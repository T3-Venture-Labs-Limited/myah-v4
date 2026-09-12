import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';
import { renderRichTextToHtml } from 'src/engine/core-modules/tool/tools/email-tool/utils/render-rich-text-to-html.util';
import {
  CAMPAIGN_EMAIL_RENDER_SCHEMA_VERSION,
  SUPPORTED_CREATOR_VARIABLES,
  type CampaignAttachmentProof,
  type CampaignMessageBlocker,
  type CampaignMessageMaterial,
  type CampaignMessageMaterialThread,
  type CampaignMessageRenderContext,
  type CampaignMessageRenderCoordinates,
  type CampaignMessageRenderResult,
  type SupportedCreatorVariable,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

import { CampaignMessageMaterializerService } from './campaign-message-materializer.service';

const RENDER_DIGEST_DOMAIN = 'campaign-email-render-digest/v1';
const subjectVariablePattern = /{{([^{}]+)}}/g;
const supportedVariables = new Set<string>(SUPPORTED_CREATOR_VARIABLES);
const bodyResolutionFailure = Symbol('bodyResolutionFailure');

type JsonRecord = Record<string, unknown>;

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const canonicalize = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical rendering contains a non-finite number');
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (isJsonRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }

  throw new TypeError('Canonical rendering contains an unsupported value');
};

type CampaignMessageBlockedResult = Extract<
  CampaignMessageRenderResult,
  { kind: 'BLOCKED' }
>;

const invalidContent = (message: string): CampaignMessageBlockedResult => ({
  kind: 'BLOCKED',
  blockers: [{ code: 'INVALID_CONTENT', message }],
});

const attachmentProof = (
  attachment: CampaignMessageMaterial['attachments'][number],
): CampaignAttachmentProof => ({
  fileId: attachment.fileId,
  filename: attachment.filename,
  contentType: attachment.contentType,
  size: attachment.size,
  contentDigest: attachment.contentDigest,
});

const publicThread = (thread: CampaignMessageMaterialThread) => {
  if (thread.kind !== 'REPLY') {
    return thread;
  }

  return {
    kind: 'REPLY' as const,
    evidenceId: thread.evidence.evidenceId,
    priorMessageId: thread.evidence.priorMessageId,
  };
};

type CampaignDigestThread =
  | Extract<CampaignMessageMaterialThread, { kind: 'NEW_THREAD' }>
  | Extract<CampaignMessageMaterialThread, { kind: 'PLANNED_PRIOR_STEP' }>
  | Readonly<{
      kind: 'REPLY';
      evidenceId: string;
      enrollmentId: string;
      occurrenceId: string;
      priorMessageId: string;
      normalizedRecipient: string;
      connectedAccountId: string;
      messageChannelId: string;
      senderHandle: string;
      providerMessageId: string;
      providerThreadId: string;
    }>;

@Injectable()
export class CampaignMessageRenderService {
  constructor(
    private readonly materializerService: CampaignMessageMaterializerService,
    private readonly emailComposerService: EmailComposerService,
  ) {}

  async renderSequenceEmail(
    coordinates: CampaignMessageRenderCoordinates,
    context: CampaignMessageRenderContext,
  ): Promise<CampaignMessageRenderResult> {
    const materialResult = await this.materializerService.load(
      coordinates,
      context,
    );

    if (materialResult.kind === 'BLOCKED') {
      return materialResult;
    }

    const { material } = materialResult;

    if (!this.coordinatesEqual(coordinates, material.coordinates)) {
      return {
        kind: 'BLOCKED',
        blockers: [
          {
            code: 'MATERIAL_STALE',
            message: 'Materialized email identity does not match the request',
          },
        ],
      };
    }

    const integrityBlockers = this.validateMaterialIntegrity(material);

    if (integrityBlockers.length > 0) {
      return { kind: 'BLOCKED', blockers: integrityBlockers };
    }

    const subjectResult = this.resolveSubject(
      material.authored.subject,
      material.creator.variables,
    );

    if (subjectResult.kind === 'BLOCKED') {
      return subjectResult;
    }

    const bodyResult = await this.resolveBody(
      material.authored.body,
      material.creator.variables,
    );

    if (bodyResult.kind === 'BLOCKED') {
      return bodyResult;
    }

    const bodyWithSignature =
      material.signature === null
        ? bodyResult.html
        : `${bodyResult.html}<div data-campaign-signature="true">${material.signature.html}</div>`;
    const inReplyTo =
      material.thread.kind === 'REPLY'
        ? material.thread.evidence.providerMessageId
        : undefined;

    let composedResult: Awaited<
      ReturnType<EmailComposerService['composeEmail']>
    >;

    try {
      composedResult = await this.emailComposerService.composeEmail(
        {
          recipients: { to: material.creator.normalizedRecipient },
          subject: subjectResult.subject,
          body: bodyWithSignature,
          connectedAccountId: material.sender.connectedAccountId,
          files: [...material.authored.orderedFileRefs],
          ...(inReplyTo === undefined ? {} : { inReplyTo }),
        },
        {
          workspaceId: coordinates.workspaceId,
          ...(context.kind === 'DISPATCH'
            ? {}
            : {
                userId: context.requesterUserId,
                userWorkspaceId: context.requesterUserWorkspaceId,
              }),
        },
        context.kind === 'DISPATCH' ? context.transactionManager : undefined,
      );
    } catch {
      return invalidContent('Canonical email composition failed');
    }

    if (!composedResult.success) {
      return invalidContent('Canonical email composition was rejected');
    }

    const composedBlockers = this.validateComposedEmail(
      material,
      composedResult.data,
    );

    if (composedBlockers.length > 0) {
      return { kind: 'BLOCKED', blockers: composedBlockers };
    }

    const orderedAttachmentProofs = material.attachments.map(attachmentProof);
    const variables = SUPPORTED_CREATOR_VARIABLES.map((key) => ({
      key,
      value: material.creator.variables[key],
    }));
    const thread = publicThread(material.thread);
    const digestPayload = {
      rendererRevision: CAMPAIGN_EMAIL_RENDER_SCHEMA_VERSION,
      coordinates: material.coordinates,
      workflowId: material.workflowId,
      authored: {
        subject: material.authored.subject,
        body: material.authored.body,
      },
      variables,
      creator: {
        creatorId: material.creator.creatorId,
        normalizedRecipient: material.creator.normalizedRecipient,
      },
      final: {
        subject: composedResult.data.sanitizedSubject,
        html: composedResult.data.sanitizedHtmlBody,
        text: composedResult.data.plainTextBody,
        bodyWithSignature,
      },
      signature:
        material.signature === null
          ? { present: false }
          : {
              present: true,
              html: material.signature.html,
              digest: material.signature.digest,
            },
      sender: {
        connectedAccountId: material.sender.connectedAccountId,
        messageChannelId: material.sender.messageChannelId,
        handle: material.sender.handle,
        provider: material.sender.provider,
        senderPoolFingerprint: material.sender.senderPoolFingerprint,
      },
      orderedAttachmentProofs,
      replyIntent: material.authored.replyToThread,
      thread: this.digestThread(material.thread),
      composed: {
        to: composedResult.data.recipients.to,
        cc: composedResult.data.recipients.cc,
        bcc: composedResult.data.recipients.bcc,
        from: material.sender.handle,
        subject: composedResult.data.sanitizedSubject,
        html: composedResult.data.sanitizedHtmlBody,
        text: composedResult.data.plainTextBody,
        orderedAttachmentProofs: composedResult.data.attachments.map(
          (attachment, index) => ({
            fileId: material.attachments[index].fileId,
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.content.length,
            contentDigest: sha256(attachment.content),
          }),
        ),
        inReplyTo: composedResult.data.inReplyTo ?? null,
        threadExternalId: composedResult.data.threadExternalId ?? null,
        references: composedResult.data.references ?? [],
      },
    };
    const renderDigest = sha256(
      `${RENDER_DIGEST_DOMAIN}\0${canonicalize(digestPayload)}`,
    );

    return {
      kind: 'READY',
      render: {
        coordinates: material.coordinates,
        creatorId: material.creator.creatorId,
        normalizedRecipient: material.creator.normalizedRecipient,
        sender: {
          connectedAccountId: material.sender.connectedAccountId,
          messageChannelId: material.sender.messageChannelId,
          handle: material.sender.handle,
          provider: material.sender.provider,
          senderPoolFingerprint: material.sender.senderPoolFingerprint,
          isPreviewProjection: material.sender.isPreviewProjection,
        },
        subject: composedResult.data.sanitizedSubject,
        html: composedResult.data.sanitizedHtmlBody,
        text: composedResult.data.plainTextBody,
        bodyWithSignature,
        variables,
        signature: material.signature,
        orderedAttachmentProofs,
        replyIntent: material.authored.replyToThread,
        thread,
        renderDigest,
        rendererRevision: CAMPAIGN_EMAIL_RENDER_SCHEMA_VERSION,
        composedEmail: composedResult.data,
      },
    };
  }

  private coordinatesEqual(
    left: CampaignMessageRenderCoordinates,
    right: CampaignMessageRenderCoordinates,
  ): boolean {
    return (
      left.workspaceId === right.workspaceId &&
      left.campaignId === right.campaignId &&
      left.campaignCreatorId === right.campaignCreatorId &&
      left.workflowVersionId === right.workflowVersionId &&
      left.messageId === right.messageId
    );
  }

  private validateMaterialIntegrity(
    material: CampaignMessageMaterial,
  ): CampaignMessageBlocker[] {
    const blockers: CampaignMessageBlocker[] = [];

    if (
      material.signature !== null &&
      sha256(material.signature.html) !== material.signature.digest
    ) {
      blockers.push({
        code: 'MATERIAL_STALE',
        message: 'Campaign signature proof changed',
      });
    }

    if (
      material.attachments.length !== material.authored.orderedFileRefs.length
    ) {
      blockers.push({
        code: 'ATTACHMENT_CHANGED',
        message: 'Campaign attachment order changed',
      });

      return blockers;
    }

    material.attachments.forEach((attachment, index) => {
      const file = material.authored.orderedFileRefs[index];

      if (
        attachment.fileId !== file.id ||
        attachment.filename !== file.name ||
        attachment.contentType !== file.type ||
        attachment.size !== file.size ||
        attachment.size !== attachment.bytes.length ||
        attachment.contentDigest !== sha256(attachment.bytes)
      ) {
        blockers.push({
          code: 'ATTACHMENT_CHANGED',
          message: 'Campaign attachment material changed',
          fileId: file.id,
        });
      }
    });

    return blockers;
  }

  private resolveSubject(
    subject: string,
    variables: Readonly<Record<SupportedCreatorVariable, string>>,
  ):
    | { kind: 'READY'; subject: string }
    | Extract<CampaignMessageRenderResult, { kind: 'BLOCKED' }> {
    let invalidVariable = false;
    const resolved = subject.replace(
      subjectVariablePattern,
      (_token, key: string) => {
        if (!supportedVariables.has(key)) {
          invalidVariable = true;

          return '';
        }

        return variables[key as SupportedCreatorVariable];
      },
    );

    if (invalidVariable) {
      return {
        kind: 'BLOCKED',
        blockers: [
          {
            code: 'UNKNOWN_VARIABLE',
            message: 'Campaign subject contains an unsupported variable',
          },
        ],
      };
    }

    if (resolved.trim().length === 0) {
      return {
        kind: 'BLOCKED',
        blockers: [
          { code: 'INVALID_CONTENT', message: 'Campaign subject is empty' },
        ],
      };
    }

    return { kind: 'READY', subject: resolved };
  }

  private async resolveBody(
    body: string,
    variables: Readonly<Record<SupportedCreatorVariable, string>>,
  ): Promise<
    | { kind: 'READY'; html: string }
    | Extract<CampaignMessageRenderResult, { kind: 'BLOCKED' }>
  > {
    let document: unknown;

    try {
      document = JSON.parse(body);
    } catch {
      return invalidContent('Campaign email body is invalid');
    }

    if (!isJsonRecord(document) || document.type !== 'doc') {
      return invalidContent('Campaign email body is invalid');
    }

    const resolved = this.resolveBodyNode(document, variables);

    if (resolved === bodyResolutionFailure) {
      return {
        kind: 'BLOCKED',
        blockers: [
          {
            code: 'UNKNOWN_VARIABLE',
            message: 'Campaign body contains an unsupported variable',
          },
        ],
      };
    }

    try {
      return {
        kind: 'READY',
        html: await renderRichTextToHtml(
          resolved as Parameters<typeof renderRichTextToHtml>[0],
        ),
      };
    } catch {
      return invalidContent('Campaign email body could not be rendered');
    }
  }

  private resolveBodyNode(
    value: unknown,
    variables: Readonly<Record<SupportedCreatorVariable, string>>,
  ): unknown | typeof bodyResolutionFailure {
    if (Array.isArray(value)) {
      const resolved = value.map((item) =>
        this.resolveBodyNode(item, variables),
      );

      return resolved.includes(bodyResolutionFailure)
        ? bodyResolutionFailure
        : resolved;
    }

    if (!isJsonRecord(value)) {
      return value;
    }

    if (value.type === 'variableTag') {
      if (
        !isJsonRecord(value.attrs) ||
        typeof value.attrs.variable !== 'string'
      ) {
        return bodyResolutionFailure;
      }

      const match = /^{{([^{}]+)}}$/.exec(value.attrs.variable);

      if (match === null || !supportedVariables.has(match[1])) {
        return bodyResolutionFailure;
      }

      return {
        type: 'text',
        text: variables[match[1] as SupportedCreatorVariable],
      };
    }

    const output: JsonRecord = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const resolved = this.resolveBodyNode(nestedValue, variables);

      if (resolved === bodyResolutionFailure) {
        return bodyResolutionFailure;
      }

      output[key] = resolved;
    }

    return output;
  }

  private validateComposedEmail(
    material: CampaignMessageMaterial,
    composed: ComposedEmail,
  ): CampaignMessageBlocker[] {
    const blockers: CampaignMessageBlocker[] = [];

    if (
      !isJsonRecord(composed) ||
      typeof composed.sanitizedSubject !== 'string' ||
      composed.sanitizedSubject.trim().length === 0 ||
      typeof composed.sanitizedHtmlBody !== 'string' ||
      composed.sanitizedHtmlBody.trim().length === 0 ||
      typeof composed.plainTextBody !== 'string' ||
      typeof composed.toRecipientsDisplay !== 'string' ||
      typeof composed.shouldPersistMessage !== 'boolean'
    ) {
      return [
        {
          code: 'INVALID_CONTENT',
          message: 'Composed email content is invalid',
        },
      ];
    }

    if (
      !isJsonRecord(composed.recipients) ||
      !Array.isArray(composed.recipients.to) ||
      !Array.isArray(composed.recipients.cc) ||
      !Array.isArray(composed.recipients.bcc) ||
      !isJsonRecord(composed.connectedAccount) ||
      !Array.isArray(composed.attachments)
    ) {
      return [
        {
          code: 'MATERIAL_STALE',
          message: 'Composed email material is incomplete',
        },
      ];
    }

    const account = composed.connectedAccount;

    if (
      composed.recipients.to.length !== 1 ||
      composed.recipients.to[0] !== material.creator.normalizedRecipient ||
      composed.recipients.cc.length > 0 ||
      composed.recipients.bcc.length > 0 ||
      account.id !== material.sender.connectedAccountId ||
      account.handle !== material.sender.handle ||
      account.provider !== material.sender.provider ||
      composed.messageChannelId !== material.sender.messageChannelId
    ) {
      blockers.push({
        code: 'MATERIAL_STALE',
        message: 'Composed sender or recipient binding changed',
      });
    }

    if (composed.attachments.length !== material.attachments.length) {
      blockers.push({
        code: 'ATTACHMENT_CHANGED',
        message: 'Composed attachment order changed',
      });
    } else {
      composed.attachments.forEach((attachment, index) => {
        const expected = material.attachments[index];

        if (
          !isJsonRecord(attachment) ||
          typeof attachment.filename !== 'string' ||
          typeof attachment.contentType !== 'string' ||
          !Buffer.isBuffer(attachment.content) ||
          attachment.filename !== expected.filename ||
          attachment.contentType !== expected.contentType ||
          attachment.content.length !== expected.size ||
          sha256(attachment.content) !== expected.contentDigest
        ) {
          blockers.push({
            code: 'ATTACHMENT_CHANGED',
            message: 'Composed attachment bytes changed',
            fileId: expected.fileId,
          });
        }
      });
    }

    if (material.thread.kind === 'REPLY') {
      if (
        composed.inReplyTo !== material.thread.evidence.providerMessageId ||
        composed.threadExternalId !== material.thread.evidence.providerThreadId
      ) {
        blockers.push({
          code: 'THREAD_IDENTITY_MISMATCH',
          message: 'Composed reply headers do not match verified evidence',
        });
      }
    } else if (
      composed.inReplyTo !== undefined ||
      composed.threadExternalId !== undefined ||
      composed.references !== undefined
    ) {
      blockers.push({
        code: 'THREAD_IDENTITY_MISMATCH',
        message: 'Composed new thread contains reply headers',
      });
    }

    return blockers;
  }

  private digestThread(
    thread: CampaignMessageMaterialThread,
  ): CampaignDigestThread {
    if (thread.kind !== 'REPLY') {
      return thread;
    }

    return {
      kind: thread.kind,
      evidenceId: thread.evidence.evidenceId,
      enrollmentId: thread.evidence.enrollmentId,
      occurrenceId: thread.evidence.occurrenceId,
      priorMessageId: thread.evidence.priorMessageId,
      normalizedRecipient: thread.evidence.normalizedRecipient,
      connectedAccountId: thread.evidence.connectedAccountId,
      messageChannelId: thread.evidence.messageChannelId,
      senderHandle: thread.evidence.senderHandle,
      providerMessageId: thread.evidence.providerMessageId,
      providerThreadId: thread.evidence.providerThreadId,
    };
  }
}

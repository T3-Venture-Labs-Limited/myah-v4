import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import {
  SUPPORTED_CREATOR_VARIABLES,
  type CampaignAttachmentProof,
  type CampaignAttachmentStoragePort,
  type CampaignCreatorMaterial,
  type CampaignCreatorMaterialPort,
  type CampaignMaterialPortResult,
  type CampaignMessageBlocker,
  type CampaignMessageBlockerCode,
  type CampaignMessageMaterial,
  type CampaignMessageMaterialResult,
  type CampaignMessageMaterialThread,
  type CampaignMessageRenderContext,
  type CampaignMessageRenderCoordinates,
  type CampaignSenderMaterialPort,
  type CampaignSignatureMaterialPort,
  type CampaignThreadMaterialPort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

import {
  CampaignSequenceService,
  type ValidatedCampaignSequenceEmail,
} from './campaign-sequence.service';

const blocker = (
  code: CampaignMessageBlockerCode,
  message: string,
  details: Pick<CampaignMessageBlocker, 'fileId' | 'messageId'> = {},
): CampaignMessageBlocker => ({ code, message, ...details });

const unavailableCreatorPort: CampaignCreatorMaterialPort = {
  load: async () => ({
    kind: 'BLOCKED',
    blockers: [
      blocker(
        'CREATOR_NOT_FOUND',
        'Creator material is unavailable or inaccessible',
      ),
    ],
  }),
};

const unavailableSignaturePort: CampaignSignatureMaterialPort = {
  load: async () => ({
    kind: 'BLOCKED',
    blockers: [blocker('MATERIAL_STALE', 'Campaign signature is unavailable')],
  }),
};

const unavailableSenderPort: CampaignSenderMaterialPort = {
  load: async () => ({
    kind: 'BLOCKED',
    blockers: [
      blocker('SENDER_UNAVAILABLE', 'An authorized sender is unavailable'),
    ],
  }),
};

const unavailableAttachmentPort: CampaignAttachmentStoragePort = {
  load: async () => ({ kind: 'FORBIDDEN' }),
};

const unavailableThreadPort: CampaignThreadMaterialPort = {
  load: async () => ({
    kind: 'BLOCKED',
    blockers: [
      blocker(
        'THREAD_EVIDENCE_MISSING',
        'Authorized thread evidence is unavailable',
      ),
    ],
  }),
};

const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const supportedVariables = new Set<string>(SUPPORTED_CREATOR_VARIABLES);
const supportedProviders = new Set<ConnectedAccountProvider>(
  Object.values(ConnectedAccountProvider),
);

const subjectVariablePattern = /{{([^{}]+)}}/g;

type JsonRecord = Record<string, unknown>;

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectVariableReferences = (
  subject: string,
  body: string,
): { kind: 'VALID'; references: Set<string> } | { kind: 'INVALID_CONTENT' } => {
  const references = new Set<string>();

  for (const match of subject.matchAll(subjectVariablePattern)) {
    references.add(match[1]);
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(body);
  } catch {
    return { kind: 'INVALID_CONTENT' };
  }

  if (!isJsonRecord(parsedBody) || parsedBody.type !== 'doc') {
    return { kind: 'INVALID_CONTENT' };
  }

  const pending: unknown[] = [parsedBody];

  while (pending.length > 0) {
    const current = pending.pop();

    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }

    if (!isJsonRecord(current)) {
      continue;
    }

    if (current.type === 'variableTag') {
      if (
        !isJsonRecord(current.attrs) ||
        typeof current.attrs.variable !== 'string'
      ) {
        return { kind: 'INVALID_CONTENT' };
      }

      const token = current.attrs.variable;
      const match = /^{{([^{}]+)}}$/.exec(token);

      if (match === null) {
        references.add(token);
      } else {
        references.add(match[1]);
      }
    }

    pending.push(...Object.values(current));
  }

  return { kind: 'VALID', references };
};

const materialPortValue = <T>(
  result: CampaignMaterialPortResult<T>,
  blockers: CampaignMessageBlocker[],
): T | null => {
  if (result.kind === 'BLOCKED') {
    blockers.push(...result.blockers);

    return null;
  }

  return result.value;
};

@Injectable()
export class CampaignMessageMaterializerService {
  constructor(
    private readonly campaignSequenceService: CampaignSequenceService,
    private readonly creatorPort: CampaignCreatorMaterialPort = unavailableCreatorPort,
    private readonly signaturePort: CampaignSignatureMaterialPort = unavailableSignaturePort,
    private readonly senderPort: CampaignSenderMaterialPort = unavailableSenderPort,
    private readonly attachmentPort: CampaignAttachmentStoragePort = unavailableAttachmentPort,
    private readonly threadPort: CampaignThreadMaterialPort = unavailableThreadPort,
  ) {}

  async load(
    coordinates: CampaignMessageRenderCoordinates,
    context: CampaignMessageRenderContext,
  ): Promise<CampaignMessageMaterialResult> {
    const contextBlockers = this.validateContext(coordinates, context);

    if (contextBlockers.length > 0) {
      return { kind: 'BLOCKED', blockers: contextBlockers };
    }

    let email: ValidatedCampaignSequenceEmail;

    try {
      email = await this.campaignSequenceService.loadEmailByVersion({
        workspaceId: coordinates.workspaceId,
        campaignId: coordinates.campaignId,
        workflowVersionId: coordinates.workflowVersionId,
        messageId: coordinates.messageId,
        authContext: context.authContext,
      });
    } catch (error) {
      return {
        kind: 'BLOCKED',
        blockers: [this.selectedEmailErrorToBlocker(error, coordinates)],
      };
    }

    const emailBlockers = this.validateSelectedEmail(coordinates, email);

    if (emailBlockers.length > 0) {
      return { kind: 'BLOCKED', blockers: emailBlockers };
    }

    const variableReferences = collectVariableReferences(
      email.subject,
      email.body,
    );

    if (variableReferences.kind === 'INVALID_CONTENT') {
      return {
        kind: 'BLOCKED',
        blockers: [
          blocker('INVALID_CONTENT', 'Campaign email content is invalid', {
            messageId: coordinates.messageId,
          }),
        ],
      };
    }

    const unknownReferences = [...variableReferences.references].filter(
      (reference) => !supportedVariables.has(reference),
    );

    if (unknownReferences.length > 0) {
      return {
        kind: 'BLOCKED',
        blockers: [
          blocker(
            'UNKNOWN_VARIABLE',
            'Campaign email contains an unsupported Creator variable',
            { messageId: coordinates.messageId },
          ),
        ],
      };
    }

    const [creatorResult, signatureResult, senderResult] = await Promise.all([
      this.creatorPort.load({
        coordinates,
        authContext: context.authContext,
      }),
      this.signaturePort.load({ coordinates, context }),
      this.senderPort.load({ coordinates, context }),
    ]);
    const blockers: CampaignMessageBlocker[] = [];
    const creator = materialPortValue(creatorResult, blockers);
    const signatureValue = materialPortValue(signatureResult, blockers);
    const sender = materialPortValue(senderResult, blockers);
    const attachments = await this.loadAttachments(email, context, blockers);

    const creatorBlockers =
      creator === null ? [] : this.validateCreator(creator);
    const senderBlockers =
      sender === null ? [] : this.validateSender(context, sender, creator);

    blockers.push(...creatorBlockers, ...senderBlockers);

    let thread: CampaignMessageMaterialThread | null = null;

    if (
      creator !== null &&
      sender !== null &&
      creatorBlockers.length === 0 &&
      senderBlockers.length === 0
    ) {
      const threadResult = await this.threadPort.load({
        coordinates,
        context,
        replyToThread: email.replyToThread,
        normalizedRecipient: creator.normalizedRecipient,
        sender,
      });

      thread = materialPortValue(threadResult, blockers);

      if (thread !== null) {
        blockers.push(
          ...this.validateThread(
            coordinates,
            context,
            email.replyToThread,
            creator.normalizedRecipient,
            sender,
            thread,
          ),
        );
      }
    }

    const signature = this.materializeSignature(signatureValue, blockers);

    if (attachments !== null) {
      blockers.push(
        ...this.validateFixedMaterial(context, signature, attachments),
      );
    }

    if (
      blockers.length > 0 ||
      creator === null ||
      sender === null ||
      attachments === null ||
      thread === null
    ) {
      return { kind: 'BLOCKED', blockers };
    }

    return {
      kind: 'READY',
      material: {
        coordinates,
        workflowId: email.workflowId,
        authored: {
          subject: email.subject,
          body: email.body,
          orderedFileRefs: email.files,
          replyToThread: email.replyToThread,
        },
        creator: {
          creatorId: creator.creatorId,
          normalizedRecipient: creator.normalizedRecipient,
          variables: {
            'creator.email': creator.variables['creator.email'] as string,
            'creator.name': creator.variables['creator.name'] as string,
          },
        },
        signature,
        sender,
        attachments,
        thread,
      },
    };
  }

  private validateContext(
    coordinates: CampaignMessageRenderCoordinates,
    context: CampaignMessageRenderContext,
  ): CampaignMessageBlocker[] {
    if (
      context.authContext.workspace.id !== coordinates.workspaceId ||
      context.authContext.userWorkspaceId !==
        (context.kind === 'DISPATCH'
          ? context.renderContext.initiatorUserWorkspaceId
          : context.requesterUserWorkspaceId) ||
      (context.kind !== 'DISPATCH' &&
        context.authContext.user.id !== context.requesterUserId)
    ) {
      return [
        blocker('MATERIAL_STALE', 'Render authority does not match the email'),
      ];
    }

    if (context.kind === 'PREVIEW') {
      return [];
    }

    const binding =
      context.kind === 'TEST_FINALIZATION'
        ? context.reservationBinding
        : context.renderContext;
    const identityMatches =
      binding.workspaceId === coordinates.workspaceId &&
      binding.campaignId === coordinates.campaignId &&
      binding.campaignCreatorId === coordinates.campaignCreatorId &&
      binding.workflowVersionId === coordinates.workflowVersionId &&
      binding.messageId === coordinates.messageId;

    if (!identityMatches) {
      return [
        blocker('MATERIAL_STALE', 'Render authority does not match the email'),
      ];
    }

    if (context.kind === 'TEST_FINALIZATION') {
      if (
        context.reservationBinding.requesterUserId !==
          context.requesterUserId ||
        context.reservationBinding.requesterUserWorkspaceId !==
          context.requesterUserWorkspaceId
      ) {
        return [
          blocker('MATERIAL_STALE', 'Test reservation authority is stale'),
        ];
      }

      return [];
    }

    if (
      context.senderBinding.connectedAccountId !==
        context.renderContext.connectedAccountId ||
      context.senderBinding.messageChannelId !==
        context.renderContext.messageChannelId ||
      context.senderBinding.senderHandle !==
        context.renderContext.senderHandle ||
      context.senderBinding.senderPoolFingerprint !==
        context.renderContext.senderPoolFingerprint ||
      context.fixedMaterialProof.fixedMaterialFingerprint !==
        context.renderContext.fixedMaterialFingerprint
    ) {
      return [
        blocker('MATERIAL_STALE', 'Dispatch material authority is stale'),
      ];
    }

    return [];
  }

  private validateSelectedEmail(
    coordinates: CampaignMessageRenderCoordinates,
    email: ValidatedCampaignSequenceEmail,
  ): CampaignMessageBlocker[] {
    if (
      !isJsonRecord(email) ||
      typeof email.workspaceId !== 'string' ||
      typeof email.campaignId !== 'string' ||
      typeof email.workflowId !== 'string' ||
      typeof email.workflowVersionId !== 'string' ||
      typeof email.messageId !== 'string' ||
      typeof email.subject !== 'string' ||
      typeof email.body !== 'string' ||
      !Array.isArray(email.files) ||
      typeof email.replyToThread !== 'boolean' ||
      !Array.isArray(email.issues)
    ) {
      return [
        blocker('INVALID_SEQUENCE', 'Campaign sequence email is invalid', {
          messageId: coordinates.messageId,
        }),
      ];
    }

    if (
      email.workspaceId !== coordinates.workspaceId ||
      email.campaignId !== coordinates.campaignId ||
      email.workflowVersionId !== coordinates.workflowVersionId ||
      email.messageId !== coordinates.messageId
    ) {
      return [
        blocker('MATERIAL_STALE', 'Selected Campaign email identity changed', {
          messageId: coordinates.messageId,
        }),
      ];
    }

    if (
      email.workflowId.trim().length === 0 ||
      email.issues.length > 0 ||
      email.subject.trim().length === 0 ||
      email.body.length === 0
    ) {
      return [
        blocker('INVALID_SEQUENCE', 'Campaign sequence email is invalid', {
          messageId: coordinates.messageId,
        }),
      ];
    }

    return [];
  }

  private selectedEmailErrorToBlocker(
    error: unknown,
    coordinates: CampaignMessageRenderCoordinates,
  ): CampaignMessageBlocker {
    const message = error instanceof Error ? error.message : '';

    if (message.includes('not an email')) {
      return blocker(
        'MESSAGE_NOT_EMAIL',
        'Campaign sequence message is not an email',
        { messageId: coordinates.messageId },
      );
    }

    if (message.includes('email not found')) {
      return blocker('MESSAGE_NOT_FOUND', 'Campaign sequence email not found', {
        messageId: coordinates.messageId,
      });
    }

    if (message.includes('version')) {
      return blocker(
        'REVISION_NOT_FOUND',
        'Campaign sequence version not found',
      );
    }

    if (message.includes('Campaign not found')) {
      return blocker(
        'CAMPAIGN_NOT_FOUND',
        'Campaign not found or inaccessible',
      );
    }

    if (message.includes('invalid')) {
      return blocker('INVALID_SEQUENCE', 'Campaign sequence email is invalid', {
        messageId: coordinates.messageId,
      });
    }

    return blocker('MATERIAL_STALE', 'Campaign email material is unavailable');
  }

  private validateCreator(
    creator: CampaignCreatorMaterial,
  ): CampaignMessageBlocker[] {
    if (
      !isJsonRecord(creator) ||
      typeof creator.creatorId !== 'string' ||
      typeof creator.normalizedRecipient !== 'string' ||
      !isJsonRecord(creator.variables)
    ) {
      return [
        blocker('INVALID_CONTENT', 'Creator recipient material is invalid'),
      ];
    }

    const blockers: CampaignMessageBlocker[] = [];
    const suppliedKeys = Object.keys(creator.variables);

    if (suppliedKeys.some((key) => !supportedVariables.has(key))) {
      blockers.push(
        blocker(
          'UNKNOWN_VARIABLE',
          'Creator material contains an unsupported variable',
        ),
      );
    }

    for (const variable of SUPPORTED_CREATOR_VARIABLES) {
      const value = creator.variables[variable];

      if (typeof value !== 'string' || value.trim().length === 0) {
        blockers.push(
          blocker(
            'MISSING_VARIABLE',
            `Creator value required for ${variable} is missing`,
          ),
        );
      }
    }

    const normalizedRecipient = creator.normalizedRecipient;
    const canonicalRecipient = normalizedRecipient.trim().toLowerCase();

    if (
      creator.creatorId.trim().length === 0 ||
      canonicalRecipient !== normalizedRecipient ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipient) ||
      creator.variables['creator.email'] !== normalizedRecipient
    ) {
      blockers.push(
        blocker('INVALID_CONTENT', 'Creator recipient material is invalid'),
      );
    }

    return blockers;
  }

  private async loadAttachments(
    email: ValidatedCampaignSequenceEmail,
    context: CampaignMessageRenderContext,
    blockers: CampaignMessageBlocker[],
  ): Promise<
    readonly (CampaignAttachmentProof & Readonly<{ bytes: Buffer }>)[] | null
  > {
    const attachments: (CampaignAttachmentProof &
      Readonly<{ bytes: Buffer }>)[] = [];

    for (const file of email.files) {
      if (
        !isJsonRecord(file) ||
        typeof file.id !== 'string' ||
        typeof file.name !== 'string' ||
        typeof file.type !== 'string' ||
        typeof file.createdAt !== 'string' ||
        file.id.trim().length === 0 ||
        file.name.trim().length === 0 ||
        file.type.trim().length === 0 ||
        !Number.isSafeInteger(file.size) ||
        (typeof file.size === 'number' && file.size < 0)
      ) {
        blockers.push(
          blocker(
            'ATTACHMENT_CHANGED',
            'Campaign attachment metadata changed',
            {
              ...(isJsonRecord(file) && typeof file.id === 'string'
                ? { fileId: file.id }
                : {}),
              messageId: email.messageId,
            },
          ),
        );
        continue;
      }

      const result = await this.attachmentPort.load({
        workspaceId: email.workspaceId,
        file,
        authContext: context.authContext,
      });

      if (result.kind === 'NOT_FOUND') {
        blockers.push(
          blocker('ATTACHMENT_NOT_FOUND', 'Campaign attachment was not found', {
            fileId: file.id,
            messageId: email.messageId,
          }),
        );
        continue;
      }

      if (result.kind === 'FORBIDDEN') {
        blockers.push(
          blocker(
            'ATTACHMENT_FORBIDDEN',
            'Campaign attachment is not accessible',
            { fileId: file.id, messageId: email.messageId },
          ),
        );
        continue;
      }

      if (result.kind === 'CHANGED') {
        blockers.push(
          blocker('ATTACHMENT_CHANGED', 'Campaign attachment bytes changed', {
            fileId: file.id,
            messageId: email.messageId,
          }),
        );
        continue;
      }

      if (
        typeof result.value.filename !== 'string' ||
        typeof result.value.contentType !== 'string' ||
        !Buffer.isBuffer(result.value.bytes) ||
        result.value.filename !== file.name ||
        result.value.contentType !== file.type ||
        result.value.bytes.length !== file.size
      ) {
        blockers.push(
          blocker('ATTACHMENT_CHANGED', 'Campaign attachment bytes changed', {
            fileId: file.id,
            messageId: email.messageId,
          }),
        );
        continue;
      }

      attachments.push({
        fileId: file.id,
        filename: result.value.filename,
        contentType: result.value.contentType,
        size: result.value.bytes.length,
        contentDigest: sha256(result.value.bytes),
        bytes: result.value.bytes,
      });
    }

    return blockers.some(({ code }) => code.startsWith('ATTACHMENT_'))
      ? null
      : attachments;
  }

  private materializeSignature(
    value: Readonly<{ html: string | null }> | null,
    blockers: CampaignMessageBlocker[],
  ): Readonly<{ html: string; digest: string }> | null {
    if (value === null || value.html === null) {
      return null;
    }

    if (typeof value.html !== 'string') {
      blockers.push(
        blocker('INVALID_CONTENT', 'Campaign signature material is invalid'),
      );

      return null;
    }

    if (value.html.trim().length === 0) {
      return null;
    }

    return { html: value.html, digest: sha256(value.html) };
  }

  private validateSender(
    context: CampaignMessageRenderContext,
    sender: CampaignMessageMaterial['sender'],
    creator: CampaignCreatorMaterial | null,
  ): CampaignMessageBlocker[] {
    if (
      !isJsonRecord(sender) ||
      typeof sender.connectedAccountId !== 'string' ||
      typeof sender.messageChannelId !== 'string' ||
      typeof sender.handle !== 'string' ||
      typeof sender.senderPoolFingerprint !== 'string' ||
      !supportedProviders.has(sender.provider) ||
      !Array.isArray(sender.authorizedEmailSenderPool) ||
      (sender.projectedSlotAt !== null &&
        (!(sender.projectedSlotAt instanceof Date) ||
          Number.isNaN(sender.projectedSlotAt.getTime()))) ||
      typeof sender.isPreviewProjection !== 'boolean' ||
      sender.connectedAccountId.trim().length === 0 ||
      sender.messageChannelId.trim().length === 0 ||
      sender.handle.trim().length === 0 ||
      sender.senderPoolFingerprint.trim().length === 0
    ) {
      return [
        blocker(
          'SENDER_UNAVAILABLE',
          'Authorized sender binding is incomplete',
        ),
      ];
    }

    if (context.kind === 'PREVIEW') {
      return sender.isPreviewProjection
        ? []
        : [
            blocker(
              'SENDER_PROJECTION_STALE',
              'Sender is not an authorized preview projection',
            ),
          ];
    }

    const binding =
      context.kind === 'TEST_FINALIZATION'
        ? context.reservationBinding
        : context.senderBinding;
    const matches =
      sender.connectedAccountId === binding.connectedAccountId &&
      sender.messageChannelId === binding.messageChannelId &&
      sender.handle === binding.senderHandle &&
      sender.senderPoolFingerprint === binding.senderPoolFingerprint &&
      (context.kind !== 'DISPATCH' ||
        sender.provider === context.senderBinding.provider) &&
      !sender.isPreviewProjection;

    if (
      !matches ||
      (context.kind === 'TEST_FINALIZATION' &&
        creator?.normalizedRecipient !==
          context.reservationBinding.normalizedRecipient)
    ) {
      return [
        blocker('SENDER_POOL_STALE', 'Authorized sender binding is stale'),
      ];
    }

    return [];
  }

  private validateFixedMaterial(
    context: CampaignMessageRenderContext,
    signature: Readonly<{ html: string; digest: string }> | null,
    attachments: readonly CampaignAttachmentProof[],
  ): CampaignMessageBlocker[] {
    if (context.kind !== 'DISPATCH') {
      return [];
    }

    const proof = context.fixedMaterialProof;
    const signatureMatches =
      proof.signatureDigest === (signature === null ? null : signature.digest);
    const attachmentsMatch =
      proof.orderedAttachmentProofs.length === attachments.length &&
      proof.orderedAttachmentProofs.every((expected, index) => {
        const actual = attachments[index];

        return (
          expected.fileId === actual.fileId &&
          expected.filename === actual.filename &&
          expected.contentType === actual.contentType &&
          expected.size === actual.size &&
          expected.contentDigest === actual.contentDigest
        );
      });

    return signatureMatches && attachmentsMatch
      ? []
      : [blocker('MATERIAL_STALE', 'Frozen Campaign material changed')];
  }

  private validateThread(
    coordinates: CampaignMessageRenderCoordinates,
    context: CampaignMessageRenderContext,
    replyToThread: boolean,
    normalizedRecipient: string,
    sender: CampaignMessageMaterial['sender'],
    thread: CampaignMessageMaterialThread,
  ): CampaignMessageBlocker[] {
    if (!replyToThread) {
      const matchesNewThreadScope =
        thread.kind === 'NEW_THREAD' &&
        (context.kind !== 'DISPATCH' ||
          ('kind' in context.replyEvidence &&
            context.replyEvidence.kind === 'NEW_THREAD' &&
            context.renderContext.replyEvidenceId === null));

      return matchesNewThreadScope
        ? []
        : [
            blocker(
              'THREAD_IDENTITY_MISMATCH',
              'Thread scope does not match authored reply intent',
            ),
          ];
    }

    if (thread.kind === 'NEW_THREAD') {
      return [
        blocker(
          'THREAD_EVIDENCE_MISSING',
          'Reply intent requires exact prior message scope',
        ),
      ];
    }

    if (thread.kind === 'PLANNED_PRIOR_STEP') {
      if (
        thread.priorMessageId.trim().length === 0 ||
        thread.priorMessageId === coordinates.messageId ||
        context.kind === 'DISPATCH' ||
        context.threadScope.kind !== 'PLANNED_PRIOR_STEP' ||
        context.threadScope.priorMessageId !== thread.priorMessageId
      ) {
        return [
          blocker(
            'THREAD_IDENTITY_MISMATCH',
            'Planned prior message scope does not match reply intent',
          ),
        ];
      }

      return [];
    }

    const evidence = thread.evidence;
    const bindingMatches =
      evidence.normalizedRecipient === normalizedRecipient &&
      evidence.connectedAccountId === sender.connectedAccountId &&
      evidence.messageChannelId === sender.messageChannelId &&
      evidence.senderHandle === sender.handle &&
      evidence.evidenceId.trim().length > 0 &&
      evidence.priorMessageId.trim().length > 0 &&
      evidence.priorMessageId !== coordinates.messageId &&
      evidence.providerMessageId.trim().length > 0 &&
      evidence.providerThreadId.trim().length > 0;

    if (!bindingMatches) {
      return [
        blocker(
          'THREAD_IDENTITY_MISMATCH',
          'Verified thread evidence does not match the email',
        ),
      ];
    }

    if (context.kind === 'DISPATCH') {
      if (
        'kind' in context.replyEvidence ||
        context.replyEvidence.evidenceId !== evidence.evidenceId ||
        context.replyEvidence.enrollmentId !== evidence.enrollmentId ||
        context.replyEvidence.occurrenceId !== evidence.occurrenceId ||
        context.replyEvidence.priorMessageId !== evidence.priorMessageId ||
        context.replyEvidence.normalizedRecipient !==
          evidence.normalizedRecipient ||
        context.replyEvidence.connectedAccountId !==
          evidence.connectedAccountId ||
        context.replyEvidence.messageChannelId !== evidence.messageChannelId ||
        context.replyEvidence.senderHandle !== evidence.senderHandle ||
        context.replyEvidence.providerMessageId !==
          evidence.providerMessageId ||
        context.replyEvidence.providerThreadId !== evidence.providerThreadId ||
        context.renderContext.replyEvidenceId !== evidence.evidenceId ||
        context.renderContext.enrollmentId !== evidence.enrollmentId ||
        context.renderContext.occurrenceId !== evidence.occurrenceId
      ) {
        return [
          blocker(
            'THREAD_IDENTITY_MISMATCH',
            'Dispatch thread evidence identity does not match',
          ),
        ];
      }

      return [];
    }

    if (
      context.threadScope.kind !== 'EXISTING_EVIDENCE' ||
      context.threadScope.evidenceId !== evidence.evidenceId ||
      context.threadScope.enrollmentId !== evidence.enrollmentId ||
      context.threadScope.occurrenceId !== evidence.occurrenceId
    ) {
      return [
        blocker(
          'THREAD_IDENTITY_MISMATCH',
          'Preview thread evidence identity does not match',
        ),
      ];
    }

    return [];
  }
}

import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  type CampaignAttachmentLoadResult,
  type CampaignAttachmentProof,
  type CampaignAttachmentStoragePort,
  type CampaignMaterialPortResult,
  type CampaignMessageBlocker,
  type CampaignMessageBlockerCode,
  type CampaignSequenceEmailFile,
  type CampaignSequenceFixedMaterialInput,
  type CampaignSequenceFixedMaterialResult,
  type CampaignSignatureMaterialPort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

import {
  CampaignSequenceService,
  type ValidatedCampaignSequenceEmail,
} from './campaign-sequence.service';

const CAMPAIGN_SEQUENCE_FIXED_MATERIAL_INTERNAL_REVISION =
  'campaign-sequence-fixed-material/v1' as const;

const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const blocker = (
  code: CampaignMessageBlockerCode,
  message: string,
  details: Pick<CampaignMessageBlocker, 'fileId' | 'messageId'> = {},
): CampaignMessageBlocker => ({ code, message, ...details });

const unavailableSignaturePort: CampaignSignatureMaterialPort = {
  load: async () => ({
    kind: 'BLOCKED',
    blockers: [blocker('MATERIAL_STALE', 'Campaign signature is unavailable')],
  }),
};

const unavailableAttachmentPort: CampaignAttachmentStoragePort = {
  load: async () => ({ kind: 'FORBIDDEN' }),
};

type JsonRecord = Record<string, unknown>;

type MaterializedSignature = Readonly<{ html: string; digest: string }> | null;
type MaterializedAttachment = CampaignAttachmentProof &
  Readonly<{ bytes: Buffer }>;
type AttachmentCacheEntry = Readonly<{
  file: CampaignSequenceEmailFile;
  result: CampaignAttachmentLoadResult;
}>;
type AttachmentCache = Map<string, AttachmentCacheEntry>;

type CampaignMessageFixedMaterialLoadResult = Readonly<{
  signature: MaterializedSignature;
  attachments: readonly MaterializedAttachment[] | null;
  blockers: readonly CampaignMessageBlocker[];
}>;

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCanonicalUuid = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return stringifyUuid(parseUuid(value)) === value;
  } catch {
    return false;
  }
};

const sameFileReference = (
  first: CampaignSequenceEmailFile,
  second: CampaignSequenceEmailFile,
): boolean =>
  first.id === second.id &&
  first.name === second.name &&
  first.size === second.size &&
  first.type === second.type &&
  first.createdAt === second.createdAt;

@Injectable()
export class CampaignSequenceFixedMaterialService {
  constructor(
    private readonly campaignSequenceService: CampaignSequenceService,
    private readonly signaturePort: CampaignSignatureMaterialPort = unavailableSignaturePort,
    private readonly attachmentPort: CampaignAttachmentStoragePort = unavailableAttachmentPort,
  ) {}

  async loadSequenceFixedMaterial(
    input: CampaignSequenceFixedMaterialInput,
    transactionManager?: WorkspaceEntityManager,
  ): Promise<CampaignSequenceFixedMaterialResult> {
    const inputBlockers = this.validateInput(input);

    if (inputBlockers.length > 0) {
      return { kind: 'BLOCKED', blockers: inputBlockers };
    }

    const emails: ValidatedCampaignSequenceEmail[] = [];

    for (const messageId of input.orderedMessageIds) {
      let email: ValidatedCampaignSequenceEmail;

      try {
        const coordinates = {
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          workflowVersionId: input.workflowVersionId,
          messageId,
          authContext: input.authContext,
        };
        email = transactionManager
          ? await this.campaignSequenceService.loadEmailByVersionInTransaction(
              coordinates,
              transactionManager,
            )
          : await this.campaignSequenceService.loadEmailByVersion(coordinates);
      } catch (error) {
        return {
          kind: 'BLOCKED',
          blockers: [this.selectedEmailErrorToBlocker(error, messageId)],
        };
      }

      const blockers = this.validateSelectedEmail(input, messageId, email);

      if (blockers.length > 0) {
        return { kind: 'BLOCKED', blockers };
      }

      emails.push(email);
    }

    const signatureResult = await this.loadSignature({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      authContext: input.authContext,
      transactionManager,
    });
    const blockers = [...signatureResult.blockers];
    const cache: AttachmentCache = new Map();
    const messageAttachments: MaterializedAttachment[][] = [];

    for (const email of emails) {
      const attachmentResult = await this.loadAttachments({
        workspaceId: input.workspaceId,
        messageId: email.messageId,
        files: email.files,
        authContext: input.authContext,
        cache,
      });

      blockers.push(...attachmentResult.blockers);
      messageAttachments.push(attachmentResult.attachments);
    }

    if (blockers.length > 0) {
      return { kind: 'BLOCKED', blockers };
    }

    return {
      kind: 'READY',
      value: {
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        workflowVersionId: input.workflowVersionId,
        signatureDigest: signatureResult.signature?.digest ?? null,
        messages: emails.map((email, index) => ({
          messageId: email.messageId,
          subject: email.subject,
          body: email.body,
          replyToThread: email.replyToThread,
          orderedFileRefs: email.files,
          orderedAttachmentProofs: messageAttachments[index].map(
            ({ bytes: _bytes, ...proof }) => proof,
          ),
        })),
      },
    };
  }

  // Shared by the per-Creator materializer so launch and render paths use the
  // same signature normalization and attachment byte-proof implementation.
  async loadMessageFixedMaterial(
    input: Readonly<{
      workspaceId: string;
      campaignId: string;
      messageId: string;
      files: readonly CampaignSequenceEmailFile[];
      authContext: WorkspaceAuthContext;
      transactionManager?: WorkspaceEntityManager;
    }>,
  ): Promise<CampaignMessageFixedMaterialLoadResult> {
    if (input.transactionManager !== undefined && input.files.length > 0) {
      return {
        signature: null,
        attachments: null,
        blockers: [
          blocker(
            'ATTACHMENT_FORBIDDEN',
            'Campaign transactional attachments are unavailable in v1',
            { messageId: input.messageId },
          ),
        ],
      };
    }
    const [signatureResult, attachmentResult] = await Promise.all([
      this.loadSignature({
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        authContext: input.authContext,
        transactionManager: input.transactionManager,
      }),
      this.loadAttachments({
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        files: input.files,
        authContext: input.authContext,
        cache: new Map(),
      }),
    ]);
    const blockers = [
      ...signatureResult.blockers,
      ...attachmentResult.blockers,
    ];

    return {
      signature: signatureResult.signature,
      attachments:
        attachmentResult.blockers.length > 0
          ? null
          : attachmentResult.attachments,
      blockers,
    };
  }

  private validateInput(
    input: CampaignSequenceFixedMaterialInput,
  ): CampaignMessageBlocker[] {
    if (
      !isJsonRecord(input) ||
      !isCanonicalUuid(input.workspaceId) ||
      !isCanonicalUuid(input.campaignId) ||
      !isCanonicalUuid(input.workflowVersionId) ||
      !Array.isArray(input.orderedMessageIds) ||
      input.orderedMessageIds.length === 0 ||
      input.orderedMessageIds.some(
        (messageId) => !isCanonicalUuid(messageId),
      ) ||
      new Set(input.orderedMessageIds).size !== input.orderedMessageIds.length
    ) {
      return [
        blocker(
          'INVALID_SEQUENCE',
          'Campaign fixed-material coordinates are invalid',
        ),
      ];
    }

    if (
      !isJsonRecord(input.authContext) ||
      !['user', 'system'].includes(String(input.authContext.type)) ||
      !isJsonRecord(input.authContext.workspace) ||
      input.authContext.workspace.id !== input.workspaceId ||
      (input.authContext.type === 'user' &&
        (!isJsonRecord(input.authContext.user) ||
          typeof input.authContext.user.id !== 'string' ||
          input.authContext.user.id.trim().length === 0 ||
          typeof input.authContext.userWorkspaceId !== 'string' ||
          input.authContext.userWorkspaceId.trim().length === 0))
    ) {
      return [
        blocker(
          'MATERIAL_STALE',
          'Fixed-material authority does not match the Campaign',
        ),
      ];
    }

    return [];
  }

  private validateSelectedEmail(
    input: CampaignSequenceFixedMaterialInput,
    expectedMessageId: string,
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
          messageId: expectedMessageId,
        }),
      ];
    }

    if (
      email.workspaceId !== input.workspaceId ||
      email.campaignId !== input.campaignId ||
      email.workflowVersionId !== input.workflowVersionId ||
      email.messageId !== expectedMessageId
    ) {
      return [
        blocker('MATERIAL_STALE', 'Selected Campaign email identity changed', {
          messageId: expectedMessageId,
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
          messageId: expectedMessageId,
        }),
      ];
    }

    return [];
  }

  private async loadSignature(
    input: Readonly<{
      workspaceId: string;
      campaignId: string;
      authContext: WorkspaceAuthContext;
      transactionManager?: WorkspaceEntityManager;
    }>,
  ): Promise<
    Readonly<{
      signature: MaterializedSignature;
      blockers: readonly CampaignMessageBlocker[];
    }>
  > {
    const result = await this.signaturePort.load(input);

    if (result.kind === 'BLOCKED') {
      return {
        signature: null,
        blockers:
          result.blockers.length > 0
            ? result.blockers
            : [blocker('MATERIAL_STALE', 'Campaign signature is unavailable')],
      };
    }

    if (result.kind === 'READY') {
      return this.materializeSignature(result);
    }

    return {
      signature: null,
      blockers: [
        blocker('MATERIAL_STALE', 'Campaign signature is unavailable'),
      ],
    };
  }

  private materializeSignature(
    result: CampaignMaterialPortResult<Readonly<{
      html: string | null;
    }> | null>,
  ): Readonly<{
    signature: MaterializedSignature;
    blockers: readonly CampaignMessageBlocker[];
  }> {
    const value = result.kind === 'READY' ? result.value : null;

    if (value === null || value.html === null) {
      return { signature: null, blockers: [] };
    }

    if (typeof value.html !== 'string') {
      return {
        signature: null,
        blockers: [
          blocker('INVALID_CONTENT', 'Campaign signature material is invalid'),
        ],
      };
    }

    if (value.html.trim().length === 0) {
      return { signature: null, blockers: [] };
    }

    return {
      signature: { html: value.html, digest: sha256(value.html) },
      blockers: [],
    };
  }

  private async loadAttachments(
    input: Readonly<{
      workspaceId: string;
      messageId: string;
      files: readonly unknown[];
      authContext: WorkspaceAuthContext;
      cache: AttachmentCache;
    }>,
  ): Promise<
    Readonly<{
      attachments: MaterializedAttachment[];
      blockers: CampaignMessageBlocker[];
    }>
  > {
    const attachments: MaterializedAttachment[] = [];
    const blockers: CampaignMessageBlocker[] = [];

    for (const file of input.files) {
      const candidateFileId =
        isJsonRecord(file) && typeof file.id === 'string' ? file.id : null;

      if (!this.isValidFileReference(file)) {
        blockers.push(
          blocker(
            'ATTACHMENT_CHANGED',
            'Campaign attachment metadata changed',
            {
              ...(candidateFileId === null ? {} : { fileId: candidateFileId }),
              messageId: input.messageId,
            },
          ),
        );
        continue;
      }

      const cacheKey = `${CAMPAIGN_SEQUENCE_FIXED_MATERIAL_INTERNAL_REVISION}:${file.id}`;
      const cached = input.cache.get(cacheKey);

      if (cached !== undefined && !sameFileReference(cached.file, file)) {
        blockers.push(
          blocker(
            'ATTACHMENT_CHANGED',
            'Campaign attachment metadata changed',
            { fileId: file.id, messageId: input.messageId },
          ),
        );
        continue;
      }

      const result =
        cached?.result ??
        (await this.attachmentPort.load({
          workspaceId: input.workspaceId,
          file,
          authContext: input.authContext,
        }));

      if (cached === undefined) {
        input.cache.set(cacheKey, { file, result });
      }

      const attachment = this.materializeAttachment(
        file,
        input.messageId,
        result,
        blockers,
      );

      if (attachment !== null) {
        attachments.push(attachment);
      }
    }

    return { attachments, blockers };
  }

  private isValidFileReference(
    file: unknown,
  ): file is CampaignSequenceEmailFile {
    return (
      isJsonRecord(file) &&
      typeof file.id === 'string' &&
      typeof file.name === 'string' &&
      typeof file.type === 'string' &&
      typeof file.createdAt === 'string' &&
      file.id.trim().length > 0 &&
      file.name.trim().length > 0 &&
      file.type.trim().length > 0 &&
      Number.isSafeInteger(file.size) &&
      typeof file.size === 'number' &&
      file.size >= 0
    );
  }

  private materializeAttachment(
    file: CampaignSequenceEmailFile,
    messageId: string,
    result: CampaignAttachmentLoadResult,
    blockers: CampaignMessageBlocker[],
  ): MaterializedAttachment | null {
    if (result.kind === 'NOT_FOUND') {
      blockers.push(
        blocker('ATTACHMENT_NOT_FOUND', 'Campaign attachment was not found', {
          fileId: file.id,
          messageId,
        }),
      );
      return null;
    }

    if (result.kind === 'FORBIDDEN') {
      blockers.push(
        blocker(
          'ATTACHMENT_FORBIDDEN',
          'Campaign attachment is not accessible',
          {
            fileId: file.id,
            messageId,
          },
        ),
      );
      return null;
    }

    if (result.kind === 'CHANGED') {
      blockers.push(
        blocker('ATTACHMENT_CHANGED', 'Campaign attachment bytes changed', {
          fileId: file.id,
          messageId,
        }),
      );
      return null;
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
          messageId,
        }),
      );
      return null;
    }

    return {
      fileId: file.id,
      filename: result.value.filename,
      contentType: result.value.contentType,
      size: result.value.bytes.length,
      contentDigest: sha256(result.value.bytes),
      bytes: result.value.bytes,
    };
  }

  private selectedEmailErrorToBlocker(
    error: unknown,
    messageId: string,
  ): CampaignMessageBlocker {
    const message = error instanceof Error ? error.message : '';

    if (message.includes('not an email')) {
      return blocker(
        'MESSAGE_NOT_EMAIL',
        'Campaign sequence message is not an email',
        { messageId },
      );
    }

    if (message.includes('email not found')) {
      return blocker('MESSAGE_NOT_FOUND', 'Campaign sequence email not found', {
        messageId,
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
        messageId,
      });
    }

    return blocker('MATERIAL_STALE', 'Campaign email material is unavailable');
  }
}

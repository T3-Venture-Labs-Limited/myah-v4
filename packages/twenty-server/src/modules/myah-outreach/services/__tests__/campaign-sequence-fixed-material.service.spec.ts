import { createHash } from 'node:crypto';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  type CampaignAttachmentStoragePort,
  type CampaignSequenceEmailFile,
  type CampaignSequenceFixedMaterialInput,
  type CampaignSignatureMaterialPort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

import { CampaignSequenceFixedMaterialService } from '../campaign-sequence-fixed-material.service';
import {
  type CampaignSequenceService,
  type ValidatedCampaignSequenceEmail,
} from '../campaign-sequence.service';

const workspaceId = '20202020-1111-4111-8111-111111111111';
const campaignId = '20202020-2222-4222-8222-222222222222';
const workflowId = '20202020-3333-4333-8333-333333333333';
const workflowVersionId = '20202020-4444-4444-8444-444444444444';
const firstMessageId = '20202020-5555-4555-8555-555555555555';
const secondMessageId = '20202020-6666-4666-8666-666666666666';
const firstFileId = '20202020-7777-4777-8777-777777777777';
const secondFileId = '20202020-8888-4888-8888-888888888888';

const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: 'user-workspace-id',
  workspaceMemberId: 'workspace-member-id',
  user: { id: 'user-id' },
  workspaceMember: {},
} as UserWorkspaceAuthContext;

const firstFile: CampaignSequenceEmailFile = {
  id: firstFileId,
  name: 'first.txt',
  size: 5,
  type: 'text/plain',
  createdAt: '2026-09-07T00:00:00.000Z',
};
const secondFile: CampaignSequenceEmailFile = {
  id: secondFileId,
  name: 'second.txt',
  size: 6,
  type: 'text/plain',
  createdAt: '2026-09-07T00:00:00.000Z',
};

const email = (
  messageId: string,
  overrides: Partial<ValidatedCampaignSequenceEmail> = {},
): ValidatedCampaignSequenceEmail => ({
  workspaceId,
  campaignId,
  workflowId,
  workflowVersionId,
  messageId,
  subject: `Subject ${messageId}`,
  body: JSON.stringify({ type: 'doc', content: [] }),
  files: messageId === firstMessageId ? [firstFile] : [secondFile],
  replyToThread: messageId === secondMessageId,
  issues: [],
  ...overrides,
});

const makeHarness = (options?: {
  emails?: Record<string, ValidatedCampaignSequenceEmail>;
  signatureResult?: Awaited<ReturnType<CampaignSignatureMaterialPort['load']>>;
  attachmentLoad?: CampaignAttachmentStoragePort['load'];
}) => {
  const emails =
    options?.emails ??
    ({
      [firstMessageId]: email(firstMessageId),
      [secondMessageId]: email(secondMessageId),
    } satisfies Record<string, ValidatedCampaignSequenceEmail>);
  const loadEmailByVersion = jest.fn(
    async ({ messageId }: { messageId: string }) => emails[messageId],
  );
  const signaturePort: CampaignSignatureMaterialPort = {
    load: jest.fn().mockResolvedValue(
      options?.signatureResult ?? {
        kind: 'READY',
        value: { html: '<p> Signature </p>' },
      },
    ),
  };
  const attachmentPort: CampaignAttachmentStoragePort = {
    load:
      options?.attachmentLoad ??
      jest.fn(async ({ file }) => ({
        kind: 'READY' as const,
        value: {
          filename: file.name,
          contentType: file.type,
          bytes: Buffer.from(file.id === firstFileId ? 'hello' : 'second'),
        },
      })),
  };
  const service = new CampaignSequenceFixedMaterialService(
    { loadEmailByVersion } as unknown as CampaignSequenceService,
    signaturePort,
    attachmentPort,
  );

  return { service, loadEmailByVersion, signaturePort, attachmentPort };
};

const input = {
  workspaceId,
  campaignId,
  workflowVersionId,
  orderedMessageIds: [firstMessageId, secondMessageId],
  authContext,
} as const;

const blockerCodes = async (
  service: CampaignSequenceFixedMaterialService,
  overrides: Partial<CampaignSequenceFixedMaterialInput> = {},
): Promise<string[]> => {
  const result = await service.loadSequenceFixedMaterial({
    ...input,
    ...overrides,
  });

  return result.kind === 'BLOCKED'
    ? result.blockers.map(({ code }) => code)
    : [];
};

describe('CampaignSequenceFixedMaterialService', () => {
  it('loads exact ordered historical Emails and projects only authored material and proofs', async () => {
    const { service, loadEmailByVersion, signaturePort, attachmentPort } =
      makeHarness();

    const result = await service.loadSequenceFixedMaterial(input);

    expect(loadEmailByVersion.mock.calls).toEqual([
      [
        {
          workspaceId,
          campaignId,
          workflowVersionId,
          messageId: firstMessageId,
          authContext,
        },
      ],
      [
        {
          workspaceId,
          campaignId,
          workflowVersionId,
          messageId: secondMessageId,
          authContext,
        },
      ],
    ]);
    expect(signaturePort.load).toHaveBeenCalledTimes(1);
    expect(signaturePort.load).toHaveBeenCalledWith({
      workspaceId,
      campaignId,
      authContext,
    });
    expect(attachmentPort.load).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      kind: 'READY',
      value: {
        workspaceId,
        campaignId,
        workflowVersionId,
        signatureDigest: createHash('sha256')
          .update('<p> Signature </p>')
          .digest('hex'),
        messages: [
          {
            messageId: firstMessageId,
            subject: `Subject ${firstMessageId}`,
            body: JSON.stringify({ type: 'doc', content: [] }),
            replyToThread: false,
            orderedFileRefs: [firstFile],
            orderedAttachmentProofs: [
              {
                fileId: firstFileId,
                filename: 'first.txt',
                contentType: 'text/plain',
                size: 5,
                contentDigest: createHash('sha256')
                  .update(Buffer.from('hello'))
                  .digest('hex'),
              },
            ],
          },
          {
            messageId: secondMessageId,
            subject: `Subject ${secondMessageId}`,
            body: JSON.stringify({ type: 'doc', content: [] }),
            replyToThread: true,
            orderedFileRefs: [secondFile],
            orderedAttachmentProofs: [
              {
                fileId: secondFileId,
                filename: 'second.txt',
                contentType: 'text/plain',
                size: 6,
                contentDigest: createHash('sha256')
                  .update(Buffer.from('second'))
                  .digest('hex'),
              },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /bytes|signatureHtml|creator|recipient|sender|composedEmail|authorization|attempt|persistence/i,
    );
  });

  it.each([
    ['empty messages', []],
    ['duplicate messages', [firstMessageId, firstMessageId]],
    ['blank message', ['']],
    ['noncanonical message', ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']],
  ])('blocks %s before reading material', async (_name, orderedMessageIds) => {
    const { service, loadEmailByVersion, signaturePort, attachmentPort } =
      makeHarness();

    expect(await blockerCodes(service, { orderedMessageIds })).toContain(
      'INVALID_SEQUENCE',
    );
    expect(loadEmailByVersion).not.toHaveBeenCalled();
    expect(signaturePort.load).not.toHaveBeenCalled();
    expect(attachmentPort.load).not.toHaveBeenCalled();
  });

  it('blocks mismatched real-user workspace auth before material reads', async () => {
    const { service, loadEmailByVersion } = makeHarness();
    const mismatchedAuth = structuredClone(authContext);

    mismatchedAuth.workspace.id = '20202020-9999-4999-8999-999999999999';

    expect(
      await blockerCodes(service, { authContext: mismatchedAuth }),
    ).toContain('MATERIAL_STALE');
    expect(loadEmailByVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['reader issues', { issues: [{ code: 'UNSELECTED_STEP_INVALID' }] }],
    [
      'workspace identity',
      { workspaceId: '20202020-9999-4999-8999-999999999999' },
    ],
    [
      'version identity',
      { workflowVersionId: '20202020-9999-4999-8999-999999999999' },
    ],
    ['message identity', { messageId: secondMessageId }],
    ['invalid subject', { subject: '   ' }],
  ] as const)('blocks the whole result for %s', async (_name, overrides) => {
    const { service, signaturePort, attachmentPort } = makeHarness({
      emails: {
        [firstMessageId]: email(
          firstMessageId,
          overrides as Partial<ValidatedCampaignSequenceEmail>,
        ),
        [secondMessageId]: email(secondMessageId),
      },
    });

    await expect(
      service.loadSequenceFixedMaterial(input),
    ).resolves.toMatchObject({
      kind: 'BLOCKED',
    });
    expect(signaturePort.load).not.toHaveBeenCalled();
    expect(attachmentPort.load).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])(
    'normalizes absent or blank signature %p without changing authored output',
    async (html) => {
      const { service } = makeHarness({
        signatureResult: { kind: 'READY', value: { html } },
      });

      await expect(
        service.loadSequenceFixedMaterial(input),
      ).resolves.toMatchObject({
        kind: 'READY',
        value: { signatureDigest: null },
      });
    },
  );

  it('treats an absent signature value as no signature', async () => {
    const { service } = makeHarness({
      signatureResult: { kind: 'READY', value: null },
    });

    await expect(
      service.loadSequenceFixedMaterial(input),
    ).resolves.toMatchObject({
      kind: 'READY',
      value: { signatureDigest: null },
    });
  });

  it('fails closed when signature loading is blocked without diagnostics', async () => {
    const { service } = makeHarness({
      signatureResult: { kind: 'BLOCKED', blockers: [] },
    });

    expect(await blockerCodes(service)).toContain('MATERIAL_STALE');
  });

  it('fails closed for an unexpected runtime signature discriminant', async () => {
    const { service } = makeHarness({
      signatureResult: {
        kind: 'UNEXPECTED',
      } as unknown as Awaited<
        ReturnType<CampaignSignatureMaterialPort['load']>
      >,
    });

    expect(await blockerCodes(service)).toContain('MATERIAL_STALE');
  });

  it('propagates signature blockers and preserves nonblank signature bytes in its digest', async () => {
    const blocked = makeHarness({
      signatureResult: {
        kind: 'BLOCKED',
        blockers: [{ code: 'MATERIAL_STALE', message: 'signature stale' }],
      },
    });
    const first = makeHarness({
      signatureResult: { kind: 'READY', value: { html: ' <p>x</p> ' } },
    });
    const changed = makeHarness({
      signatureResult: { kind: 'READY', value: { html: '<p>x</p>' } },
    });

    expect(await blockerCodes(blocked.service)).toContain('MATERIAL_STALE');
    const firstResult = await first.service.loadSequenceFixedMaterial(input);
    const changedResult =
      await changed.service.loadSequenceFixedMaterial(input);

    expect(firstResult).toMatchObject({
      kind: 'READY',
      value: {
        signatureDigest: createHash('sha256')
          .update(' <p>x</p> ')
          .digest('hex'),
      },
    });
    expect(changedResult).not.toMatchObject(firstResult);
  });

  it('loads a repeated File once while preserving proof order and multiplicity', async () => {
    const load = jest.fn(async () => ({
      kind: 'READY' as const,
      value: {
        filename: firstFile.name,
        contentType: firstFile.type,
        bytes: Buffer.from('hello'),
      },
    }));
    const { service } = makeHarness({
      emails: {
        [firstMessageId]: email(firstMessageId, {
          files: [firstFile, firstFile],
        }),
        [secondMessageId]: email(secondMessageId, { files: [firstFile] }),
      },
      attachmentLoad: load,
    });

    const result = await service.loadSequenceFixedMaterial(input);

    expect(load).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: 'READY',
      value: {
        messages: [
          {
            orderedAttachmentProofs: [
              { fileId: firstFileId },
              { fileId: firstFileId },
            ],
          },
          { orderedAttachmentProofs: [{ fileId: firstFileId }] },
        ],
      },
    });
  });

  it('blocks conflicting repeated File references without a second storage read', async () => {
    const load = jest.fn(async () => ({
      kind: 'READY' as const,
      value: {
        filename: firstFile.name,
        contentType: firstFile.type,
        bytes: Buffer.from('hello'),
      },
    }));
    const changedReference = { ...firstFile, name: 'changed.txt' };
    const { service } = makeHarness({
      emails: {
        [firstMessageId]: email(firstMessageId, { files: [firstFile] }),
        [secondMessageId]: email(secondMessageId, {
          files: [changedReference],
        }),
      },
      attachmentLoad: load,
    });

    expect(await blockerCodes(service)).toContain('ATTACHMENT_CHANGED');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('blocks malformed authored File metadata before storage access', async () => {
    const load = jest.fn();
    const { service } = makeHarness({
      emails: {
        [firstMessageId]: email(firstMessageId, {
          files: [{ ...firstFile, name: '' }],
        }),
        [secondMessageId]: email(secondMessageId, { files: [] }),
      },
      attachmentLoad: load,
    });

    expect(await blockerCodes(service)).toContain('ATTACHMENT_CHANGED');
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'NOT_FOUND' as const }, 'ATTACHMENT_NOT_FOUND'],
    [{ kind: 'FORBIDDEN' as const }, 'ATTACHMENT_FORBIDDEN'],
    [{ kind: 'CHANGED' as const }, 'ATTACHMENT_CHANGED'],
    [
      {
        kind: 'READY' as const,
        value: {
          filename: firstFile.name,
          contentType: firstFile.type,
          bytes: 'not-a-buffer' as unknown as Buffer,
        },
      },
      'ATTACHMENT_CHANGED',
    ],
  ])(
    'preserves storage/byte blocker semantics',
    async (storageResult, code) => {
      const { service } = makeHarness({
        attachmentLoad: jest.fn(async ({ file }) =>
          file.id === firstFileId
            ? storageResult
            : {
                kind: 'READY' as const,
                value: {
                  filename: secondFile.name,
                  contentType: secondFile.type,
                  bytes: Buffer.from('second'),
                },
              },
        ) as CampaignAttachmentStoragePort['load'],
      });

      expect(await blockerCodes(service)).toContain(code);
    },
  );
});

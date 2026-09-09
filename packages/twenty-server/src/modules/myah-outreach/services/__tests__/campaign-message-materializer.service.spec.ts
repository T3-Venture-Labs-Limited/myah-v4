import { createHash } from 'node:crypto';

import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  type CampaignAttachmentStoragePort,
  type CampaignCreatorMaterialPort,
  type CampaignMessageRenderCoordinates,
  type CampaignMessageRenderContext,
  type CampaignSenderMaterialPort,
  type CampaignSignatureMaterialPort,
  type CampaignThreadMaterialPort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

import { CampaignMessageMaterializerService } from '../campaign-message-materializer.service';
import { type CampaignSequenceService } from '../campaign-sequence.service';

const workspaceId = '20202020-1111-4111-8111-111111111111';
const campaignId = '20202020-2222-4222-8222-222222222222';
const campaignCreatorId = '20202020-3333-4333-8333-333333333333';
const creatorId = '20202020-4444-4444-8444-444444444444';
const workflowId = '20202020-5555-4555-8555-555555555555';
const workflowVersionId = '20202020-6666-4666-8666-666666666666';
const messageId = '20202020-7777-4777-8777-777777777777';
const fileId = '20202020-8888-4888-8888-888888888888';

const coordinates: CampaignMessageRenderCoordinates = {
  workspaceId,
  campaignId,
  campaignCreatorId,
  workflowVersionId,
  messageId,
};

const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: 'user-workspace-id',
  workspaceMemberId: 'workspace-member-id',
  user: {},
  workspaceMember: {},
} as UserWorkspaceAuthContext;

const context: CampaignMessageRenderContext = {
  kind: 'PREVIEW',
  authContext,
  requesterUserId: 'requester-user-id',
  requesterUserWorkspaceId: 'user-workspace-id',
  threadScope: { kind: 'NEW_THREAD' },
};

const body = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        {
          type: 'variableTag',
          attrs: { variable: '{{creator.name}}' },
        },
      ],
    },
  ],
});

const authoredFile = {
  id: fileId,
  name: 'brief.txt',
  size: 5,
  type: 'text/plain',
  createdAt: '2026-09-07T00:00:00.000Z',
};

const makeHarness = (overrides?: {
  subject?: string;
  body?: string;
  signatureHtml?: string | null;
  creatorVariables?: Partial<Record<'creator.name' | 'creator.email', string>>;
  attachmentResult?: Awaited<ReturnType<CampaignAttachmentStoragePort['load']>>;
  selectedEmailOverrides?: Record<string, unknown>;
}) => {
  const loadEmailByVersion = jest.fn().mockResolvedValue({
    workspaceId,
    campaignId,
    workflowId,
    workflowVersionId,
    messageId,
    subject: overrides?.subject ?? 'A subject for {{creator.name}}',
    body: overrides?.body ?? body,
    files: [authoredFile],
    replyToThread: false,
    issues: [],
    ...overrides?.selectedEmailOverrides,
  });
  const creatorPort: CampaignCreatorMaterialPort = {
    load: jest.fn().mockResolvedValue({
      kind: 'READY',
      value: {
        creatorId,
        normalizedRecipient: 'creator@example.com',
        variables: overrides?.creatorVariables ?? {
          'creator.name': 'Ada Creator',
          'creator.email': 'creator@example.com',
        },
      },
    }),
  };
  const signaturePort: CampaignSignatureMaterialPort = {
    load: jest.fn().mockResolvedValue({
      kind: 'READY',
      value:
        overrides && 'signatureHtml' in overrides
          ? { html: overrides.signatureHtml }
          : { html: '<p>Campaign signature</p>' },
    }),
  };
  const senderPort: CampaignSenderMaterialPort = {
    load: jest.fn().mockResolvedValue({
      kind: 'READY',
      value: {
        connectedAccountId: 'account-id',
        messageChannelId: 'channel-id',
        handle: 'sender@example.com',
        provider: ConnectedAccountProvider.GOOGLE,
        senderPoolFingerprint: 'pool-fingerprint',
        authorizedEmailSenderPool: [],
        projectedSlotAt: new Date('2026-09-07T12:00:00.000Z'),
        isPreviewProjection: true,
      },
    }),
  };
  const attachmentPort: CampaignAttachmentStoragePort = {
    load: jest.fn().mockResolvedValue(
      overrides?.attachmentResult ?? {
        kind: 'READY',
        value: {
          filename: authoredFile.name,
          contentType: authoredFile.type,
          bytes: Buffer.from('hello'),
        },
      },
    ),
  };
  const threadPort: CampaignThreadMaterialPort = {
    load: jest.fn().mockResolvedValue({
      kind: 'READY',
      value: { kind: 'NEW_THREAD' },
    }),
  };
  const service = new CampaignMessageMaterializerService(
    { loadEmailByVersion } as unknown as CampaignSequenceService,
    creatorPort,
    signaturePort,
    senderPort,
    attachmentPort,
    threadPort,
  );

  return {
    service,
    loadEmailByVersion,
    attachmentPort,
  };
};

const blockerCodes = async (
  service: CampaignMessageMaterializerService,
): Promise<string[]> => {
  const result = await service.load(coordinates, context);

  return result.kind === 'BLOCKED'
    ? result.blockers.map(({ code }) => code)
    : [];
};

describe('CampaignMessageMaterializerService', () => {
  it('loads the exact historical email and derives ordered authorized byte proof', async () => {
    const { service, loadEmailByVersion, attachmentPort } = makeHarness();

    const result = await service.load(coordinates, context);

    expect(loadEmailByVersion).toHaveBeenCalledWith({
      workspaceId,
      campaignId,
      workflowVersionId,
      messageId,
      authContext,
    });
    expect(attachmentPort.load).toHaveBeenCalledWith({
      workspaceId,
      file: authoredFile,
      authContext,
    });
    expect(result).toMatchObject({
      kind: 'READY',
      material: {
        coordinates,
        workflowId,
        creator: {
          creatorId,
          normalizedRecipient: 'creator@example.com',
        },
        signature: {
          html: '<p>Campaign signature</p>',
          digest: createHash('sha256')
            .update('<p>Campaign signature</p>')
            .digest('hex'),
        },
        attachments: [
          {
            fileId,
            filename: 'brief.txt',
            contentType: 'text/plain',
            size: 5,
            contentDigest: createHash('sha256')
              .update(Buffer.from('hello'))
              .digest('hex'),
            bytes: Buffer.from('hello'),
          },
        ],
      },
    });
  });

  it('uses only the frozen Creator variable allowlist and blocks unknown or missing values', async () => {
    const unknown = makeHarness({
      subject: 'Hello {{creator.instagramUsername}}',
    });
    const missing = makeHarness({
      creatorVariables: {
        'creator.name': '   ',
        'creator.email': 'creator@example.com',
      },
    });

    expect(await blockerCodes(unknown.service)).toContain('UNKNOWN_VARIABLE');
    expect(await blockerCodes(missing.service)).toContain('MISSING_VARIABLE');
  });

  it('does not treat lookalike braces in ordinary TipTap text as variables', async () => {
    const { service } = makeHarness({
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '{{creator.instagramUsername}}' }],
          },
        ],
      }),
    });

    await expect(service.load(coordinates, context)).resolves.toMatchObject({
      kind: 'READY',
    });
  });

  it.each([null, '', '   '])(
    'does not materialize blank signature markup (%p)',
    async (signatureHtml) => {
      const { service } = makeHarness({ signatureHtml });
      const result = await service.load(coordinates, context);

      expect(result).toMatchObject({
        kind: 'READY',
        material: { signature: null },
      });
    },
  );

  it.each([
    ['NOT_FOUND', 'ATTACHMENT_NOT_FOUND'],
    ['FORBIDDEN', 'ATTACHMENT_FORBIDDEN'],
    ['CHANGED', 'ATTACHMENT_CHANGED'],
  ] as const)(
    'maps %s storage results to a typed blocker',
    async (kind, expectedCode) => {
      const { service } = makeHarness({ attachmentResult: { kind } });

      expect(await blockerCodes(service)).toContain(expectedCode);
    },
  );

  it.each([
    {
      filename: 'changed.txt',
      contentType: authoredFile.type,
      bytes: Buffer.from('hello'),
    },
    {
      filename: authoredFile.name,
      contentType: 'application/octet-stream',
      bytes: Buffer.from('hello'),
    },
    {
      filename: authoredFile.name,
      contentType: authoredFile.type,
      bytes: Buffer.from('changed'),
    },
  ])('blocks changed attachment metadata or bytes', async (value) => {
    const { service } = makeHarness({
      attachmentResult: { kind: 'READY', value },
    });

    expect(await blockerCodes(service)).toContain('ATTACHMENT_CHANGED');
  });

  it('returns a typed blocker for malformed selected-email material', async () => {
    const { service } = makeHarness({
      selectedEmailOverrides: { subject: null },
    });

    await expect(service.load(coordinates, context)).resolves.toMatchObject({
      kind: 'BLOCKED',
      blockers: [expect.objectContaining({ code: 'INVALID_SEQUENCE' })],
    });
  });

  it('fails closed when unavailable internal seams are not injected', async () => {
    const loadEmailByVersion = jest.fn().mockResolvedValue({
      workspaceId,
      campaignId,
      workflowId,
      workflowVersionId,
      messageId,
      subject: 'Subject',
      body,
      files: [],
      replyToThread: false,
      issues: [],
    });
    const service = new CampaignMessageMaterializerService({
      loadEmailByVersion,
    } as unknown as CampaignSequenceService);

    const result = await service.load(coordinates, context);

    expect(result).toMatchObject({
      kind: 'BLOCKED',
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'CREATOR_NOT_FOUND' }),
        expect.objectContaining({ code: 'SENDER_UNAVAILABLE' }),
        expect.objectContaining({ code: 'MATERIAL_STALE' }),
      ]),
    });
  });
});

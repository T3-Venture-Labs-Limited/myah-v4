import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { type CampaignMessageMaterializerService } from 'src/modules/myah-outreach/services/campaign-message-materializer.service';
import {
  CAMPAIGN_EMAIL_RENDER_SCHEMA_VERSION,
  type CampaignMessageMaterial,
  type CampaignMessageRenderCoordinates,
  type CampaignMessageRenderContext,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

import { CampaignMessageRenderService } from '../campaign-message-render.service';

jest.mock(
  'src/engine/core-modules/tool/tools/email-tool/utils/render-rich-text-to-html.util',
  () => ({
    renderRichTextToHtml: jest.fn(
      async (document: unknown) =>
        `<rendered>${JSON.stringify(document)}</rendered>`,
    ),
  }),
);

const workspaceId = '20202020-1111-4111-8111-111111111111';
const campaignId = '20202020-2222-4222-8222-222222222222';
const campaignCreatorId = '20202020-3333-4333-8333-333333333333';
const workflowVersionId = '20202020-4444-4444-8444-444444444444';
const messageId = '20202020-5555-4555-8555-555555555555';
const firstFileId = '20202020-6666-4666-8666-666666666666';
const secondFileId = '20202020-7777-4777-8777-777777777777';

const coordinates: CampaignMessageRenderCoordinates = {
  workspaceId,
  campaignId,
  campaignCreatorId,
  workflowVersionId,
  messageId,
};

const context = {
  kind: 'PREVIEW',
  authContext: {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId: 'user-workspace-id',
    workspaceMemberId: 'workspace-member-id',
    user: {},
    workspaceMember: {},
  },
  requesterUserId: 'requester-user-id',
  requesterUserWorkspaceId: 'user-workspace-id',
  threadScope: { kind: 'NEW_THREAD' },
} as CampaignMessageRenderContext;

const authoredBody = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Literal {{creator.email}} and ' },
        {
          type: 'variableTag',
          attrs: { variable: '{{creator.name}}' },
        },
      ],
    },
  ],
});

const files = [
  {
    id: firstFileId,
    name: 'a.txt',
    size: 1,
    type: 'text/plain',
    createdAt: '2026-09-07T00:00:00.000Z',
  },
  {
    id: secondFileId,
    name: 'b.txt',
    size: 2,
    type: 'text/plain',
    createdAt: '2026-09-07T00:00:01.000Z',
  },
];

type DeepMutable<T> = T extends Buffer | Date
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

type MutableCampaignMessageMaterial = DeepMutable<CampaignMessageMaterial>;

const baseMaterial = (): MutableCampaignMessageMaterial => ({
  coordinates: { ...coordinates },
  workflowId: '20202020-8888-4888-8888-888888888888',
  authored: {
    subject: 'Hello {{creator.name}}',
    body: authoredBody,
    orderedFileRefs: files,
    replyToThread: false,
  },
  creator: {
    creatorId: '20202020-9999-4999-8999-999999999999',
    normalizedRecipient: 'creator@example.com',
    variables: {
      'creator.name': 'Ada Creator',
      'creator.email': 'creator@example.com',
    },
  },
  signature: {
    html: '<p>Regards, Sender</p>',
    digest: '15f8386360f278c8bcec49094f98305a1c6762d9ccea7689bd21fae903c07518',
  },
  sender: {
    connectedAccountId: 'account-id',
    messageChannelId: 'channel-id',
    handle: 'sender@example.com',
    provider: ConnectedAccountProvider.GOOGLE,
    senderPoolFingerprint: 'pool-fingerprint',
    authorizedEmailSenderPool: [],
    projectedSlotAt: new Date('2026-09-07T12:00:00.000Z'),
    isPreviewProjection: true,
  },
  attachments: [
    {
      fileId: firstFileId,
      filename: 'a.txt',
      contentType: 'text/plain',
      size: 1,
      contentDigest:
        'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      bytes: Buffer.from('a'),
    },
    {
      fileId: secondFileId,
      filename: 'b.txt',
      contentType: 'text/plain',
      size: 2,
      contentDigest:
        '3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf',
      bytes: Buffer.from('bb'),
    },
  ],
  thread: { kind: 'NEW_THREAD' },
});

const cloneMaterial = (
  material: CampaignMessageMaterial,
): MutableCampaignMessageMaterial =>
  structuredClone(material) as unknown as MutableCampaignMessageMaterial;

const makeHarness = (
  material = baseMaterial(),
  mutateComposed?: (composed: Record<string, unknown>) => void,
) => {
  const load = jest.fn().mockResolvedValue({ kind: 'READY', material });
  const composeEmail = jest.fn(async (parameters) => {
    const composed: Record<string, unknown> = {
      recipients: {
        to: [parameters.recipients.to],
        cc: [],
        bcc: [],
      },
      toRecipientsDisplay: parameters.recipients.to,
      sanitizedSubject: parameters.subject,
      plainTextBody: `text:${parameters.body}`,
      sanitizedHtmlBody: parameters.body,
      attachments: material.attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.bytes,
      })),
      connectedAccount: {
        id: material.sender.connectedAccountId,
        handle: material.sender.handle,
        provider: material.sender.provider,
      },
      messageChannelId: material.sender.messageChannelId,
      shouldPersistMessage: true,
      ...(parameters.inReplyTo === undefined
        ? {}
        : {
            inReplyTo: parameters.inReplyTo,
            threadExternalId:
              material.thread.kind === 'REPLY'
                ? material.thread.evidence.providerThreadId
                : undefined,
            references: ['reference-one'],
          }),
    };

    mutateComposed?.(composed);

    return { success: true as const, data: composed };
  });
  const service = new CampaignMessageRenderService(
    { load } as unknown as CampaignMessageMaterializerService,
    { composeEmail } as unknown as EmailComposerService,
  );

  return { service, load, composeEmail };
};

const readyRender = async (
  material = baseMaterial(),
  mutateComposed?: (composed: Record<string, unknown>) => void,
) => {
  const { service } = makeHarness(material, mutateComposed);
  const renderContext = structuredClone(context);

  renderContext.authContext.workspace.id = material.coordinates.workspaceId;
  const result = await service.renderSequenceEmail(
    material.coordinates,
    renderContext,
  );

  if (result.kind !== 'READY') {
    throw new Error(
      `Expected READY but got ${result.blockers.map(({ code }) => code).join(',')}`,
    );
  }

  return result.render;
};

describe('CampaignMessageRenderService', () => {
  it('resolves only canonical variable nodes, appends signature once, and reuses EmailComposerService', async () => {
    const { service, composeEmail } = makeHarness();

    const result = await service.renderSequenceEmail(coordinates, context);

    expect(composeEmail).toHaveBeenCalledTimes(1);
    expect(composeEmail).toHaveBeenCalledWith(
      {
        recipients: { to: 'creator@example.com' },
        subject: 'Hello Ada Creator',
        body: expect.stringContaining('<p>Regards, Sender</p>'),
        connectedAccountId: 'account-id',
        files,
      },
      {
        workspaceId,
        userId: 'requester-user-id',
        userWorkspaceId: 'user-workspace-id',
      },
    );
    const composedBody = composeEmail.mock.calls[0][0].body;

    expect(composedBody.match(/Regards, Sender/g)).toHaveLength(1);
    expect(composedBody).toContain('Literal {{creator.email}} and ');
    expect(composedBody).toContain('Ada Creator');
    expect(result).toMatchObject({
      kind: 'READY',
      render: {
        rendererRevision: CAMPAIGN_EMAIL_RENDER_SCHEMA_VERSION,
        subject: 'Hello Ada Creator',
        orderedAttachmentProofs: [
          { fileId: firstFileId },
          { fileId: secondFileId },
        ],
      },
    });
  });

  it('does not append separator markup when signature is absent', async () => {
    const material = baseMaterial();

    material.signature = null;
    const { service, composeEmail } = makeHarness(material);
    const result = await service.renderSequenceEmail(coordinates, context);

    expect(result).toMatchObject({
      kind: 'READY',
      render: { signature: null },
    });
    expect(composeEmail.mock.calls[0][0].body).not.toContain(
      'data-campaign-signature',
    );
  });

  it('produces the same digest for identical inputs and no attachment bytes in proof/result projections', async () => {
    const first = await readyRender();
    const second = await readyRender();

    expect(first.renderDigest).toBe(second.renderDigest);
    expect(first.renderDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.orderedAttachmentProofs).toEqual([
      expect.not.objectContaining({ bytes: expect.anything() }),
      expect.not.objectContaining({ bytes: expect.anything() }),
    ]);
    expect(JSON.stringify(first.orderedAttachmentProofs)).not.toContain(
      'bytes',
    );
  });

  it.each([
    [
      'workspace coordinate',
      (value: MutableCampaignMessageMaterial) => {
        value.coordinates.workspaceId = '30303030-1111-4111-8111-111111111111';
      },
    ],
    [
      'Campaign coordinate',
      (value: MutableCampaignMessageMaterial) => {
        value.coordinates.campaignId = '30303030-2222-4222-8222-222222222222';
      },
    ],
    [
      'Campaign Creator coordinate',
      (value: MutableCampaignMessageMaterial) => {
        value.coordinates.campaignCreatorId =
          '30303030-3333-4333-8333-333333333333';
      },
    ],
    [
      'WorkflowVersion coordinate',
      (value: MutableCampaignMessageMaterial) => {
        value.coordinates.workflowVersionId =
          '30303030-4444-4444-8444-444444444444';
      },
    ],
    [
      'message coordinate',
      (value: MutableCampaignMessageMaterial) => {
        value.coordinates.messageId = '30303030-5555-4555-8555-555555555555';
      },
    ],
    [
      'authored subject',
      (value: MutableCampaignMessageMaterial) => {
        value.authored.subject = 'Changed {{creator.name}}';
      },
    ],
    [
      'authored body',
      (value: MutableCampaignMessageMaterial) => {
        value.authored.body = value.authored.body.replace('Literal', 'Changed');
      },
    ],
    [
      'variable value',
      (value: MutableCampaignMessageMaterial) => {
        value.creator.variables['creator.name'] = 'Grace Creator';
      },
    ],
    [
      'Creator identity',
      (value: MutableCampaignMessageMaterial) => {
        value.creator.creatorId = '30303030-9999-4999-8999-999999999999';
      },
    ],
    [
      'normalized recipient',
      (value: MutableCampaignMessageMaterial) => {
        value.creator.normalizedRecipient = 'other@example.com';
        value.creator.variables['creator.email'] = 'other@example.com';
      },
    ],
    [
      'signature presence',
      (value: MutableCampaignMessageMaterial) => {
        value.signature = null;
      },
    ],
    [
      'signature content and digest',
      (value: MutableCampaignMessageMaterial) => {
        value.signature = {
          html: '<p>Different signature</p>',
          digest:
            '675fe8481b57f54af3a13becbc312afbaf395e5ec4aeec82212be4f26a549bc6',
        };
      },
    ],
    [
      'sender account',
      (value: MutableCampaignMessageMaterial) => {
        value.sender.connectedAccountId = 'different-account-id';
      },
    ],
    [
      'sender channel',
      (value: MutableCampaignMessageMaterial) => {
        value.sender.messageChannelId = 'different-channel-id';
      },
    ],
    [
      'sender handle',
      (value: MutableCampaignMessageMaterial) => {
        value.sender.handle = 'different-sender@example.com';
      },
    ],
    [
      'sender provider',
      (value: MutableCampaignMessageMaterial) => {
        value.sender.provider = ConnectedAccountProvider.MICROSOFT;
      },
    ],
    [
      'sender pool fingerprint',
      (value: MutableCampaignMessageMaterial) => {
        value.sender.senderPoolFingerprint = 'different-pool-fingerprint';
      },
    ],
    [
      'sender projection kind',
      (value: MutableCampaignMessageMaterial) => {
        value.sender.isPreviewProjection = false;
      },
    ],
    [
      'attachment identity',
      (value: MutableCampaignMessageMaterial) => {
        value.attachments[0].fileId = '30303030-6666-4666-8666-666666666666';
        value.authored.orderedFileRefs[0].id = value.attachments[0].fileId;
      },
    ],
    [
      'attachment filename',
      (value: MutableCampaignMessageMaterial) => {
        value.attachments[0].filename = 'changed.txt';
        value.authored.orderedFileRefs[0].name = 'changed.txt';
      },
    ],
    [
      'attachment content type',
      (value: MutableCampaignMessageMaterial) => {
        value.attachments[0].contentType = 'application/octet-stream';
        value.authored.orderedFileRefs[0].type = 'application/octet-stream';
      },
    ],
    [
      'attachment size and bytes',
      (value: MutableCampaignMessageMaterial) => {
        value.attachments[0].bytes = Buffer.from('changed');
        value.attachments[0].size = 7;
        value.attachments[0].contentDigest =
          'd67e2e944994496c8d8ec76eed0cf9f09679448d584b532bebf941852a37f5ed';
        value.authored.orderedFileRefs[0].size = 7;
      },
    ],
    [
      'attachment order',
      (value: MutableCampaignMessageMaterial) => {
        value.attachments.reverse();
        value.authored.orderedFileRefs.reverse();
      },
    ],
    [
      'planned versus new thread',
      (value: MutableCampaignMessageMaterial) => {
        value.authored.replyToThread = true;
        value.thread = {
          kind: 'PLANNED_PRIOR_STEP',
          priorMessageId: '30303030-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        };
      },
    ],
  ] as const)('changes digest for %s', async (_label, mutate) => {
    const baseline = await readyRender();
    const changed = cloneMaterial(baseMaterial());

    mutate(changed);
    const changedRender = await readyRender(changed);

    expect(changedRender.renderDigest).not.toBe(baseline.renderDigest);
  });

  it('changes digest for verified reply evidence and final thread headers', async () => {
    const first = baseMaterial();

    first.authored.replyToThread = true;
    first.thread = {
      kind: 'REPLY',
      evidence: {
        evidenceId: 'evidence-one',
        enrollmentId: 'enrollment-id',
        occurrenceId: 'occurrence-id',
        priorMessageId: 'prior-message-id',
        normalizedRecipient: first.creator.normalizedRecipient,
        connectedAccountId: first.sender.connectedAccountId,
        messageChannelId: first.sender.messageChannelId,
        senderHandle: first.sender.handle,
        providerMessageId: 'provider-message-one',
        providerThreadId: 'provider-thread-one',
      },
    };
    const second = cloneMaterial(first);

    if (second.thread.kind !== 'REPLY') {
      throw new Error('Expected reply fixture');
    }
    second.thread.evidence.evidenceId = 'evidence-two';
    second.thread.evidence.providerMessageId = 'provider-message-two';
    second.thread.evidence.providerThreadId = 'provider-thread-two';

    const firstRender = await readyRender(first);
    const secondRender = await readyRender(second, (composed) => {
      composed.threadExternalId = 'provider-thread-two';
      composed.references = ['reference-two'];
    });

    expect(secondRender.renderDigest).not.toBe(firstRender.renderDigest);
  });

  it('blocks when composer output attachment bytes differ from authorized material', async () => {
    const { service } = makeHarness(baseMaterial(), (composed) => {
      const attachments = composed.attachments as Array<{ content: Buffer }>;

      attachments[0].content = Buffer.from('tampered');
    });

    await expect(
      service.renderSequenceEmail(coordinates, context),
    ).resolves.toMatchObject({
      kind: 'BLOCKED',
      blockers: [expect.objectContaining({ code: 'ATTACHMENT_CHANGED' })],
    });
  });

  it('propagates typed material blockers without composing or performing side effects', async () => {
    const load = jest.fn().mockResolvedValue({
      kind: 'BLOCKED',
      blockers: [{ code: 'INVALID_SEQUENCE', message: 'Invalid sequence' }],
    });
    const composeEmail = jest.fn();
    const service = new CampaignMessageRenderService(
      { load } as unknown as CampaignMessageMaterializerService,
      { composeEmail } as unknown as EmailComposerService,
    );

    await expect(
      service.renderSequenceEmail(coordinates, context),
    ).resolves.toEqual({
      kind: 'BLOCKED',
      blockers: [{ code: 'INVALID_SEQUENCE', message: 'Invalid sequence' }],
    });
    expect(composeEmail).not.toHaveBeenCalled();
  });
});

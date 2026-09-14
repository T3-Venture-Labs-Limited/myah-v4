import { CampaignExecutionApplicationService } from 'src/modules/campaign-execution/services/campaign-execution-application.service';
import { buildCampaignSenderAuthorityDigest } from 'src/modules/campaign-execution/utils/campaign-launch-proof.util';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const campaignId = '20000000-0000-4000-8000-000000000002';
const key = '30000000-0000-4000-8000-000000000003';
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: '40000000-0000-4000-8000-000000000004',
  user: { id: '50000000-0000-4000-8000-000000000005' },
  workspaceMemberId: '60000000-0000-4000-8000-000000000006',
} as never;

const makeService = (messages: Record<string, unknown>[]) => {
  const execution = {
    lookupStartReplay: jest.fn().mockResolvedValue(null),
    startCampaign: jest.fn(),
    pauseCampaign: jest.fn(),
    updateSendingWindow: jest.fn(),
  };
  const sequence = {
    load: jest.fn().mockResolvedValue({
      kind: 'SEQUENCE',
      snapshot: {
        workflowId: '70000000-0000-4000-8000-000000000007',
        versionId: '80000000-0000-4000-8000-000000000008',
        issues: [],
        sequence: { messages, delaysSeconds: messages.slice(1).map(() => 0) },
      },
    }),
  };
  const sender = {
    getCampaignEmailSenderPool: jest.fn().mockResolvedValue({
      mailboxes: [{ bindingStatus: 'RESOLVED_BINDING', status: 'READY' }],
      senderPoolFingerprint: 'a'.repeat(64),
      serializationRevision: 'v1',
      rotationPolicyId: 'single',
    }),
  };
  const query = jest.fn().mockResolvedValue([
    {
      timeZone: 'UTC',
      startLocalTime: '09:00:00',
      endLocalTime: '17:00:00',
      campaignCapacityTimeZone: 'UTC',
      workspaceCapacityTimeZone: 'UTC',
    },
  ]);
  const connect = jest.fn().mockResolvedValue(undefined);
  const release = jest.fn().mockResolvedValue(undefined);
  const createQueryRunner = jest.fn().mockReturnValue({
    connect,
    query,
    release,
  });
  const manager = {
    getGlobalWorkspaceDataSource: jest
      .fn()
      .mockResolvedValue({ createQueryRunner }),
  };
  const fixedMaterial = {
    loadSequenceFixedMaterial: jest.fn().mockResolvedValue({
      kind: 'READY',
      value: {
        workspaceId,
        campaignId,
        workflowVersionId: '80000000-0000-4000-8000-000000000008',
        signatureDigest: null,
        messages: messages
          .filter((message) => message.channel === 'EMAIL')
          .map((message) => ({
            messageId: message.id,
            subject: message.subject,
            body: message.body,
            replyToThread: message.replyToThread,
            orderedFileRefs: message.files,
            orderedAttachmentProofs: [],
          })),
      },
    }),
  };
  return {
    service: new CampaignExecutionApplicationService(
      execution as never,
      sequence as never,
      sender as never,
      manager as never,
      fixedMaterial as never,
    ),
    execution,
    sequence,
    sender,
    fixedMaterial,
    createQueryRunner,
    connect,
    query,
    release,
  };
};

describe('CampaignExecutionApplicationService', () => {
  it('returns a durable replay before mutable preparation', async () => {
    const harness = makeService([]);
    harness.execution.lookupStartReplay.mockResolvedValue({
      status: 'REPLAYED',
      mayActivate: false,
      activation: {},
    });
    harness.sequence.load.mockRejectedValue(new Error('changed readiness'));

    await expect(
      harness.service.start(campaignId, key, authContext),
    ).resolves.toMatchObject({ status: 'ACKNOWLEDGED', replayed: true });
    expect(harness.sequence.load).not.toHaveBeenCalled();
    expect(harness.sender.getCampaignEmailSenderPool).not.toHaveBeenCalled();
    expect(harness.execution.startCampaign).not.toHaveBeenCalled();
  });

  it('fails closed for any used Instagram node before transaction/provider work', async () => {
    const harness = makeService([
      {
        id: '90000000-0000-4000-8000-000000000009',
        channel: 'INSTAGRAM',
        text: 'hello',
      },
    ]);
    await expect(
      harness.service.start(campaignId, key, authContext),
    ).resolves.toEqual({
      status: 'BLOCKED',
      lifecycleStatus: null,
      reason: 'EMAIL_ONLY',
      replayed: false,
      changed: false,
      inFlightCount: null,
    });
    expect(harness.sender.getCampaignEmailSenderPool).not.toHaveBeenCalled();
    expect(harness.execution.startCampaign).not.toHaveBeenCalled();
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('server-prepares an email-only request and delegates exactly once without provider sends', async () => {
    const harness = makeService([
      {
        id: '90000000-0000-4000-8000-000000000009',
        channel: 'EMAIL',
        subject: 'Hello',
        body: 'Body',
        files: [],
        replyToThread: false,
      },
    ]);
    harness.execution.startCampaign.mockResolvedValue({
      status: 'ACTIVATED',
      mayActivate: true,
      activation: {},
    });
    await expect(
      harness.service.start(campaignId, key, authContext),
    ).resolves.toMatchObject({ status: 'STARTED', changed: true });
    expect(harness.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(harness.execution.startCampaign).toHaveBeenCalledTimes(1);
    expect(
      harness.fixedMaterial.loadSequenceFixedMaterial,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        campaignId,
        orderedMessageIds: ['90000000-0000-4000-8000-000000000009'],
      }),
    );
    expect(harness.execution.startCampaign.mock.calls[0][0]).toMatchObject({
      campaignId,
      startIdempotencyKey: key,
      request: {
        preparedProof: {
          usedChannels: ['EMAIL'],
          orderedMessageIds: ['90000000-0000-4000-8000-000000000009'],
        },
        reviewedWindow: { timeZone: 'UTC' },
        campaignCapacityTimeZone: 'UTC',
      },
    });
    expect(harness.execution.startCampaign.mock.calls[0][0]).not.toHaveProperty(
      'provider',
    );
  });

  it('fails closed when canonical signature or attachment material is unavailable', async () => {
    const harness = makeService([
      {
        id: '90000000-0000-4000-8000-000000000009',
        channel: 'EMAIL',
        subject: 'Hello',
        body: 'Body',
        files: ['missing-file'],
        replyToThread: false,
      },
    ]);
    harness.fixedMaterial.loadSequenceFixedMaterial.mockResolvedValue({
      kind: 'BLOCKED',
      blockers: [
        {
          code: 'ATTACHMENT_REFERENCE_INVALID',
          messageId: '90000000-0000-4000-8000-000000000009',
          fileIndex: 0,
        },
      ],
    });

    await expect(
      harness.service.start(campaignId, key, authContext),
    ).resolves.toMatchObject({
      status: 'BLOCKED',
      reason: 'ATTACHMENTS_UNAVAILABLE',
    });
    expect(harness.execution.startCampaign).not.toHaveBeenCalled();
  });

  it('prepares one or more READY senders from a mixed selected pool', async () => {
    const harness = makeService([
      {
        id: '90000000-0000-4000-8000-000000000009',
        channel: 'EMAIL',
        subject: 'Hello',
        body: 'Body',
        files: [],
        replyToThread: false,
      },
    ]);
    const readyMailboxOne = {
      bindingStatus: 'RESOLVED_BINDING',
      status: 'READY',
      connectedAccountId: 'a',
    };
    const blockedMailbox = {
      bindingStatus: 'RESOLVED_BINDING',
      status: 'BLOCKED',
      connectedAccountId: 'b',
    };
    const readyMailboxTwo = {
      bindingStatus: 'RESOLVED_BINDING',
      status: 'READY',
      connectedAccountId: 'c',
    };
    const pool = {
      mailboxes: [readyMailboxOne, blockedMailbox, readyMailboxTwo],
      senderPoolFingerprint: 'd'.repeat(64),
      serializationRevision: 'v1',
      rotationPolicyId: 'stable-rotation',
    };
    harness.sender.getCampaignEmailSenderPool.mockResolvedValue(pool);
    harness.execution.startCampaign.mockResolvedValue({
      status: 'ACTIVATED',
      mayActivate: true,
      activation: {},
    });

    await expect(
      harness.service.start(campaignId, key, authContext),
    ).resolves.toMatchObject({ status: 'STARTED', changed: true });

    expect(
      harness.execution.startCampaign.mock.calls[0][0].request.preparedProof,
    ).toMatchObject({
      senderPoolFingerprint: pool.senderPoolFingerprint,
      senderAuthorityDigest: buildCampaignSenderAuthorityDigest({
        readySenderBindings: [readyMailboxOne, readyMailboxTwo],
        senderPoolFingerprint: pool.senderPoolFingerprint,
        senderPoolSerializationRevision: pool.serializationRevision,
        senderPoolRotationPolicyId: pool.rotationPolicyId,
      }),
    });
  });

  it('blocks truthfully when the selected pool has no resolved READY sender', async () => {
    const harness = makeService([
      {
        id: '90000000-0000-4000-8000-000000000009',
        channel: 'EMAIL',
        subject: 'Hello',
        body: 'Body',
        files: [],
        replyToThread: false,
      },
    ]);
    harness.sender.getCampaignEmailSenderPool.mockResolvedValue({
      mailboxes: [
        { bindingStatus: 'RESOLVED_BINDING', status: 'BLOCKED' },
        { bindingStatus: 'MISSING_CORE_BINDING', status: 'BLOCKED' },
      ],
      senderPoolFingerprint: 'd'.repeat(64),
      serializationRevision: 'v1',
      rotationPolicyId: 'stable-rotation',
    });

    await expect(
      harness.service.start(campaignId, key, authContext),
    ).resolves.toMatchObject({
      status: 'BLOCKED',
      reason: 'AT_LEAST_ONE_READY_EMAIL_MAILBOX_REQUIRED',
    });
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.execution.startCampaign).not.toHaveBeenCalled();
  });

  it('acknowledges a historical replay without inventing current lifecycle or in-flight state', async () => {
    const harness = makeService([
      {
        id: '90000000-0000-4000-8000-000000000009',
        channel: 'EMAIL',
        subject: 'Hello',
        body: 'Body',
        files: [],
        replyToThread: false,
      },
    ]);
    harness.execution.startCampaign.mockResolvedValue({
      status: 'REPLAYED',
      mayActivate: false,
      activation: {},
    });

    await expect(
      harness.service.start(campaignId, key, authContext),
    ).resolves.toEqual({
      status: 'ACKNOWLEDGED',
      lifecycleStatus: null,
      reason: null,
      replayed: true,
      changed: false,
      inFlightCount: null,
    });
  });

  it('releases the preflight query runner when the sending-window read fails', async () => {
    const harness = makeService([
      {
        id: '90000000-0000-4000-8000-000000000009',
        channel: 'EMAIL',
        subject: 'Hello',
        body: 'Body',
        files: [],
        replyToThread: false,
      },
    ]);
    harness.query.mockRejectedValueOnce(new Error('window read failed'));

    await expect(
      harness.service.start(campaignId, key, authContext),
    ).rejects.toThrow('window read failed');
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(harness.execution.startCampaign).not.toHaveBeenCalled();
  });

  it('delegates the editable Campaign sending window without a workspace-timezone fallback', async () => {
    const harness = makeService([]);
    harness.execution.updateSendingWindow.mockResolvedValue({
      status: 'UPDATED',
      createdExecution: true,
    });
    await expect(
      harness.service.updateSendingWindow(
        campaignId,
        {
          timeZone: 'America/New_York',
          startLocalTime: '09:00:00',
          endLocalTime: '17:00:00',
        },
        authContext,
      ),
    ).resolves.toEqual({ status: 'UPDATED', reason: null });
    expect(harness.execution.updateSendingWindow).toHaveBeenCalledWith({
      workspaceId,
      campaignId,
      authContext,
      window: {
        timeZone: 'America/New_York',
        startLocalTime: '09:00:00',
        endLocalTime: '17:00:00',
      },
    });
  });

  it('maps PAUSED to user-facing STOPPED and preserves in-flight truth on idempotent Stop', async () => {
    const harness = makeService([]);
    harness.execution.pauseCampaign.mockResolvedValue({
      status: 'PAUSED',
      changed: false,
      lifecycleStatus: 'PAUSED',
      campaignExecutionId: key,
      inFlightCount: 2,
    });
    await expect(
      harness.service.stop(campaignId, authContext),
    ).resolves.toEqual({
      status: 'STOPPED',
      lifecycleStatus: 'STOPPED',
      reason: null,
      replayed: false,
      changed: false,
      inFlightCount: 2,
    });
    expect(harness.execution.pauseCampaign).toHaveBeenCalledWith({
      workspaceId,
      campaignId,
      authContext,
    });
  });
});

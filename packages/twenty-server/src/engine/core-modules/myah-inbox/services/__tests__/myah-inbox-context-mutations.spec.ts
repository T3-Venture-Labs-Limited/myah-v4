import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const threadId = '00000000-0000-4000-8000-000000000002';
const draftId = '00000000-0000-4000-8000-000000000003';
const user = { id: 'user' };
const input = {
  expectedWorkspaceId: workspaceId,
  workspace: { id: workspaceId },
  user,
  workspaceMemberId: 'member',
  authContext: {
    type: 'user',
    user,
    workspace: { id: workspaceId },
    workspaceMemberId: 'member',
  },
  target: {
    channel: ReplyChannel.EMAIL,
    threadId,
    contactId: encodeMyahInboxContactId({
      workspaceId,
      identity: { kind: 'email-thread', recordId: threadId },
    }),
  },
  replyContext: { kind: ReplyContextKind.GENERAL },
  expectedRevision: 4,
  body: { markdown: 'A', blocknote: null },
};
const setup = () => {
  const snapshot = {
    draftId,
    revision: 4,
    body: input.body,
    proposalContextFingerprint: 'a'.repeat(64),
    reviewedContextFingerprint: null,
  };
  const resolved = {
    target: {
      channel: ReplyChannel.EMAIL,
      deliveryTargetId: threadId,
      contactAnchor: { kind: 'EMAIL_THREAD', id: threadId },
      creatorId: null,
    },
    selected: input.replyContext,
    state: 'READY',
    contextFingerprint: 'b'.repeat(64),
  };
  const approvals = {
    executeInboxReplyTargetLocked: jest.fn(async (_input, run) => run()),
    getInboxReplyTargetExecutionState: jest.fn(
      async (): Promise<string | null> => null,
    ),
  };
  const contexts = {
    resolveForAction: jest.fn(async () => resolved),
    resolveForRead: jest.fn(async () => resolved),
  };
  const drafts = {
    read: jest.fn(async () => snapshot),
    save: jest.fn(async () => ({
      status: 'SAVED',
      revision: 5,
      body: input.body,
    })),
    review: jest.fn(async () => ({
      ...snapshot,
      reviewedContextFingerprint: resolved.contextFingerprint,
    })),
  };
  const Service = MyahInboxMutationService as unknown as new (
    ...args: unknown[]
  ) => MyahInboxMutationService;
  const service = new Service({}, {}, {}, approvals, {}, contexts, drafts);
  return { service, approvals, contexts, drafts };
};

describe('Myah Inbox public context mutations', () => {
  it('saves only the resolved anchored context and never acknowledges changed guidance on an edit', async () => {
    const { service, drafts, approvals } = setup();
    await expect(
      service.saveMyahInboxDraft(input as never),
    ).resolves.toMatchObject({ status: 'SAVED' });
    expect(drafts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        deliveryTargetId: threadId,
        contactAnchorId: threadId,
        context: input.replyContext,
        expectedRevision: 4,
        body: input.body,
      }),
    );
    expect(drafts.review).not.toHaveBeenCalled();
    expect(approvals.executeInboxReplyTargetLocked).toHaveBeenCalled();
  });
  it('rejects stale proposal fingerprints and target-wide UNKNOWN before a write', async () => {
    const { service, drafts, approvals } = setup();
    await expect(
      service.saveMyahInboxDraft({
        ...input,
        proposalContextFingerprint: 'a'.repeat(64),
      } as never),
    ).rejects.toThrow();
    approvals.getInboxReplyTargetExecutionState.mockResolvedValue('UNKNOWN');
    await expect(service.saveMyahInboxDraft(input as never)).rejects.toThrow();
    expect(drafts.save).not.toHaveBeenCalled();
  });
  it('acknowledges F2 only by explicit exact-revision review', async () => {
    const { service, drafts } = setup();
    const review = {
      ...input,
      expectedDraftRevision: 4,
      expectedContextFingerprint: 'b'.repeat(64),
    };
    await expect(
      service.reviewMyahInboxReplyContext(review as never),
    ).resolves.toMatchObject({ reviewedContextFingerprint: 'b'.repeat(64) });
    expect(drafts.review).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewedContextFingerprint: 'b'.repeat(64),
        deliveryTargetId: threadId,
      }),
    );
    await expect(
      service.reviewMyahInboxReplyContext({
        ...review,
        expectedDraftRevision: 3,
      } as never),
    ).rejects.toThrow();
  });
});

it('rejects missing public target/context fields instead of retaining thread-only GraphQL writers', async () => {
  const { validate } = await import('class-validator');
  const { SendMyahInboxReplyInput } =
    await import('src/engine/core-modules/myah-inbox/dtos/send-myah-inbox-reply.input');
  const { GenerateMyahInboxReplyProposalInput } =
    await import('src/engine/core-modules/myah-inbox/dtos/generate-myah-inbox-reply-proposal.input');
  for (const Input of [
    SendMyahInboxReplyInput,
    GenerateMyahInboxReplyProposalInput,
  ]) {
    const errors = await validate(
      Object.assign(new Input(), {
        expectedWorkspaceId: workspaceId,
        threadId,
        expectedDraftRevision: 4,
        operatorInstructions: 'Reply',
      }),
    );
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['target', 'replyContext']),
    );
  }
});

it('captures the selected context fingerprint and releases the target lock before proposal generation', async () => {
  const { MyahInboxReplyProposalService } =
    await import('src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service');
  let locked = false;
  const resolved = {
    state: 'READY',
    contextFingerprint: 'b'.repeat(64),
    selected: input.replyContext,
    target: { deliveryTargetId: threadId },
  };
  const contexts = { resolveForAction: jest.fn(async () => resolved) };
  const approvals = {
    executeInboxReplyTargetLocked: jest.fn(async (_input, run) => {
      locked = true;
      try {
        return await run();
      } finally {
        locked = false;
      }
    }),
    getInboxReplyTargetExecutionState: jest.fn(async () => null),
  };
  const Service = MyahInboxReplyProposalService as unknown as new (
    ...args: unknown[]
  ) => InstanceType<typeof MyahInboxReplyProposalService>;
  const service = new Service({}, {}, {}, {}, {}, {}, {}, contexts, approvals);
  const generate = jest
    .spyOn(service, 'generateReplyProposal')
    .mockImplementation(async () => {
      expect(locked).toBe(false);
      return { body: input.body };
    });
  await expect(
    service.generateContextReplyProposal({
      ...input,
      operatorInstructions: 'Reply',
      expectedContextFingerprint: 'b'.repeat(64),
    } as never),
  ).resolves.toMatchObject({ contextFingerprint: 'b'.repeat(64) });
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({ threadId, selectedContext: resolved }),
  );
  await expect(
    service.generateContextReplyProposal({
      ...input,
      operatorInstructions: 'Reply',
      expectedContextFingerprint: 'a'.repeat(64),
    } as never),
  ).rejects.toThrow();
  expect(generate).toHaveBeenCalledTimes(1);
});

it('does not expose or restore a rejected v2 draft after context read permission is lost', async () => {
  const { service, contexts, drafts } = setup();
  contexts.resolveForRead.mockRejectedValue(
    new Error('Context permission lost'),
  );
  await expect(
    service.saveMyahInboxContextDraftAfterProviderFailure({
      ...input,
      snapshot: {
        channel: 'EMAIL',
        deliveryTargetId: threadId,
        draftId,
        contactAnchor: { kind: 'EMAIL_THREAD', id: threadId },
        replyContext: { kind: 'GENERAL' },
      },
    } as never),
  ).rejects.toThrow('Context permission lost');
  expect(drafts.save).not.toHaveBeenCalled();
});

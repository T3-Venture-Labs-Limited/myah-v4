import { createHash } from 'crypto';

import { InstagramReplyApprovalService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-approval.service';

type ApprovalRequest = {
  id: string;
  workspaceId: string;
  userWorkspaceId: string;
  threadId: string;
  approvalId: string;
  toolName: string;
  connectedAccountId: string;
  draftId: string;
  conversationId: string;
  previewTextSha256: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  approvedAt: Date | null;
};

type Receipt = {
  id: string;
  approvalRequestId: string;
  state: 'PROCESSING' | 'SENT' | 'FAILED' | 'BLOCKED' | 'UNKNOWN';
};

const workspaceId = '7c36727d-117e-491b-8676-14e31daf610f';
const userWorkspaceId = '5f2ca278-f41f-4cf8-9b8d-a9ce5a9f2c76';
const otherUserWorkspaceId = '11e3d652-7ddb-4af3-9d36-7b99430a2b69';
const threadId = 'a99a4f1c-e934-4a7c-ab77-7df745bf3a8c';
const approvalId = 'e437e762-d5f3-4ab6-b33d-363e38e4c6ee';
const draftId = 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b';
const conversationId = '2370f3fb-5738-458c-ae4d-0bdb2c24611e';
const connectedAccountId = 'ca_instagram_123';

const previewText = 'Thanks for reaching out — I would love to help.';
const previewTextSha256 = createHash('sha256')
  .update(previewText)
  .digest('hex');

const createApprovalRepository = () => {
  const requests = new Map<string, ApprovalRequest>();

  return {
    requests,
    save: jest.fn(
      async (
        _workspaceId: string,
        request: ApprovalRequest,
      ): Promise<ApprovalRequest> => {
        const scopedRequest = { ...request, workspaceId: _workspaceId };
        requests.set(scopedRequest.id, scopedRequest);

        return scopedRequest;
      },
    ),
    findOneBy: jest.fn(
      async (
        _workspaceId: string,
        where: Partial<ApprovalRequest>,
      ): Promise<ApprovalRequest | undefined> =>
        Array.from(requests.values()).find((request) =>
          Object.entries(where).every(
            ([key, value]) => request[key as keyof ApprovalRequest] === value,
          ),
        ),
    ),
  };
};

const createReceiptRepository = () => {
  const receipts = new Map<string, Receipt>();

  return {
    receipts,
    create: jest.fn((receipt: Receipt) => receipt),
    save: jest.fn(async (receipt: Receipt) => {
      if (
        Array.from(receipts.values()).some(
          (saved) => saved.approvalRequestId === receipt.approvalRequestId,
        )
      ) {
        throw Object.assign(new Error('duplicate receipt'), { code: '23505' });
      }

      receipts.set(receipt.id, receipt);
      return receipt;
    }),
    findOneBy: jest.fn(async (where: Partial<Receipt>) =>
      Array.from(receipts.values()).find((receipt) =>
        Object.entries(where).every(
          ([key, value]) => receipt[key as keyof Receipt] === value,
        ),
      ),
    ),
  };
};

describe('InstagramReplyApprovalService', () => {
  const createService = () => {
    const approvalRepository = createApprovalRepository();
    const receiptRepository = createReceiptRepository();

    return {
      approvalRepository,
      receiptRepository,
      service: new InstagramReplyApprovalService(
        approvalRepository as never,
        receiptRepository as never,
      ),
    };
  };

  const createPendingApproval = async (
    service: InstagramReplyApprovalService,
  ) =>
    service.createPendingApproval({
      workspaceId,
      userWorkspaceId,
      threadId,
      approvalId,
      toolName: 'send_instagram_reply',
      connectedAccountId,
      draftId,
      conversationId,
      previewTextSha256,
    });

  it('persists an immutable request bound to the initiating member and exact preview', async () => {
    const { service, approvalRepository } = createService();

    const request = await createPendingApproval(service);

    expect(request).toMatchObject({
      workspaceId,
      userWorkspaceId,
      threadId,
      approvalId,
      toolName: 'send_instagram_reply',
      connectedAccountId,
      draftId,
      conversationId,
      previewTextSha256,
      state: 'PENDING',
      decidedAt: null,
    });
    expect(approvalRepository.save).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        approvalId,
        connectedAccountId,
        draftId,
        conversationId,
        previewTextSha256,
      }),
    );
  });

  it('does not let another member approve the bound request', async () => {
    const { service } = createService();
    const request = await createPendingApproval(service);

    await expect(
      service.resolveApproval({
        workspaceId,
        userWorkspaceId: otherUserWorkspaceId,
        approvalId: request.approvalId,
        decision: 'approved',
      }),
    ).rejects.toThrow('only the initiating workspace member may approve');
  });

  it('transitions only an approved request into a single processing receipt', async () => {
    const { service } = createService();
    const request = await createPendingApproval(service);

    await service.resolveApproval({
      workspaceId,
      userWorkspaceId,
      approvalId: request.approvalId,
      decision: 'approved',
    });

    const firstReservation = await service.reserveExecution({
      workspaceId,
      approvalId: request.approvalId,
      userWorkspaceId,
      threadId,
    });
    const replay = await service.reserveExecution({
      workspaceId,
      approvalId: request.approvalId,
      userWorkspaceId,
      threadId,
    });

    expect(firstReservation.receipt).toMatchObject({
      approvalRequestId: request.id,
      state: 'PROCESSING',
    });
    expect(firstReservation.created).toBe(true);
    expect(replay).toMatchObject({
      approvalRequest: request,
      created: false,
      receipt: firstReservation.receipt,
    });
  });

  it('rejects a receipt reservation from another thread or workspace member', async () => {
    const { service } = createService();
    const request = await createPendingApproval(service);

    await service.resolveApproval({
      workspaceId,
      userWorkspaceId,
      approvalId: request.approvalId,
      decision: 'approved',
    });

    await expect(
      service.reserveExecution({
        workspaceId,
        userWorkspaceId: otherUserWorkspaceId,
        threadId,
        approvalId: request.approvalId,
      }),
    ).rejects.toThrow('bound to another thread and workspace member');
  });

  it.each(['rejected', 'changes_requested'] as const)(
    'does not issue a receipt after a %s decision',
    async (decision) => {
      const { service } = createService();
      const request = await createPendingApproval(service);

      await service.resolveApproval({
        workspaceId,
        userWorkspaceId,
        approvalId: request.approvalId,
        decision,
      });

      await expect(
        service.reserveExecution({
          workspaceId,
          approvalId: request.approvalId,
          userWorkspaceId,
          threadId,
        }),
      ).rejects.toThrow('approved approval request');
    },
  );
});

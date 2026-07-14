import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  InstagramReplyApprovalRequestEntity,
  InstagramReplyApprovalState,
} from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-approval-request.entity';
import {
  InstagramReplyExecutionReceiptEntity,
  InstagramReplyExecutionState,
} from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-execution-receipt.entity';
import { InstagramReplyDraftService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-draft.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const APPROVAL_TTL_MS = 30 * 60 * 1000;

type ExecutionReceiptRepository = {
  create: (
    receipt: Partial<InstagramReplyExecutionReceiptEntity>,
  ) => InstagramReplyExecutionReceiptEntity;
  save: (
    receipt: InstagramReplyExecutionReceiptEntity,
  ) => Promise<InstagramReplyExecutionReceiptEntity>;
  findOneBy: (
    where: Partial<InstagramReplyExecutionReceiptEntity>,
  ) => Promise<InstagramReplyExecutionReceiptEntity | null>;
};

export type CreateInstagramReplyApprovalInput = {
  workspaceId: string;
  userWorkspaceId: string;
  threadId: string;
  approvalId: string;
  toolName: 'send_instagram_reply';
  connectedAccountId: string;
  draftId: string;
  conversationId: string;
  previewTextSha256: string;
};

export type ResolveInstagramReplyApprovalInput = {
  workspaceId: string;
  userWorkspaceId: string;
  approvalId: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
};

@Injectable()
export class InstagramReplyApprovalService {
  constructor(
    @InjectWorkspaceScopedRepository(InstagramReplyApprovalRequestEntity)
    private readonly approvalRequestRepository: WorkspaceScopedRepository<InstagramReplyApprovalRequestEntity>,
    // Receipt records have no workspaceId; their approval-request FK enforces ownership.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(InstagramReplyExecutionReceiptEntity)
    private readonly executionReceiptRepository: ExecutionReceiptRepository,
    private readonly instagramReplyDraftService: InstagramReplyDraftService,
  ) {}

  async createPendingApproval(
    input: CreateInstagramReplyApprovalInput,
  ): Promise<InstagramReplyApprovalRequestEntity> {
    await this.instagramReplyDraftService.validateApprovalBinding(input);

    const existingRequest = await this.approvalRequestRepository.findOneBy(
      input.workspaceId,
      { approvalId: input.approvalId },
    );

    if (existingRequest) {
      if (
        existingRequest.userWorkspaceId !== input.userWorkspaceId ||
        existingRequest.threadId !== input.threadId ||
        existingRequest.toolName !== input.toolName ||
        existingRequest.connectedAccountId !== input.connectedAccountId ||
        existingRequest.draftId !== input.draftId ||
        existingRequest.conversationId !== input.conversationId ||
        existingRequest.previewTextSha256 !== input.previewTextSha256
      ) {
        throw new Error(
          'Instagram reply approval ID is already bound to a different request.',
        );
      }

      return existingRequest;
    }

    const now = new Date();
    return this.approvalRequestRepository.save(input.workspaceId, {
      id: randomUUID(),
      userWorkspaceId: input.userWorkspaceId,
      threadId: input.threadId,
      approvalId: input.approvalId,
      toolName: input.toolName,
      connectedAccountId: input.connectedAccountId,
      draftId: input.draftId,
      conversationId: input.conversationId,
      previewTextSha256: input.previewTextSha256,
      state: InstagramReplyApprovalState.PENDING,
      expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
      decidedAt: null,
    });
  }

  async resolveApproval(
    input: ResolveInstagramReplyApprovalInput,
  ): Promise<InstagramReplyApprovalRequestEntity> {
    const request = await this.approvalRequestRepository.findOneBy(
      input.workspaceId,
      { approvalId: input.approvalId },
    );

    if (!request) {
      throw new Error('Instagram reply approval request was not found');
    }

    if (request.userWorkspaceId !== input.userWorkspaceId) {
      throw new Error(
        'only the initiating workspace member may approve an Instagram reply',
      );
    }

    if (request.state !== InstagramReplyApprovalState.PENDING) {
      throw new Error('Instagram reply approval request is no longer pending');
    }

    request.state = this.toApprovalState(input.decision);
    request.decidedAt = new Date();

    return this.approvalRequestRepository.save(input.workspaceId, request);
  }

  async reserveExecution(input: {
    workspaceId: string;
    userWorkspaceId: string;
    threadId: string;
    approvalId: string;
  }): Promise<{
    approvalRequest: InstagramReplyApprovalRequestEntity;
    created: boolean;
    receipt: InstagramReplyExecutionReceiptEntity;
  }> {
    const request = await this.approvalRequestRepository.findOneBy(
      input.workspaceId,
      { approvalId: input.approvalId },
    );

    if (!request || request.state !== InstagramReplyApprovalState.APPROVED) {
      throw new Error('An approved approval request is required');
    }

    if (
      request.userWorkspaceId !== input.userWorkspaceId ||
      request.threadId !== input.threadId
    ) {
      throw new Error(
        'Instagram reply approval request is bound to another thread and workspace member',
      );
    }

    if (request.expiresAt < new Date()) {
      throw new Error('Instagram reply approval request has expired');
    }

    const receipt = this.executionReceiptRepository.create({
      id: randomUUID(),
      approvalRequestId: request.id,
      state: InstagramReplyExecutionState.PROCESSING,
      providerMessageId: null,
      failureCode: null,
      failureReason: null,
    });

    try {
      return {
        approvalRequest: request,
        created: true,
        receipt: await this.executionReceiptRepository.save(receipt),
      };
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const priorReceipt = await this.executionReceiptRepository.findOneBy({
        approvalRequestId: request.id,
      });

      if (!priorReceipt) {
        throw error;
      }

      return {
        approvalRequest: request,
        created: false,
        receipt: priorReceipt,
      };
    }
  }

  async finalizeExecution({
    receipt,
    state,
    providerMessageId = null,
    failureCode = null,
    failureReason = null,
  }: {
    receipt: InstagramReplyExecutionReceiptEntity;
    state:
      | InstagramReplyExecutionState.SENT
      | InstagramReplyExecutionState.FAILED
      | InstagramReplyExecutionState.BLOCKED
      | InstagramReplyExecutionState.UNKNOWN;
    providerMessageId?: string | null;
    failureCode?: string | null;
    failureReason?: string | null;
  }): Promise<InstagramReplyExecutionReceiptEntity> {
    receipt.state = state;
    receipt.providerMessageId = providerMessageId;
    receipt.failureCode = failureCode;
    receipt.failureReason = failureReason;

    return this.executionReceiptRepository.save(receipt);
  }

  private toApprovalState(
    decision: ResolveInstagramReplyApprovalInput['decision'],
  ): InstagramReplyApprovalState {
    switch (decision) {
      case 'approved':
        return InstagramReplyApprovalState.APPROVED;
      case 'rejected':
        return InstagramReplyApprovalState.REJECTED;
      case 'changes_requested':
        return InstagramReplyApprovalState.CHANGES_REQUESTED;
    }
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }
}

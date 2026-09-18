import { InstagramMessageReceiptProjectionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-receipt-projection.service';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';

describe('ActionReceiptProjectorService', () => {
  const receipt = {
    id: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
    actionApprovalBindingId: '00000000-0000-4000-8000-000000000007',
    state: 'PROVIDER_ACCEPTED',
    providerMessageId: '<sent@example.com>',
    providerExternalMessageId: 'provider-message-id',
    providerThreadExternalId: 'provider-thread-id',
    actionApprovalBinding: {
      id: '00000000-0000-4000-8000-000000000007',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      actionName: 'send_inbox_reply',
      actionVersion: 1,
      draftId: '00000000-0000-4000-8000-000000000003',
      threadId: '00000000-0000-4000-8000-000000000003',
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000006',
      contentDigest: 'a'.repeat(64),
      recipientFingerprint: 'b'.repeat(64),
      sendingAccountFingerprint: 'c'.repeat(64),
      actionContextFingerprint: 'd'.repeat(64),
      inboundMessageId: null,
      inboundSenderIgsid: null,
      inboundDirection: null,
      inboundReceivedAt: null,
      evidenceLinks: [
        {
          objectMetadataId: '00000000-0000-4000-8000-000000000004',
          recordId: '00000000-0000-4000-8000-000000000005',
          role: 'thread_parent',
        },
      ],
    },
  };

  it('projects by receipt id, retries an idempotent projection after the post-projection boundary, and then marks sent', async () => {
    let storedState = receipt.state;
    const writes = new Set<string>();
    const writer = {
      project: jest.fn(async ({ receiptId }: { receiptId: string }) => {
        writes.add(receiptId);
      }),
    };
    const repository = {
      findOne: jest.fn(async () => ({ ...receipt, state: storedState })),
      update: jest.fn().mockImplementation(async () => {
        storedState = 'SENT';
        return { affected: 1 };
      }),
    };
    const service = new ActionReceiptProjectorService(
      repository as never,
      writer,
    );

    await expect(
      service.projectReceipt(receipt.id, {
        afterWorkspaceProjection: async () => {
          throw new Error('lost after workspace projection');
        },
      }),
    ).rejects.toThrow('lost after workspace projection');
    expect(writes).toEqual(new Set([receipt.id]));

    await expect(service.projectReceipt(receipt.id)).resolves.toEqual({
      projected: true,
    });
    expect(writes).toEqual(new Set([receipt.id]));
    expect(writer.project).toHaveBeenCalledWith({
      receiptId: receipt.id,
      workspaceId: receipt.workspaceId,
      draftId: receipt.actionApprovalBinding.draftId,
      contentDigest: receipt.actionApprovalBinding.contentDigest,
      actionName: 'send_inbox_reply',
      actionVersion: receipt.actionApprovalBinding.actionVersion,
      threadId: receipt.actionApprovalBinding.threadId,
      initiatorUserWorkspaceId:
        receipt.actionApprovalBinding.initiatorUserWorkspaceId,
      providerMessageId: '<sent@example.com>',
      providerExternalMessageId: 'provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
      recipientFingerprint: receipt.actionApprovalBinding.recipientFingerprint,
      sendingAccountFingerprint:
        receipt.actionApprovalBinding.sendingAccountFingerprint,
      actionContextFingerprint:
        receipt.actionApprovalBinding.actionContextFingerprint,
      evidenceLinks: receipt.actionApprovalBinding.evidenceLinks,
    });
    expect(repository.update).toHaveBeenCalledWith(
      { id: receipt.id, state: 'PROVIDER_ACCEPTED' },
      { state: 'SENT' },
    );
  });

  it('rejects a provider-accepted receipt with an unsupported binding before projecting it', async () => {
    const writer = { project: jest.fn() };
    const repository = {
      findOne: jest.fn(async () => ({
        ...receipt,
        actionApprovalBinding: {
          ...receipt.actionApprovalBinding,
          actionVersion: 2,
        },
      })),
      update: jest.fn(),
    };
    const service = new ActionReceiptProjectorService(
      repository as never,
      writer,
    );

    await expect(service.projectReceipt(receipt.id)).rejects.toThrow(
      'Unsupported action receipt projection',
    );
    expect(writer.project).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('does not project any state except PROVIDER_ACCEPTED', async () => {
    const writer = { project: jest.fn() };
    const repository = {
      findOne: jest.fn(async () => ({ ...receipt, state: 'UNKNOWN' })),
      update: jest.fn(),
    };
    const service = new ActionReceiptProjectorService(
      repository as never,
      writer,
    );

    await expect(service.projectReceipt(receipt.id)).resolves.toEqual({
      projected: false,
    });
    expect(writer.project).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('projects a v2 direct REPLY Instagram receipt through an explicit module-owned writer', async () => {
    const directWriter = { project: jest.fn().mockResolvedValue(undefined) };
    const defaultWriter = { project: jest.fn() };
    const repository = {
      findOne: jest.fn(async () => ({
        ...receipt,
        providerExternalMessageId: 'provider-instagram-message',
        providerThreadExternalId: 'provider-instagram-chat',
        actionApprovalBinding: {
          ...receipt.actionApprovalBinding,
          actionName: 'send_instagram_message',
          actionVersion: 2,
          actionKind: 'REPLY',
          threadId: null,
          interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
          interactionContextId: receipt.actionApprovalBinding.draftId,
        },
      })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = new ActionReceiptProjectorService(
      repository as never,
      defaultWriter,
    );

    await expect(
      service.projectReceiptWithWriter(receipt.id, directWriter),
    ).resolves.toEqual({ projected: true });
    expect(defaultWriter.project).not.toHaveBeenCalled();
    expect(directWriter.project).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: 'send_instagram_message',
        actionVersion: 2,
        actionKind: 'REPLY',
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: receipt.actionApprovalBinding.draftId,
        providerExternalMessageId: 'provider-instagram-message',
        providerThreadExternalId: 'provider-instagram-chat',
      }),
    );
    expect(repository.update).toHaveBeenCalledWith(
      { id: receipt.id, state: 'PROVIDER_ACCEPTED' },
      { state: 'SENT' },
    );
  });
  it.each([
    { instagramMessageSnapshot: {} },
    { composerInputDigest: 'e'.repeat(64) },
  ])(
    'rejects a malformed v2 receipt with v3-only fields before projection',
    async (v3Fields) => {
      const writer = { project: jest.fn() };
      const repository = {
        findOne: jest.fn().mockResolvedValue({
          ...receipt,
          actionApprovalBinding: {
            ...receipt.actionApprovalBinding,
            actionName: 'send_instagram_message',
            actionVersion: 2,
            actionKind: 'REPLY',
            threadId: null,
            interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
            interactionContextId: receipt.actionApprovalBinding.draftId,
            ...v3Fields,
          },
        }),
        update: jest.fn(),
      };
      const service = new ActionReceiptProjectorService(
        repository as never,
        writer,
      );

      await expect(service.projectReceipt(receipt.id)).rejects.toThrow(
        'Unsupported action receipt projection',
      );
      expect(writer.project).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it('projects a complete v3 direct REPLY snapshot and composer digest', async () => {
    const directWriter = { project: jest.fn().mockResolvedValue(undefined) };
    const repository = {
      findOne: jest.fn(async () => ({
        ...receipt,
        actionApprovalBinding: {
          ...receipt.actionApprovalBinding,
          actionName: 'send_instagram_message',
          actionVersion: 3,
          actionKind: 'REPLY',
          threadId: null,
          interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
          interactionContextId: receipt.actionApprovalBinding.draftId,
          composerInputDigest: 'e'.repeat(64),
          instagramMessageSnapshot: {
            publicIdentifier: 'creator.name',
            providerId: 'profile-001',
            providerMessagingId: 'messaging-009',
            creatorRecordId: '00000000-0000-4000-8000-000000000004',
            accountBindingId: '00000000-0000-4000-8000-000000000005',
            instagramAccountRecordId: '00000000-0000-4000-8000-000000000006',
            unipileAccountId: 'unipile-account',
            instagramUserId: 'brand-instagram-id',
            recipientSourceValues: [
              { field: 'instagramUsername', value: '@Creator.Name' },
            ],
            actionKind: 'REPLY',
            conversationRecordId: '00000000-0000-4000-8000-000000000009',
            providerChatId: 'chat-009',
            attendeeProviderId: 'messaging-009',
          },
        },
      })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = new ActionReceiptProjectorService(repository as never, {
      project: jest.fn(),
    });

    await expect(
      service.projectReceiptWithWriter(receipt.id, directWriter),
    ).resolves.toEqual({ projected: true });
    expect(directWriter.project).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: 'send_instagram_message',
        actionVersion: 3,
        actionKind: 'REPLY',
        interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        composerInputDigest: 'e'.repeat(64),
        instagramMessageSnapshot: expect.objectContaining({
          providerMessagingId: 'messaging-009',
          providerChatId: 'chat-009',
        }),
      }),
    );
  });

  it('retains Accepted IDs through the real projector and real START writer despite matching historical evidence', async () => {
    const stored = {
      ...receipt,
      providerMessageId: null,
      actionApprovalBinding: {
        ...receipt.actionApprovalBinding,
        actionName: 'send_instagram_message',
        actionVersion: 2,
        actionKind: 'START_CHAT',
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: receipt.actionApprovalBinding.draftId,
        contentDigest: computeActionContentDigest('Exact historical body'),
      },
    };
    const before = structuredClone(stored);
    const repository = {
      findOne: jest.fn().mockResolvedValue(stored),
      update: jest
        .fn()
        .mockImplementation(async (_where, patch) =>
          Object.assign(stored, patch),
        ),
    };
    const authorityReader = {
      rebuildForReconciliation: jest.fn().mockResolvedValue({
        canonicalGraph: {
          account: {
            bindingId: 'account-binding',
            unipileAccountId: 'provider-account',
            instagramUserId: 'owner',
          },
          draft: {
            kind: 'START_CHAT',
            recipientProviderId: '17841400000000000',
          },
        },
      }),
    };
    const bindingRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'account-binding', status: 'ACTIVE' }),
    };
    const client = {
      getChat: jest
        .fn()
        .mockResolvedValue({ attendeeProviderId: '17841400000000000' }),
      getMessage: jest.fn().mockResolvedValue({
        senderId: 'owner',
        text: 'Exact historical body',
        hidden: false,
        deleted: false,
        isEvent: false,
      }),
    };
    const projection = {
      upsertVerifiedChat: jest
        .fn()
        .mockResolvedValue({ conversationRecordId: 'conversation' }),
      upsertVerifiedMessage: jest.fn(),
    };
    const draft = { sentAt: null as Date | null };
    const draftService = {
      markSent: jest.fn().mockImplementation(async () => {
        draft.sentAt = new Date();
      }),
    };
    const writer = new InstagramMessageReceiptProjectionService(
      authorityReader as never,
      bindingRepository as never,
      client as never,
      projection as never,
      draftService as never,
    );
    const defaultWriter = { project: jest.fn() };
    const service = new ActionReceiptProjectorService(
      repository as never,
      defaultWriter,
    );
    await expect(
      service.projectReceiptWithWriter(stored.id, writer),
    ).rejects.toThrow('Instagram first-contact projection is unavailable');
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: stored.id },
      relations: { actionApprovalBinding: { evidenceLinks: true } },
    });
    expect(repository.update).not.toHaveBeenCalled();
    expect(stored).toEqual(before);
    expect(defaultWriter.project).not.toHaveBeenCalled();
    expect(authorityReader.rebuildForReconciliation).not.toHaveBeenCalled();
    expect(bindingRepository.findOne).not.toHaveBeenCalled();
    expect(client.getChat).not.toHaveBeenCalled();
    expect(client.getMessage).not.toHaveBeenCalled();
    expect(projection.upsertVerifiedChat).not.toHaveBeenCalled();
    expect(projection.upsertVerifiedMessage).not.toHaveBeenCalled();
    expect(draftService.markSent).not.toHaveBeenCalled();
    expect(draft.sentAt).toBeNull();
  });
});

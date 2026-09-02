import { Test, type TestingModule } from '@nestjs/testing';

import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessagingCursorService } from 'src/modules/messaging/message-import-manager/services/messaging-cursor.service';
import { MessagingPendingSyncCursorService } from 'src/modules/messaging/message-import-manager/services/messaging-pending-sync-cursor.service';
import {
  getAcknowledgedMessageSyncIdsCacheKey,
  getMessagesToImportCacheKey,
  getPendingMessageSyncCursorsCacheKey,
  getPendingMessageSyncGenerationCacheKey,
} from 'src/modules/messaging/message-import-manager/utils/get-message-sync-cache-keys.util';

const workspaceId = 'workspace-id';
const messageChannelId = 'message-channel-id';
const generationKey = getPendingMessageSyncGenerationCacheKey({
  messageChannelId,
  workspaceId,
});

const pendingKey = (generationId: string) =>
  getPendingMessageSyncCursorsCacheKey({
    generationId,
    messageChannelId,
    workspaceId,
  });

const acknowledgedKey = (generationId: string) =>
  getAcknowledgedMessageSyncIdsCacheKey({
    generationId,
    messageChannelId,
    workspaceId,
  });

type PendingState = {
  cursors: Array<{ folderId: string | undefined; nextSyncCursor: string }>;
  expectedMessageExternalIds: string[];
  generationId: string;
};

describe('MessagingPendingSyncCursorService', () => {
  let service: MessagingPendingSyncCursorService;
  let cache: {
    get: jest.Mock;
    getSetLength: jest.Mock;
    mdel: jest.Mock;
    set: jest.Mock;
    setAdd: jest.Mock;
  };
  let updateCursor: jest.Mock;

  beforeEach(async () => {
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      getSetLength: jest.fn().mockResolvedValue(0),
      mdel: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      setAdd: jest.fn().mockResolvedValue(undefined),
    };
    updateCursor = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingPendingSyncCursorService,
        {
          provide: CacheStorageNamespace.ModuleMessaging,
          useValue: cache,
        },
        {
          provide: MessagingCursorService,
          useValue: { updateCursor },
        },
      ],
    }).compile();

    service = module.get(MessagingPendingSyncCursorService);
  });

  it('stages generation-scoped cursors before publishing the generation pointer', async () => {
    await service.stage({
      messageChannelId,
      messageExternalIds: ['INBOX:1', 'INBOX:1', 'Sent:2'],
      messageLists: [
        {
          folderId: 'inbox-folder-id',
          messageExternalIds: ['INBOX:1'],
          messageExternalIdsToDelete: [],
          nextSyncCursor: 'inbox-next',
          previousSyncCursor: null,
        },
      ],
      workspaceId,
    });

    const [stagedKey, stagedState] = cache.set.mock.calls[0];
    const generationId = stagedState.generationId as string;

    expect(stagedKey).toBe(pendingKey(generationId));
    expect(stagedState).toEqual({
      cursors: [{ folderId: 'inbox-folder-id', nextSyncCursor: 'inbox-next' }],
      expectedMessageExternalIds: ['INBOX:1', 'Sent:2'],
      generationId,
    });
    expect(cache.set).toHaveBeenNthCalledWith(
      2,
      generationKey,
      generationId,
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it('acknowledges only IDs expected by the published generation', async () => {
    cache.get.mockImplementation(async (key: string) => {
      if (key === generationKey) return 'generation-1';
      if (key === pendingKey('generation-1')) {
        return {
          cursors: [],
          expectedMessageExternalIds: ['INBOX:1'],
          generationId: 'generation-1',
        } satisfies PendingState;
      }
      return undefined;
    });

    await service.acknowledge({
      messageChannelId,
      processedMessageExternalIds: ['INBOX:1', 'Sent:2'],
      workspaceId,
    });

    expect(cache.setAdd).toHaveBeenCalledWith(
      acknowledgedKey('generation-1'),
      ['INBOX:1'],
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it('isolates a late G1 acknowledgement after G2 is published', async () => {
    cache.get.mockResolvedValueOnce('generation-1').mockResolvedValueOnce({
      cursors: [],
      expectedMessageExternalIds: ['old-id'],
      generationId: 'generation-1',
    } satisfies PendingState);

    await service.acknowledge({
      messageChannelId,
      processedMessageExternalIds: ['old-id'],
      workspaceId,
    });

    expect(cache.setAdd).toHaveBeenCalledWith(
      acknowledgedKey('generation-1'),
      ['old-id'],
      7 * 24 * 60 * 60 * 1000,
    );
    expect(cache.setAdd).not.toHaveBeenCalledWith(
      acknowledgedKey('generation-2'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('refuses to commit while current-generation IDs remain unacknowledged', async () => {
    cache.get.mockResolvedValueOnce('generation-1').mockResolvedValueOnce({
      cursors: [],
      expectedMessageExternalIds: ['INBOX:1', 'Sent:2'],
      generationId: 'generation-1',
    } satisfies PendingState);
    cache.getSetLength.mockResolvedValue(1);

    await expect(
      service.commit({
        messageChannel: { id: messageChannelId } as MessageChannelEntity,
        workspaceId,
      }),
    ).rejects.toThrow('pending message IDs are not fully acknowledged');

    expect(updateCursor).not.toHaveBeenCalled();
  });

  it('commits and deletes only current generation-scoped state', async () => {
    cache.get.mockResolvedValueOnce('generation-1').mockResolvedValueOnce({
      cursors: [{ folderId: 'inbox-folder-id', nextSyncCursor: 'inbox-next' }],
      expectedMessageExternalIds: ['INBOX:1'],
      generationId: 'generation-1',
    } satisfies PendingState);
    cache.getSetLength.mockResolvedValue(1);
    const messageChannel = { id: messageChannelId } as MessageChannelEntity;

    await service.commit({ messageChannel, workspaceId });

    expect(updateCursor).toHaveBeenCalledWith(
      messageChannel,
      'inbox-next',
      workspaceId,
      'inbox-folder-id',
    );
    expect(cache.mdel).toHaveBeenCalledWith([
      pendingKey('generation-1'),
      acknowledgedKey('generation-1'),
    ]);
    expect(cache.mdel).not.toHaveBeenCalledWith(
      expect.arrayContaining([generationKey]),
    );
  });

  it('fails closed when current generation or its pending state is missing', async () => {
    await expect(
      service.commit({
        messageChannel: { id: messageChannelId } as MessageChannelEntity,
        workspaceId,
      }),
    ).rejects.toThrow('pending cursor generation is missing');

    cache.get.mockReset().mockResolvedValueOnce('generation-1');

    await expect(
      service.commit({
        messageChannel: { id: messageChannelId } as MessageChannelEntity,
        workspaceId,
      }),
    ).rejects.toThrow('pending cursor state is missing');

    expect(updateCursor).not.toHaveBeenCalled();
  });

  it('keeps generation-scoped state when cursor commit fails', async () => {
    cache.get.mockResolvedValueOnce('generation-1').mockResolvedValueOnce({
      cursors: [
        { folderId: 'inbox-folder-id', nextSyncCursor: 'inbox-next' },
        { folderId: 'sent-folder-id', nextSyncCursor: 'sent-next' },
      ],
      expectedMessageExternalIds: [],
      generationId: 'generation-1',
    } satisfies PendingState);
    cache.getSetLength.mockResolvedValue(0);
    updateCursor
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cursor write failed'));

    await expect(
      service.commit({
        messageChannel: { id: messageChannelId } as MessageChannelEntity,
        workspaceId,
      }),
    ).rejects.toThrow('cursor write failed');

    expect(cache.mdel).not.toHaveBeenCalled();
  });

  it('clears work, generation pointer, and current generation-scoped state', async () => {
    cache.get.mockResolvedValueOnce('generation-1').mockResolvedValueOnce({
      cursors: [],
      expectedMessageExternalIds: ['INBOX:1'],
      generationId: 'generation-1',
    } satisfies PendingState);

    await service.clear({ messageChannelId, workspaceId });

    expect(cache.mdel).toHaveBeenCalledWith([
      getMessagesToImportCacheKey({ messageChannelId, workspaceId }),
      generationKey,
      pendingKey('generation-1'),
      acknowledgedKey('generation-1'),
    ]);
  });
});

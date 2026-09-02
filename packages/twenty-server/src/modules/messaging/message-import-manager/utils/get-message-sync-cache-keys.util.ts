type MessageSyncCacheKeyArgs = {
  messageChannelId: string;
  workspaceId: string;
};

export const getMessagesToImportCacheKey = ({
  messageChannelId,
  workspaceId,
}: MessageSyncCacheKeyArgs) =>
  `messages-to-import:${workspaceId}:${messageChannelId}`;

export const getPendingMessageSyncGenerationCacheKey = ({
  messageChannelId,
  workspaceId,
}: MessageSyncCacheKeyArgs) =>
  `pending-message-sync-generation:${workspaceId}:${messageChannelId}`;

export const getPendingMessageSyncCursorsCacheKey = ({
  generationId,
  messageChannelId,
  workspaceId,
}: MessageSyncCacheKeyArgs & { generationId: string }) =>
  `pending-message-sync-cursors:${workspaceId}:${messageChannelId}:${generationId}`;

export const getAcknowledgedMessageSyncIdsCacheKey = ({
  generationId,
  messageChannelId,
  workspaceId,
}: MessageSyncCacheKeyArgs & { generationId: string }) =>
  `acknowledged-message-sync-ids:${workspaceId}:${messageChannelId}:${generationId}`;

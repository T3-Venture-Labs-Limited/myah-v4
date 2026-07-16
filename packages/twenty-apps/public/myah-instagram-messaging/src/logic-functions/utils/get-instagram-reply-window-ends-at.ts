const REPLY_WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

export const getInstagramReplyWindowEndsAt = (inboundAt: string): string => {
  const timestamp = new Date(inboundAt).getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error('Invalid inbound timestamp.');
  }

  return new Date(timestamp + REPLY_WINDOW_DURATION_MS).toISOString();
};

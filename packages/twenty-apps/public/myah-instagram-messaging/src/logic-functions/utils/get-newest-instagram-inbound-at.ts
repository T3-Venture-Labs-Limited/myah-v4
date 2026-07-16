const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getNewestInstagramInboundAt = ({
  messages,
  recipientIgsid,
  now = new Date(),
}: {
  messages: unknown[];
  recipientIgsid: string;
  now?: Date;
}): string | undefined => {
  let newestInboundAt: Date | undefined;

  for (const message of messages) {
    if (!isRecord(message) || !isRecord(message.from)) {
      continue;
    }

    if (
      message.from.id !== recipientIgsid ||
      typeof message.created_time !== 'string'
    ) {
      continue;
    }

    const createdAt = new Date(message.created_time);

    if (Number.isNaN(createdAt.getTime()) || createdAt > now) {
      continue;
    }

    if (!newestInboundAt || createdAt > newestInboundAt) {
      newestInboundAt = createdAt;
    }
  }

  return newestInboundAt?.toISOString();
};

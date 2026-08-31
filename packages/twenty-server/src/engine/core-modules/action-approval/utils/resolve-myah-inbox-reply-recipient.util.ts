import { emailSchema } from 'twenty-shared/utils';

export type MyahInboxReplyRecipient = {
  email: string;
  label: string;
};

type ResolveMyahInboxReplyRecipientInput = {
  direction: 'INCOMING' | 'OUTGOING';
  participants: {
    role: string;
    handle: string | null;
    displayName: string | null;
  }[];
  senderHandles: ReadonlySet<string>;
};

export const resolveMyahInboxReplyRecipient = ({
  direction,
  participants,
  senderHandles,
}: ResolveMyahInboxReplyRecipientInput): MyahInboxReplyRecipient => {
  const role = direction === 'INCOMING' ? 'FROM' : 'TO';
  const normalizedSenderHandles = new Set(
    [...senderHandles].map((handle) => handle.trim().toLowerCase()),
  );
  const candidates = participants.flatMap((participant) => {
    if (participant.role !== role) {
      return [];
    }

    const parsed = emailSchema.safeParse(participant.handle?.trim());
    if (
      !parsed.success ||
      normalizedSenderHandles.has(parsed.data.toLowerCase())
    ) {
      return [];
    }

    return [
      {
        email: parsed.data.toLowerCase(),
        label: participant.displayName?.trim() || parsed.data,
      },
    ];
  });
  const unique = [
    ...new Map(candidates.map((item) => [item.email, item])).values(),
  ];

  if (unique.length !== 1) {
    throw new Error('RECIPIENT_UNAVAILABLE');
  }

  return unique[0];
};

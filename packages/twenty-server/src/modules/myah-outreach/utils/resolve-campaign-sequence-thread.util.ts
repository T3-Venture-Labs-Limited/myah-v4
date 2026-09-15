import { type CampaignSequenceMessage } from 'twenty-shared/workflow';

export type SequenceSentEmailEvidence = {
  workspaceId: string;
  campaignId: string;
  campaignCreatorId: string;
  enrollmentId: string;
  workflowVersionId: string;
  sequenceMessageId: string;
  acceptedOrdinal: number;
  state: 'SENT';
  receiptId: string;
  persistedMessageId: string;
  headerMessageId: string;
  messageThreadId: string;
  providerThreadExternalId: string | null;
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
};

export type SequenceThreadResult =
  | { kind: 'NEW_THREAD' }
  | { kind: 'REPLY'; evidence: SequenceSentEmailEvidence }
  | {
      kind: 'HOLD';
      code:
        | 'MISSING_THREAD'
        | 'AMBIGUOUS_THREAD'
        | 'SENDER_CHANGED'
        | 'UNSAFE_HISTORY';
    };

export type SequenceThreadInput = {
  scope: Pick<
    SequenceSentEmailEvidence,
    'workspaceId' | 'campaignId' | 'campaignCreatorId' | 'enrollmentId'
  >;
  message: Extract<CampaignSequenceMessage, { channel: 'EMAIL' }>;
  precedingEmailMessageIds: string[];
  historyReconciled: boolean;
  evidence: SequenceSentEmailEvidence[];
  currentSender: Pick<
    SequenceSentEmailEvidence,
    'connectedAccountId' | 'messageChannelId' | 'senderEmail'
  >;
};

const EVIDENCE_FIELDS = [
  'workspaceId',
  'campaignId',
  'campaignCreatorId',
  'enrollmentId',
  'workflowVersionId',
  'sequenceMessageId',
  'acceptedOrdinal',
  'state',
  'receiptId',
  'persistedMessageId',
  'headerMessageId',
  'messageThreadId',
  'providerThreadExternalId',
  'connectedAccountId',
  'messageChannelId',
  'senderEmail',
] as const satisfies readonly (keyof SequenceSentEmailEvidence)[];

const hasText = (value: string): boolean => value.trim().length > 0;

const isSameEvidence = (
  left: SequenceSentEmailEvidence,
  right: SequenceSentEmailEvidence,
): boolean => EVIDENCE_FIELDS.every((field) => left[field] === right[field]);

const hasCompleteProof = (evidence: SequenceSentEmailEvidence): boolean =>
  hasText(evidence.workflowVersionId) &&
  hasText(evidence.sequenceMessageId) &&
  hasText(evidence.receiptId) &&
  hasText(evidence.persistedMessageId) &&
  hasText(evidence.headerMessageId) &&
  hasText(evidence.messageThreadId) &&
  (evidence.providerThreadExternalId === null ||
    hasText(evidence.providerThreadExternalId));

const hasValidScope = (scope: SequenceThreadInput['scope']): boolean =>
  hasText(scope.workspaceId) &&
  hasText(scope.campaignId) &&
  hasText(scope.campaignCreatorId) &&
  hasText(scope.enrollmentId);

const hasValidSender = (
  sender: Pick<
    SequenceSentEmailEvidence,
    'connectedAccountId' | 'messageChannelId' | 'senderEmail'
  >,
): boolean =>
  hasText(sender.connectedAccountId) &&
  hasText(sender.messageChannelId) &&
  hasText(sender.senderEmail);

export const resolveCampaignSequenceThread = (
  input: SequenceThreadInput,
): SequenceThreadResult => {
  if (input.message.replyToThread === false) {
    return { kind: 'NEW_THREAD' };
  }

  if (!input.historyReconciled) {
    return { kind: 'HOLD', code: 'UNSAFE_HISTORY' };
  }

  if (!hasValidScope(input.scope)) {
    return { kind: 'HOLD', code: 'MISSING_THREAD' };
  }

  const precedingEmailMessageIds = new Set(input.precedingEmailMessageIds);
  const scopedEvidence = input.evidence.filter(
    (evidence) =>
      evidence.workspaceId === input.scope.workspaceId &&
      evidence.campaignId === input.scope.campaignId &&
      evidence.campaignCreatorId === input.scope.campaignCreatorId &&
      evidence.enrollmentId === input.scope.enrollmentId &&
      precedingEmailMessageIds.has(evidence.sequenceMessageId),
  );

  if (scopedEvidence.length === 0) {
    return { kind: 'HOLD', code: 'MISSING_THREAD' };
  }

  const evidenceByReceiptId = new Map<string, SequenceSentEmailEvidence>();

  for (const evidence of scopedEvidence) {
    const repeatedEvidence = evidenceByReceiptId.get(evidence.receiptId);

    if (repeatedEvidence !== undefined) {
      if (!isSameEvidence(repeatedEvidence, evidence)) {
        return { kind: 'HOLD', code: 'AMBIGUOUS_THREAD' };
      }

      continue;
    }

    evidenceByReceiptId.set(evidence.receiptId, evidence);
  }

  const uniqueEvidence = [...evidenceByReceiptId.values()];
  const seenSequenceMessageIds = new Set<string>();
  const seenAcceptedOrdinals = new Set<number>();

  for (const evidence of uniqueEvidence) {
    if (
      evidence.state !== 'SENT' ||
      !Number.isFinite(evidence.acceptedOrdinal) ||
      !Number.isInteger(evidence.acceptedOrdinal) ||
      evidence.acceptedOrdinal <= 0 ||
      seenSequenceMessageIds.has(evidence.sequenceMessageId) ||
      seenAcceptedOrdinals.has(evidence.acceptedOrdinal)
    ) {
      return { kind: 'HOLD', code: 'AMBIGUOUS_THREAD' };
    }

    if (!hasCompleteProof(evidence)) {
      return { kind: 'HOLD', code: 'MISSING_THREAD' };
    }

    seenSequenceMessageIds.add(evidence.sequenceMessageId);
    seenAcceptedOrdinals.add(evidence.acceptedOrdinal);
  }

  const matchedEvidence = uniqueEvidence.reduce((latest, evidence) =>
    evidence.acceptedOrdinal > latest.acceptedOrdinal ? evidence : latest,
  );

  if (
    !hasValidSender(matchedEvidence) ||
    !hasValidSender(input.currentSender) ||
    matchedEvidence.connectedAccountId !==
      input.currentSender.connectedAccountId ||
    matchedEvidence.messageChannelId !== input.currentSender.messageChannelId ||
    matchedEvidence.senderEmail !== input.currentSender.senderEmail
  ) {
    return { kind: 'HOLD', code: 'SENDER_CHANGED' };
  }

  return { kind: 'REPLY', evidence: matchedEvidence };
};

import { createHash } from 'crypto';

import { type ConnectedAccountProvider } from 'twenty-shared/types';

export type CampaignSenderBlockedReason =
  | 'AUTH_EXPIRED'
  | 'MISSING_PERMISSION'
  | 'SYNC_DISABLED'
  | 'ACCOUNT_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'WRONG_WORKSPACE';

type CampaignSenderReadinessCommon = {
  campaignAccountId: string;
  connectedAccountId: string;
  messageChannelId: string;
  recoveryPath: string | null;
};

type ResolvedCampaignSenderBinding = {
  bindingStatus: 'RESOLVED_BINDING';
  senderHandle: string;
  provider: ConnectedAccountProvider;
  dailySendLimit: number;
  minimumSendIntervalMs: number;
  missingBinding: null;
};

export type CampaignSenderReadiness = CampaignSenderReadinessCommon &
  (
    | (ResolvedCampaignSenderBinding & {
        status: 'READY';
        reason: null;
      })
    | (ResolvedCampaignSenderBinding & {
        status: 'BLOCKED';
        reason: CampaignSenderBlockedReason;
      })
    | {
        bindingStatus: 'MISSING_CORE_BINDING';
        senderHandle: null;
        provider: null;
        dailySendLimit: null;
        minimumSendIntervalMs: null;
        status: 'BLOCKED';
        reason: 'ACCOUNT_UNAVAILABLE';
        missingBinding: 'CONNECTED_ACCOUNT' | 'MESSAGE_CHANNEL' | 'BOTH';
      }
  );

export type ReadyCampaignSenderReadiness = Extract<
  CampaignSenderReadiness,
  { bindingStatus: 'RESOLVED_BINDING'; status: 'READY' }
>;

export const CAMPAIGN_EMAIL_ROTATION_POLICY_ID =
  'EARLIEST_ELIGIBLE_LOWEST_DAILY_USAGE_STABLE_ACCOUNT_V1' as const;

export const CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION =
  'CAMPAIGN_SENDER_POOL_V2' as const;

export type CampaignSenderCandidateReadiness = {
  rotationPolicyId: typeof CAMPAIGN_EMAIL_ROTATION_POLICY_ID;
  connectedAccountId: string;
  messageChannelId: string;
  senderHandle: string;
} & (
  | { status: 'READY'; reason: null }
  | { status: 'BLOCKED'; reason: CampaignSenderBlockedReason }
);

export type CampaignSenderPoolSnapshot = {
  rotationPolicyId: typeof CAMPAIGN_EMAIL_ROTATION_POLICY_ID;
  serializationRevision: typeof CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION;
  mailboxes: CampaignSenderReadiness[];
  senderPoolFingerprint: string;
};

type CanonicalSenderTuple =
  | {
      tag: 'RESOLVED_BINDING';
      campaignAccountId: string;
      connectedAccountId: string;
      messageChannelId: string;
      normalizedSenderHandle: string;
      provider: ConnectedAccountProvider;
      dailySendLimit: number;
      minimumSendIntervalMs: number;
    }
  | {
      tag: 'MISSING_CORE_BINDING';
      campaignAccountId: string;
      connectedAccountId: string;
      messageChannelId: string;
      missingBinding: 'CONNECTED_ACCOUNT' | 'MESSAGE_CHANNEL' | 'BOTH';
    };

type SenderPoolSerializationOptions = {
  serializationRevision?: string;
  rotationPolicyId?: string;
};

const toCanonicalTuple = (
  mailbox: CampaignSenderReadiness,
): CanonicalSenderTuple => {
  if (mailbox.bindingStatus === 'MISSING_CORE_BINDING') {
    return {
      tag: 'MISSING_CORE_BINDING',
      campaignAccountId: mailbox.campaignAccountId,
      connectedAccountId: mailbox.connectedAccountId,
      messageChannelId: mailbox.messageChannelId,
      missingBinding: mailbox.missingBinding,
    };
  }

  return {
    tag: 'RESOLVED_BINDING',
    campaignAccountId: mailbox.campaignAccountId,
    connectedAccountId: mailbox.connectedAccountId,
    messageChannelId: mailbox.messageChannelId,
    normalizedSenderHandle: mailbox.senderHandle.trim().toLowerCase(),
    provider: mailbox.provider,
    dailySendLimit: mailbox.dailySendLimit,
    minimumSendIntervalMs: mailbox.minimumSendIntervalMs,
  };
};

const tupleSortKey = (tuple: CanonicalSenderTuple): string =>
  [
    tuple.connectedAccountId,
    tuple.messageChannelId,
    tuple.campaignAccountId,
    tuple.tag,
  ].join('\u0000');

export const serializeCampaignSenderPool = (
  mailboxes: CampaignSenderReadiness[],
  options: SenderPoolSerializationOptions = {},
): string => {
  const bindings = mailboxes
    .map(toCanonicalTuple)
    .sort((left, right) =>
      tupleSortKey(left).localeCompare(tupleSortKey(right)),
    );

  return JSON.stringify({
    serializationRevision:
      options.serializationRevision ??
      CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
    rotationPolicyId:
      options.rotationPolicyId ?? CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
    bindings,
  });
};

export const computeCampaignSenderPoolFingerprint = (
  mailboxes: CampaignSenderReadiness[],
  options: SenderPoolSerializationOptions = {},
): string =>
  createHash('sha256')
    .update(serializeCampaignSenderPool(mailboxes, options))
    .digest('hex');

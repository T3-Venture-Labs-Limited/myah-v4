import { type IcemailMailboxCredential } from '../icemail/icemail.types';

export type WarmupInboxStatus =
  | 'paused'
  | 'running'
  | 'banned'
  | 'error'
  | 'suspended';

export type WarmupInboxConnectionType =
  | 'SMTP_IMAP'
  | 'GOOGLE_OAUTH'
  | 'MICROSOFT_OAUTH';

export type WarmupInboxSummary = {
  id: string;
  address: string;
  status: WarmupInboxStatus;
  connectionType: WarmupInboxConnectionType;
  score: number;
  senderFirstName: string;
  senderLastName: string;
};

export type ManagedWarmupPolicyConfiguration = {
  startingBaseline: number;
  increasePerDay: number;
  maxSendsPerDay: number;
  replyRatePercent: number;
  strategy: 'progressive';
  version: string;
};

export type WarmupInboxProviderPolicy = Omit<
  ManagedWarmupPolicyConfiguration,
  'version'
>;

export type WarmupInboxHealth = {
  mxScore: number;
  spfScore: number;
  dmarcScore: number;
  blacklistScore: number;
  detectedBlacklists: number;
  warmupDaysScore: number;
  warmupDays: number;
};

export type WarmupInboxDetail = WarmupInboxSummary & {
  createdAt: Date;
  policy: WarmupInboxProviderPolicy;
  health: WarmupInboxHealth;
};

export type WarmupInboxCreateInput = {
  address: string;
  senderFirstName: string;
  senderLastName: string;
  credential: IcemailMailboxCredential;
  policy: ManagedWarmupPolicyConfiguration;
};

export type WarmupInboxCreateReceipt = {
  id: string;
  replayed: boolean;
};

export type WarmupInboxCapacity = {
  total: number;
  available: number;
  inUse: number;
};

export type WarmupInboxMetricsRange = {
  from: Date;
  to: Date;
};

export type WarmupInboxMetricTotals = {
  messages: number;
  sent: number;
  landedInbox: number;
  landedSpam: number;
  landedCategory: number;
  repliesReceived: number;
};

export type WarmupInboxMetricTrend = {
  date: string;
  queued: number;
  landedInbox: number;
  landedCategory: number;
  landedSpam: number;
  repliesReceived: number;
};

export type WarmupInboxMetrics = {
  inboxId: string;
  from: Date;
  to: Date;
  totals: WarmupInboxMetricTotals;
  trend: WarmupInboxMetricTrend[];
};

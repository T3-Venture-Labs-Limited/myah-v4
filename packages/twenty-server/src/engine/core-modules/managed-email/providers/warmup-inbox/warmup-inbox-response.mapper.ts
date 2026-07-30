import {
  WarmupInboxException,
  WarmupInboxExceptionCode,
} from './warmup-inbox.exception';
import {
  type WarmupInboxCapacity,
  type WarmupInboxConnectionType,
  type WarmupInboxCreateReceipt,
  type WarmupInboxDetail,
  type WarmupInboxMetrics,
  type WarmupInboxStatus,
  type WarmupInboxSummary,
} from './warmup-inbox.types';

const malformed = (): never => {
  throw new WarmupInboxException(WarmupInboxExceptionCode.MALFORMED_RESPONSE);
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return malformed();
  }

  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) return malformed();

  return value;
};

const asString = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 500
  ) {
    return malformed();
  }

  return value.trim();
};

const asNumber = (
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    return malformed();
  }

  return value;
};

const asCount = (value: unknown): number => {
  const count = asNumber(value);

  if (!Number.isSafeInteger(count)) return malformed();

  return count;
};

const asBoolean = (value: unknown): boolean => {
  if (typeof value !== 'boolean') return malformed();

  return value;
};

const asEpochDate = (value: unknown): Date => {
  const seconds = asCount(value);
  const date = new Date(seconds * 1_000);

  if (Number.isNaN(date.getTime())) return malformed();

  return date;
};

const asScheduleDate = (value: unknown): string => {
  const match = /^([A-Z][a-z]{2}) (\d{2}), (\d{4})$/.exec(asString(value));
  let month: number;

  switch (match?.[1]) {
    case 'Jan':
      month = 0;
      break;
    case 'Feb':
      month = 1;
      break;
    case 'Mar':
      month = 2;
      break;
    case 'Apr':
      month = 3;
      break;
    case 'May':
      month = 4;
      break;
    case 'Jun':
      month = 5;
      break;
    case 'Jul':
      month = 6;
      break;
    case 'Aug':
      month = 7;
      break;
    case 'Sep':
      month = 8;
      break;
    case 'Oct':
      month = 9;
      break;
    case 'Nov':
      month = 10;
      break;
    case 'Dec':
      month = 11;
      break;
    default:
      return malformed();
  }

  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));

  if (
    !Number.isSafeInteger(day) ||
    !Number.isSafeInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return malformed();
  }

  return date.toISOString().slice(0, 10);
};

const asStatus = (value: unknown): WarmupInboxStatus => {
  switch (value) {
    case 'paused':
    case 'running':
    case 'banned':
    case 'error':
    case 'suspended':
      return value;
    default:
      return malformed();
  }
};

const asConnectionType = (value: unknown): WarmupInboxConnectionType => {
  switch (value) {
    case 'smtp_imap':
      return 'SMTP_IMAP';
    case 'google':
      return 'GOOGLE_OAUTH';
    case 'office':
      return 'MICROSOFT_OAUTH';
    default:
      return malformed();
  }
};

const mapSummaryRecord = (
  data: Record<string, unknown>,
): WarmupInboxSummary => {
  const address = asString(data.email).toLowerCase();

  if (!address.includes('@')) return malformed();

  return {
    id: asString(data.inbox_id),
    address,
    status: asStatus(data.status),
    connectionType: asConnectionType(data.type),
    score: asNumber(data.score, 0, 100),
    senderFirstName: asString(data.sender_first),
    senderLastName: asString(data.sender_last),
  };
};

export const mapWarmupInboxList = (value: unknown): WarmupInboxSummary[] => {
  const data = asRecord(value);

  return asArray(data.items).map((item) => mapSummaryRecord(asRecord(item)));
};

export const mapWarmupInboxCapacity = (value: unknown): WarmupInboxCapacity => {
  const data = asRecord(value);
  const plans = asRecord(data.plans);
  const basic = asRecord(plans.basic);
  const total = asCount(basic.total);
  const available = asCount(basic.available);
  const inUse = asCount(basic.in_use);

  if (available + inUse !== total) return malformed();

  return { total, available, inUse };
};

export const mapWarmupInboxCreateReceipt = (
  value: unknown,
): WarmupInboxCreateReceipt => {
  const data = asRecord(value);

  return { id: asString(data.inbox_id), replayed: false };
};

export const mapWarmupInboxDetail = (value: unknown): WarmupInboxDetail => {
  const data = asRecord(value);
  const frequency = asRecord(data.frequency);
  const healthCheck = asRecord(data.health_check);
  const mx = asRecord(healthCheck.mx);
  const spf = asRecord(healthCheck.spf);
  const dmarc = asRecord(healthCheck.dmarc);
  const domainBlacklists = asRecord(healthCheck.domain_blacklists);
  const warmupDays = asRecord(healthCheck.warmup_days);
  const blacklists = asArray(domainBlacklists.blacklists);
  let detectedBlacklists = 0;

  for (const blacklistValue of blacklists) {
    const blacklist = asRecord(blacklistValue);

    asString(blacklist.name);
    asString(blacklist.url);
    if (asBoolean(blacklist.detected)) detectedBlacklists += 1;
  }

  return {
    ...mapSummaryRecord(data),
    createdAt: asEpochDate(data.created_at),
    policy: {
      startingBaseline: asCount(frequency.starting_baseline),
      increasePerDay: asCount(frequency.increase_per_day),
      maxSendsPerDay: asCount(frequency.max_sends_per_day),
      replyRatePercent: asNumber(frequency.reply_rate, 0, 100),
      strategy:
        frequency.strategy === 'progressive' ? 'progressive' : malformed(),
    },
    health: {
      mxScore: asNumber(mx.score, 0, 1),
      spfScore: asNumber(spf.score, 0, 1),
      dmarcScore: asNumber(dmarc.score, 0, 1),
      blacklistScore: asNumber(domainBlacklists.score, 0, 1),
      detectedBlacklists,
      warmupDaysScore: asNumber(warmupDays.score, 0, 1),
      warmupDays: asCount(warmupDays.warmup_days),
    },
  };
};

export const mapWarmupInboxMetrics = (value: unknown): WarmupInboxMetrics => {
  const data = asRecord(value);
  const main = asRecord(data.main_metrics);
  const landedInbox = asRecord(main.landed_inbox);
  const landedSpam = asRecord(main.landed_spam);
  const landedCategory = asRecord(main.landed_category);

  return {
    inboxId: asString(data.inbox_id),
    from: asEpochDate(data.start_time),
    to: asEpochDate(data.end_time),
    totals: {
      messages: asCount(main.total_count),
      sent: asCount(main.sent),
      landedInbox: asCount(landedInbox.value),
      landedSpam: asCount(landedSpam.value),
      landedCategory: asCount(landedCategory.value),
      repliesReceived: asCount(main.replies_received),
    },
    trend: asArray(data.schedule_metrics).map((trendValue) => {
      const trend = asRecord(trendValue);
      return {
        date: asScheduleDate(trend.date),
        queued: asCount(trend.queued),
        landedInbox: asCount(trend.inbox),
        landedCategory: asCount(trend.category),
        landedSpam: asCount(trend.spam),
        repliesReceived: asCount(trend.replies_received),
      };
    }),
  };
};

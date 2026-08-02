import { IcemailException, IcemailExceptionCode } from './icemail.exception';
import {
  type IcemailDomainAvailability,
  type IcemailDomainDetail,
  type IcemailDomainSummary,
  type IcemailMailboxDeletionReceipt,
  type IcemailMailboxDetail,
  type IcemailMailboxSummary,
  type IcemailOrderReceipt,
  type IcemailPage,
  type IcemailPrewarmPurchaseReceipt,
  type IcemailPrewarmedBundlePage,
  type IcemailPrewarmedMailbox,
  type IcemailProviderPrice,
  type IcemailQueuedDomainActionReceipt,
} from './icemail.types';

const MAX_COLLECTION_SIZE = 100;
const MAX_STRING_LENGTH = 500;
const MAX_SAFE_INTEGER_DECIMAL_LENGTH = 16;

const malformed = (): never => {
  throw new IcemailException(IcemailExceptionCode.MALFORMED_RESPONSE);
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return malformed();
  }

  return value as Record<string, unknown>;
};

const asArray = (value: unknown, max = MAX_COLLECTION_SIZE): unknown[] => {
  if (!Array.isArray(value) || value.length > max) return malformed();

  return value;
};

const asString = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_STRING_LENGTH
  ) {
    return malformed();
  }

  return value;
};

const asBoolean = (value: unknown): boolean => {
  if (typeof value !== 'boolean') return malformed();

  return value;
};

const asNonNegativeInteger = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return malformed();

  return value as number;
};

const asProviderCount = (value: unknown): number => {
  if (
    typeof value !== 'string' ||
    value.length > MAX_SAFE_INTEGER_DECIMAL_LENGTH ||
    !/^(?:0|[1-9]\d*)$/.test(value)
  ) {
    return malformed();
  }

  return asNonNegativeInteger(Number(value));
};

const asDate = (value: unknown): Date => {
  const date = new Date(asString(value));

  if (Number.isNaN(date.getTime())) return malformed();

  return date;
};

const asNullableDate = (value: unknown): Date | null =>
  value === null ? null : asDate(value);

const asDomain = (value: unknown): string => {
  const domain = asString(value).trim().toLowerCase();

  if (
    domain.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|biz|live|info)$/.test(
      domain,
    )
  ) {
    return malformed();
  }

  return domain;
};

const asAddress = (value: unknown, expectedDomain?: string): string => {
  const address = asString(value).trim().toLowerCase();
  const parts = address.split('@');

  if (
    parts.length !== 2 ||
    parts[0].length === 0 ||
    asDomain(parts[1]) !== (expectedDomain ?? asDomain(parts[1]))
  ) {
    return malformed();
  }

  return address;
};

const asGoogleProvider = (value: unknown): 'GOOGLE' => {
  if (value !== 'GOOGLE') return malformed();

  return value;
};

const asCents = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return malformed();
  }

  const cents = Math.round(value * 100);

  if (
    !Number.isSafeInteger(cents) ||
    Math.abs(value - cents / 100) > Number.EPSILON * 100
  ) {
    return malformed();
  }

  return cents;
};

const unwrapData = (value: unknown): unknown => {
  const envelope = asRecord(value);

  if (envelope.success !== true || !('data' in envelope)) return malformed();

  return envelope.data;
};

const mapPrice = (value: unknown): IcemailProviderPrice => {
  const price = asRecord(value);

  if (
    price.currency !== 'USD' ||
    price.duration_type !== 'YEAR' ||
    price.duration !== 1
  ) {
    return malformed();
  }

  return {
    amountCents: asCents(price.price),
    currency: 'USD',
    duration: 1,
    durationUnit: 'YEAR',
  };
};

const mapAvailabilityItem = (value: unknown) => {
  const item = asRecord(value);

  return {
    domain: asDomain(item.domain),
    available: asBoolean(item.available),
    price: mapPrice(item.pricing),
  };
};

export const mapIcemailDomainAvailability = (
  value: unknown,
): IcemailDomainAvailability => {
  const data = asRecord(unwrapData(value));
  const current = mapAvailabilityItem(data.current_domain);

  return {
    ...current,
    alternatives: asArray(data.recommended_domains, 50).map(
      mapAvailabilityItem,
    ),
  };
};

const mapDomain = (value: unknown): IcemailDomainSummary => {
  const domain = asRecord(value);
  const mailboxCount = asProviderCount(domain.mailbox_count);
  const provider =
    domain.workspace_type === null
      ? null
      : asGoogleProvider(domain.workspace_type);

  if (provider === null && mailboxCount !== 0) return malformed();

  return {
    id: asString(domain.domain_id),
    domain: asDomain(domain.domain),
    status: asString(domain.status),
    active: asBoolean(domain.active),
    provider,
    purchased: !asBoolean(domain.import),
    prewarmed: asBoolean(domain.prewarmed),
    blacklisted: asBoolean(domain.blacklisted),
    mailboxCount,
    expiresAt: asNullableDate(domain.expires_at),
  };
};

export const mapIcemailDomainPage = (
  value: unknown,
): IcemailPage<IcemailDomainSummary> => {
  const data = asRecord(unwrapData(value));

  return {
    items: asArray(data.domains, 50).map(mapDomain),
    total: asNonNegativeInteger(data.total_count),
    page: asNonNegativeInteger(data.page),
    limit: asNonNegativeInteger(data.limit),
  };
};

export const mapIcemailDomainDetail = (value: unknown): IcemailDomainDetail =>
  mapDomain(unwrapData(value));

const mapMailbox = (value: unknown): IcemailMailboxSummary => {
  const mailbox = asRecord(value);
  const domain = asRecord(mailbox.domains);
  const normalizedDomain = asDomain(domain.domain);

  return {
    id: asString(mailbox.id),
    domainId: asString(domain.domain_id),
    domain: normalizedDomain,
    address: asAddress(mailbox.username, normalizedDomain),
    firstName: asString(mailbox.first_name),
    lastName: asString(mailbox.last_name),
    provider: asGoogleProvider(mailbox.type),
    status: asString(mailbox.status),
    active: asBoolean(mailbox.active),
    master: asBoolean(mailbox.master_inbox),
    nextBillingAt: asNullableDate(mailbox.next_billing_date),
  };
};

export const mapIcemailMailboxPage = (
  value: unknown,
): IcemailPage<IcemailMailboxSummary> => {
  const data = asRecord(unwrapData(value));

  return {
    items: asArray(data.mailboxes, 50).map(mapMailbox),
    total: asNonNegativeInteger(data.total_count),
    page: asNonNegativeInteger(data.page),
    limit: asNonNegativeInteger(data.limit),
  };
};

export const mapIcemailMailboxDetail = (value: unknown): IcemailMailboxDetail =>
  mapMailbox(unwrapData(value));

export const mapIcemailAppPassword = (value: unknown): string | null => {
  const data = asRecord(unwrapData(value));

  return data.app_password === null ? null : asString(data.app_password);
};

export const mapIcemailOrderReceipt = (
  value: unknown,
): IcemailOrderReceipt => ({
  domains: asArray(unwrapData(value)).map((rawDomain) => {
    const domain = asRecord(rawDomain);
    const normalizedDomain = asDomain(domain.domain_name);

    if (domain.import !== false) return malformed();
    asGoogleProvider(domain.mailbox_type);

    return {
      orderId: asString(domain.order_id),
      domainId: asString(domain.domain_id),
      domain: normalizedDomain,
      mailboxes: asArray(domain.mailboxes).map((rawMailbox) => {
        const mailbox = asRecord(rawMailbox);

        return {
          id: asString(mailbox.mailbox_id),
          address: asAddress(mailbox.username, normalizedDomain),
          firstName: asString(mailbox.first_name),
          lastName: asString(mailbox.last_name),
        };
      }),
    };
  }),
});

const mapPrewarmedMailbox = (
  value: unknown,
  expectedDomain: string,
): IcemailPrewarmedMailbox => {
  const mailbox = asRecord(value);

  return {
    address: asAddress(mailbox.username, expectedDomain),
    firstName: asString(mailbox.first_name),
    lastName: asString(mailbox.last_name),
    provider: asGoogleProvider(mailbox.type),
    master: asBoolean(mailbox.master_inbox),
  };
};

export const mapIcemailPrewarmedBundlePage = (
  value: unknown,
): IcemailPrewarmedBundlePage => {
  const data = asRecord(unwrapData(value));

  return {
    items: asArray(data.domains).map((rawBundle) => {
      const bundle = asRecord(rawBundle);
      const domain = asDomain(bundle.domain);
      const rawMailboxes = asArray(bundle.pre_warm_mailbox);
      const mailboxCount = asProviderCount(bundle.mailbox_count);

      if (mailboxCount !== rawMailboxes.length) return malformed();

      return {
        inventoryId: asString(bundle.domain_id),
        domain,
        domainPriceCents: asCents(bundle.per_domain_price),
        mailboxPriceCents: asCents(bundle.per_mailbox_price),
        mailboxCount,
        mailboxes: rawMailboxes.map((mailbox) =>
          mapPrewarmedMailbox(mailbox, domain),
        ),
      };
    }),
  };
};

export const mapIcemailPrewarmPurchaseReceipt = (
  value: unknown,
): IcemailPrewarmPurchaseReceipt => {
  const data = asRecord(unwrapData(value));
  const successful = asArray(data.successful_domains, 50).map((rawDomain) => {
    const domain = asRecord(rawDomain);
    const normalizedDomain = asDomain(domain.domain_name);

    return {
      domainId: asString(domain.domain_id),
      domain: normalizedDomain,
      mailboxes: asArray(domain.mailboxes).map((rawMailbox) => {
        const mailbox = asRecord(rawMailbox);

        return {
          id: asString(mailbox.mailbox_id),
          ...mapPrewarmedMailbox(mailbox, normalizedDomain),
        };
      }),
    };
  });
  const failedInventoryIds = asArray(data.failed_domains, 50).map(
    (rawFailure) => asString(asRecord(rawFailure).domain_id),
  );
  const totalSuccessful = asNonNegativeInteger(data.total_successful);
  const totalFailed = asNonNegativeInteger(data.total_failed);
  const totalMailboxes = asNonNegativeInteger(data.total_mailboxes_created);

  if (
    totalSuccessful !== successful.length ||
    totalFailed !== failedInventoryIds.length ||
    totalMailboxes !==
      successful.reduce((total, domain) => total + domain.mailboxes.length, 0)
  ) {
    return malformed();
  }

  return {
    orderId: asString(data.order_id),
    successful,
    failedInventoryIds,
    totalCostCents: asCents(data.total_cost),
  };
};

const assertExactIds = (actualIds: string[], expectedIds: string[]) => {
  if (
    actualIds.length !== expectedIds.length ||
    [...actualIds]
      .sort()
      .some((id, index) => id !== [...expectedIds].sort()[index])
  ) {
    return malformed();
  }
};

export const mapIcemailMailboxDeletionReceipt = (
  value: unknown,
  expectedDomainIds: string[],
  expectedMode: 'immediate' | 'scheduled',
): IcemailMailboxDeletionReceipt => {
  const data = asRecord(unwrapData(value));

  if (data.mode !== expectedMode) return malformed();

  const results = asArray(data.per_domain).map((rawResult) => {
    const result = asRecord(rawResult);
    const skipped =
      result.skipped === undefined ? false : asBoolean(result.skipped);
    const failed = result.error !== undefined;

    if (failed) asString(result.error);
    if (failed && skipped) return malformed();

    return {
      domainId: asString(result.domain_id),
      mailboxIds: asArray(result.mailbox_ids).map(asString),
      skipped,
      failed,
    };
  });

  assertExactIds(
    results.map((result) => result.domainId),
    expectedDomainIds,
  );
  const providerSummary = asRecord(data.summary);
  const summary = {
    domainsRequested: asNonNegativeInteger(providerSummary.domains_requested),
    domainsProcessed: asNonNegativeInteger(providerSummary.domains_processed),
    domainsSkipped: asNonNegativeInteger(providerSummary.domains_skipped),
    domainsFailed: asNonNegativeInteger(providerSummary.domains_failed),
    mailboxesAffected: asNonNegativeInteger(providerSummary.mailboxes_affected),
  };

  if (summary.domainsRequested !== expectedDomainIds.length) return malformed();

  return { mode: expectedMode, results, summary };
};

export const mapIcemailQueuedDomainAction = (
  value: unknown,
  expectedAction: 'clear_dns_records' | 'delete_domain',
  expectedDomainCount: number,
): IcemailQueuedDomainActionReceipt => {
  const data = asRecord(unwrapData(value));

  if (
    data.action !== expectedAction ||
    asNonNegativeInteger(data.estimated_domains) !== expectedDomainCount
  ) {
    return malformed();
  }

  return {
    state: 'QUEUED',
    action: expectedAction,
    estimatedDomains: expectedDomainCount,
    correlationId: asString(data.correlation_id),
  };
};

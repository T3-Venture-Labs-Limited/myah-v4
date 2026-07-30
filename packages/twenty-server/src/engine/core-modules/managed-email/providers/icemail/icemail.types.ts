export type IcemailManagedProvider = 'GOOGLE';

export type IcemailProviderPrice = {
  amountCents: number;
  currency: 'USD';
  duration: number;
  durationUnit: 'YEAR';
};

export type IcemailDomainAvailabilityItem = {
  domain: string;
  available: boolean;
  price: IcemailProviderPrice;
};

export type IcemailDomainAvailability = IcemailDomainAvailabilityItem & {
  alternatives: IcemailDomainAvailabilityItem[];
};

export type IcemailPage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export type IcemailDomainSummary = {
  id: string;
  domain: string;
  status: string;
  active: boolean;
  provider: IcemailManagedProvider;
  purchased: boolean;
  prewarmed: boolean;
  blacklisted: boolean;
  mailboxCount: number;
  expiresAt: Date | null;
};

export type IcemailDomainDetail = IcemailDomainSummary;

export type IcemailMailboxSummary = {
  id: string;
  domainId: string;
  domain: string;
  address: string;
  firstName: string;
  lastName: string;
  provider: IcemailManagedProvider;
  status: string;
  active: boolean;
  master: boolean;
  nextBillingAt: Date | null;
};

export type IcemailMailboxDetail = IcemailMailboxSummary;

export type IcemailMailboxCredential = {
  username: string;
  appPassword: string;
  smtp: { host: 'smtp.gmail.com'; port: 465; secure: true };
  imap: { host: 'imap.gmail.com'; port: 993; secure: true };
};

export type IcemailOrdinaryMailboxInput = {
  firstName: string;
  lastName: string;
  address: string;
  password: string;
};

export type IcemailOrdinaryOrderInput = {
  domains: Array<{
    domain: string;
    mailboxes: IcemailOrdinaryMailboxInput[];
  }>;
};

export type IcemailOrderReceipt = {
  domains: Array<{
    orderId: string;
    domainId: string;
    domain: string;
    mailboxes: Array<{
      id: string;
      address: string;
      firstName: string;
      lastName: string;
    }>;
  }>;
};

export type IcemailPrewarmedMailbox = {
  address: string;
  firstName: string;
  lastName: string;
  provider: IcemailManagedProvider;
  master: boolean;
};

export type IcemailPrewarmedBundle = {
  inventoryId: string;
  domain: string;
  domainPriceCents: number;
  mailboxPriceCents: number;
  mailboxCount: number;
  mailboxes: IcemailPrewarmedMailbox[];
};

export type IcemailPrewarmedBundlePage = {
  items: IcemailPrewarmedBundle[];
};

export type IcemailPrewarmPurchaseInput = {
  inventoryIds: string[];
};

export type IcemailPrewarmPurchaseReceipt = {
  orderId: string;
  successful: Array<{
    domainId: string;
    domain: string;
    mailboxes: Array<IcemailPrewarmedMailbox & { id: string }>;
  }>;
  failedInventoryIds: string[];
  totalCostCents: number;
};

export type IcemailMailboxDeletionInput = {
  domainIds: string[];
  mode: 'immediate' | 'scheduled';
};

export type IcemailMailboxDeletionReceipt = {
  mode: IcemailMailboxDeletionInput['mode'];
  results: Array<{
    domainId: string;
    mailboxIds: string[];
    skipped: boolean;
    failed: boolean;
  }>;
  summary: {
    domainsRequested: number;
    domainsProcessed: number;
    domainsSkipped: number;
    domainsFailed: number;
    mailboxesAffected: number;
  };
};

export type IcemailQueuedDomainActionReceipt = {
  state: 'QUEUED';
  action: 'clear_dns_records' | 'delete_domain';
  estimatedDomains: number;
  correlationId: string;
};

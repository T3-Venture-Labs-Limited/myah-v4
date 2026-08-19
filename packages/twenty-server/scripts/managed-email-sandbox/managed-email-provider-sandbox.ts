import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { dirname } from 'node:path';

type SandboxOptions = {
  host?: string;
  icemailPort?: number;
  warmupPort?: number;
  controlPort?: number;
  statePath: string;
  greenMail?: {
    host: string;
    smtpPort: number;
    imapPort: number;
  };
};

type IcemailDomain = {
  domain_id: string;
  domain: string;
  status: string;
  active: boolean;
  workspace_type: 'GOOGLE';
  import: boolean;
  prewarmed: boolean;
  blacklisted: boolean;
  expires_at: string;
};

type IcemailMailbox = {
  id: string;
  domain_id: string;
  username: string;
  first_name: string;
  last_name: string;
  type: 'GOOGLE';
  status: string;
  active: boolean;
  master_inbox: boolean;
  password: string;
};

type IcemailPrewarmedMailbox = {
  username: string;
  first_name: string;
  last_name: string;
  type: 'GOOGLE';
  master_inbox: boolean;
};

type IcemailPrewarmedBundle = {
  domain_id: string;
  domain: string;
  per_domain_price: number;
  per_mailbox_price: number;
  mailbox_count: string;
  pre_warm_mailbox: IcemailPrewarmedMailbox[];
};

type IcemailOrderMailbox = {
  mailbox_id: string;
  username: string;
  first_name: string;
  last_name: string;
};

type IcemailOrderDomain = {
  domain_name: string;
  import: false;
  mailbox_type: 'GOOGLE';
  order_id: string;
  domain_id: string;
  mailboxes: IcemailOrderMailbox[];
};

type IcemailOrderResponse = {
  success: true;
  data: IcemailOrderDomain[];
};

type WarmupFrequency = {
  starting_baseline: number;
  increase_per_day: number;
  max_sends_per_day: number;
  reply_rate: number;
  strategy: 'progressive';
};

type WarmupInboxStatus =
  | 'paused'
  | 'running'
  | 'banned'
  | 'error'
  | 'suspended';

type WarmupInbox = {
  id: string;
  email: string;
  sender_first: string;
  sender_last: string;
  status: WarmupInboxStatus;
  frequency: WarmupFrequency;
  created_at: number;
};

type SandboxFault =
  | 'icemail-order-response-lost-after-write'
  | 'icemail-prewarm-partial'
  | 'icemail-read-not-found'
  | 'warmup-create-response-lost-after-write';

type SandboxState = {
  version: 1;
  domains: IcemailDomain[];
  mailboxes: IcemailMailbox[];
  inboxes: WarmupInbox[];
  prewarm: IcemailPrewarmedBundle[];
  operations: Record<string, IcemailOrderResponse>;
  faults: SandboxFault[];
};

type StartedSandbox = {
  icemailBaseUrl: string;
  warmupBaseUrl: string;
  controlBaseUrl: string;
};

type JsonRecord = Record<string, unknown>;

type SandboxHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

const asRecord = (value: unknown): JsonRecord => value as JsonRecord;

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const readJson = async (request: IncomingMessage): Promise<JsonRecord> => {
  let body = '';

  for await (const chunk of request) {
    body += chunk.toString();
  }

  if (body === '') return {};

  return JSON.parse(body) as JsonRecord;
};

const send = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
};

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const normalize = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const SANDBOX_DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.test$/;

const requireSandboxDomain = (value: unknown): string => {
  const domain = normalize(value);

  if (!SANDBOX_DOMAIN_PATTERN.test(domain)) {
    throw new Error('Managed email sandbox requires a test domain');
  }

  return domain;
};

const requireSandboxAddress = (
  value: unknown,
  expectedDomain: string,
): string => {
  const address = normalize(value);
  const parts = address.split('@');

  if (
    parts.length !== 2 ||
    parts[0].length === 0 ||
    requireSandboxDomain(parts[1]) !== expectedDomain
  ) {
    throw new Error('Managed email sandbox requires a test domain address');
  }

  return address;
};

const SANDBOX_FAULTS = new Set<SandboxFault>([
  'icemail-order-response-lost-after-write',
  'icemail-prewarm-partial',
  'icemail-read-not-found',
  'warmup-create-response-lost-after-write',
]);

const isSandboxFault = (value: unknown): value is SandboxFault =>
  typeof value === 'string' && SANDBOX_FAULTS.has(value as SandboxFault);

const assertSandboxState = (value: SandboxState): SandboxState => {
  const faults = value.faults ?? [];

  if (
    value.version !== 1 ||
    !Array.isArray(value.domains) ||
    !Array.isArray(value.mailboxes) ||
    !Array.isArray(value.inboxes) ||
    !Array.isArray(value.prewarm) ||
    value.operations === null ||
    typeof value.operations !== 'object' ||
    Array.isArray(value.operations) ||
    !Array.isArray(faults) ||
    !faults.every(isSandboxFault)
  ) {
    throw new Error('Managed email sandbox state is invalid');
  }

  const domainsById = new Map(
    value.domains.map((domain) => [
      domain.domain_id,
      requireSandboxDomain(domain.domain),
    ]),
  );

  for (const mailbox of value.mailboxes) {
    const domain = domainsById.get(mailbox.domain_id);

    if (domain === undefined) {
      throw new Error('Managed email sandbox mailbox domain is missing');
    }
    requireSandboxAddress(mailbox.username, domain);
  }

  for (const bundle of value.prewarm) {
    const domain = requireSandboxDomain(bundle.domain);

    for (const mailbox of bundle.pre_warm_mailbox) {
      requireSandboxAddress(mailbox.username, domain);
    }
  }

  for (const inbox of value.inboxes) {
    const domain = normalize(inbox.email).split('@')[1];

    requireSandboxAddress(inbox.email, requireSandboxDomain(domain));
  }

  for (const operation of Object.values(value.operations)) {
    for (const rawDomain of operation.data) {
      const domain = requireSandboxDomain(rawDomain.domain_name);

      for (const mailbox of rawDomain.mailboxes) {
        requireSandboxAddress(mailbox.username, domain);
      }
    }
  }

  return { ...value, faults };
};

const SANDBOX_DOMAINS = [
  'example-one.test',
  'example-two.test',
  'example-three.test',
] as const;

const seedState = (): SandboxState => ({
  version: 1,
  domains: [],
  mailboxes: [],
  inboxes: [],
  operations: {},
  faults: [],
  prewarm: SANDBOX_DOMAINS.map((domain, index) => ({
    domain_id: `inventory-${index + 1}`,
    domain,
    per_domain_price: 120,
    per_mailbox_price: 25,
    mailbox_count: '1',
    pre_warm_mailbox: [
      {
        username: `prewarm${index + 1}@${domain}`,
        first_name: 'Prewarmed',
        last_name: `${index + 1}`,
        type: 'GOOGLE',
        master_inbox: false,
      },
    ],
  })),
});

const loadState = async (statePath: string): Promise<SandboxState> => {
  try {
    return assertSandboxState(
      JSON.parse(await readFile(statePath, 'utf8')) as SandboxState,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return seedState();
    }

    throw error;
  }
};

export async function createManagedEmailProviderSandbox(
  options: SandboxOptions,
) {
  const host = options.host ?? '127.0.0.1';
  const greenMail = options.greenMail ?? {
    host: '127.0.0.1',
    smtpPort: 3025,
    imapPort: 3143,
  };
  let state = await loadState(options.statePath);
  const servers: Server[] = [];
  let started: StartedSandbox | undefined;
  let stopPromise: Promise<void> | undefined;

  const hasExpectedMailEndpoint = (
    value: unknown,
    email: string,
    port: number,
  ): boolean => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const endpoint = value as JsonRecord;

    return (
      normalize(endpoint.username) === email &&
      asString(endpoint.password).length > 0 &&
      endpoint.host === greenMail.host &&
      endpoint.port === port &&
      endpoint.tls === false
    );
  };

  const persist = async (): Promise<void> => {
    await mkdir(dirname(options.statePath), { recursive: true });

    const temporaryPath = `${options.statePath}.${process.pid}.${Date.now()}.tmp`;

    await writeFile(temporaryPath, JSON.stringify(state, null, 2));
    await rename(temporaryPath, options.statePath);
  };

  const takeFault = (fault: SandboxFault): boolean => {
    const index = state.faults.indexOf(fault);

    if (index === -1) return false;

    state.faults.splice(index, 1);
    return true;
  };

  const makeDomain = (
    domainValue: unknown,
    prewarmed: boolean,
  ): IcemailDomain => ({
    domain_id: randomUUID(),
    domain: requireSandboxDomain(domainValue),
    status: 'active',
    active: true,
    workspace_type: 'GOOGLE',
    import: !prewarmed,
    prewarmed,
    blacklisted: false,
    expires_at: new Date(Date.now() + 31_536_000_000).toISOString(),
  });

  const makeMailbox = (
    domain: IcemailDomain,
    source: JsonRecord,
  ): IcemailMailbox => {
    const firstName = asString(source.first_name) || 'Test';
    const lastName = asString(source.last_name) || 'User';
    const username =
      normalize(source.username) || `${normalize(firstName)}@${domain.domain}`;

    return {
      id: randomUUID(),
      domain_id: domain.domain_id,
      username: requireSandboxAddress(username, domain.domain),
      first_name: firstName,
      last_name: lastName,
      type: 'GOOGLE',
      status: 'active',
      active: true,
      master_inbox: false,
      password: asString(source.password) || 'sandbox-password',
    };
  };

  const domainView = (domain: IcemailDomain) => ({
    ...domain,
    mailbox_count: String(
      state.mailboxes.filter(
        (mailbox) => mailbox.domain_id === domain.domain_id,
      ).length,
    ),
  });

  const mailboxView = (mailbox: IcemailMailbox) => ({
    ...mailbox,
    domains: {
      domain_id: mailbox.domain_id,
      domain:
        state.domains.find((domain) => domain.domain_id === mailbox.domain_id)
          ?.domain ?? 'deleted.test',
    },
    next_billing_date: null,
  });

  const warmupSummaryView = (inbox: WarmupInbox) => ({
    inbox_id: inbox.id,
    email: inbox.email,
    status: inbox.status,
    type: 'smtp_imap',
    score: 100,
    sender_first: inbox.sender_first,
    sender_last: inbox.sender_last,
  });

  const warmupDetailView = (inbox: WarmupInbox) => ({
    ...warmupSummaryView(inbox),
    created_at: inbox.created_at,
    frequency: inbox.frequency,
    health_check: {
      mx: { score: 1 },
      spf: { score: 1 },
      dmarc: { score: 1 },
      domain_blacklists: { score: 1, blacklists: [] },
      warmup_days: { score: 0, warmup_days: 0 },
    },
  });

  const handleIcemail: SandboxHandler = async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://sandbox');
    const method = request.method ?? 'GET';
    const path = url.pathname;

    if (path === '/domain/available' && method === 'GET') {
      let domain: string;

      try {
        domain = requireSandboxDomain(url.searchParams.get('domain'));
      } catch {
        send(response, 400, { error: 'invalid_test_domain' });
        return;
      }

      send(response, 200, {
        success: true,
        data: {
          current_domain: {
            domain,
            available: !state.domains.some(
              (candidate) => candidate.domain === domain,
            ),
            pricing: {
              price: 1.2,
              currency: 'USD',
              duration_type: 'YEAR',
              duration: 1,
            },
          },
          recommended_domains: [],
        },
      });
      return;
    }

    if (path === '/prewarm' && method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 100);

      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        send(response, 400, { error: 'invalid_page' });
        return;
      }

      send(response, 200, {
        success: true,
        data: {
          domains: page === 1 ? state.prewarm : [],
          page,
          limit,
        },
      });
      return;
    }

    if (path === '/prewarm/buy' && method === 'POST') {
      const body = await readJson(request);
      const inventoryIds = [...new Set(asStringArray(body.domain_ids))];
      const selectedBundles = state.prewarm.filter((bundle) =>
        inventoryIds.includes(bundle.domain_id),
      );
      const failedInventoryIds = inventoryIds.filter(
        (inventoryId) =>
          !selectedBundles.some((bundle) => bundle.domain_id === inventoryId),
      );

      if (takeFault('icemail-prewarm-partial') && selectedBundles.length > 0) {
        failedInventoryIds.push(selectedBundles.pop()!.domain_id);
      }

      const claimedInventoryIds = new Set(
        selectedBundles.map((bundle) => bundle.domain_id),
      );
      state.prewarm = state.prewarm.filter(
        (bundle) => !claimedInventoryIds.has(bundle.domain_id),
      );
      const purchasedDomains = selectedBundles.map((bundle) => {
        const domain = makeDomain(bundle.domain, true);
        const mailboxes = bundle.pre_warm_mailbox.map((rawMailbox) =>
          makeMailbox(domain, rawMailbox),
        );

        state.domains.push(domain);
        state.mailboxes.push(...mailboxes);

        return {
          domain_name: domain.domain,
          domain_id: domain.domain_id,
          mailboxes: mailboxes.map((mailbox) => ({
            mailbox_id: mailbox.id,
            username: mailbox.username,
            first_name: mailbox.first_name,
            last_name: mailbox.last_name,
            type: mailbox.type,
            master_inbox: mailbox.master_inbox,
          })),
        };
      });

      await persist();
      send(response, 200, {
        success: true,
        data: {
          order_id: randomUUID(),
          successful_domains: purchasedDomains,
          failed_domains: failedInventoryIds.map((domainId) => ({
            domain_id: domainId,
            reason: 'not_available',
          })),
          total_successful: purchasedDomains.length,
          total_failed: failedInventoryIds.length,
          total_mailboxes_created: purchasedDomains.reduce(
            (total, domain) => total + domain.mailboxes.length,
            0,
          ),
          total_cost: purchasedDomains.length,
        },
      });
      return;
    }

    if (path === '/order' && method === 'POST') {
      const body = await readJson(request);
      const operationKey = fingerprint(body);
      const existing = state.operations[operationKey];

      if (existing !== undefined) {
        send(response, 201, { ...existing, replayed: true });
        return;
      }

      const orderItems = Array.isArray(body.data) ? body.data : [];
      let validatedItems: Array<{
        domain: string;
        item: JsonRecord;
        mailboxes: JsonRecord[];
      }>;

      try {
        validatedItems = orderItems.map((value) => {
          const item = asRecord(value);
          const domain = requireSandboxDomain(item.domain_name);
          const mailboxes = Array.isArray(item.mailboxes)
            ? item.mailboxes.map(asRecord)
            : [];

          for (const mailbox of mailboxes) {
            if (asString(mailbox.username).length > 0) {
              requireSandboxAddress(mailbox.username, domain);
            }
          }

          return { domain, item, mailboxes };
        });
      } catch {
        send(response, 400, { error: 'invalid_test_domain' });
        return;
      }

      const responseLost = takeFault('icemail-order-response-lost-after-write');

      const receipt: IcemailOrderDomain[] = validatedItems.map(
        ({ domain: domainName, mailboxes: mailboxInputs }) => {
          const domain = makeDomain(domainName, false);
          const mailboxes = mailboxInputs.map((mailbox) =>
            makeMailbox(domain, mailbox),
          );

          state.domains.push(domain);
          state.mailboxes.push(...mailboxes);
          return {
            domain_name: domain.domain,
            import: false,
            mailbox_type: 'GOOGLE',
            order_id: randomUUID(),
            domain_id: domain.domain_id,
            mailboxes: mailboxes.map((mailbox) => ({
              mailbox_id: mailbox.id,
              username: mailbox.username,
              first_name: mailbox.first_name,
              last_name: mailbox.last_name,
            })),
          };
        },
      );
      const result: IcemailOrderResponse = { success: true, data: receipt };

      state.operations[operationKey] = result;
      await persist();

      if (responseLost) {
        send(response, 503, { error: 'response_lost' });
        return;
      }

      send(response, 201, result);
      return;
    }

    if (path === '/domain' && method === 'GET') {
      send(response, 200, {
        success: true,
        data: {
          domains: state.domains.map(domainView),
          total_count: state.domains.length,
          page: 1,
          limit: 50,
        },
      });
      return;
    }

    if (path === '/mailbox' && method === 'GET') {
      send(response, 200, {
        success: true,
        data: {
          mailboxes: state.mailboxes.map(mailboxView),
          total_count: state.mailboxes.length,
          page: 1,
          limit: 50,
        },
      });
      return;
    }

    const domainMatch = /^\/domain\/([^/]+)$/.exec(path);

    if (domainMatch !== null && method === 'GET') {
      if (takeFault('icemail-read-not-found')) {
        await persist();
        send(response, 404, { error: 'not_found' });
        return;
      }

      const domain = state.domains.find(
        (candidate) =>
          candidate.domain_id === decodeURIComponent(domainMatch[1]),
      );

      if (domain === undefined) {
        send(response, 404, { error: 'not_found' });
        return;
      }

      send(response, 200, { success: true, data: domainView(domain) });
      return;
    }

    const mailboxMatch = /^\/mailbox\/([^/]+)(?:\/(app-password))?$/.exec(path);

    if (mailboxMatch !== null && method === 'GET') {
      if (takeFault('icemail-read-not-found')) {
        await persist();
        send(response, 404, { error: 'not_found' });
        return;
      }

      const mailbox = state.mailboxes.find(
        (candidate) => candidate.id === decodeURIComponent(mailboxMatch[1]),
      );

      if (mailbox === undefined) {
        send(response, 404, { error: 'not_found' });
        return;
      }

      if (mailboxMatch[2] === 'app-password') {
        send(response, 200, {
          success: true,
          data: {
            app_password: mailbox.password,
            forwarding: false,
            smtp: {
              host: greenMail.host,
              port: greenMail.smtpPort,
              tls: false,
            },
            imap: {
              host: greenMail.host,
              port: greenMail.imapPort,
              tls: false,
            },
          },
        });
        return;
      }

      send(response, 200, { success: true, data: mailboxView(mailbox) });
      return;
    }

    if (path === '/domain/mailboxes' && method === 'DELETE') {
      const body = await readJson(request);
      const domainIds = asStringArray(body.domain_ids);
      const results = domainIds.map((domainId) => {
        const mailboxes = state.mailboxes.filter(
          (mailbox) => mailbox.domain_id === domainId,
        );

        state.mailboxes = state.mailboxes.filter(
          (mailbox) => mailbox.domain_id !== domainId,
        );
        state.domains = state.domains.filter(
          (domain) => domain.domain_id !== domainId,
        );

        return {
          domain_id: domainId,
          mailbox_ids: mailboxes.map((mailbox) => mailbox.id),
        };
      });

      await persist();
      send(response, 200, {
        success: true,
        data: {
          mode: body.mode,
          per_domain: results,
          summary: {
            domains_requested: domainIds.length,
            domains_processed: results.length,
            domains_skipped: 0,
            domains_failed: 0,
            mailboxes_affected: results.reduce(
              (total, result) => total + result.mailbox_ids.length,
              0,
            ),
          },
        },
      });
      return;
    }

    if (
      (path === '/domain/clear-dns' || path === '/domain') &&
      method === 'DELETE'
    ) {
      send(response, 200, {
        success: true,
        data: {
          action:
            path === '/domain/clear-dns'
              ? 'clear_dns_records'
              : 'delete_domain',
          estimated_domains: 0,
          correlation_id: randomUUID(),
        },
      });
      return;
    }

    send(response, 404, { error: 'not_found' });
  };

  const handleWarmup: SandboxHandler = async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://sandbox');
    const method = request.method ?? 'GET';
    const path = url.pathname;

    if (path === '/v1/account/credits' && method === 'GET') {
      const inUse = state.inboxes.length;

      send(response, 200, {
        plans: {
          basic: { total: 100, available: 100 - inUse, in_use: inUse },
        },
      });
      return;
    }

    if (path === '/v1/inboxes' && method === 'GET') {
      send(response, 200, {
        items: state.inboxes.map(warmupSummaryView),
      });
      return;
    }

    if (path === '/v1/inboxes/advanced' && method === 'POST') {
      const body = await readJson(request);
      const email = normalize(body.email);
      const smtp = body.smtp;
      const imap = body.imap;
      const smtpPassword =
        smtp !== null && typeof smtp === 'object' && !Array.isArray(smtp)
          ? asString((smtp as JsonRecord).password)
          : '';
      const imapPassword =
        imap !== null && typeof imap === 'object' && !Array.isArray(imap)
          ? asString((imap as JsonRecord).password)
          : '';

      if (
        !hasExpectedMailEndpoint(smtp, email, greenMail.smtpPort) ||
        !hasExpectedMailEndpoint(imap, email, greenMail.imapPort) ||
        smtpPassword !== imapPassword
      ) {
        send(response, 422, { error: 'invalid_mail_transport' });
        return;
      }
      const existing = state.inboxes.find((inbox) => inbox.email === email);

      if (existing !== undefined) {
        send(response, 409, { error: 'conflict' });
        return;
      }
      const responseLost = takeFault('warmup-create-response-lost-after-write');

      const rawFrequency = asRecord(body.frequency);
      const inbox: WarmupInbox = {
        id: randomUUID(),
        email,
        sender_first: asString(body.sender_first),
        sender_last: asString(body.sender_last),
        status: 'paused',
        frequency: {
          starting_baseline: Number(rawFrequency.starting_baseline),
          increase_per_day: Number(rawFrequency.increase_per_day),
          max_sends_per_day: Number(rawFrequency.max_sends_per_day),
          reply_rate: Number(rawFrequency.reply_rate),
          strategy: 'progressive',
        },
        created_at: Math.floor(Date.now() / 1_000),
      };

      state.inboxes.push(inbox);
      await persist();
      send(
        response,
        responseLost ? 503 : 201,
        responseLost ? { error: 'response_lost' } : { inbox_id: inbox.id },
      );
      return;
    }

    const inboxMatch =
      /^\/v1\/inboxes\/([^/]+)(?:\/(start|pause|resume|metrics))?$/.exec(path);

    if (inboxMatch === null) {
      send(response, 404, { error: 'not_found' });
      return;
    }

    const inbox = state.inboxes.find(
      (candidate) => candidate.id === decodeURIComponent(inboxMatch[1]),
    );

    if (inbox === undefined) {
      send(response, 404, { error: 'not_found' });
      return;
    }

    const action = inboxMatch[2];

    if (action === 'metrics' && method === 'GET') {
      const from = Number(url.searchParams.get('from') ?? 0);
      const to = Number(url.searchParams.get('to') ?? 3_600);

      send(response, 200, {
        inbox_id: inbox.id,
        start_time: from,
        end_time: to,
        main_metrics: {
          total_count: 0,
          sent: 0,
          landed_inbox: { value: 0 },
          landed_spam: { value: 0 },
          landed_category: { value: 0 },
          replies_received: 0,
        },
        schedule_metrics: [],
      });
      return;
    }

    if (action === undefined && method === 'GET') {
      send(response, 200, warmupDetailView(inbox));
      return;
    }

    if (action === undefined && method === 'PATCH') {
      const body = await readJson(request);
      const frequency = asRecord(body.frequency);

      inbox.frequency = {
        starting_baseline: Number(frequency.starting_baseline),
        increase_per_day: Number(frequency.increase_per_day),
        max_sends_per_day: Number(frequency.max_sends_per_day),
        reply_rate: Number(frequency.reply_rate),
        strategy: 'progressive',
      };
      await persist();
      send(response, 200, warmupDetailView(inbox));
      return;
    }

    if (action === undefined && method === 'DELETE') {
      state.inboxes = state.inboxes.filter(
        (candidate) => candidate.id !== inbox.id,
      );
      await persist();
      send(response, 200, {});
      return;
    }

    if (method === 'POST' && action !== undefined) {
      inbox.status = action === 'pause' ? 'paused' : 'running';
      await persist();
      send(response, 200, {});
      return;
    }

    send(response, 404, { error: 'not_found' });
  };

  const listen = async (handler: SandboxHandler, port = 0): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        handler(request, response).catch(() => {
          send(response, 500, { error: 'request_failed' });
        });
      });

      server.once('error', reject);
      server.listen({ host, port }, () => {
        const address = server.address();

        if (address === null || typeof address === 'string') {
          reject(new Error('Managed email sandbox did not bind a TCP port'));
          return;
        }

        resolve(address.port);
      });
      servers.push(server);
    });

  const stop = (): Promise<void> => {
    if (stopPromise !== undefined) return stopPromise;

    stopPromise = Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeIdleConnections();
            server.closeAllConnections();
          }),
      ),
    )
      .then(() => {
        servers.length = 0;
        started = undefined;
      })
      .finally(() => {
        stopPromise = undefined;
      });

    return stopPromise;
  };

  return {
    start: async (): Promise<StartedSandbox> => {
      if (started !== undefined) return started;

      const [icemailPort, warmupPort, controlPort] = await Promise.all([
        listen(handleIcemail, options.icemailPort),
        listen(handleWarmup, options.warmupPort),
        listen(async (request, response) => {
          if (request.url === '/reset') {
            state = seedState();
            await persist();
            send(response, 200, { ok: true });
            return;
          }

          if (request.method === 'POST' && request.url === '/fault') {
            const body = await readJson(request);
            const fault = body.fault;

            if (!isSandboxFault(fault)) {
              send(response, 422, { error: 'invalid_fault' });
              return;
            }

            state.faults.push(fault);
            await persist();
            send(response, 202, { queued: fault });
            return;
          }

          if (request.method === 'POST' && request.url === '/stop') {
            response.setHeader('connection', 'close');
            response.once('finish', () => void stop());
            send(response, 202, { stopping: true });
            return;
          }

          send(response, 404, { error: 'not_found' });
        }, options.controlPort),
      ]);

      started = {
        icemailBaseUrl: `http://${host}:${icemailPort}`,
        warmupBaseUrl: `http://${host}:${warmupPort}`,
        controlBaseUrl: `http://${host}:${controlPort}`,
      };
      await persist();

      return started;
    },
    stop,
  };
}

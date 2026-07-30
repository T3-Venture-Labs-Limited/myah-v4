import { type AxiosInstance } from 'axios';

import { type SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { WarmupInboxClient } from '../warmup-inbox.client';
import { WarmupInboxExceptionCode } from '../warmup-inbox.exception';

const providerSecret = 'not-a-real-warmup-key';
const mailboxSecret = 'not-a-real-mailbox-app-password';

const policy = {
  startingBaseline: 0,
  increasePerDay: 1,
  maxSendsPerDay: 1,
  replyRatePercent: 0,
  strategy: 'progressive' as const,
  version: 'manual-beta-v1',
};

const summaryFixture = {
  inbox_id: 'inbox-1',
  status: 'running',
  type: 'smtp_imap',
  email: 'ada@sender.com',
  filter_id: 'deprecated-filter',
  identifier: 'private-identifier',
  score: 98,
  sender_first: 'Ada',
  sender_last: 'Lovelace',
};

const detailFixture = {
  ...summaryFixture,
  created_at: 1_785_283_200,
  frequency: {
    starting_baseline: 0,
    increase_per_day: 1,
    max_sends_per_day: 1,
    reply_rate: 0,
    last_sends_per_day: null,
    strategy: 'progressive',
  },
  reputation: { score: 98 },
  plan: 'basic',
  email_topics: [],
  schedule: { mon: { start: 9, end: 17 } },
  timezone: 'Etc/UTC',
  language: 'english',
  esp_priority: { google: true, outlook: false, all_other: false },
  extended_reply: false,
  health_check: {
    mx: { score: 1, mx_records: [] },
    spf: { score: 1, value: 'raw-spf-record' },
    dmarc: { score: 1, value: 'raw-dmarc-record' },
    domain_blacklists: {
      score: 1,
      blacklists: [
        {
          name: 'Private list name',
          url: 'https://list.test',
          detected: false,
        },
        { name: 'Another list', url: 'https://list-2.test', detected: true },
      ],
    },
    warmup_days: { score: 0.2, warmup_days: 4 },
  },
};

const createClient = (enabled = true) => {
  const httpClient = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<AxiosInstance>;
  const secureHttpClientService = {
    getHttpClient: jest.fn(() => httpClient),
  } as Pick<SecureHttpClientService, 'getHttpClient'>;
  const twentyConfigService = {
    get: jest.fn((key: keyof ConfigVariables) => {
      switch (key) {
        case 'MANAGED_EMAIL_ENABLED':
          return enabled;
        case 'WARMUP_INBOX_API_BASE_URL':
          return 'https://api.warmup.test';
        case 'WARMUP_INBOX_API_KEY':
          return providerSecret;
        default:
          throw new Error(`Unexpected config key: ${key}`);
      }
    }),
  } as Pick<TwentyConfigService, 'get'>;

  return {
    client: new WarmupInboxClient(
      twentyConfigService as TwentyConfigService,
      secureHttpClientService as SecureHttpClientService,
    ),
    httpClient,
    secureHttpClientService,
  };
};

const expectCode = async (
  operation: Promise<unknown>,
  code: WarmupInboxExceptionCode,
) => {
  await expect(operation).rejects.toMatchObject({ code });
};

const axiosFailure = (status?: number, code?: string) => ({
  isAxiosError: true,
  code,
  response:
    status === undefined
      ? undefined
      : {
          status,
          data: {
            message: `provider detail ${providerSecret} ${mailboxSecret}`,
          },
        },
});

describe('WarmupInboxClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fails closed before creating an HTTP client while managed email is disabled', async () => {
    const { client, secureHttpClientService } = createClient(false);

    await expectCode(
      client.listInboxes(),
      WarmupInboxExceptionCode.CONFIGURATION_DISABLED,
    );
    expect(secureHttpClientService.getHttpClient).not.toHaveBeenCalled();
  });

  it('lists bounded customer-safe inbox summaries and finds an exact address', async () => {
    const { client, httpClient, secureHttpClientService } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: { items: [summaryFixture] },
      headers: {},
    });

    const expected = [
      {
        id: 'inbox-1',
        address: 'ada@sender.com',
        status: 'running',
        connectionType: 'SMTP_IMAP',
        score: 98,
        senderFirstName: 'Ada',
        senderLastName: 'Lovelace',
      },
    ];
    await expect(client.listInboxes()).resolves.toEqual(expected);
    await expect(
      client.findByExactAddress(' ADA@SENDER.COM '),
    ).resolves.toEqual(expected);
    expect(httpClient.get).toHaveBeenCalledWith('/v1/inboxes');
    expect(secureHttpClientService.getHttpClient).toHaveBeenCalledWith({
      baseURL: 'https://api.warmup.test',
      headers: { 'x-api-key': providerSecret },
      retries: 2,
      shouldResetTimeout: true,
      timeout: 10_000,
    });
    expect(JSON.stringify(expected)).not.toContain('filter');
    expect(JSON.stringify(expected)).not.toContain('identifier');
  });

  it('projects only Basic credit capacity without provider plan amounts', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        plans: {
          basic: { total: 1, available: 1, in_use: 0 },
          pro: { total: 50, available: 49, in_use: 1 },
          max: { total: 0, available: 0, in_use: 0 },
          send_only: { total: 0, available: 0, in_use: 0 },
          monitoring: { total: 0, available: 0, in_use: 0 },
        },
      },
      headers: {},
    });

    await expect(client.getCapacity()).resolves.toEqual({
      total: 1,
      available: 1,
      inUse: 0,
    });
    expect(httpClient.get).toHaveBeenCalledWith('/v1/account/credits');
  });

  it('creates one Basic SMTP/IMAP inbox with server-held credentials and no schedule', async () => {
    const { client, httpClient, secureHttpClientService } = createClient();

    httpClient.post.mockResolvedValue({
      status: 201,
      data: {
        code: 'created',
        inbox_id: 'inbox-1',
        details: 'The inbox was successfully created.',
        isThisFirstOne: false,
      },
      headers: {},
    });

    const receipt = await client.createAdvanced({
      address: 'ada@sender.com',
      senderFirstName: 'Ada',
      senderLastName: 'Lovelace',
      credential: {
        username: 'ada@sender.com',
        appPassword: mailboxSecret,
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
      },
      policy,
    });

    expect(receipt).toEqual({ id: 'inbox-1', replayed: false });
    expect(JSON.stringify(receipt)).not.toContain(mailboxSecret);
    expect(httpClient.post).toHaveBeenCalledWith('/v1/inboxes/advanced', {
      email: 'ada@sender.com',
      sender_first: 'Ada',
      sender_last: 'Lovelace',
      plan: 'basic',
      smtp: {
        username: 'ada@sender.com',
        password: mailboxSecret,
        host: 'smtp.gmail.com',
        port: 465,
        tls: true,
      },
      imap: {
        username: 'ada@sender.com',
        password: mailboxSecret,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
      },
      frequency: {
        starting_baseline: 0,
        increase_per_day: 1,
        max_sends_per_day: 1,
        reply_rate: 0,
        strategy: 'progressive',
      },
      custom_oauth: null,
      google: null,
      office: null,
    });
    expect(secureHttpClientService.getHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({ retries: 0, timeout: 30_000 }),
    );
  });

  it.each([
    [{ ...policy, maxSendsPerDay: 0 }],
    [{ ...policy, increasePerDay: 0 }],
    [{ ...policy, strategy: 'flat' }],
  ])(
    'rejects unsupported Basic policy %p before a provider call',
    async (invalid) => {
      const { client, httpClient } = createClient();

      await expectCode(
        client.createAdvanced({
          address: 'ada@sender.com',
          senderFirstName: 'Ada',
          senderLastName: 'Lovelace',
          credential: {
            username: 'ada@sender.com',
            appPassword: mailboxSecret,
            smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
            imap: { host: 'imap.gmail.com', port: 993, secure: true },
          },
          policy: invalid as typeof policy,
        }),
        WarmupInboxExceptionCode.INVALID_INPUT,
      );
      expect(httpClient.post).not.toHaveBeenCalled();
    },
  );

  it('rejects timezone or schedule fields before a Basic provider call', async () => {
    const { client, httpClient } = createClient();
    const input = {
      address: 'ada@sender.com',
      senderFirstName: 'Ada',
      senderLastName: 'Lovelace',
      credential: {
        username: 'ada@sender.com',
        appPassword: mailboxSecret,
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
      } as const,
      policy,
      timezone: 'Etc/UTC',
    };

    await expectCode(
      client.createAdvanced(input),
      WarmupInboxExceptionCode.INVALID_INPUT,
    );
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it('reconciles duplicate create by exactly one matching address', async () => {
    const { client, httpClient } = createClient();

    httpClient.post.mockRejectedValue(axiosFailure(409));
    httpClient.get.mockResolvedValue({
      status: 200,
      data: { items: [summaryFixture] },
      headers: {},
    });

    await expect(
      client.createAdvanced({
        address: 'ada@sender.com',
        senderFirstName: 'Ada',
        senderLastName: 'Lovelace',
        credential: {
          username: 'ada@sender.com',
          appPassword: mailboxSecret,
          smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
          imap: { host: 'imap.gmail.com', port: 993, secure: true },
        },
        policy,
      }),
    ).resolves.toEqual({ id: 'inbox-1', replayed: true });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(httpClient.get).toHaveBeenCalledWith('/v1/inboxes');
  });

  it.each([
    [[], WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN],
    [
      [summaryFixture, { ...summaryFixture, inbox_id: 'inbox-2' }],
      WarmupInboxExceptionCode.RECONCILIATION_REQUIRED,
    ],
  ] as const)(
    'reconciles uncertain create matches %p to %s',
    async (items, expectedCode) => {
      const { client, httpClient } = createClient();

      httpClient.post.mockRejectedValue(axiosFailure(undefined, 'ETIMEDOUT'));
      httpClient.get.mockResolvedValue({
        status: 200,
        data: { items },
        headers: {},
      });

      await expectCode(
        client.createAdvanced({
          address: 'ada@sender.com',
          senderFirstName: 'Ada',
          senderLastName: 'Lovelace',
          credential: {
            username: 'ada@sender.com',
            appPassword: mailboxSecret,
            smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
            imap: { host: 'imap.gmail.com', port: 993, secure: true },
          },
          policy,
        }),
        expectedCode,
      );
      expect(httpClient.post).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves uncertainty when a malformed successful create cannot reconcile', async () => {
    const { client, httpClient } = createClient();

    httpClient.post.mockResolvedValue({
      status: 201,
      data: { code: 'created' },
      headers: {},
    });
    httpClient.get.mockRejectedValue(axiosFailure(500));

    await expectCode(
      client.createAdvanced({
        address: 'ada@sender.com',
        senderFirstName: 'Ada',
        senderLastName: 'Lovelace',
        credential: {
          username: 'ada@sender.com',
          appPassword: mailboxSecret,
          smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
          imap: { host: 'imap.gmail.com', port: 993, secure: true },
        },
        policy,
      }),
      WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
    );
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(httpClient.get).toHaveBeenCalledTimes(1);
  });

  it('maps customer-safe detail and returns null after delete', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValueOnce({
      status: 200,
      data: detailFixture,
      headers: {},
    });
    const detail = await client.getInbox('inbox-1');
    expect(detail).toEqual({
      id: 'inbox-1',
      address: 'ada@sender.com',
      status: 'running',
      connectionType: 'SMTP_IMAP',
      score: 98,
      senderFirstName: 'Ada',
      senderLastName: 'Lovelace',
      createdAt: new Date('2026-07-29T00:00:00.000Z'),
      policy: {
        startingBaseline: 0,
        increasePerDay: 1,
        maxSendsPerDay: 1,
        replyRatePercent: 0,
        strategy: 'progressive',
      },
      health: {
        mxScore: 1,
        spfScore: 1,
        dmarcScore: 1,
        blacklistScore: 1,
        detectedBlacklists: 1,
        warmupDaysScore: 0.2,
        warmupDays: 4,
      },
    });
    expect(JSON.stringify(detail)).not.toContain('basic');
    expect(JSON.stringify(detail)).not.toContain('timezone');
    expect(JSON.stringify(detail)).not.toContain('raw-spf-record');
    expect(JSON.stringify(detail)).not.toContain('Private list name');

    httpClient.get.mockRejectedValueOnce(axiosFailure(404));
    await expect(client.getInbox('inbox-1')).resolves.toBeNull();
  });

  it('rejects oversized blacklist evidence before mapping health detail', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        ...detailFixture,
        health_check: {
          ...detailFixture.health_check,
          domain_blacklists: {
            ...detailFixture.health_check.domain_blacklists,
            blacklists: Array.from({ length: 201 }, () => ({
              name: 'Bounded list',
              url: 'https://list.test',
              detected: false,
            })),
          },
        },
      },
      headers: {},
    });

    await expectCode(
      client.getInbox('inbox-1'),
      WarmupInboxExceptionCode.MALFORMED_RESPONSE,
    );
  });

  it('patches only the Myah-owned policy and omits its version', async () => {
    const { client, httpClient } = createClient();

    httpClient.patch.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await expect(
      client.updatePolicy('inbox-1', policy),
    ).resolves.toBeUndefined();
    expect(httpClient.patch).toHaveBeenCalledWith('/v1/inboxes/inbox-1', {
      frequency: {
        starting_baseline: 0,
        increase_per_day: 1,
        max_sends_per_day: 1,
        reply_rate: 0,
        strategy: 'progressive',
      },
    });
  });

  it('accepts observed start, pause, and delete replay outcomes', async () => {
    const { client, httpClient } = createClient();

    httpClient.post
      .mockResolvedValueOnce({ status: 200, data: {}, headers: {} })
      .mockRejectedValueOnce(axiosFailure(409))
      .mockResolvedValueOnce({ status: 201, data: {}, headers: {} })
      .mockRejectedValueOnce(axiosFailure(409));
    httpClient.delete
      .mockResolvedValueOnce({ status: 200, data: {}, headers: {} })
      .mockRejectedValueOnce(axiosFailure(404));

    await expect(client.start('inbox-1')).resolves.toBeUndefined();
    await expect(client.start('inbox-1')).resolves.toBeUndefined();
    await expect(client.pause('inbox-1')).resolves.toBeUndefined();
    await expect(client.pause('inbox-1')).resolves.toBeUndefined();
    await expect(client.delete('inbox-1')).resolves.toBeUndefined();
    await expect(client.delete('inbox-1')).resolves.toBeUndefined();
    expect(httpClient.post).toHaveBeenCalledTimes(4);
    expect(httpClient.delete).toHaveBeenCalledTimes(2);
  });

  it('maps bounded metrics and returns null after delete', async () => {
    const { client, httpClient } = createClient();
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-02T00:00:00.000Z');

    httpClient.get.mockResolvedValueOnce({
      status: 200,
      data: {
        inbox_id: 'inbox-1',
        start_time: 1_782_864_000,
        end_time: 1_782_950_400,
        main_metrics: {
          total_count: 10,
          sent: 8,
          temperature: 100,
          landed_inbox: { value: 7, percent: '87.5%' },
          landed_spam: { value: 1, percent: '12.5%' },
          landed_category: { value: 0, percent: '0%' },
          replies_received: 2,
          per_esp: {},
        },
        schedule_metrics: [
          {
            date: 'Jul 01, 2026',
            queued: 1,
            inbox: 7,
            category: 0,
            spam: 1,
            replies_received: 2,
            per_esp: {},
          },
        ],
      },
      headers: {},
    });

    await expect(client.getMetrics('inbox-1', { from, to })).resolves.toEqual({
      inboxId: 'inbox-1',
      from,
      to,
      totals: {
        messages: 10,
        sent: 8,
        landedInbox: 7,
        landedSpam: 1,
        landedCategory: 0,
        repliesReceived: 2,
      },
      trend: [
        {
          date: '2026-07-01',
          queued: 1,
          landedInbox: 7,
          landedCategory: 0,
          landedSpam: 1,
          repliesReceived: 2,
        },
      ],
    });
    expect(httpClient.get).toHaveBeenCalledWith('/v1/inboxes/inbox-1/metrics', {
      params: { from: 1_782_864_000, to: 1_782_950_400 },
    });

    httpClient.get.mockRejectedValueOnce(axiosFailure(404));
    await expect(
      client.getMetrics('inbox-1', { from, to }),
    ).resolves.toBeNull();
  });

  it('normalizes metric ranges to the provider whole-second precision', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        inbox_id: 'inbox-1',
        start_time: 1_782_864_000,
        end_time: 1_782_950_400,
        main_metrics: {
          total_count: 0,
          sent: 0,
          landed_inbox: { value: 0, percent: '0%' },
          landed_spam: { value: 0, percent: '0%' },
          landed_category: { value: 0, percent: '0%' },
          replies_received: 0,
        },
        schedule_metrics: [],
      },
      headers: {},
    });

    await expect(
      client.getMetrics('inbox-1', {
        from: new Date('2026-07-01T00:00:00.999Z'),
        to: new Date('2026-07-02T00:00:00.999Z'),
      }),
    ).resolves.toMatchObject({
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-02T00:00:00.000Z'),
    });
    expect(httpClient.get).toHaveBeenCalledWith('/v1/inboxes/inbox-1/metrics', {
      params: { from: 1_782_864_000, to: 1_782_950_400 },
    });
  });

  it('rejects oversized metric trends before mapping rows', async () => {
    const { client, httpClient } = createClient();
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-02T00:00:00.000Z');

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        inbox_id: 'inbox-1',
        start_time: 1_782_864_000,
        end_time: 1_782_950_400,
        main_metrics: {
          total_count: 0,
          sent: 0,
          landed_inbox: { value: 0, percent: '0%' },
          landed_spam: { value: 0, percent: '0%' },
          landed_category: { value: 0, percent: '0%' },
          replies_received: 0,
        },
        schedule_metrics: Array.from({ length: 401 }, () => ({
          date: 'Jul 01, 2026',
          queued: 0,
          inbox: 0,
          category: 0,
          spam: 0,
          replies_received: 0,
        })),
      },
      headers: {},
    });

    await expectCode(
      client.getMetrics('inbox-1', { from, to }),
      WarmupInboxExceptionCode.MALFORMED_RESPONSE,
    );
  });

  it('rejects invalid metric ranges before the provider call', async () => {
    const { client, httpClient } = createClient();

    await expectCode(
      client.getMetrics('inbox-1', {
        from: new Date('2026-07-02T00:00:00.000Z'),
        to: new Date('2026-07-01T00:00:00.000Z'),
      }),
      WarmupInboxExceptionCode.INVALID_INPUT,
    );
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('classifies rate limits without echoing provider details', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockRejectedValue(axiosFailure(429));
    const operation = client.listInboxes();

    await expectCode(operation, WarmupInboxExceptionCode.RATE_LIMITED);
    await expect(operation).rejects.not.toThrow(providerSecret);
    await expect(operation).rejects.not.toThrow(mailboxSecret);
  });

  it('rejects malformed list data instead of returning partial summaries', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: { items: [{ ...summaryFixture, status: 'unknown' }] },
      headers: {},
    });

    await expectCode(
      client.listInboxes(),
      WarmupInboxExceptionCode.MALFORMED_RESPONSE,
    );
  });

  it('rejects oversized inbox collections before reconciliation mapping', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        items: Array.from({ length: 1_001 }, (_, index) => ({
          ...summaryFixture,
          inbox_id: `inbox-${index}`,
        })),
      },
      headers: {},
    });

    await expectCode(
      client.listInboxes(),
      WarmupInboxExceptionCode.MALFORMED_RESPONSE,
    );
  });
});

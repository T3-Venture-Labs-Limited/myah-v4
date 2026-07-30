import { type AxiosInstance } from 'axios';

import { type SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { IcemailClient } from '../icemail.client';
import { IcemailExceptionCode } from '../icemail.exception';

const providerSecret = 'not-a-real-provider-key';
const mailboxSecret = 'not-a-real-mailbox-credential';

const domainFixture = {
  domain_id: 'domain-1',
  domain: 'sender.com',
  status: 'ACTIVE',
  created_at: '2026-07-01T00:00:00.000Z',
  expires_at: '2027-07-01T00:00:00.000Z',
  import: false,
  order_id: 'order-1',
  mailbox_count: 1,
  active: true,
  workspace_type: 'GOOGLE',
  prewarmed: false,
  blacklisted: false,
};

const mailboxFixture = {
  id: 'mailbox-1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  username: 'ada@sender.com',
  type: 'GOOGLE',
  status: 'ACTIVE',
  active: true,
  master_inbox: true,
  created_at: '2026-07-01T00:00:00.000Z',
  modified_at: '2026-07-01T00:00:00.000Z',
  password: mailboxSecret,
  domains: { domain_id: 'domain-1', domain: 'sender.com' },
  next_billing_date: '2026-08-01T00:00:00.000Z',
  cost: '4.99',
  billing_cycle: 'MONTHLY',
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
        case 'ICEMAIL_API_BASE_URL':
          return 'https://app.icemail.test/api/v1';
        case 'ICEMAIL_API_KEY':
          return providerSecret;
        default:
          throw new Error(`Unexpected config key: ${key}`);
      }
    }),
  } as Pick<TwentyConfigService, 'get'>;

  return {
    client: new IcemailClient(
      twentyConfigService as TwentyConfigService,
      secureHttpClientService as SecureHttpClientService,
    ),
    httpClient,
    secureHttpClientService,
  };
};

const expectCode = async (
  operation: Promise<unknown>,
  code: IcemailExceptionCode,
) => {
  await expect(operation).rejects.toMatchObject({ code });
};

describe('IcemailClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fails closed before creating an HTTP client while managed email is disabled', async () => {
    const { client, secureHttpClientService } = createClient(false);

    await expectCode(
      client.listDomains(),
      IcemailExceptionCode.CONFIGURATION_DISABLED,
    );
    expect(secureHttpClientService.getHttpClient).not.toHaveBeenCalled();
  });

  it('uses the server-side key, bounded first-page read, and read-only retries', async () => {
    const { client, httpClient, secureHttpClientService } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: { domains: [domainFixture], total_count: 1, page: 1, limit: 50 },
      },
      headers: {},
    });

    await expect(client.listDomains()).resolves.toEqual({
      items: [
        {
          id: 'domain-1',
          domain: 'sender.com',
          status: 'ACTIVE',
          active: true,
          provider: 'GOOGLE',
          purchased: true,
          prewarmed: false,
          blacklisted: false,
          mailboxCount: 1,
          expiresAt: new Date('2027-07-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    expect(secureHttpClientService.getHttpClient).toHaveBeenCalledWith({
      baseURL: 'https://app.icemail.test/api/v1',
      headers: { 'x-api-key': providerSecret },
      retries: 2,
      shouldResetTimeout: true,
      timeout: 10_000,
    });
    expect(httpClient.get).toHaveBeenCalledWith('/domain', {
      params: { page: 1, limit: 50 },
    });
  });

  it('maps exact availability pricing to integer cents', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: {
          current_domain: {
            domain: 'sender.com',
            available: true,
            pricing: {
              tld: 'com',
              price: 10,
              currency: 'USD',
              duration: 1,
              duration_type: 'YEAR',
            },
          },
          recommended_domains: [
            {
              domain: 'getsender.com',
              available: true,
              pricing: {
                tld: 'com',
                price: 12.34,
                currency: 'USD',
                duration: 1,
                duration_type: 'YEAR',
              },
            },
          ],
        },
      },
      headers: {},
    });

    await expect(client.checkDomainAvailability('Sender.COM')).resolves.toEqual(
      {
        domain: 'sender.com',
        available: true,
        price: {
          amountCents: 1_000,
          currency: 'USD',
          duration: 1,
          durationUnit: 'YEAR',
        },
        alternatives: [
          {
            domain: 'getsender.com',
            available: true,
            price: {
              amountCents: 1_234,
              currency: 'USD',
              duration: 1,
              durationUnit: 'YEAR',
            },
          },
        ],
      },
    );
    expect(httpClient.get).toHaveBeenCalledWith('/domain/available', {
      params: { domain: 'sender.com', page: 1 },
    });
  });

  it.each(['https://sender.com', 'sub.sender.com', 'sender.invalid', ''])(
    'rejects invalid availability domain %p before the provider call',
    async (domain) => {
      const { client, httpClient } = createClient();

      await expectCode(
        client.checkDomainAvailability(domain),
        IcemailExceptionCode.INVALID_INPUT,
      );
      expect(httpClient.get).not.toHaveBeenCalled();
    },
  );

  it('projects mailbox lists without password or recovery fields', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: {
          mailboxes: [mailboxFixture],
          total_count: 1,
          page: 1,
          limit: 50,
        },
      },
      headers: {},
    });

    const page = await client.listMailboxes();

    expect(page).toEqual({
      items: [
        {
          id: 'mailbox-1',
          domainId: 'domain-1',
          domain: 'sender.com',
          address: 'ada@sender.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          provider: 'GOOGLE',
          status: 'ACTIVE',
          active: true,
          master: true,
          nextBillingAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    expect(JSON.stringify(page)).not.toContain(mailboxSecret);
    expect(JSON.stringify(page)).not.toContain('password');
    expect(JSON.stringify(page)).not.toContain('recovery_email');
  });

  it('returns null for a missing exact mailbox and rejects unknown providers', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { message: 'not found' } },
    });
    await expect(client.getMailbox('mailbox-1')).resolves.toBeNull();

    httpClient.get.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: { ...mailboxFixture, type: 'CUSTOM' },
      },
      headers: {},
    });
    await expectCode(
      client.getMailbox('mailbox-1'),
      IcemailExceptionCode.MALFORMED_RESPONSE,
    );
  });

  it('projects a ready Google app password into fixed SMTP and IMAP settings', async () => {
    const { client, httpClient } = createClient();

    httpClient.get
      .mockResolvedValueOnce({
        status: 200,
        data: { success: true, data: mailboxFixture },
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { success: true, data: { app_password: mailboxSecret } },
        headers: {},
      });

    await expect(client.getMailboxCredential('mailbox-1')).resolves.toEqual({
      username: 'ada@sender.com',
      appPassword: mailboxSecret,
      smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(1, '/mailbox/mailbox-1');
    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      '/mailbox/mailbox-1/app-password',
    );
  });

  it('returns null when the Google app password is not ready', async () => {
    const { client, httpClient } = createClient();

    httpClient.get
      .mockResolvedValueOnce({
        status: 200,
        data: { success: true, data: mailboxFixture },
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { success: true, data: { app_password: null } },
        headers: {},
      });

    await expect(client.getMailboxCredential('mailbox-1')).resolves.toBeNull();
  });

  it('creates a Google ordinary order without returning raw passwords', async () => {
    const { client, httpClient, secureHttpClientService } = createClient();

    httpClient.post.mockResolvedValue({
      status: 201,
      data: {
        success: true,
        data: [
          {
            order_id: 'order-1',
            import: false,
            domain_id: 'domain-1',
            domain_name: 'sender.com',
            mailbox_type: 'GOOGLE',
            mailboxes: [
              {
                mailbox_id: 'mailbox-1',
                first_name: 'Ada',
                last_name: 'Lovelace',
                username: 'ada@sender.com',
                password: mailboxSecret,
              },
            ],
          },
        ],
      },
      headers: {},
    });

    const receipt = await client.createOrdinaryOrder({
      domains: [
        {
          domain: 'sender.com',
          mailboxes: [
            {
              firstName: 'Ada',
              lastName: 'Lovelace',
              address: 'ada@sender.com',
              password: mailboxSecret,
            },
          ],
        },
      ],
    });

    expect(receipt).toEqual({
      domains: [
        {
          orderId: 'order-1',
          domainId: 'domain-1',
          domain: 'sender.com',
          mailboxes: [
            {
              id: 'mailbox-1',
              address: 'ada@sender.com',
              firstName: 'Ada',
              lastName: 'Lovelace',
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(receipt)).not.toContain(mailboxSecret);
    expect(JSON.stringify(receipt)).not.toContain('password');
    expect(httpClient.post).toHaveBeenCalledWith('/order', {
      import: false,
      data: [
        {
          domain_name: 'sender.com',
          mailbox_type: 'GOOGLE',
          mailboxes: [
            {
              first_name: 'Ada',
              last_name: 'Lovelace',
              username: 'ada@sender.com',
              password: mailboxSecret,
            },
          ],
        },
      ],
    });
    expect(secureHttpClientService.getHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({ retries: 0, timeout: 30_000 }),
    );
  });

  it('classifies a malformed successful order receipt as write-outcome uncertain', async () => {
    const { client, httpClient } = createClient();

    httpClient.post.mockResolvedValue({
      status: 201,
      data: {
        success: true,
        data: [
          {
            import: false,
            domain_id: 'domain-1',
            domain_name: 'sender.com',
            mailbox_type: 'GOOGLE',
            mailboxes: [],
          },
        ],
      },
      headers: {},
    });

    await expectCode(
      client.createOrdinaryOrder({
        domains: [
          {
            domain: 'sender.com',
            mailboxes: [
              {
                firstName: 'Ada',
                lastName: 'Lovelace',
                address: 'ada@sender.com',
                password: mailboxSecret,
              },
            ],
          },
        ],
      }),
      IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN,
    );
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  it('rejects an ordinary order whose address does not belong to its domain', async () => {
    const { client, httpClient } = createClient();

    await expectCode(
      client.createOrdinaryOrder({
        domains: [
          {
            domain: 'sender.com',
            mailboxes: [
              {
                firstName: 'Ada',
                lastName: 'Lovelace',
                address: 'ada@other.com',
                password: mailboxSecret,
              },
            ],
          },
        ],
      }),
      IcemailExceptionCode.INVALID_INPUT,
    );
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it('maps bounded prewarmed inventory and partial purchase receipts', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          domains: [
            {
              id: 'prewarm-1',
              domain: 'warm.com',
              per_domain_price: 5.5,
              per_mailbox_price: 2.5,
              mailbox_count: 1,
              active: true,
              pre_warm_mailbox: [
                {
                  username: 'admin@warm.com',
                  first_name: 'Admin',
                  last_name: 'User',
                  type: 'GOOGLE',
                  admin: true,
                  master_inbox: true,
                  per_mailbox_price: 2.5,
                },
              ],
            },
          ],
        },
      },
      headers: {},
    });
    await expect(client.listPrewarmedBundles()).resolves.toEqual({
      items: [
        {
          inventoryId: 'prewarm-1',
          domain: 'warm.com',
          domainPriceCents: 550,
          mailboxPriceCents: 250,
          mailboxCount: 1,
          mailboxes: [
            {
              address: 'admin@warm.com',
              firstName: 'Admin',
              lastName: 'User',
              provider: 'GOOGLE',
              master: true,
            },
          ],
        },
      ],
    });
    expect(httpClient.get).toHaveBeenCalledWith('/prewarm', {
      params: { page: 1, limit: 100 },
    });

    httpClient.post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          order_id: 'order-2',
          successful_domains: [
            {
              domain_id: 'domain-2',
              domain_name: 'warm.com',
              domain_price: 5.5,
              mailbox_count: 1,
              mailboxes: [
                {
                  mailbox_id: 'mailbox-2',
                  first_name: 'Admin',
                  last_name: 'User',
                  username: 'admin@warm.com',
                  type: 'GOOGLE',
                  master_inbox: true,
                },
              ],
            },
          ],
          failed_domains: [
            { domain_id: 'prewarm-2', reason: 'provider internal detail' },
          ],
          total_successful: 1,
          total_failed: 1,
          total_mailboxes_created: 1,
          total_cost: 8,
        },
      },
      headers: {},
    });
    await expect(
      client.buyPrewarmedBundles({ inventoryIds: ['prewarm-1', 'prewarm-2'] }),
    ).resolves.toEqual({
      orderId: 'order-2',
      successful: [
        {
          domainId: 'domain-2',
          domain: 'warm.com',
          mailboxes: [
            {
              id: 'mailbox-2',
              address: 'admin@warm.com',
              firstName: 'Admin',
              lastName: 'User',
              provider: 'GOOGLE',
              master: true,
            },
          ],
        },
      ],
      failedInventoryIds: ['prewarm-2'],
      totalCostCents: 800,
    });
  });

  it('returns exact staged domain wind-down receipts without claiming completion', async () => {
    const { client, httpClient } = createClient();

    httpClient.delete
      .mockResolvedValueOnce({
        status: 200,
        data: {
          success: true,
          data: {
            mode: 'scheduled',
            per_domain: [
              {
                domain_id: 'domain-1',
                mode: 'scheduled',
                mailbox_ids: ['mailbox-1'],
              },
              {
                domain_id: 'domain-2',
                mode: 'scheduled',
                mailbox_ids: [],
                skipped: true,
              },
            ],
            summary: {
              domains_requested: 2,
              domains_processed: 1,
              domains_skipped: 1,
              domains_failed: 0,
              mailboxes_affected: 1,
            },
          },
        },
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 202,
        data: {
          success: true,
          data: {
            action: 'clear_dns_records',
            estimated_domains: 1,
            correlation_id: 'correlation-1',
          },
        },
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 202,
        data: {
          success: true,
          data: {
            action: 'delete_domain',
            estimated_domains: 1,
            correlation_id: 'correlation-2',
          },
        },
        headers: {},
      });

    await expect(
      client.deleteDomainMailboxes({
        domainIds: ['domain-1', 'domain-2'],
        mode: 'scheduled',
      }),
    ).resolves.toEqual({
      mode: 'scheduled',
      results: [
        {
          domainId: 'domain-1',
          mailboxIds: ['mailbox-1'],
          skipped: false,
          failed: false,
        },
        {
          domainId: 'domain-2',
          mailboxIds: [],
          skipped: true,
          failed: false,
        },
      ],
      summary: {
        domainsRequested: 2,
        domainsProcessed: 1,
        domainsSkipped: 1,
        domainsFailed: 0,
        mailboxesAffected: 1,
      },
    });
    await expect(client.clearDomainDns(['domain-1'])).resolves.toEqual({
      state: 'QUEUED',
      action: 'clear_dns_records',
      estimatedDomains: 1,
      correlationId: 'correlation-1',
    });
    await expect(client.deleteConnectedDomains(['domain-1'])).resolves.toEqual({
      state: 'QUEUED',
      action: 'delete_domain',
      estimatedDomains: 1,
      correlationId: 'correlation-2',
    });
    expect(httpClient.delete).toHaveBeenNthCalledWith(1, '/domain/mailboxes', {
      data: { domain_ids: ['domain-1', 'domain-2'], mode: 'scheduled' },
    });
    expect(httpClient.delete).toHaveBeenNthCalledWith(2, '/domain/clear-dns', {
      data: { domain_ids: ['domain-1'] },
    });
    expect(httpClient.delete).toHaveBeenNthCalledWith(3, '/domain', {
      data: { domain_ids: ['domain-1'] },
    });
  });

  it.each([
    [402, IcemailExceptionCode.INSUFFICIENT_CREDITS],
    [409, IcemailExceptionCode.CONFLICT],
    [429, IcemailExceptionCode.RATE_LIMITED],
  ] as const)(
    'classifies write status %i without echoing provider details',
    async (status, code) => {
      const { client, httpClient } = createClient();

      httpClient.post.mockRejectedValue({
        isAxiosError: true,
        response: {
          status,
          data: { message: `provider body ${providerSecret} ${mailboxSecret}` },
        },
      });

      const operation = client.buyPrewarmedBundles({
        inventoryIds: ['prewarm-1'],
      });
      await expectCode(operation, code);
      await expect(operation).rejects.not.toThrow(providerSecret);
      await expect(operation).rejects.not.toThrow(mailboxSecret);
    },
  );

  it('classifies write timeout and server failure as uncertain without retrying', async () => {
    const { client, httpClient, secureHttpClientService } = createClient();

    httpClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ETIMEDOUT',
    });
    await expectCode(
      client.buyPrewarmedBundles({ inventoryIds: ['prewarm-1'] }),
      IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN,
    );

    httpClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { message: 'unknown outcome' } },
    });
    await expectCode(
      client.buyPrewarmedBundles({ inventoryIds: ['prewarm-1'] }),
      IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN,
    );
    expect(httpClient.post).toHaveBeenCalledTimes(2);
    expect(secureHttpClientService.getHttpClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ retries: 0 }),
    );
  });

  it('rejects malformed provider pages instead of returning partial data', async () => {
    const { client, httpClient } = createClient();

    httpClient.get.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: {
          domains: [domainFixture],
          total_count: '1',
          page: 1,
          limit: 50,
        },
      },
      headers: {},
    });

    await expectCode(
      client.listDomains(),
      IcemailExceptionCode.MALFORMED_RESPONSE,
    );
  });
});

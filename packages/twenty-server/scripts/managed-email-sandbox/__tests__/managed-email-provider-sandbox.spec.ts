import { readFile, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';

import {
  mapIcemailCredentialSecret,
  mapIcemailDomainPage,
  mapIcemailMailboxPage,
  mapIcemailPrewarmedBundlePage,
} from 'src/engine/core-modules/managed-email/providers/icemail/icemail-response.mapper';
import {
  mapWarmupInboxCapacity,
  mapWarmupInboxCreateReceipt,
  mapWarmupInboxDetail,
  mapWarmupInboxList,
  mapWarmupInboxMetrics,
} from 'src/engine/core-modules/managed-email/providers/warmup-inbox/warmup-inbox-response.mapper';

import { createManagedEmailProviderSandbox } from '../managed-email-provider-sandbox';

type Sandbox = Awaited<ReturnType<typeof createManagedEmailProviderSandbox>>;
type StartedSandbox = Awaited<ReturnType<Sandbox['start']>>;

const json = async (response: Response) =>
  response.json() as Promise<Record<string, any>>;

const request = async (
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: Record<string, any> }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });

  return { response, body: await json(response) };
};

const acceptsConnections = async (baseUrl: string): Promise<boolean> => {
  const url = new URL(baseUrl);

  return new Promise((resolve) => {
    const socket = connect({
      host: url.hostname,
      port: Number(url.port),
    });
    const finish = (accepts: boolean) => {
      socket.destroy();
      resolve(accepts);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(250, () => finish(false));
  });
};

const waitForClosedListener = async (baseUrl: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!(await acceptsConnections(baseUrl))) return;

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Sandbox listener did not close: ${baseUrl}`);
};

describe('managed email provider sandbox contract', () => {
  let statePath: string;
  let sandbox: Sandbox;
  let started: StartedSandbox;

  beforeEach(async () => {
    jest.useRealTimers();
    statePath = `${process.env.TMPDIR ?? '/tmp'}/managed-email-sandbox-${Math.random()}.json`;
    sandbox = await createManagedEmailProviderSandbox({
      icemailPort: 0,
      warmupPort: 0,
      controlPort: 0,
      statePath,
      greenMail: { host: '127.0.0.1', smtpPort: 3025, imapPort: 3143 },
    });
    started = await sandbox.start();
  });

  afterEach(async () => {
    await sandbox.stop();
  });

  it('persists versioned state with atomic, restart-safe writes', async () => {
    const first = await request(started.icemailBaseUrl, '/order', {
      method: 'POST',
      body: JSON.stringify({
        import: false,
        data: [
          {
            domain_name: 'ordinary-one.test',
            mailbox_type: 'GOOGLE',
            mailboxes: [{ first_name: 'Ada', last_name: 'Lovelace' }],
          },
        ],
      }),
    });
    expect(first.response.status).toBe(201);

    const state = JSON.parse(await readFile(statePath, 'utf8')) as Record<
      string,
      any
    >;
    expect(state.version).toBe(1);
    expect(state.domains).toHaveLength(1);
    expect(state.mailboxes).toHaveLength(1);
    expect(state).not.toHaveProperty('tmp');

    await sandbox.stop();
    sandbox = await createManagedEmailProviderSandbox({
      host: '127.0.0.1',
      icemailPort: 0,
      warmupPort: 0,
      controlPort: 0,
      statePath,
      greenMail: { host: '127.0.0.1', smtpPort: 3025, imapPort: 3143 },
    });
    started = await sandbox.start();

    const domains = await request(started.icemailBaseUrl, '/domain');
    expect(domains.response.status).toBe(200);
    expect(mapIcemailDomainPage(domains.body, 'SANDBOX').items).toHaveLength(1);
  });

  it('rejects ordinary orders and restored state outside test-only domains', async () => {
    const rejected = await request(started.icemailBaseUrl, '/order', {
      method: 'POST',
      body: JSON.stringify({
        import: false,
        data: [
          {
            domain_name: 'unsafe.example.com',
            mailbox_type: 'GOOGLE',
            mailboxes: [{ first_name: 'Unsafe', last_name: 'Domain' }],
          },
        ],
      }),
    });

    expect(rejected.response.status).toBe(400);
    expect(
      (await request(started.icemailBaseUrl, '/domain')).body.data.domains,
    ).toHaveLength(0);

    await sandbox.stop();
    await writeFile(
      statePath,
      JSON.stringify({
        version: 1,
        domains: [{ domain_id: 'domain-1', domain: 'unsafe.example.com' }],
        mailboxes: [],
        inboxes: [],
        operations: {},
        prewarm: [],
      }),
    );

    await expect(
      createManagedEmailProviderSandbox({
        icemailPort: 0,
        warmupPort: 0,
        controlPort: 0,
        statePath,
        greenMail: {
          host: '127.0.0.1',
          smtpPort: 3025,
          imapPort: 3143,
        },
      }),
    ).rejects.toThrow(/test domain/i);
  });

  it('persists a one-shot response-lost fault that the application consumes', async () => {
    const configured = await request(started.controlBaseUrl, '/fault', {
      method: 'POST',
      body: JSON.stringify({
        fault: 'icemail-order-response-lost-after-write',
      }),
    });
    expect(configured.response.status).toBe(202);

    await sandbox.stop();
    sandbox = await createManagedEmailProviderSandbox({
      host: '127.0.0.1',
      icemailPort: 0,
      warmupPort: 0,
      controlPort: 0,
      statePath,
      greenMail: { host: '127.0.0.1', smtpPort: 3025, imapPort: 3143 },
    });
    started = await sandbox.start();

    const input = {
      import: false,
      data: [
        {
          domain_name: 'ordinary-two.test',
          mailbox_type: 'GOOGLE',
          mailboxes: [{ first_name: 'Grace', last_name: 'Hopper' }],
        },
      ],
    };
    const first = await request(started.icemailBaseUrl, '/order', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    expect(first.response.status).toBeGreaterThanOrEqual(500);

    const replay = await request(started.icemailBaseUrl, '/order', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    expect(replay.response.status).toBe(201);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.data).toHaveLength(1);

    const mailboxes = await request(started.icemailBaseUrl, '/mailbox');
    expect(mapIcemailMailboxPage(mailboxes.body, 'SANDBOX').items).toHaveLength(
      1,
    );
  });

  it('exposes deterministic prewarmed inventory and exact-address lookup data', async () => {
    const bundles = await request(
      started.icemailBaseUrl,
      '/prewarm?page=1&limit=100',
    );
    expect(bundles.response.status).toBe(200);
    expect(bundles.body.data.domains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain_id: expect.any(String) }),
      ]),
    );
    expect(
      mapIcemailPrewarmedBundlePage(bundles.body, 'SANDBOX').items,
    ).toHaveLength(3);

    expect(
      bundles.body.data.domains.every(
        (bundle: Record<string, any>) =>
          bundle.domain.endsWith('.test') &&
          bundle.pre_warm_mailbox.every((mailbox: Record<string, any>) =>
            mailbox.username.endsWith(`@${bundle.domain}`),
          ),
      ),
    ).toBe(true);

    const exhausted = await request(
      started.icemailBaseUrl,
      '/prewarm?page=2&limit=100',
    );
    expect(exhausted.response.status).toBe(200);
    expect(exhausted.body.data).toEqual(
      expect.objectContaining({ domains: [], page: 2, limit: 100 }),
    );

    await request(started.icemailBaseUrl, '/order', {
      method: 'POST',
      body: JSON.stringify({
        import: false,
        data: [
          {
            domain_name: 'ordinary-three.test',
            mailbox_type: 'GOOGLE',
            mailboxes: [{ first_name: 'Katherine', last_name: 'Johnson' }],
          },
        ],
      }),
    });
    const mailboxes = await request(started.icemailBaseUrl, '/mailbox');
    expect(mailboxes.body.data.mailboxes).toEqual([
      expect.objectContaining({ username: 'katherine@ordinary-three.test' }),
    ]);
  });

  it('claims each finite prewarmed bundle once and reports later claims as failures', async () => {
    const inventory = await request(started.icemailBaseUrl, '/prewarm');
    const inventoryId = inventory.body.data.domains[0].domain_id;

    const first = await request(started.icemailBaseUrl, '/prewarm/buy', {
      method: 'POST',
      body: JSON.stringify({ domain_ids: [inventoryId] }),
    });
    expect(first.body.data).toEqual(
      expect.objectContaining({
        total_successful: 1,
        total_failed: 0,
      }),
    );
    expect(
      (await request(started.icemailBaseUrl, '/prewarm')).body.data.domains,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain_id: inventoryId }),
      ]),
    );

    const duplicate = await request(started.icemailBaseUrl, '/prewarm/buy', {
      method: 'POST',
      body: JSON.stringify({ domain_ids: [inventoryId] }),
    });
    expect(duplicate.body.data).toEqual(
      expect.objectContaining({
        successful_domains: [],
        failed_domains: [expect.objectContaining({ domain_id: inventoryId })],
        total_successful: 0,
        total_failed: 1,
      }),
    );
    expect(
      (await request(started.icemailBaseUrl, '/domain')).body.data.domains,
    ).toHaveLength(1);
  });

  it('consumes a controlled prewarm partial failure once', async () => {
    const inventory = await request(started.icemailBaseUrl, '/prewarm');
    const inventoryIds = inventory.body.data.domains
      .slice(0, 2)
      .map((bundle: Record<string, any>) => bundle.domain_id);

    expect(
      (
        await request(started.controlBaseUrl, '/fault', {
          method: 'POST',
          body: JSON.stringify({ fault: 'icemail-prewarm-partial' }),
        })
      ).response.status,
    ).toBe(202);

    const partial = await request(started.icemailBaseUrl, '/prewarm/buy', {
      method: 'POST',
      body: JSON.stringify({ domain_ids: inventoryIds }),
    });
    expect(partial.body.data).toEqual(
      expect.objectContaining({
        total_successful: 1,
        total_failed: 1,
        failed_domains: [
          expect.objectContaining({ domain_id: inventoryIds[1] }),
        ],
      }),
    );

    const retry = await request(started.icemailBaseUrl, '/prewarm/buy', {
      method: 'POST',
      body: JSON.stringify({ domain_ids: [inventoryIds[1]] }),
    });
    expect(retry.body.data).toEqual(
      expect.objectContaining({
        total_successful: 1,
        total_failed: 0,
      }),
    );
  });

  it('reconciles domain/mailbox deletion and returns GreenMail credentials without forwarding', async () => {
    await request(started.icemailBaseUrl, '/order', {
      method: 'POST',
      body: JSON.stringify({
        import: false,
        data: [
          {
            domain_name: 'ordinary-four.test',
            mailbox_type: 'GOOGLE',
            mailboxes: [{ first_name: 'Linus', last_name: 'Torvalds' }],
          },
        ],
      }),
    });
    const mailbox = (await request(started.icemailBaseUrl, '/mailbox')).body
      .data.mailboxes[0];
    const credential = await request(
      started.icemailBaseUrl,
      `/mailbox/${mailbox.id}/app-password`,
    );
    expect(credential.body.data.app_password).toEqual(expect.any(String));
    expect(credential.body.data.forwarding).toBe(false);
    expect(mapIcemailCredentialSecret(credential.body)).toEqual({
      appPassword: credential.body.data.app_password,
      transport: {
        smtp: { host: '127.0.0.1', port: 3025, secure: false },
        imap: { host: '127.0.0.1', port: 3143, secure: false },
      },
    });

    const deleted = await request(started.icemailBaseUrl, '/domain/mailboxes', {
      method: 'DELETE',
      body: JSON.stringify({
        domain_ids: [mailbox.domain_id],
        mode: 'immediate',
      }),
    });
    expect(deleted.response.status).toBe(200);
    expect(
      (await request(started.icemailBaseUrl, '/mailbox')).body.data.mailboxes,
    ).toHaveLength(0);
    expect(
      (await request(started.icemailBaseUrl, '/domain')).body.data.domains,
    ).toHaveLength(0);
  });

  it('consumes a controlled exact-read not-found fault once', async () => {
    await request(started.icemailBaseUrl, '/order', {
      method: 'POST',
      body: JSON.stringify({
        import: false,
        data: [
          {
            domain_name: 'read-recovery.test',
            mailbox_type: 'GOOGLE',
            mailboxes: [{ first_name: 'Read', last_name: 'Recovery' }],
          },
        ],
      }),
    });
    const mailbox = (await request(started.icemailBaseUrl, '/mailbox')).body
      .data.mailboxes[0];

    await request(started.controlBaseUrl, '/fault', {
      method: 'POST',
      body: JSON.stringify({ fault: 'icemail-read-not-found' }),
    });

    expect(
      (await request(started.icemailBaseUrl, `/mailbox/${mailbox.id}`)).response
        .status,
    ).toBe(404);
    expect(
      (await request(started.icemailBaseUrl, `/mailbox/${mailbox.id}`)).response
        .status,
    ).toBe(200);
  });

  it('persists a warmup inbox before a controlled lost response', async () => {
    await request(started.controlBaseUrl, '/fault', {
      method: 'POST',
      body: JSON.stringify({
        fault: 'warmup-create-response-lost-after-write',
      }),
    });

    const lost = await request(started.warmupBaseUrl, '/v1/inboxes/advanced', {
      method: 'POST',
      body: JSON.stringify({
        email: 'response-lost@warmup.test',
        sender_first: 'Response',
        sender_last: 'Lost',
        smtp: {
          username: 'response-lost@warmup.test',
          password: 'secret',
          host: '127.0.0.1',
          port: 3025,
          tls: false,
        },
        imap: {
          username: 'response-lost@warmup.test',
          password: 'secret',
          host: '127.0.0.1',
          port: 3143,
          tls: false,
        },
        frequency: {
          starting_baseline: 5,
          increase_per_day: 2,
          max_sends_per_day: 50,
          reply_rate: 20,
          strategy: 'progressive',
        },
      }),
    });
    expect(lost.response.status).toBeGreaterThanOrEqual(500);
    expect(
      (await request(started.warmupBaseUrl, '/v1/inboxes')).body.items,
    ).toEqual([
      expect.objectContaining({ email: 'response-lost@warmup.test' }),
    ]);
  });

  it('supports warmup capacity, lifecycle, policy, status, metrics, and delete', async () => {
    const capacity = await request(
      started.warmupBaseUrl,
      '/v1/account/credits',
    );
    expect(capacity.body.plans.basic).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        available: expect.any(Number),
        in_use: expect.any(Number),
      }),
    );
    expect(mapWarmupInboxCapacity(capacity.body)).toEqual({
      total: 100,
      available: 100,
      inUse: 0,
    });

    const rejectedTransport = await request(
      started.warmupBaseUrl,
      '/v1/inboxes/advanced',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'warmup@lifecycle.test',
          sender_first: 'Warm',
          sender_last: 'Up',
          smtp: {
            username: 'warmup@lifecycle.test',
            password: 'secret',
            host: 'smtp.gmail.com',
            port: 465,
            tls: true,
          },
          imap: {
            username: 'warmup@lifecycle.test',
            password: 'secret',
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
          },
          frequency: {
            starting_baseline: 5,
            increase_per_day: 2,
            max_sends_per_day: 50,
            reply_rate: 20,
            strategy: 'progressive',
          },
        }),
      },
    );
    expect(rejectedTransport.response.status).toBe(422);
    expect(rejectedTransport.body).toEqual({
      error: 'invalid_mail_transport',
    });

    const created = await request(
      started.warmupBaseUrl,
      '/v1/inboxes/advanced',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'warmup@lifecycle.test',
          sender_first: 'Warm',
          sender_last: 'Up',
          smtp: {
            username: 'warmup@lifecycle.test',
            password: 'secret',
            host: '127.0.0.1',
            port: 3025,
            tls: false,
          },
          imap: {
            username: 'warmup@lifecycle.test',
            password: 'secret',
            host: '127.0.0.1',
            port: 3143,
            tls: false,
          },
          frequency: {
            starting_baseline: 5,
            increase_per_day: 2,
            max_sends_per_day: 50,
            reply_rate: 20,
            strategy: 'progressive',
          },
        }),
      },
    );
    expect(created.response.status).toBe(201);
    const inboxId = created.body.inbox_id;
    expect(mapWarmupInboxCreateReceipt(created.body)).toEqual({
      id: inboxId,
      replayed: false,
    });
    expect(
      mapWarmupInboxList(
        (await request(started.warmupBaseUrl, '/v1/inboxes')).body,
      ),
    ).toHaveLength(1);

    expect(
      (
        await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}/start`, {
          method: 'POST',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}`)).body
        .status,
    ).toBe('running');
    expect(
      mapWarmupInboxDetail(
        (await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}`)).body,
      ).status,
    ).toBe('running');
    expect(
      (
        await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            frequency: {
              starting_baseline: 10,
              increase_per_day: 3,
              max_sends_per_day: 70,
              reply_rate: 25,
              strategy: 'progressive',
            },
          }),
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}/pause`, {
          method: 'POST',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}/start`, {
          method: 'POST',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          started.warmupBaseUrl,
          `/v1/inboxes/${inboxId}/metrics?from=0&to=3600`,
        )
      ).body.inbox_id,
    ).toBe(inboxId);
    expect(
      mapWarmupInboxMetrics(
        (
          await request(
            started.warmupBaseUrl,
            `/v1/inboxes/${inboxId}/metrics?from=0&to=3600`,
          )
        ).body,
      ).inboxId,
    ).toBe(inboxId);
    expect(
      (
        await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}`, {
          method: 'DELETE',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (await request(started.warmupBaseUrl, `/v1/inboxes/${inboxId}`)).response
        .status,
    ).toBe(404);
  });
  it('stops every emulator listener through the loopback control API', async () => {
    const stopped = await request(started.controlBaseUrl, '/stop', {
      method: 'POST',
    });

    expect(stopped.response.status).toBe(202);
    expect(stopped.body).toEqual({ stopping: true });

    await expect(
      Promise.all([
        waitForClosedListener(started.icemailBaseUrl),
        waitForClosedListener(started.warmupBaseUrl),
      ]),
    ).resolves.toEqual([undefined, undefined]);
  });
});

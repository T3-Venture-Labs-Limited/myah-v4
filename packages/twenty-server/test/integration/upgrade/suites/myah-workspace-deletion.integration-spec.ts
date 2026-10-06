import { randomUUID } from 'node:crypto';
import { DataSource, type DataSourceOptions, type QueryRunner } from 'typeorm';
import { type Stripe } from 'stripe';

import { typeORMCoreModuleOptions } from 'src/database/typeorm/core/core.datasource';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';
import { MyahSubscriptionSyncService } from 'src/engine/core-modules/myah-subscription/myah-subscription-sync.service';
import { MyahWorkspaceAccessService } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';
import { UnipileReadError } from 'src/modules/myah-unipile/services/unipile-v1-client.service';

// Real workspace/subscription/binding rows; stubbed providers, all writes rolled back.
describe('Myah workspace deletion (PostgreSQL)', () => {
  const source = new DataSource(typeORMCoreModuleOptions as DataSourceOptions);
  let runner: QueryRunner;
  let workspaceId: string;
  let binding: UnipileInstagramAccountBindingEntity;
  let sync: MyahSubscriptionSyncService;
  let accounts: UnipileInstagramAccountService;
  let remove: () => Promise<WorkspaceEntity>;
  let enabled: boolean;
  let subscriptions: { id: string; status: string }[];
  let sessions: {
    id: string;
    status: string;
    metadata: { myah_subscription?: string };
  }[];
  const members = jest.fn();
  const cache = { get: jest.fn(), set: jest.fn(), incrBy: jest.fn() };
  const provider = { deleteAccount: jest.fn(), getAccount: jest.fn() };
  const stripe = {
    customers: { retrieve: jest.fn() },
    subscriptions: { list: jest.fn(), cancel: jest.fn() },
    checkout: { sessions: { list: jest.fn(), expire: jest.fn() } },
  };

  beforeAll(async () => {
    await source.initialize();
  });
  afterAll(async () => {
    await source.destroy();
  });
  beforeEach(async () => {
    jest.resetAllMocks();
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    workspaceId = randomUUID();
    enabled = true;
    await runner.query(
      `INSERT INTO core.workspace (id, "displayName", subdomain, "activationStatus", "databaseSchema", "workspaceCustomApplicationId", "defaultRoleId")
      SELECT $1, 'Deletion fixture', $2, 'ACTIVE', $2, "workspaceCustomApplicationId", "defaultRoleId" FROM core.workspace LIMIT 1`,
      [workspaceId, `deletion-${workspaceId}`],
    );
    await runner.query(
      `INSERT INTO core."myahWorkspaceInstallation" ("workspaceId", "customerAccountId", "stripeCustomerId")
      SELECT $1, "customerAccountId", $2 FROM core."myahWorkspaceInstallation" LIMIT 1`,
      [workspaceId, `cus_${workspaceId}`],
    );
    const config = {
      get: (key: string) =>
        ({
          MYAH_SUBSCRIPTION_REQUIRED: enabled,
          MYAH_COMPLIMENTARY_WORKSPACE_IDS: [],
          MYAH_STRIPE_PRICE_ID: 'price_myah',
        })[key],
    };
    const access = new MyahWorkspaceAccessService(
      new WorkspaceScopedRepository(
        runner.manager.getRepository(MyahWorkspaceSubscriptionEntity),
      ),
      config as never,
      cache as never,
    );
    await access.saveSubscription(workspaceId, {
      stripeSubscriptionId: 'sub_paid',
      stripeStatus: 'active',
      hadPaidSubscription: true,
    });
    binding = await runner.manager
      .getRepository(UnipileInstagramAccountBindingEntity)
      .save({
        workspaceId,
        workspaceInstagramAccountRecordId: randomUUID(),
        unipileAccountId: `account_${workspaceId}`,
        instagramUserId: `instagram_${workspaceId}`,
        status: UnipileInstagramAccountBindingStatus.ACTIVE,
      });
    provider.deleteAccount.mockImplementation(async (_id, options) => {
      await options.beforeDispatch();
      return { kind: 'ACCEPTED', value: { deleted: true } };
    });
    accounts = new UnipileInstagramAccountService(
      runner.manager.getRepository(WorkspaceEntity),
      runner.manager.getRepository(UnipileInstagramAccountBindingEntity),
      { markAccountStatus: jest.fn() } as never,
      provider as never,
      {
        withSessionLock: async (
          _scope: unknown,
          operation: (runner: QueryRunner) => Promise<unknown>,
        ) => operation(runner),
        withLock: async (
          _scope: unknown,
          operation: (manager: QueryRunner['manager']) => Promise<unknown>,
        ) => operation(runner.manager),
      } as never,
      { assertEnabled: jest.fn() } as never,
      {} as never,
    );
    subscriptions = [{ id: 'sub_paid', status: 'active' }];
    sessions = [
      {
        id: 'checkout_myah',
        status: 'open',
        metadata: { myah_subscription: 'true' },
      },
      { id: 'checkout_other', status: 'open', metadata: {} },
    ];
    stripe.customers.retrieve.mockResolvedValue({
      id: `cus_${workspaceId}`,
      metadata: { workspace_id: workspaceId },
    });
    stripe.subscriptions.list.mockImplementation(() =>
      (async function* () {
        yield* subscriptions;
      })(),
    );
    stripe.subscriptions.cancel.mockImplementation(async (id) => {
      subscriptions.find((s) => s.id === id)!.status = 'canceled';
    });
    stripe.checkout.sessions.list.mockImplementation(() =>
      (async function* () {
        yield* sessions.filter((s) => s.status === 'open');
      })(),
    );
    stripe.checkout.sessions.expire.mockImplementation(async (id) => {
      sessions.find((s) => s.id === id)!.status = 'expired';
    });
    sync = new MyahSubscriptionSyncService(
      {
        transaction: runner.manager.transaction.bind(runner.manager),
      } as DataSource,
      access,
      config as never,
      { add: jest.fn() } as never,
    );
    jest.spyOn(sync, 'stripe').mockReturnValue(stripe as unknown as Stripe);
    const context = {
      workspaceRepository: runner.manager.getRepository(WorkspaceEntity),
      userWorkspaceRepository: { find: async () => [{ userId: 'member' }] },
      handleRemoveWorkspaceMember: members,
      twentyConfigService: config,
      unipileInstagramAccountService: accounts,
      myahSubscriptionSyncService: sync,
      billingService: { isBillingEnabled: () => false },
      coreEntityCacheService: { invalidate: jest.fn() },
      logger: { log: jest.fn() },
    } as never;
    remove = () =>
      WorkspaceService.prototype.deleteWorkspace.call(
        context,
        workspaceId,
        true,
      );
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });
  const workspace = () =>
    runner.manager
      .getRepository(WorkspaceEntity)
      .findOneOrFail({ where: { id: workspaceId }, withDeleted: true });
  const account = () =>
    runner.manager
      .getRepository(UnipileInstagramAccountBindingEntity)
      .findOneByOrFail({ id: binding.id });
  const subscription = () =>
    runner.manager
      .getRepository(MyahWorkspaceSubscriptionEntity)
      .findOneByOrFail({ workspaceId });

  it('disconnects Instagram and cancels all live Myah subscriptions without proration before deleting, safely on retry', async () => {
    subscriptions.push(
      { id: 'sub_duplicate', status: 'past_due' },
      { id: 'sub_ended', status: 'canceled' },
    );
    await remove();
    expect(provider.deleteAccount).toHaveBeenCalledWith(
      binding.unipileAccountId,
      expect.anything(),
    );
    expect((await account()).status).toBe('INACTIVE');
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: `cus_${workspaceId}`,
      price: 'price_myah',
      status: 'all',
      limit: 100,
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_paid', {
      prorate: false,
      invoice_now: false,
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_duplicate', {
      prorate: false,
      invoice_now: false,
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith(
      'checkout_myah',
    );
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    expect((await subscription()).stripeStatus).toBe('canceled');
    expect((await workspace()).deletedAt).toBeInstanceOf(Date);
    expect(members).toHaveBeenCalledTimes(1);
    await remove();
    expect(provider.deleteAccount).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledTimes(1);
  });

  it('keeps the workspace and membership while an unknown disconnect is recovered, without replaying the delete', async () => {
    provider.deleteAccount.mockResolvedValue({ kind: 'UNKNOWN' });
    await expect(remove()).rejects.toThrow('disconnection is being confirmed');
    await expect(remove()).rejects.toThrow('disconnection is being confirmed');
    expect((await account()).status).toBe('DELETE_UNKNOWN');
    expect((await workspace()).deletedAt).toBeNull();
    expect(members).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(provider.deleteAccount).toHaveBeenCalledTimes(1);
    provider.getAccount.mockRejectedValue(
      new UnipileReadError(
        404,
        'UNIPILE_ACCOUNT_NOT_FOUND',
        'Not found',
        false,
      ),
    );
    await accounts.reconcileUnknownDisconnect(binding.id);
    await remove();
    expect(provider.deleteAccount).toHaveBeenCalledTimes(1);
    expect((await workspace()).deletedAt).toBeInstanceOf(Date);
  });

  it('does not replay a cancellation whose response was lost: retry reads Stripe first', async () => {
    stripe.subscriptions.cancel.mockImplementationOnce(async () => {
      subscriptions[0].status = 'canceled';
      throw new Error('Stripe response lost');
    });
    await expect(remove()).rejects.toThrow('Stripe response lost');
    expect((await workspace()).deletedAt).toBeNull();
    expect(members).not.toHaveBeenCalled();
    await remove();
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect((await workspace()).deletedAt).toBeInstanceOf(Date);
  });

  it('refuses a customer mismatch without cancelling another workspace subscription', async () => {
    stripe.customers.retrieve.mockResolvedValue({
      id: 'cus_other',
      metadata: { workspace_id: randomUUID() },
    });
    await expect(remove()).rejects.toThrow('ownership mismatch');
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect((await workspace()).deletedAt).toBeNull();
    expect(members).not.toHaveBeenCalled();
  });

  it('still cancels Myah billing while the paywall is off, leaving Instagram alone', async () => {
    // A paying brand deleting its workspace after a rollback must not keep
    // being billed. Instagram cleanup stays tied to the paywall switch.
    enabled = false;
    await remove();
    expect(provider.deleteAccount).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_paid', {
      prorate: false,
      invoice_now: false,
    });
    expect((await subscription()).stripeStatus).toBe('canceled');
    expect((await workspace()).deletedAt).toBeInstanceOf(Date);
  });

  it('deletes a never-subscribed workspace without contacting either provider', async () => {
    await runner.manager
      .getRepository(MyahWorkspaceSubscriptionEntity)
      .delete({ workspaceId });
    await runner.manager
      .getRepository(UnipileInstagramAccountBindingEntity)
      .delete({ id: binding.id });
    await remove();
    expect(provider.deleteAccount).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
    expect((await workspace()).deletedAt).toBeInstanceOf(Date);
  });
});

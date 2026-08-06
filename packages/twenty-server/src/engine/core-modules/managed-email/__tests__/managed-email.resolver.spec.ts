import {
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA, PIPES_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
  GqlExecutionContext,
} from '@nestjs/graphql';
import { isInputObjectType, isObjectType } from 'graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { RESOLVER_SCHEMA_SCOPE_KEY } from 'src/engine/api/graphql/graphql-config/constants/resolver-schema-scope-key.constant';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCampaignEligibility } from 'src/engine/core-modules/managed-email/enums/managed-email-campaign-eligibility.enum';
import {
  ManagedEmailCampaignCapInput,
  ManagedEmailProposalInput,
} from 'src/engine/core-modules/managed-email/managed-email.input';
import { ManagedEmailResolver } from 'src/engine/core-modules/managed-email/managed-email.resolver';
import { ManagedEmailCustomerService } from 'src/engine/core-modules/managed-email/services/managed-email-customer.service';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

const workspace = {
  id: '123e4567-e89b-42d3-a456-426614174000',
};
const actorId = '123e4567-e89b-42d3-a456-426614174001';
const mailboxId = '123e4567-e89b-42d3-a456-426614174002';
const domainId = '123e4567-e89b-42d3-a456-426614174003';
const operationId = '123e4567-e89b-42d3-a456-426614174004';
const idempotencyKey = 'managed-email-action-1';

const createResolver = () => {
  const customerService = {
    cancelDomainRenewal: jest.fn().mockResolvedValue({ accepted: true }),
    cancelWarmup: jest.fn().mockResolvedValue({ accepted: true }),
    domainHealth: jest.fn().mockResolvedValue(null),
    domains: jest.fn().mockResolvedValue([]),
    mailboxHealth: jest.fn().mockResolvedValue(null),
    mailboxes: jest.fn().mockResolvedValue([]),
    newProposal: jest.fn().mockResolvedValue({ id: 'proposal-id' }),
    operation: jest.fn().mockResolvedValue({ id: operationId }),
    overview: jest.fn().mockResolvedValue({ status: 'EMPTY' }),
    pauseWarmup: jest.fn().mockResolvedValue({ accepted: true }),
    prewarmedBundles: jest.fn().mockResolvedValue([]),
    purchase: jest.fn().mockResolvedValue({ accepted: true }),
    quote: jest.fn().mockResolvedValue({ id: 'quote-id' }),
    resumeWarmup: jest.fn().mockResolvedValue({ accepted: true }),
    retryPayment: jest.fn().mockResolvedValue({ accepted: true }),
    setCampaignCap: jest.fn().mockResolvedValue({ accepted: true }),
    stopMailbox: jest.fn().mockResolvedValue({ accepted: true }),
  };

  return {
    customerService,
    resolver: new ManagedEmailResolver(
      customerService as unknown as ManagedEmailCustomerService,
    ),
  };
};

describe('ManagedEmailResolver', () => {
  it('registers on the metadata schema used by workspace settings', () => {
    expect(
      Reflect.getMetadata(RESOLVER_SCHEMA_SCOPE_KEY, ManagedEmailResolver),
    ).toBe('metadata');
  });

  it('emits the approved customer-safe GraphQL surface', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        ManagedEmailResolver,
        { provide: ManagedEmailCustomerService, useValue: {} },
        { provide: PermissionsService, useValue: {} },
      ],
    }).compile();
    const schema = await moduleRef
      .get(GraphQLSchemaFactory)
      .create([ManagedEmailResolver]);

    expect(Object.keys(schema.getQueryType()?.getFields() ?? {})).toEqual(
      expect.arrayContaining([
        'managedEmailOverview',
        'managedEmailDomains',
        'managedEmailMailboxes',
        'managedEmailPrewarmedBundles',
        'managedEmailProposal',
        'managedEmailQuote',
        'managedEmailOperation',
        'managedEmailHealthDetails',
      ]),
    );
    expect(Object.keys(schema.getMutationType()?.getFields() ?? {})).toEqual(
      expect.arrayContaining([
        'confirmManagedEmailPrewarmedPurchase',
        'confirmManagedEmailOrdinaryPurchase',
        'setManagedEmailCampaignCap',
        'cancelManagedEmailWarmup',
        'pauseManagedEmailWarmup',
        'resumeManagedEmailWarmup',
        'retryManagedEmailPayment',
        'stopManagedEmailMailbox',
        'cancelManagedEmailDomainRenewal',
      ]),
    );

    for (const inputTypeName of [
      'ManagedEmailProposalInput',
      'ManagedEmailQuoteInput',
      'ManagedEmailPurchaseInput',
      'ManagedEmailCampaignCapInput',
      'ManagedEmailMailboxActionInput',
      'ManagedEmailDomainActionInput',
      'ManagedEmailHealthDetailsInput',
      'ManagedEmailOperationInput',
      'ManagedEmailPersonaInput',
      'ManagedEmailRetryPaymentInput',
    ]) {
      const inputType = schema.getType(inputTypeName);

      if (!isInputObjectType(inputType)) {
        throw new Error(`Missing input type ${inputTypeName}`);
      }
      for (const forbiddenField of [
        'workspaceId',
        'actorId',
        'providerId',
        'providerConfigurationKey',
        'providerPrice',
        'metronomeProductId',
        'metronomeRateCardId',
        'readinessPolicyVersion',
      ]) {
        expect(Object.keys(inputType.getFields())).not.toContain(
          forbiddenField,
        );
      }
    }

    for (const outputTypeName of [
      'ManagedEmailOverview',
      'ManagedEmailDomain',
      'ManagedEmailMailbox',
      'ManagedEmailBundle',
      'ManagedEmailProposal',
      'ManagedEmailQuote',
      'ManagedEmailOperation',
      'ManagedEmailHealthDetails',
      'ManagedEmailActionResult',
      'ManagedEmailDisclosures',
      'ManagedEmailProposalDomain',
      'ManagedEmailProposalMailbox',
      'ManagedEmailQuoteLine',
    ]) {
      const outputType = schema.getType(outputTypeName);

      expect(isObjectType(outputType)).toBe(true);
      if (!isObjectType(outputType)) {
        throw new Error(`Missing output type ${outputTypeName}`);
      }
      for (const forbiddenField of [
        'workspaceId',
        'providerId',
        'providerConfigurationKey',
        'providerPlan',
        'providerReceipt',
        'providerError',
        'credentials',
        'password',
        'metronomeCustomerId',
        'metronomeContractId',
        'metronomeInvoiceId',
        'metronomeProductId',
        'metronomeRateCardId',
      ]) {
        expect(Object.keys(outputType.getFields())).not.toContain(
          forbiddenField,
        );
      }
    }

    await moduleRef.close();
  });

  it('requires workspace auth, billing permission, and input validation', async () => {
    const guards: Type<CanActivate>[] = Reflect.getMetadata(
      GUARDS_METADATA,
      ManagedEmailResolver,
    );
    const pipes = Reflect.getMetadata(PIPES_METADATA, ManagedEmailResolver);
    const permissionsService = {
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
    };
    const executionContext = {
      getType: jest.fn(() => 'graphql'),
    } as unknown as ExecutionContext;
    const gqlContextSpy = jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue({
        getContext: () => ({
          req: {
            userWorkspaceId: actorId,
            workspace: {
              activationStatus: WorkspaceActivationStatus.ACTIVE,
              id: workspace.id,
            },
          },
        }),
      } as never);

    expect(guards).toHaveLength(2);
    expect(guards[0]).toBe(WorkspaceAuthGuard);
    expect(pipes).toContain(ResolverValidationPipe);

    const BillingPermissionGuard = guards[1];
    const guard = new BillingPermissionGuard(
      permissionsService as unknown as PermissionsService,
    );

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      apiKeyId: undefined,
      applicationId: undefined,
      setting: PermissionFlagType.BILLING,
      userWorkspaceId: actorId,
      workspaceId: workspace.id,
    });

    gqlContextSpy.mockRestore();
  });

  it('rejects invalid nested proposal data and non-integer caps', async () => {
    const proposalErrors = await validate(
      plainToInstance(ManagedEmailProposalInput, {
        mailboxCount: 1,
        personas: [
          {
            displayName: '',
            localPartPreference: '',
            roleTitle: null,
            signature: '',
          },
        ],
      }),
    );
    const capErrors = await validate(
      plainToInstance(ManagedEmailCampaignCapInput, {
        dailyCap: 1.5,
        idempotencyKey,
        mailboxId,
      }),
    );

    expect(proposalErrors.map(({ property }) => property)).toContain(
      'personas',
    );
    expect(capErrors.map(({ property }) => property)).toContain('dailyCap');
  });

  it.each([undefined, null])(
    'accepts an omitted or null optional persona role',
    async (roleTitle) => {
      const errors = await validate(
        plainToInstance(ManagedEmailProposalInput, {
          mailboxCount: 1,
          personas: [
            {
              displayName: 'Founder',
              localPartPreference: 'founder',
              roleTitle,
              signature: 'Thanks',
            },
          ],
        }),
      );

      expect(errors).toEqual([]);
    },
  );

  it('derives workspace and actor identity from authentication for every mutation', async () => {
    const { resolver, customerService } = createResolver();
    const mailboxInput = { mailboxId, idempotencyKey };
    const domainInput = { domainId, idempotencyKey };

    await resolver.setManagedEmailCampaignCap(
      { ...mailboxInput, dailyCap: 3 },
      workspace as never,
      actorId,
    );
    await resolver.cancelManagedEmailWarmup(
      mailboxInput,
      workspace as never,
      actorId,
    );
    await resolver.pauseManagedEmailWarmup(
      mailboxInput,
      workspace as never,
      actorId,
    );
    await resolver.resumeManagedEmailWarmup(
      mailboxInput,
      workspace as never,
      actorId,
    );
    await resolver.retryManagedEmailPayment(
      { operationId, idempotencyKey },
      workspace as never,
      actorId,
    );
    await resolver.stopManagedEmailMailbox(
      mailboxInput,
      workspace as never,
      actorId,
    );
    await resolver.cancelManagedEmailDomainRenewal(
      domainInput,
      workspace as never,
      actorId,
    );
    const purchaseInput = {
      idempotencyKey,
      quoteFingerprint: 'quote-fingerprint',
      quoteId: operationId,
      quoteVersion: 'quote-version',
    };

    await resolver.confirmManagedEmailPrewarmedPurchase(
      purchaseInput,
      workspace as never,
      actorId,
    );
    await resolver.confirmManagedEmailOrdinaryPurchase(
      purchaseInput,
      workspace as never,
      actorId,
    );

    expect(customerService.setCampaignCap).toHaveBeenCalledWith({
      actorId,
      dailyCap: 3,
      idempotencyKey,
      mailboxId,
      workspaceId: workspace.id,
    });
    for (const method of [
      customerService.cancelWarmup,
      customerService.pauseWarmup,
      customerService.resumeWarmup,
      customerService.stopMailbox,
    ]) {
      expect(method).toHaveBeenCalledWith({
        actorId,
        idempotencyKey,
        mailboxId,
        workspaceId: workspace.id,
      });
    }
    expect(customerService.retryPayment).toHaveBeenCalledWith({
      actorId,
      idempotencyKey,
      operationId,
      workspaceId: workspace.id,
    });
    expect(customerService.cancelDomainRenewal).toHaveBeenCalledWith({
      actorId,
      domainId,
      idempotencyKey,
      workspaceId: workspace.id,
    });
    expect(customerService.purchase).toHaveBeenNthCalledWith(1, {
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      actorId,
      input: purchaseInput,
      workspaceId: workspace.id,
    });
    expect(customerService.purchase).toHaveBeenNthCalledWith(2, {
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      actorId,
      input: purchaseInput,
      workspaceId: workspace.id,
    });
  });
});

describe('ManagedEmailCustomerService', () => {
  const createService = ({
    enabled = false,
    allowedWorkspaceIds = [workspace.id],
    mailbox = {
      id: mailboxId,
      workspaceId: workspace.id,
      managedEmailDomainId: domainId,
      address: 'alex@example.test',
      personaDisplayName: 'Alex Example',
      personaRole: 'Founder',
      infrastructureState: 'ACTIVE',
      warmupState: 'WARMING',
      campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
      policySafeDailyCapacity: 10,
      adminDailyCap: null,
      infrastructurePaidThrough: new Date('2026-09-01T00:00:00.000Z'),
      warmupPaidThrough: new Date('2026-09-01T00:00:00.000Z'),
      lastHealthEvaluatedAt: new Date('2026-08-05T00:00:00.000Z'),
      safeFailureCode: null,
    },
  }: {
    enabled?: boolean;
    allowedWorkspaceIds?: string[];
    mailbox?: Record<string, unknown> | null;
  } = {}) => {
    const domains = [
      {
        id: domainId,
        workspaceId: workspace.id,
        domain: 'example.test',
        infrastructureState: 'ACTIVE',
        paidThrough: new Date('2027-08-01T00:00:00.000Z'),
        renewalEnabled: true,
        cancelAtPeriodEnd: false,
        safeFailureCode: null,
      },
    ];
    const mailboxes = mailbox === null ? [] : [mailbox];
    const operation = {
      id: operationId,
      workspaceId: workspace.id,
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      idempotencyKey,
      state: 'PAYMENT_PENDING',
      paymentStatus: 'PENDING',
      expectedAmountCents: '12345',
      currency: 'USD',
      safeFailureCode: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    };
    const domainRepository = {
      find: jest.fn().mockResolvedValue(domains),
      findOneBy: jest.fn().mockResolvedValue(domains[0]),
    };
    const mailboxRepository = {
      find: jest.fn().mockResolvedValue(mailboxes),
      findOneBy: jest.fn().mockResolvedValue(mailbox),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const operationRepository = {
      findOneBy: jest.fn().mockResolvedValue(operation),
    };
    const lifecycleService = {
      cancelWarmupAtPeriodEnd: jest.fn().mockResolvedValue(undefined),
      disableDomainRenewal: jest.fn().mockResolvedValue(undefined),
      pauseWarmupNow: jest.fn().mockResolvedValue(undefined),
      resumeWarmup: jest.fn().mockResolvedValue(undefined),
      stopMailboxAtPeriodEnd: jest.fn().mockResolvedValue(undefined),
    };
    const acquisitionService = {
      admit: jest.fn(),
      continue: jest.fn().mockResolvedValue(operation),
    };
    const proposalService = {
      createProposal: jest.fn(),
      createPrewarmedProposal: jest.fn(),
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'MANAGED_EMAIL_ENABLED') return enabled;
        if (key === 'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS') {
          return allowedWorkspaceIds;
        }
        return undefined;
      }),
    };
    const Service = ManagedEmailCustomerService as unknown as new (
      ...args: unknown[]
    ) => ManagedEmailCustomerService;
    const service = new Service(
      domainRepository,
      mailboxRepository,
      operationRepository,
      lifecycleService,
      acquisitionService,
      proposalService,
      twentyConfigService,
    );

    return {
      acquisitionService,
      domainRepository,
      lifecycleService,
      mailboxRepository,
      operationRepository,
      proposalService,
      service,
      twentyConfigService,
    };
  };

  it('projects workspace-scoped persisted state without internal identifiers', async () => {
    const test = createService();

    await expect(test.service.overview(workspace.id)).resolves.toMatchObject({
      acquisitionAvailable: false,
      domainCount: 1,
      mailboxCount: 1,
      readyCount: 1,
      warmingCount: 1,
    });
    await expect(test.service.domains(workspace.id)).resolves.toEqual([
      expect.objectContaining({
        dependentMailboxCount: 1,
        domain: 'example.test',
        id: domainId,
      }),
    ]);
    await expect(test.service.mailboxes(workspace.id)).resolves.toEqual([
      expect.objectContaining({
        address: 'alex@example.test',
        domain: 'example.test',
        id: mailboxId,
        personaDisplayName: 'Alex Example',
      }),
    ]);

    expect(test.domainRepository.find).toHaveBeenCalledWith(workspace.id);
    expect(test.mailboxRepository.find).toHaveBeenCalledWith(workspace.id);
  });

  it('normalizes an omitted persona role before proposal generation', async () => {
    const test = createService({ enabled: true });

    test.proposalService.createProposal.mockResolvedValue({
      disclosures: {},
      domains: [],
      expiresAt: new Date('2026-08-06T12:00:00.000Z'),
      id: 'proposal-id',
      mailboxCount: 1,
      policyVersion: 'proposal-policy-v1',
    });

    await test.service.newProposal({
      actorId,
      input: {
        mailboxCount: 1,
        personas: [
          {
            displayName: 'Founder',
            localPartPreference: 'founder',
            signature: 'Thanks',
          },
        ],
      },
      workspaceId: workspace.id,
      workspaceSlug: 'workspace-slug',
    });

    expect(test.proposalService.createProposal).toHaveBeenCalledWith(
      {
        mailboxCount: 1,
        personas: [
          {
            displayName: 'Founder',
            localPartPreference: 'founder',
            roleTitle: null,
            signature: 'Thanks',
          },
        ],
      },
      {
        actorWorkspaceMemberId: actorId,
        workspaceId: workspace.id,
        workspaceSlug: 'workspace-slug',
      },
    );
  });

  it('loads an operation read-only and never advances its state machine', async () => {
    const test = createService();

    await expect(
      test.service.operation(workspace.id, operationId),
    ).resolves.toMatchObject({
      id: operationId,
      state: 'PAYMENT_PENDING',
    });
    expect(test.operationRepository.findOneBy).toHaveBeenCalledWith(
      workspace.id,
      { id: operationId },
    );
    expect(test.acquisitionService.continue).not.toHaveBeenCalled();
  });

  it('fails closed before provider or payment calls when admission is disabled', async () => {
    const test = createService({ enabled: false });

    await expect(test.service.prewarmedBundles(workspace.id)).rejects.toThrow(
      'Managed email acquisition is unavailable',
    );
    await expect(
      test.service.newProposal({
        actorId,
        input: { mailboxCount: 1, personas: [] },
        workspaceId: workspace.id,
        workspaceSlug: 'workspace',
      }),
    ).rejects.toThrow('Managed email acquisition is unavailable');
    await expect(
      test.service.purchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorId,
        input: {
          idempotencyKey,
          quoteFingerprint: 'quote-fingerprint',
          quoteId: 'quote-id',
          quoteVersion: 'quote-version',
        },
        workspaceId: workspace.id,
      }),
    ).rejects.toThrow('Managed email acquisition is unavailable');

    expect(test.proposalService.createProposal).not.toHaveBeenCalled();
    expect(test.acquisitionService.admit).not.toHaveBeenCalled();
  });

  it('passes the authenticated actor to every lifecycle action', async () => {
    const test = createService();
    const mailboxAction = {
      actorId,
      idempotencyKey,
      mailboxId,
      workspaceId: workspace.id,
    };

    await test.service.cancelWarmup(mailboxAction);
    await test.service.pauseWarmup(mailboxAction);
    await test.service.resumeWarmup(mailboxAction);
    await test.service.stopMailbox(mailboxAction);
    await test.service.cancelDomainRenewal({
      actorId,
      domainId,
      idempotencyKey,
      workspaceId: workspace.id,
    });

    expect(test.lifecycleService.cancelWarmupAtPeriodEnd).toHaveBeenCalledWith(
      mailboxAction,
    );
    expect(test.lifecycleService.pauseWarmupNow).toHaveBeenCalledWith(
      mailboxAction,
    );
    expect(test.lifecycleService.resumeWarmup).toHaveBeenCalledWith(
      mailboxAction,
    );
    expect(test.lifecycleService.stopMailboxAtPeriodEnd).toHaveBeenCalledWith(
      mailboxAction,
    );
    expect(test.lifecycleService.disableDomainRenewal).toHaveBeenCalledWith({
      actorId,
      domainId,
      idempotencyKey,
      workspaceId: workspace.id,
    });
  });

  it('binds payment retry to the operation durable idempotency key', async () => {
    const test = createService();

    await expect(
      test.service.retryPayment({
        actorId,
        idempotencyKey,
        operationId,
        workspaceId: workspace.id,
      }),
    ).resolves.toEqual({ accepted: true, operationId });
    expect(test.operationRepository.findOneBy).toHaveBeenCalledWith(
      workspace.id,
      { id: operationId, idempotencyKey },
    );
    expect(test.acquisitionService.continue).toHaveBeenCalledWith({
      operationId,
      workspaceId: workspace.id,
    });

    test.operationRepository.findOneBy.mockResolvedValueOnce(null);
    await expect(
      test.service.retryPayment({
        actorId,
        idempotencyKey: 'conflicting-key',
        operationId,
        workspaceId: workspace.id,
      }),
    ).rejects.toThrow('Managed email retry identity does not match');
    expect(test.acquisitionService.continue).toHaveBeenCalledTimes(1);
  });

  it('atomically lowers a campaign cap and rejects attempts to raise it', async () => {
    const test = createService();

    await expect(
      test.service.setCampaignCap({
        actorId,
        dailyCap: 3,
        idempotencyKey,
        mailboxId,
        workspaceId: workspace.id,
      }),
    ).resolves.toEqual({ accepted: true, operationId: mailboxId });
    expect(test.mailboxRepository.update).toHaveBeenCalledWith(
      workspace.id,
      expect.objectContaining({
        id: mailboxId,
        policySafeDailyCapacity: 10,
      }),
      { adminDailyCap: 3 },
    );

    await expect(
      test.service.setCampaignCap({
        actorId,
        dailyCap: null,
        idempotencyKey: 'remove-cap',
        mailboxId,
        workspaceId: workspace.id,
      }),
    ).resolves.toEqual({ accepted: true, operationId: mailboxId });
    expect(test.mailboxRepository.update).toHaveBeenLastCalledWith(
      workspace.id,
      expect.objectContaining({
        id: mailboxId,
        policySafeDailyCapacity: 10,
      }),
      { adminDailyCap: null },
    );

    await expect(
      test.service.setCampaignCap({
        actorId,
        dailyCap: 11,
        idempotencyKey: 'raise-cap',
        mailboxId,
        workspaceId: workspace.id,
      }),
    ).rejects.toThrow('Managed email campaign cap cannot be raised');
  });
});

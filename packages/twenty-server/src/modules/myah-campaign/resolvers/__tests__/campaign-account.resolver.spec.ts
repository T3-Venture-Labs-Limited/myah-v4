import { GUARDS_METADATA, PIPES_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { validate } from 'class-validator';
import { graphql, isNonNullType, isObjectType } from 'graphql';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  CampaignEmailAccountCampaignInput,
  CampaignEmailAccountDTO,
  CampaignEmailAccountLinkInput,
  LinkCampaignEmailAccountInput,
  ReplaceCampaignEmailPoolInput,
  ResolveExactCampaignEmailSenderInput,
  CampaignSenderReadinessDTO,
  toCampaignSenderPoolSnapshotDTO,
  toCampaignSenderReadinessDTO,
} from 'src/modules/myah-campaign/dtos/campaign-account.dto';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';
import {
  CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
  CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
  type CampaignSenderReadiness,
} from 'src/modules/myah-campaign/types/campaign-sender-pool.type';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CampaignAccountResolver } from 'src/modules/myah-campaign/resolvers/campaign-account.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
);

describe('CampaignAccountResolver', () => {
  const authContext = { workspace: { id: 'workspace' } } as never;
  const service = {
    list: jest.fn(),
    candidates: jest.fn(),
    link: jest.fn(),
    setDefault: jest.fn(),
    remove: jest.fn(),
    replaceCampaignEmailPool: jest.fn(),
    getCampaignEmailSenderPool: jest.fn(),
    resolveExactCampaignEmailSender: jest.fn(),
  };
  const campaignId = '11111111-1111-4111-8111-111111111111';
  const connectedAccountId = '22222222-2222-4222-8222-222222222222';
  const campaignAccountId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkspaceAuthContext as jest.Mock).mockReturnValue(authContext);
  });

  it.each([
    [CampaignEmailAccountCampaignInput, {}],
    [CampaignEmailAccountLinkInput, { campaignAccountId }],
    [LinkCampaignEmailAccountInput, { connectedAccountId }],
    [ReplaceCampaignEmailPoolInput, { connectedAccountIds: [] }],
    [
      ResolveExactCampaignEmailSenderInput,
      { connectedAccountId, expectedSenderPoolFingerprint: 'fingerprint' },
    ],
  ])('validates UUID fields for %s', async (Input, fields) => {
    const input = Object.assign(new Input(), {
      ...fields,
      campaignId: 'not-a-uuid',
    });

    await expect(validate(input)).resolves.toHaveLength(1);
  });

  it.each([
    [LinkCampaignEmailAccountInput, 'connectedAccountId'],
    [CampaignEmailAccountLinkInput, 'campaignAccountId'],
  ])('validates the secondary UUID field for %s', async (Input, field) => {
    const input = Object.assign(new Input(), {
      campaignId,
      [field]: 'not-a-uuid',
    });

    await expect(validate(input)).resolves.toHaveLength(1);
  });

  it('validates the exact sender connected-account UUID', async () => {
    const input = Object.assign(new ResolveExactCampaignEmailSenderInput(), {
      campaignId,
      connectedAccountId: 'not-a-uuid',
      expectedSenderPoolFingerprint: 'fingerprint',
    });

    await expect(validate(input)).resolves.toHaveLength(1);
  });

  it('maps every readiness union branch through one validated flattened adapter', () => {
    const common = {
      campaignAccountId,
      connectedAccountId,
      messageChannelId: '44444444-4444-4444-8444-444444444444',
      recoveryPath: null,
    };
    const cases: CampaignSenderReadiness[] = [
      {
        ...common,
        bindingStatus: 'RESOLVED_BINDING',
        senderHandle: 'sender@brand.test',
        provider: ConnectedAccountProvider.GOOGLE,
        dailySendLimit: 50,
        minimumSendIntervalMs: 300_000,
        missingBinding: null,
        status: 'READY',
        reason: null,
      },
      ...(['CONNECTED_ACCOUNT', 'MESSAGE_CHANNEL', 'BOTH'] as const).map(
        (missingBinding): CampaignSenderReadiness => ({
          ...common,
          bindingStatus: 'MISSING_CORE_BINDING',
          senderHandle: null,
          provider: null,
          dailySendLimit: null,
          minimumSendIntervalMs: null,
          missingBinding,
          status: 'BLOCKED',
          reason: 'ACCOUNT_UNAVAILABLE',
        }),
      ),
    ];

    expect(cases.map(toCampaignSenderReadinessDTO)).toEqual(cases);
  });

  it('exposes nullable tombstone fields and executes READY plus all missing markers without GraphQL non-null errors', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        CampaignAccountResolver,
        { provide: CampaignAccountService, useValue: service },
      ],
    }).compile();
    const schema = await moduleRef
      .get(GraphQLSchemaFactory)
      .create([CampaignAccountResolver]);
    const outputType = schema.getType(CampaignSenderReadinessDTO.name);
    expect(isObjectType(outputType)).toBe(true);
    if (!isObjectType(outputType)) throw new Error('Missing readiness DTO');
    for (const fieldName of [
      'senderHandle',
      'provider',
      'dailySendLimit',
      'minimumSendIntervalMs',
      'missingBinding',
    ]) {
      expect(isNonNullType(outputType.getFields()[fieldName].type)).toBe(false);
    }

    const common = {
      campaignAccountId,
      connectedAccountId,
      messageChannelId: '44444444-4444-4444-8444-444444444444',
      recoveryPath: null,
    };
    const cases: CampaignSenderReadiness[] = [
      {
        ...common,
        bindingStatus: 'RESOLVED_BINDING',
        senderHandle: 'sender@brand.test',
        provider: ConnectedAccountProvider.GOOGLE,
        dailySendLimit: 50,
        minimumSendIntervalMs: 300_000,
        missingBinding: null,
        status: 'READY',
        reason: null,
      },
      ...(['CONNECTED_ACCOUNT', 'MESSAGE_CHANNEL', 'BOTH'] as const).map(
        (missingBinding): CampaignSenderReadiness => ({
          ...common,
          bindingStatus: 'MISSING_CORE_BINDING',
          senderHandle: null,
          provider: null,
          dailySendLimit: null,
          minimumSendIntervalMs: null,
          missingBinding,
          status: 'BLOCKED',
          reason: 'ACCOUNT_UNAVAILABLE',
        }),
      ),
    ];

    for (const mailbox of cases) {
      const snapshot = toCampaignSenderPoolSnapshotDTO({
        rotationPolicyId: CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
        serializationRevision: CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
        mailboxes: [mailbox],
        senderPoolFingerprint: 'fingerprint',
      });
      const result = await graphql({
        schema,
        source: `query {
          campaignEmailSenderPool(input: { campaignId: "${campaignId}" }) {
            serializationRevision rotationPolicyId senderPoolFingerprint
            mailboxes {
              bindingStatus campaignAccountId connectedAccountId messageChannelId
              status reason recoveryPath missingBinding senderHandle provider
              dailySendLimit minimumSendIntervalMs
            }
          }
        }`,
        rootValue: { campaignEmailSenderPool: snapshot },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toMatchObject({
        campaignEmailSenderPool: {
          mailboxes: [
            {
              bindingStatus: mailbox.bindingStatus,
              campaignAccountId: mailbox.campaignAccountId,
              connectedAccountId: mailbox.connectedAccountId,
              messageChannelId: mailbox.messageChannelId,
              missingBinding: mailbox.missingBinding,
              senderHandle: mailbox.senderHandle,
              provider: mailbox.provider,
              dailySendLimit: mailbox.dailySendLimit,
              minimumSendIntervalMs: mailbox.minimumSendIntervalMs,
            },
          ],
        },
      });
    }
    await moduleRef.close();
  });

  it('exposes backward-compatible candidate fields with canonical sender readiness', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        CampaignAccountResolver,
        { provide: CampaignAccountService, useValue: service },
      ],
    }).compile();
    const schema = await moduleRef
      .get(GraphQLSchemaFactory)
      .create([CampaignAccountResolver]);
    const accountType = schema.getType(CampaignEmailAccountDTO.name);
    expect(isObjectType(accountType)).toBe(true);
    if (!isObjectType(accountType)) throw new Error('Missing account DTO');
    expect(isNonNullType(accountType.getFields().senderReadiness.type)).toBe(
      false,
    );

    const result = await graphql({
      schema,
      source: `query {
        campaignEmailAccountCandidates(input: { campaignId: "${campaignId}" }) {
          id connectedAccountId messageChannelId provider senderEmail label
          isDefault health
          senderReadiness {
            rotationPolicyId connectedAccountId messageChannelId senderHandle
            status reason
          }
        }
      }`,
      rootValue: {
        campaignEmailAccountCandidates: [
          {
            id: connectedAccountId,
            connectedAccountId,
            messageChannelId: '44444444-4444-4444-8444-444444444444',
            provider: ConnectedAccountProvider.GOOGLE,
            senderEmail: 'sender@brand.test',
            label: 'Sender',
            isDefault: false,
            health: 'AVAILABLE',
            senderReadiness: {
              rotationPolicyId: CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
              connectedAccountId,
              messageChannelId: '44444444-4444-4444-8444-444444444444',
              senderHandle: 'sender@brand.test',
              status: 'BLOCKED',
              reason: 'MISSING_PERMISSION',
            },
          },
        ],
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toMatchObject({
      campaignEmailAccountCandidates: [
        {
          health: 'AVAILABLE',
          senderReadiness: {
            rotationPolicyId: CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
            status: 'BLOCKED',
            reason: 'MISSING_PERMISSION',
          },
        },
      ],
    });
    await moduleRef.close();
  });

  it('requires workspace authentication, custom permission guards, and resolver validation', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CampaignAccountResolver),
    ).toEqual([WorkspaceAuthGuard, CustomPermissionGuard]);
    expect(
      Reflect.getMetadata(PIPES_METADATA, CampaignAccountResolver),
    ).toEqual([ResolverValidationPipe]);
  });

  it.each([
    ['campaignEmailAccounts', 'list', { campaignId }],
    ['campaignEmailAccountCandidates', 'candidates', { campaignId }],
    ['linkCampaignEmailAccount', 'link', { campaignId, connectedAccountId }],
    [
      'setDefaultCampaignEmailAccount',
      'setDefault',
      { campaignId, campaignAccountId },
    ],
    ['removeCampaignEmailAccount', 'remove', { campaignId, campaignAccountId }],
  ])(
    'forwards %s input and the unchanged server auth context',
    async (method, serviceMethod, input) => {
      const result = [{ id: 'campaign-account' }];
      const resolver = new CampaignAccountResolver(service as never);
      service[serviceMethod as keyof typeof service].mockResolvedValue(result);

      await expect(
        (
          resolver[method as keyof CampaignAccountResolver] as (
            input: never,
          ) => Promise<unknown>
        )(input as never),
      ).resolves.toBe(result);

      expect(
        service[serviceMethod as keyof typeof service],
      ).toHaveBeenCalledWith(
        serviceMethod === 'list' || serviceMethod === 'candidates'
          ? input.campaignId
          : input,
        authContext,
      );
    },
  );

  it('maps canonical pool and exact results while forwarding unchanged auth context', async () => {
    const resolver = new CampaignAccountResolver(service as never);
    const sender = {
      bindingStatus: 'RESOLVED_BINDING' as const,
      campaignAccountId,
      connectedAccountId,
      messageChannelId: '44444444-4444-4444-8444-444444444444',
      senderHandle: 'sender@brand.test',
      provider: ConnectedAccountProvider.GOOGLE,
      status: 'READY' as const,
      reason: null,
      recoveryPath: null,
      dailySendLimit: 50,
      minimumSendIntervalMs: 300_000,
      missingBinding: null,
    };
    const snapshot = {
      rotationPolicyId: CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
      serializationRevision: CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
      mailboxes: [sender],
      senderPoolFingerprint: 'fingerprint',
    };
    service.getCampaignEmailSenderPool.mockResolvedValueOnce(snapshot);
    service.replaceCampaignEmailPool.mockResolvedValueOnce(snapshot);
    service.resolveExactCampaignEmailSender.mockResolvedValueOnce({
      status: 'READY',
      sender,
    });

    await expect(
      resolver.campaignEmailSenderPool({ campaignId }),
    ).resolves.toEqual(snapshot);
    await expect(
      resolver.replaceCampaignEmailPool({
        campaignId,
        connectedAccountIds: [connectedAccountId],
      }),
    ).resolves.toEqual(snapshot);
    await expect(
      resolver.exactCampaignEmailSender({
        campaignId,
        connectedAccountId,
        expectedSenderPoolFingerprint: 'fingerprint',
      }),
    ).resolves.toEqual({ status: 'READY', sender, reason: null });

    expect(service.getCampaignEmailSenderPool).toHaveBeenCalledWith(
      { campaignId },
      authContext,
    );
    expect(service.replaceCampaignEmailPool).toHaveBeenCalledWith(
      { campaignId, connectedAccountIds: [connectedAccountId] },
      authContext,
    );
  });
});

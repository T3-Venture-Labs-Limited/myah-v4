import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';

const campaignId = '10000000-0000-4000-8000-000000000000';
const membershipId = (suffix: number) =>
  `20000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const creatorId = (suffix: number) =>
  `30000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const membership = (
  suffix: number,
  overrides: Record<string, unknown> = {},
) => ({
  id: membershipId(suffix),
  campaignId,
  creatorId: creatorId(suffix),
  stage: 'READY',
  selectedContactMethod: 'EMAIL',
  deletedAt: null,
  ...overrides,
});
const creator = (suffix: number, overrides: Record<string, unknown> = {}) => ({
  id: creatorId(suffix),
  name: `Creator ${suffix}`,
  email: `creator-${suffix}@example.com`,
  deletedAt: null,
  ...overrides,
});

const createService = (suppressed: string[] = []) =>
  new CampaignOutreachAudienceReviewService(
    {} as never,
    {
      getSuppressedAddresses: jest.fn().mockResolvedValue(new Set(suppressed)),
    } as never,
  );

const evaluate = (
  service: CampaignOutreachAudienceReviewService,
  memberships: Record<string, unknown>[],
  audienceCreators: Record<string, unknown>[],
  allWorkspaceCreators = audienceCreators,
  suppressedEmails: string[] = [],
) =>
  (service as any).evaluate(
    campaignId,
    {
      memberships,
      audienceCreators,
      allWorkspaceCreators,
    },
    new Set(suppressedEmails),
  );

describe('CampaignOutreachAudienceReviewService', () => {
  it('rejects a non-role permission context before record access', async () => {
    const authContext = buildSystemAuthContext('workspace');
    const getRepository = jest.fn();
    const service = new CampaignOutreachAudienceReviewService(
      {
        executeInWorkspaceContext: (callback: () => unknown) =>
          withWorkspaceContext(
            { authContext } as ORMWorkspaceContext,
            callback,
          ),
        getRepository,
      } as never,
      {} as never,
    );

    await expect(service.preview({ authContext, campaignId })).rejects.toThrow(
      'requires role permissions',
    );
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('uses READY/CONTACTED, Email, normalized valid email, suppression, and nondeleted Creator rules', async () => {
    const creators = [
      creator(1, { email: ' READY@Example.com ' }),
      creator(2),
      creator(3),
      creator(4, { email: 'invalid' }),
      creator(5),
      creator(6),
      creator(7, { deletedAt: new Date('2026-01-01T00:00:00.000Z') }),
    ];
    const result = await evaluate(
      createService(['creator-6@example.com']),
      [
        membership(1),
        membership(2, { stage: 'CONTACTED' }),
        membership(3, { stage: 'POSTED' }),
        membership(4),
        membership(5, { selectedContactMethod: 'INSTAGRAM' }),
        membership(6),
        membership(7),
      ],
      creators,
      creators,
      ['creator-6@example.com'],
    );

    expect(result.eligible.map(({ creatorName }: any) => creatorName)).toEqual([
      'Creator 1',
      'Creator 2',
    ]);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          creatorName: 'Creator 3',
          reasons: ['INVALID_STAGE'],
        }),
        expect.objectContaining({
          creatorName: 'Creator 4',
          reasons: ['INVALID_EMAIL'],
        }),
        expect.objectContaining({
          creatorName: 'Creator 5',
          reasons: ['NON_EMAIL_CONTACT_METHOD'],
        }),
        expect.objectContaining({
          creatorName: 'Creator 6',
          reasons: ['SUPPRESSED_EMAIL'],
        }),
        expect.objectContaining({
          creatorName: null,
          reasons: ['MISSING_CREATOR'],
        }),
      ]),
    );
    expect(result.excluded).toHaveLength(5);
  });

  it('excludes every conflicting identity when an out-of-audience Creator shares its normalized email', async () => {
    const firstAudienceCreator = creator(1, {
      email: ' DUPLICATE@Example.com ',
    });
    const secondAudienceCreator = creator(2, {
      email: 'duplicate@example.com',
    });
    const outOfAudienceConflict = creator(99, {
      email: 'duplicate@example.COM',
    });

    const result = await evaluate(
      createService(),
      [membership(1), membership(2)],
      [firstAudienceCreator, secondAudienceCreator],
      [firstAudienceCreator, secondAudienceCreator, outOfAudienceConflict],
    );

    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([
      expect.objectContaining({
        campaignCreatorId: membershipId(1),
        creatorName: 'Creator 1',
        reasons: ['DUPLICATE_CREATOR_EMAIL'],
      }),
      expect.objectContaining({
        campaignCreatorId: membershipId(2),
        creatorName: 'Creator 2',
        reasons: ['DUPLICATE_CREATOR_EMAIL'],
      }),
    ]);
  });

  it('uses actor permissions and only the supplied manager for transactional audience and suppression reads', async () => {
    const ambientSuppressionRead = jest.fn();
    const membershipFind = jest
      .fn()
      .mockResolvedValue([membership(1), membership(2, { stage: 'POSTED' })]);
    const creatorFind = jest.fn().mockResolvedValue([creator(1), creator(2)]);
    const getRepository = jest.fn(async (_workspaceId, objectName) =>
      objectName === 'campaignCreator'
        ? { find: membershipFind }
        : { find: creatorFind },
    );
    const service = new CampaignOutreachAudienceReviewService(
      { getRepository } as never,
      { getSuppressedAddresses: ambientSuppressionRead } as never,
    );
    const manager = {} as any;
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([creator(1), creator(2)])
      .mockResolvedValueOnce([]);
    manager.queryRunner = {
      isTransactionActive: true,
      isReleased: false,
      manager,
      query,
    };
    const rolePermissionConfig = { intersectionOf: ['actor-role'] };

    await expect(
      service.reviewInTransaction({
        workspaceId: 'workspace',
        campaignId,
        schemaName: 'workspace_schema',
        manager,
        rolePermissionConfig,
      }),
    ).resolves.toEqual({
      campaignId,
      eligible: [
        expect.objectContaining({
          campaignCreatorId: membershipId(1),
          creatorName: 'Creator 1',
        }),
      ],
      excluded: [
        expect.objectContaining({
          campaignCreatorId: membershipId(2),
          reasons: ['INVALID_STAGE'],
        }),
      ],
    });
    expect(getRepository).toHaveBeenNthCalledWith(
      1,
      'workspace',
      'campaignCreator',
      rolePermissionConfig,
    );
    expect(getRepository).toHaveBeenNthCalledWith(
      2,
      'workspace',
      'creator',
      rolePermissionConfig,
    );
    expect(membershipFind.mock.calls[0][1]).toBe(manager);
    expect(creatorFind.mock.calls[0][1]).toBe(manager);
    expect(query.mock.calls[0][0]).toContain('LOCK TABLE');
    expect(query.mock.calls[2][0]).toContain('core."messageSuppression"');
    expect(ambientSuppressionRead).not.toHaveBeenCalled();
  });

  it('does not enroll a Creator hidden by actor record permissions during Start', async () => {
    const membershipFind = jest.fn().mockResolvedValue([membership(1)]);
    const creatorFind = jest.fn().mockResolvedValue([]);
    const service = new CampaignOutreachAudienceReviewService(
      {
        getRepository: jest.fn(async (_workspaceId, objectName) =>
          objectName === 'campaignCreator'
            ? { find: membershipFind }
            : { find: creatorFind },
        ),
      } as never,
      { getSuppressedAddresses: jest.fn() } as never,
    );
    const manager = {} as any;
    manager.queryRunner = {
      isTransactionActive: true,
      isReleased: false,
      manager,
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([creator(1)])
        .mockResolvedValueOnce([]),
    };

    await expect(
      service.reviewInTransaction({
        workspaceId: 'workspace',
        campaignId,
        schemaName: 'workspace_schema',
        manager,
        rolePermissionConfig: { intersectionOf: ['restricted-role'] },
      }),
    ).resolves.toEqual({
      campaignId,
      eligible: [],
      excluded: [
        expect.objectContaining({
          campaignCreatorId: membershipId(1),
          creatorName: null,
          reasons: ['MISSING_CREATOR'],
        }),
      ],
    });
  });

  it('fails closed without an active transactional manager', async () => {
    const service = createService();

    await expect(
      service.reviewInTransaction({
        workspaceId: 'workspace',
        campaignId,
        schemaName: 'workspace_schema',
        manager: { queryRunner: undefined } as never,
        rolePermissionConfig: { intersectionOf: ['actor-role'] },
      }),
    ).rejects.toThrow('requires the active manager');
  });
});

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({ getWorkspaceContext: jest.fn() }),
);

const getWorkspaceContextMock = jest.mocked(getWorkspaceContext);

describe('CampaignOutreachWorkflowLifecycleService', () => {
  const workflowRepository = {
    delete: jest.fn(),
    find: jest.fn(),
    softDelete: jest.fn(),
  };
  const getRepository = jest.fn().mockResolvedValue(workflowRepository);
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => Promise<void>) => await callback(),
  );
  const globalWorkspaceOrmManager = {
    getRepository,
    executeInWorkspaceContext,
  } as unknown as GlobalWorkspaceOrmManager;
  const authContext = {
    type: 'system',
    workspace: { id: 'workspace-a' },
  } as never;
  const service = new CampaignOutreachWorkflowLifecycleWorkspaceService(
    globalWorkspaceOrmManager,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceContextMock.mockReturnValue({
      apiKeyRoleMap: {},
      authContext,
      userWorkspaceRoleMap: {},
    } as never);
  });

  describe('transactional parent precondition', () => {
    const campaignRepository = { find: jest.fn() };

    const createTransactionManager = (
      retainedWorkflows: Array<{ id: string }>,
    ) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'campaign-a' }, { id: 'campaign-b' }])
        .mockResolvedValueOnce(retainedWorkflows);

      return {
        entityManager: {
          getRepository: jest.fn(() => campaignRepository),
          queryRunner: { isTransactionActive: true, query },
        },
        query,
      };
    };

    it('locks sorted deduplicated Campaign IDs and rejects the complete batch before mutation', async () => {
      campaignRepository.find.mockResolvedValue([
        { id: 'campaign-a' },
        { id: 'campaign-b' },
      ]);
      const { entityManager, query } = createTransactionManager([
        { id: 'retained-workflow' },
      ]);

      await expect(
        service.assertCampaignDeletionAllowedInTransaction({
          authContext,
          campaignIds: ['campaign-b', 'campaign-a', 'campaign-b'],
          entityManager: entityManager as never,
          workspaceId: '20202020-0000-4000-8000-000000000001',
        }),
      ).rejects.toThrow(
        'Campaigns with outreach definitions cannot be deleted.',
      );

      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('pg_advisory_xact_lock'),
        ['20202020-0000-4000-8000-000000000001', 'campaign-a'],
      );
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('pg_advisory_xact_lock'),
        ['20202020-0000-4000-8000-000000000001', 'campaign-b'],
      );
      expect(query.mock.calls[2][0]).toContain('FOR UPDATE');
      expect(query.mock.calls[2][1]).toEqual([['campaign-a', 'campaign-b']]);
      expect(query.mock.calls[3][0]).toContain('"outreachCampaignId"');
    });

    it('permits a complete accessible no-outreach batch under the same transaction', async () => {
      campaignRepository.find.mockResolvedValue([
        { id: 'campaign-a' },
        { id: 'campaign-b' },
      ]);
      const { entityManager } = createTransactionManager([]);

      await expect(
        service.assertCampaignDeletionAllowedInTransaction({
          authContext,
          campaignIds: ['campaign-a', 'campaign-b'],
          entityManager: entityManager as never,
          workspaceId: '20202020-0000-4000-8000-000000000001',
        }),
      ).resolves.toBeUndefined();
    });

    it('fails closed without an active transaction', async () => {
      await expect(
        service.assertCampaignDeletionAllowedInTransaction({
          authContext,
          campaignIds: ['campaign-a'],
          entityManager: {
            queryRunner: { isTransactionActive: false },
          } as never,
          workspaceId: '20202020-0000-4000-8000-000000000001',
        }),
      ).rejects.toThrow('requires a transaction');
    });
  });

  it.each(['delete', 'destroy'] as const)(
    'rejects %s parent cascades for legacy Campaign outreach before mutation',
    async (operation) => {
      workflowRepository.find.mockResolvedValue([{ id: 'workflow-a' }]);

      await expect(
        service.handleCampaignDeletion({
          authContext,
          campaignIds: ['campaign-a'],
          operation,
          workspaceId: 'workspace-a',
        }),
      ).rejects.toThrow(
        'Campaigns with outreach definitions cannot be deleted.',
      );

      expect(workflowRepository.softDelete).not.toHaveBeenCalled();
      expect(workflowRepository.delete).not.toHaveBeenCalled();
      expect(workflowRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    },
  );

  it('rejects Campaign delete preflight when any retained outreach definition exists', async () => {
    workflowRepository.find.mockResolvedValue([
      { id: 'archived-legacy-workflow', deletedAt: new Date() },
      { id: 'sequence-workflow', deletedAt: null },
    ]);

    await expect(
      service.assertCampaignDeletionAllowed({
        authContext,
        campaignIds: ['campaign-a'],
        workspaceId: 'workspace-a',
      }),
    ).rejects.toThrow('Campaigns with outreach definitions cannot be deleted.');
  });

  it('permits parent deletion when Campaigns have no Outreach definition', async () => {
    workflowRepository.find.mockResolvedValue([]);

    await service.handleCampaignDeletion({
      authContext,
      campaignIds: ['campaign-a'],
      operation: 'delete',
      workspaceId: 'workspace-a',
    });
  });
});

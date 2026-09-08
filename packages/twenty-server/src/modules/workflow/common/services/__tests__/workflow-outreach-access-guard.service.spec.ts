import { WorkflowQueryValidationExceptionCode } from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { WorkflowOutreachAccessGuardService } from '../workflow-outreach-access-guard.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(),
  }),
);

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({
    getWorkspaceAuthContext: jest.fn(),
  }),
);

const getWorkspaceContextMock = jest.mocked(getWorkspaceContext);
const getWorkspaceAuthContextMock = jest.mocked(getWorkspaceAuthContext);

describe('WorkflowOutreachAccessGuardService', () => {
  const campaignRepository = { findOne: jest.fn() };
  const query = jest.fn();
  const getGlobalWorkspaceDataSource = jest.fn(async () => ({ query }));
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => Promise<void>) => callback(),
  );
  const getRepository = jest.fn(async () => campaignRepository);
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext,
    getGlobalWorkspaceDataSource,
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager;
  const service = new WorkflowOutreachAccessGuardService(
    globalWorkspaceOrmManager,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    getRepository.mockResolvedValue(campaignRepository);
    const authContext = {
      type: 'user',
      userWorkspaceId: 'user-workspace-a',
      workspace: { id: '20202020-0000-4000-8000-000000000001' },
    } as never;

    getWorkspaceAuthContextMock.mockReturnValue(authContext);
    getWorkspaceContextMock.mockReturnValue({
      apiKeyRoleMap: {},
      authContext,
      userWorkspaceRoleMap: { 'user-workspace-a': 'role-a' },
    } as never);
  });

  it('rejects an Outreach workflow whose Campaign is not readable', async () => {
    query.mockResolvedValue([{ outreachCampaignId: 'campaign-a' }]);
    campaignRepository.findOne.mockResolvedValue(null);

    await expect(
      service.assertWorkflowIsAccessible({
        workflowId: 'workflow-a',
        workspaceId: '20202020-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
    });
  });

  it('permits a general Automation without an ORM context', async () => {
    query.mockResolvedValue([{ outreachCampaignId: null }]);
    getRepository.mockRejectedValue(new Error('Workspace context not set'));

    await expect(
      service.assertWorkflowIsAccessible({
        workflowId: 'workflow-a',
        workspaceId: '20202020-0000-4000-8000-000000000001',
      }),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"workflow"'),
      ['workflow-a'],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    expect(getRepository).not.toHaveBeenCalled();
    expect(getWorkspaceAuthContextMock).not.toHaveBeenCalled();
    expect(executeInWorkspaceContext).not.toHaveBeenCalled();
  });

  it('establishes ORM context from the query auth context for Outreach authorization', async () => {
    query.mockResolvedValue([{ outreachCampaignId: 'campaign-a' }]);
    campaignRepository.findOne.mockResolvedValue({ id: 'campaign-a' });
    const authContext = {
      type: 'user',
      userWorkspaceId: 'user-workspace-a',
      workspace: { id: '20202020-0000-4000-8000-000000000001' },
    } as never;

    await service.assertWorkflowIsAccessible({
      authContext,
      workflowId: 'workflow-a',
      workspaceId: '20202020-0000-4000-8000-000000000001',
    });

    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      authContext,
    );
  });

  it('rejects an Outreach workflow version whose Campaign is not readable', async () => {
    query.mockResolvedValue([{ outreachCampaignId: 'campaign-a' }]);
    campaignRepository.findOne.mockResolvedValue(null);

    await expect(
      service.assertWorkflowVersionIsAccessible({
        workflowVersionId: 'workflow-version-a',
        workspaceId: '20202020-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"workflowVersion"'),
      ['workflow-version-a'],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  });

  it('permits general Automation versions and runs without an ORM context', async () => {
    query.mockResolvedValue([{ outreachCampaignId: null }]);
    getRepository.mockRejectedValue(new Error('Workspace context not set'));

    await service.assertWorkflowVersionIsAccessible({
      workflowVersionId: 'workflow-version-a',
      workspaceId: '20202020-0000-4000-8000-000000000001',
    });
    await service.assertWorkflowRunIsAccessible({
      workflowRunId: 'workflow-run-a',
      workspaceId: '20202020-0000-4000-8000-000000000001',
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('"workflowVersion"'),
      ['workflow-version-a'],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"workflowRun"'),
      ['workflow-run-a'],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    expect(getRepository).not.toHaveBeenCalled();
    expect(getWorkspaceAuthContextMock).not.toHaveBeenCalled();
    expect(executeInWorkspaceContext).not.toHaveBeenCalled();
  });

  it('permits only a legacy Campaign version for the replacement lifecycle', async () => {
    query.mockResolvedValue([
      { outreachCampaignId: 'campaign-a', campaignSequence: null },
    ]);

    await expect(
      service.assertLegacyCampaignWorkflowVersionReplacementAllowed({
        workflowVersionId: 'workflow-version-a',
        workspaceId: '20202020-0000-4000-8000-000000000001',
      }),
    ).resolves.toBeUndefined();
  });

  it('permits only a run of a legacy Campaign version for replacement cleanup', async () => {
    query.mockResolvedValue([
      { outreachCampaignId: 'campaign-a', campaignSequence: null },
    ]);

    await expect(
      service.assertLegacyCampaignWorkflowRunReplacementAllowed({
        workflowRunId: 'workflow-run-a',
        workspaceId: '20202020-0000-4000-8000-000000000001',
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    { rows: [{ outreachCampaignId: null, campaignSequence: null }] },
    {
      rows: [
        {
          outreachCampaignId: 'campaign-a',
          campaignSequence: { nodes: [] },
        },
      ],
    },
    { rows: [] },
  ])(
    'rejects non-legacy replacement lifecycle ownership: $rows',
    async ({ rows }) => {
      query.mockResolvedValue(rows);

      await expect(
        service.assertLegacyCampaignWorkflowVersionReplacementAllowed({
          workflowVersionId: 'workflow-version-a',
          workspaceId: '20202020-0000-4000-8000-000000000001',
        }),
      ).rejects.toMatchObject({
        code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
      });
    },
  );

  describe('workflow run batch generic mutation guard', () => {
    const invoke = () =>
      service.assertGenericWorkflowRunMutationsAllowed({
        workflowRunIds: ['run-a', 'run-b', 'run-a'],
        workspaceId: '20202020-0000-4000-8000-000000000001',
      });

    it('preflights the complete deduplicated ordinary batch in one persisted query', async () => {
      query.mockResolvedValue([
        { id: 'run-a', outreachCampaignId: null },
        { id: 'run-b', outreachCampaignId: null },
      ]);

      await expect(invoke()).resolves.toBeUndefined();

      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('source.id = ANY($1::uuid[])'),
        [['run-a', 'run-b']],
        undefined,
        { shouldBypassPermissionChecks: true },
      );
    });

    it('rejects the whole batch when one run is Campaign-owned', async () => {
      query.mockResolvedValue([
        { id: 'run-a', outreachCampaignId: null },
        { id: 'run-b', outreachCampaignId: 'campaign-a' },
      ]);

      await expect(invoke()).rejects.toThrow(
        'Use the Campaign sequence editor.',
      );
    });

    it('fails closed when any requested run is missing', async () => {
      query.mockResolvedValue([{ id: 'run-a', outreachCampaignId: null }]);

      await expect(invoke()).rejects.toMatchObject({
        code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
      });
    });
  });

  describe.each([
    [
      'workflow',
      'assertGenericWorkflowMutationAllowed',
      'workflowId',
      'workflow-a',
    ],
    [
      'workflow version',
      'assertGenericWorkflowVersionMutationAllowed',
      'workflowVersionId',
      'workflow-version-a',
    ],
    [
      'workflow run',
      'assertGenericWorkflowRunMutationAllowed',
      'workflowRunId',
      'workflow-run-a',
    ],
  ] as const)('%s generic mutation guard', (_label, method, idKey, id) => {
    const invoke = () =>
      (
        (service as unknown as Record<string, unknown>)[method] as (
          args: Record<string, string>,
        ) => Promise<void>
      )({
        [idKey]: id,
        workspaceId: '20202020-0000-4000-8000-000000000001',
      });

    it('rejects persisted Campaign ownership without consulting Campaign read access', async () => {
      query.mockResolvedValue([{ outreachCampaignId: 'campaign-a' }]);

      await expect(invoke()).rejects.toThrow(
        'Use the Campaign sequence editor.',
      );

      expect(getRepository).not.toHaveBeenCalled();
      expect(executeInWorkspaceContext).not.toHaveBeenCalled();
    });

    it('permits an existing general Automation record', async () => {
      query.mockResolvedValue([{ outreachCampaignId: null }]);

      await expect(invoke()).resolves.toBeUndefined();
    });

    it('fails closed when the persisted owner record is missing or deleted', async () => {
      query.mockResolvedValue([]);

      await expect(invoke()).rejects.toMatchObject({
        code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
      });
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import {
  WorkflowVersionEventType,
  WorkflowStatusesUpdateJob,
} from 'src/modules/workflow/workflow-status/jobs/workflow-statuses-update.job';
import { CampaignSequenceService } from '../campaign-sequence.service';

const workspaceId = '20202020-1111-4111-8111-111111111111';
const otherWorkspaceId = '20202020-2222-4222-8222-222222222222';
const campaignId = '20202020-3333-4333-8333-333333333333';
const workflowId = '20202020-4444-4444-8444-444444444444';
const versionId = '20202020-5555-4555-8555-555555555555';
const nextVersionId = '20202020-6666-4666-8666-666666666666';
const messageId = '20202020-7777-4777-8777-777777777777';
const rolePermissionConfig = { unionOf: ['role-id'] };
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: 'user-workspace-id',
  workspaceMemberId: 'workspace-member-id',
  user: {},
  workspaceMember: {},
} as WorkspaceAuthContext;

const sequence = {
  schemaVersion: 1 as const,
  messages: [
    {
      id: messageId,
      channel: 'EMAIL' as const,
      subject: 'Hello',
      body: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] },
        ],
      }),
      files: [],
      replyToThread: false,
    },
  ],
  delaysSeconds: [],
};

let canUpdateCampaign = true;

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      apiKeyRoleMap: {},
      authContext,
      objectIdByNameSingular: { campaign: 'campaign-object-id' },
      permissionsPerRoleId: {
        'role-id': {
          'campaign-object-id': {
            canReadObjectRecords: true,
            get canUpdateObjectRecords() {
              return canUpdateCampaign;
            },
          },
        },
      },
      userWorkspaceRoleMap: new Map(),
    })),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => rolePermissionConfig),
  }),
);

jest.mock(
  'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager',
  () => ({ GlobalWorkspaceOrmManager: class {} }),
);

const createContext = () => {
  const queryRunner = {
    query: jest.fn<Promise<unknown[]>, [string, unknown[]?]>(async (query) => {
      if (query.includes('SELECT DISTINCT') && query.includes('"status"')) {
        return [{ status: WorkflowVersionStatus.DRAFT }];
      }
      if (
        query.includes('INSERT INTO') &&
        query.includes('"workflowVersion"')
      ) {
        return [{ id: nextVersionId }];
      }
      if (query.includes('INSERT INTO') && query.includes('"workflow"')) {
        return [{ id: workflowId }];
      }
      if (query.includes('UPDATE') && query.includes('"workflowVersion"')) {
        return [{ id: versionId }];
      }
      return [];
    }),
  };
  const manager = { queryRunner };
  const campaignRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: campaignId,
      lifecycleStatus: 'DRAFT',
    }),
  };
  const workflowRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: workflowId,
      name: 'Campaign Outreach',
      outreachCampaignId: campaignId,
      lastPublishedVersionId: null,
    }),
    insert: jest
      .fn()
      .mockResolvedValue({ generatedMaps: [{ id: workflowId }] }),
  };
  const workflowVersionRepository = {
    find: jest.fn().mockResolvedValue([
      {
        id: versionId,
        workflowId,
        name: 'v1',
        position: 0,
        status: WorkflowVersionStatus.DRAFT,
        campaignSequence: sequence,
      },
    ]),
    insert: jest
      .fn()
      .mockResolvedValue({ generatedMaps: [{ id: nextVersionId }] }),
    update: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
      callback(manager),
    ),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
    getRepository: jest.fn(async (_workspace: string, objectName: string) => {
      if (objectName === 'campaign') return campaignRepository;
      if (objectName === 'workflow') return workflowRepository;
      return workflowVersionRepository;
    }),
  };
  const workflowQueue = { add: jest.fn() };
  const service = new CampaignSequenceService(
    globalWorkspaceOrmManager as never,
    workflowQueue as never,
  );

  return {
    campaignRepository,
    dataSource,
    globalWorkspaceOrmManager,
    manager,
    queryRunner,
    service,
    workflowQueue,
    workflowRepository,
    workflowVersionRepository,
  };
};

beforeEach(() => {
  canUpdateCampaign = true;
});

describe('CampaignSequenceService', () => {
  it('loads ABSENT without creating a workflow', async () => {
    const { service, workflowRepository, workflowVersionRepository } =
      createContext();
    workflowRepository.findOne.mockResolvedValue(null);

    await expect(
      service.load({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual({ kind: 'ABSENT', campaignId });
    expect(workflowVersionRepository.find).not.toHaveBeenCalled();
    expect(workflowRepository.insert).not.toHaveBeenCalled();
  });

  it('loads an explicitly replaceable null sequence as LEGACY', async () => {
    const { service, workflowVersionRepository } = createContext();
    workflowVersionRepository.find.mockResolvedValue([
      {
        id: versionId,
        workflowId,
        status: WorkflowVersionStatus.DRAFT,
        campaignSequence: null,
      },
    ]);

    await expect(
      service.load({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual({ kind: 'LEGACY', campaignId, workflowId });
  });

  it('rejects a Workflow definition with no authoring or published version', async () => {
    const { service, workflowVersionRepository } = createContext();
    workflowVersionRepository.find.mockResolvedValue([]);

    await expect(
      service.load({ authContext, campaignId, workspaceId }),
    ).rejects.toThrow('Campaign sequence version is missing');
  });

  it('loads a strict sequence snapshot with validation issues', async () => {
    const { service } = createContext();

    await expect(
      service.load({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual({
      kind: 'SEQUENCE',
      snapshot: {
        campaignId,
        workflowId,
        versionId,
        sequence,
        lifecycleStatus: 'DRAFT',
        editable: true,
        issues: [],
      },
    });
  });

  it('loads readable Draft content as non-editable without Campaign update permission', async () => {
    const { service } = createContext();
    canUpdateCampaign = false;

    await expect(
      service.load({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual({
      kind: 'SEQUENCE',
      snapshot: expect.objectContaining({
        sequence,
        lifecycleStatus: 'DRAFT',
        editable: false,
      }),
    });
  });

  it('rejects malformed persisted non-null sequence data as an integrity error', async () => {
    const { service, workflowVersionRepository } = createContext();
    workflowVersionRepository.find.mockResolvedValue([
      {
        id: versionId,
        workflowId,
        status: WorkflowVersionStatus.DRAFT,
        campaignSequence: { ...sequence, unexpected: true },
      },
    ]);

    await expect(
      service.load({ authContext, campaignId, workspaceId }),
    ).rejects.toThrow('Campaign sequence data is invalid');
  });

  it('rejects inaccessible and cross-workspace Campaign scopes', async () => {
    const { campaignRepository, service } = createContext();
    campaignRepository.findOne.mockResolvedValue(null);

    await expect(
      service.load({ authContext, campaignId, workspaceId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.load({
        authContext,
        campaignId,
        workspaceId: otherWorkspaceId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('strictly rejects malicious payload keys before opening a transaction', async () => {
    const { dataSource, service } = createContext();

    await expect(
      service.save({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        sequence: { ...sequence, editable: true } as never,
        workspaceId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('requires Campaign update permission for create, save, and validate', async () => {
    const { dataSource, service } = createContext();
    canUpdateCampaign = false;

    await expect(
      service.assertCampaignSequenceReplacementAllowed({
        authContext,
        campaignId,
        workspaceId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createInitial({ authContext, campaignId, workspaceId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.save({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        sequence,
        workspaceId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.validate({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        workspaceId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each([null, 'UNKNOWN', 'ACTIVE', 'PAUSED', 'COMPLETED', 'DEACTIVATED'])(
    'rejects save while Campaign lifecycle is %p',
    async (lifecycleStatus) => {
      const { campaignRepository, service, workflowVersionRepository } =
        createContext();
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        lifecycleStatus,
      });

      await expect(
        service.save({
          authContext,
          campaignId,
          expectedVersionId: versionId,
          sequence,
          workspaceId,
        }),
      ).rejects.toThrow('Stop Campaign outreach before editing.');
      expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
    },
  );

  it('fails closed for STOPPED until a trusted lifecycle integration supplies it', async () => {
    const { campaignRepository, service } = createContext();
    campaignRepository.findOne.mockResolvedValue({
      id: campaignId,
      lifecycleStatus: 'STOPPED',
    });

    await expect(
      service.save({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        sequence,
        workspaceId,
      }),
    ).rejects.toThrow('Stop Campaign outreach before editing.');
  });

  it('saves a new immutable draft with same-runner SQL and archives only the superseded authoring version', async () => {
    const {
      campaignRepository,
      manager,
      queryRunner,
      service,
      workflowQueue,
      workflowRepository,
      workflowVersionRepository,
    } = createContext();
    const edited = {
      ...sequence,
      messages: [{ ...sequence.messages[0], subject: '' }],
    };

    await expect(
      service.save({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        sequence: edited,
        workspaceId,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        campaignId,
        workflowId,
        versionId: nextVersionId,
        sequence: edited,
        lifecycleStatus: 'DRAFT',
        editable: true,
        issues: [expect.objectContaining({ code: 'CONTENT_REQUIRED' })],
      }),
    );

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [workspaceId, campaignId],
    );
    expect(campaignRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      manager,
    );
    expect(workflowRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      manager,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      [versionId, workflowId],
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO'),
      expect.arrayContaining([
        workflowId,
        WorkflowVersionStatus.DRAFT,
        JSON.stringify(edited),
      ]),
    );
    expect(workflowVersionRepository.update).not.toHaveBeenCalled();
    expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
    expect(workflowQueue.add).toHaveBeenCalledWith(
      WorkflowStatusesUpdateJob.name,
      {
        type: WorkflowVersionEventType.CREATE,
        workspaceId,
        workflowIds: [workflowId],
      },
    );
  });

  it.each([WorkflowVersionStatus.ACTIVE, WorkflowVersionStatus.DEACTIVATED])(
    'preserves a published %s version when starting a new authoring draft',
    async (publishedStatus) => {
      const {
        queryRunner,
        service,
        workflowRepository,
        workflowVersionRepository,
      } = createContext();
      workflowRepository.findOne.mockResolvedValue({
        id: workflowId,
        name: 'Campaign Outreach',
        outreachCampaignId: campaignId,
        lastPublishedVersionId: versionId,
      });
      workflowVersionRepository.find.mockResolvedValue([
        {
          id: versionId,
          workflowId,
          name: 'v1',
          position: 0,
          status: publishedStatus,
          campaignSequence: sequence,
        },
      ]);

      await expect(
        service.save({
          authContext,
          campaignId,
          expectedVersionId: versionId,
          sequence,
          workspaceId,
        }),
      ).resolves.toEqual(expect.objectContaining({ versionId: nextVersionId }));

      const versionSqlCalls = queryRunner.query.mock.calls.filter(
        ([query]) =>
          typeof query === 'string' && query.includes('"workflowVersion"'),
      );
      expect(
        versionSqlCalls.filter(([query]) =>
          (query as string).trimStart().startsWith('UPDATE'),
        ),
      ).toHaveLength(0);
      expect(
        versionSqlCalls.filter(([query]) =>
          (query as string).trimStart().startsWith('INSERT'),
        ),
      ).toHaveLength(1);
      expect(workflowVersionRepository.update).not.toHaveBeenCalled();
      expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
    },
  );

  it('rejects a stale expected version without inserting', async () => {
    const { service, workflowVersionRepository } = createContext();

    await expect(
      service.save({
        authContext,
        campaignId,
        expectedVersionId: nextVersionId,
        sequence,
        workspaceId,
      }),
    ).rejects.toEqual(
      new ConflictException('Sequence changed. Reload before saving.'),
    );
    expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
  });

  it('validates the exact current revision without writing', async () => {
    const { service, workflowVersionRepository } = createContext();

    await expect(
      service.validate({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        workspaceId,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ versionId, sequence, issues: [] }),
    );
    expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
    expect(workflowVersionRepository.update).not.toHaveBeenCalled();
  });

  it('returns an existing immutable definition without inserting on repeated creation', async () => {
    const { service, workflowRepository, workflowVersionRepository } =
      createContext();

    await expect(
      service.createInitial({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual(expect.objectContaining({ versionId, sequence }));
    expect(workflowRepository.insert).not.toHaveBeenCalled();
    expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
  });

  it('creates one empty sequence definition with same-runner SQL', async () => {
    const {
      queryRunner,
      service,
      workflowQueue,
      workflowRepository,
      workflowVersionRepository,
    } = createContext();
    workflowRepository.findOne.mockResolvedValueOnce(null);
    workflowVersionRepository.find.mockResolvedValueOnce([]);

    await expect(
      service.createInitial({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual(
      expect.objectContaining({
        campaignId,
        workflowId,
        versionId: nextVersionId,
        sequence: { schemaVersion: 1, messages: [], delaysSeconds: [] },
      }),
    );
    expect(workflowRepository.insert).not.toHaveBeenCalled();
    expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('"workflow"'),
      ['Campaign Outreach', campaignId, 0],
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('"workflowVersion"'),
      [
        'v1',
        workflowId,
        0,
        WorkflowVersionStatus.DRAFT,
        JSON.stringify({
          schemaVersion: 1,
          messages: [],
          delaysSeconds: [],
        }),
      ],
    );
    expect(workflowQueue.add).toHaveBeenCalledWith(
      WorkflowStatusesUpdateJob.name,
      {
        type: WorkflowVersionEventType.CREATE,
        workspaceId,
        workflowIds: [workflowId],
      },
    );
  });

  it('keeps a committed save successful and its canonical status projection current when post-commit queueing fails', async () => {
    const { queryRunner, service, workflowQueue } = createContext();
    const diagnosticSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    queryRunner.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT DISTINCT') && query.includes('"status"')) {
        return [
          { status: WorkflowVersionStatus.DEACTIVATED },
          { status: WorkflowVersionStatus.DRAFT },
          { status: WorkflowVersionStatus.ACTIVE },
        ];
      }
      if (
        query.includes('INSERT INTO') &&
        query.includes('"workflowVersion"')
      ) {
        return [{ id: nextVersionId }];
      }
      return [];
    });
    workflowQueue.add.mockRejectedValueOnce(
      new Error('injected workflow queue failure'),
    );

    await expect(
      service.save({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        sequence,
        workspaceId,
      }),
    ).resolves.toEqual(expect.objectContaining({ versionId: nextVersionId }));
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT DISTINCT[\s\S]+"deletedAt" IS NULL/),
      [workflowId],
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      [workflowId, ['DRAFT', 'ACTIVE']],
    );
    expect(diagnosticSpy).toHaveBeenCalledWith(
      expect.stringContaining(workflowId),
      expect.stringContaining('injected workflow queue failure'),
    );
    diagnosticSpy.mockRestore();
  });

  it('keeps a committed initial creation successful with a Draft projection when post-commit queueing fails', async () => {
    const { queryRunner, service, workflowQueue, workflowRepository } =
      createContext();
    const diagnosticSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    workflowRepository.findOne.mockResolvedValueOnce(null);
    workflowQueue.add.mockRejectedValueOnce(
      new Error('injected workflow queue failure'),
    );

    await expect(
      service.createInitial({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual(expect.objectContaining({ versionId: nextVersionId }));
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      [workflowId, ['DRAFT']],
    );
    expect(diagnosticSpy).toHaveBeenCalledWith(
      expect.stringContaining(workflowId),
      expect.stringContaining('injected workflow queue failure'),
    );
    diagnosticSpy.mockRestore();
  });

  it('does not enqueue synchronization until the save transaction commits', async () => {
    const { dataSource, manager, service, workflowQueue } = createContext();
    let releaseCommit!: () => void;
    let transactionCallbackCompleted!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const callbackCompleted = new Promise<void>((resolve) => {
      transactionCallbackCompleted = resolve;
    });
    dataSource.transaction.mockImplementation(
      async (callback: (transactionManager: unknown) => unknown) => {
        const result = await callback(manager);
        transactionCallbackCompleted();
        await commitGate;
        return result;
      },
    );

    const saving = service.save({
      authContext,
      campaignId,
      expectedVersionId: versionId,
      sequence,
      workspaceId,
    });
    await callbackCompleted;

    expect(workflowQueue.add).not.toHaveBeenCalled();
    releaseCommit();
    await expect(saving).resolves.toEqual(
      expect.objectContaining({ versionId: nextVersionId }),
    );
    expect(workflowQueue.add).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue synchronization when same-runner persistence rolls back', async () => {
    const { queryRunner, service, workflowQueue } = createContext();
    queryRunner.query.mockImplementation(async (query: string) => {
      if (
        query.includes('INSERT INTO') &&
        query.includes('"workflowVersion"')
      ) {
        throw new Error('injected successor insert failure');
      }
      return [];
    });

    await expect(
      service.save({
        authContext,
        campaignId,
        expectedVersionId: versionId,
        sequence,
        workspaceId,
      }),
    ).rejects.toThrow('injected successor insert failure');
    expect(workflowQueue.add).not.toHaveBeenCalled();
  });
});

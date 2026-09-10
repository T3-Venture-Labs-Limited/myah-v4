import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
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
const secondMessageId = '20202020-8888-4888-8888-888888888888';
const firstFileId = '20202020-9999-4999-8999-999999999999';
const secondFileId = '20202020-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

const MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES = 1_048_576;

const executableSequence = {
  ...sequence,
  messages: [
    sequence.messages[0],
    {
      ...sequence.messages[0],
      id: secondMessageId,
      files: [],
      replyToThread: true,
      subject: 'Follow up',
    },
  ],
  delaysSeconds: [17],
};

const serializedBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), 'utf8');

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

const createTrapCountingProxy = <T extends object>(target: T) => {
  let structuralTrapCount = 0;
  let thenTrapCount = 0;
  const countStructuralTrap = () => {
    structuralTrapCount += 1;
  };
  const proxy = new Proxy(target, {
    get(targetValue, property, receiver) {
      if (property === 'then') {
        thenTrapCount += 1;
      } else {
        countStructuralTrap();
      }
      return Reflect.get(targetValue, property, receiver);
    },
    getOwnPropertyDescriptor(...parameters) {
      countStructuralTrap();
      return Reflect.getOwnPropertyDescriptor(...parameters);
    },
    getPrototypeOf(value) {
      countStructuralTrap();
      return Reflect.getPrototypeOf(value);
    },
    ownKeys(value) {
      countStructuralTrap();
      return Reflect.ownKeys(value);
    },
  });

  return {
    proxy,
    structuralTrapCount: () => structuralTrapCount,
    thenTrapCount: () => thenTrapCount,
  };
};

const createExecutionContext = ({
  campaignRows = [{ id: campaignId }],
  campaignResult = campaignRows,
  workflowRows = [
    {
      id: workflowId,
      outreachCampaignId: campaignId,
      lastPublishedVersionId: versionId,
    },
  ],
  versionRows = [
    {
      id: versionId,
      workflowId,
      status: WorkflowVersionStatus.ACTIVE,
      campaignSequenceBytes: serializedBytes(executableSequence),
      campaignSequence: executableSequence,
    },
  ],
  workflowResult = workflowRows,
  versionResult = versionRows,
}: {
  campaignRows?: unknown[];
  campaignResult?: unknown;
  workflowRows?: unknown[];
  workflowResult?: unknown;
  versionRows?: unknown[];
  versionResult?: unknown;
} = {}) => {
  const queryRunner = {
    isReleased: false,
    isTransactionActive: true,
    query: jest.fn<Promise<unknown>, [string, unknown[]?]>(async (query) => {
      if (query.includes('"campaign"')) return campaignResult;
      if (query.includes('"workflowVersion"')) return versionResult;
      if (query.includes('"workflow"')) return workflowResult;

      throw new Error('Unexpected execution-plan query');
    }),
  };
  const manager = {
    getRepository: jest.fn(),
    queryRunner,
    transaction: jest.fn(),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(),
    getGlobalWorkspaceDataSource: jest.fn(),
    getRepository: jest.fn(),
  };
  const workflowQueue = { add: jest.fn() };
  const service = new CampaignSequenceService(
    globalWorkspaceOrmManager as never,
    workflowQueue as never,
  );

  return {
    globalWorkspaceOrmManager,
    manager,
    queryRunner,
    service,
    workflowQueue,
  };
};

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
  const workflowVersion = {
    id: versionId,
    workflowId,
    name: 'v1',
    position: 0,
    status: WorkflowVersionStatus.DRAFT,
    campaignSequence: sequence,
  };
  const workflowVersionRepository = {
    find: jest.fn().mockResolvedValue([workflowVersion]),
    findOne: jest.fn().mockResolvedValue(workflowVersion),
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

  describe('loadEmailByVersion', () => {
    const loadArgs = {
      authContext,
      campaignId,
      messageId,
      workflowVersionId: versionId,
      workspaceId,
    };

    it('loads the exact historical Email with authored file order and no side effects', async () => {
      const {
        dataSource,
        queryRunner,
        service,
        workflowQueue,
        workflowVersionRepository,
      } = createContext();
      const files = [
        {
          id: firstFileId,
          name: 'first.pdf',
          size: 10,
          type: 'application/pdf',
          createdAt: '2026-09-08T00:00:00.000Z',
        },
        {
          id: secondFileId,
          name: 'second.png',
          size: 20,
          type: 'image/png',
          createdAt: '2026-09-08T00:00:01.000Z',
        },
      ];
      const historicalSequence = {
        ...sequence,
        messages: [
          { ...sequence.messages[0], id: secondMessageId },
          {
            ...sequence.messages[0],
            files,
            replyToThread: true,
            subject: '',
          },
        ],
        delaysSeconds: [1],
      };
      workflowVersionRepository.find.mockResolvedValue([
        {
          id: nextVersionId,
          workflowId,
          status: WorkflowVersionStatus.DRAFT,
          campaignSequence: sequence,
        },
      ]);
      workflowVersionRepository.findOne.mockResolvedValue({
        id: versionId,
        workflowId,
        status: WorkflowVersionStatus.DEACTIVATED,
        campaignSequence: historicalSequence,
      });

      await expect(service.loadEmailByVersion(loadArgs)).resolves.toEqual({
        workspaceId,
        campaignId,
        workflowId,
        workflowVersionId: versionId,
        messageId,
        subject: '',
        body: sequence.messages[0].body,
        files,
        replyToThread: true,
        issues: [
          expect.objectContaining({
            code: 'CONTENT_REQUIRED',
            messageId,
            path: 'messages.1.subject',
          }),
        ],
      });
      expect(workflowVersionRepository.findOne).toHaveBeenCalledWith({
        where: { id: versionId, workflowId },
      });
      expect(workflowVersionRepository.find).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(queryRunner.query).not.toHaveBeenCalled();
      expect(workflowQueue.add).not.toHaveBeenCalled();
    });

    it.each([
      ['workflowVersionId', 'not-a-version-id'],
      ['messageId', 'not-a-message-id'],
    ])(
      'rejects malformed %s before repository access',
      async (field, value) => {
        const { campaignRepository, service } = createContext();

        await expect(
          service.loadEmailByVersion({ ...loadArgs, [field]: value }),
        ).rejects.toEqual(new BadRequestException(`${field} must be a UUID`));
        expect(campaignRepository.findOne).not.toHaveBeenCalled();
      },
    );

    it('fails closed for cross-workspace and inaccessible Campaign scopes', async () => {
      const { campaignRepository, service } = createContext();

      await expect(
        service.loadEmailByVersion({
          ...loadArgs,
          workspaceId: otherWorkspaceId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(campaignRepository.findOne).not.toHaveBeenCalled();

      campaignRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.loadEmailByVersion(loadArgs)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects an absent Campaign Workflow or unrelated immutable version', async () => {
      const { service, workflowRepository, workflowVersionRepository } =
        createContext();
      workflowRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.loadEmailByVersion(loadArgs)).rejects.toEqual(
        new NotFoundException('Campaign sequence version not found'),
      );
      expect(workflowVersionRepository.findOne).not.toHaveBeenCalled();

      workflowVersionRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.loadEmailByVersion(loadArgs)).rejects.toEqual(
        new NotFoundException('Campaign sequence version not found'),
      );
    });

    it('rejects legacy and malformed persisted versions', async () => {
      const { service, workflowVersionRepository } = createContext();
      workflowVersionRepository.findOne.mockResolvedValueOnce({
        id: versionId,
        workflowId,
        campaignSequence: null,
      });

      await expect(service.loadEmailByVersion(loadArgs)).rejects.toEqual(
        new ConflictException('Campaign sequence version is legacy'),
      );

      workflowVersionRepository.findOne.mockResolvedValueOnce({
        id: versionId,
        workflowId,
        campaignSequence: { ...sequence, unexpected: true },
      });
      await expect(service.loadEmailByVersion(loadArgs)).rejects.toEqual(
        new InternalServerErrorException('Campaign sequence data is invalid'),
      );
    });

    it('rejects a missing or non-Email message', async () => {
      const { service, workflowVersionRepository } = createContext();

      await expect(
        service.loadEmailByVersion({ ...loadArgs, messageId: secondMessageId }),
      ).rejects.toEqual(
        new NotFoundException('Campaign sequence email not found'),
      );

      workflowVersionRepository.findOne.mockResolvedValueOnce({
        id: versionId,
        workflowId,
        campaignSequence: {
          schemaVersion: 1,
          messages: [
            { id: messageId, channel: 'INSTAGRAM', text: 'Hello there' },
          ],
          delaysSeconds: [],
        },
      });
      await expect(service.loadEmailByVersion(loadArgs)).rejects.toEqual(
        new ConflictException('Campaign sequence message is not an email'),
      );
    });

    it('treats duplicate stable message IDs as invalid persisted data', async () => {
      const { service, workflowVersionRepository } = createContext();
      workflowVersionRepository.findOne.mockResolvedValueOnce({
        id: versionId,
        workflowId,
        campaignSequence: {
          ...sequence,
          messages: [sequence.messages[0], sequence.messages[0]],
          delaysSeconds: [1],
        },
      });

      await expect(service.loadEmailByVersion(loadArgs)).rejects.toEqual(
        new InternalServerErrorException('Campaign sequence data is invalid'),
      );
    });
  });

  describe('loadExecutionPlanInTransaction', () => {
    const args = { campaignId, workflowVersionId: versionId, workspaceId };

    it.each([
      ['missing', undefined],
      [
        'inactive',
        { isReleased: false, isTransactionActive: false, query: jest.fn() },
      ],
      [
        'released',
        { isReleased: true, isTransactionActive: true, query: jest.fn() },
      ],
    ])(
      'requires a non-released active query runner (%s)',
      async (_, runner) => {
        const { service } = createExecutionContext();
        const manager = { queryRunner: runner };

        await expect(
          service.loadExecutionPlanInTransaction(
            { ...args, workspaceId: 'not-a-uuid' },
            manager as never,
          ),
        ).rejects.toEqual(
          new InternalServerErrorException(
            'Campaign sequence execution plan requires an active transaction',
          ),
        );
        if (runner) expect(runner.query).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['workspaceId', 'not-a-workspace'],
      ['campaignId', 'not-a-campaign'],
      ['workflowVersionId', 'not-a-version'],
    ])('rejects malformed %s before issuing a query', async (field, value) => {
      const { manager, queryRunner, service } = createExecutionContext();

      await expect(
        service.loadExecutionPlanInTransaction(
          { ...args, [field]: value },
          manager as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(queryRunner.query).not.toHaveBeenCalled();
    });

    it('returns a canonical, authored-order, deeply frozen execution plan using only the supplied manager runner', async () => {
      const {
        globalWorkspaceOrmManager,
        manager,
        queryRunner,
        service,
        workflowQueue,
      } = createExecutionContext();

      const result = await service.loadExecutionPlanInTransaction(
        args,
        manager as never,
      );

      expect(result).toEqual({
        kind: 'READY',
        workspaceId,
        campaignId,
        workflowId,
        workflowVersionId: versionId,
        nodes: [
          { messageId, channel: 'EMAIL', replyToThread: false },
          { messageId: secondMessageId, channel: 'EMAIL', replyToThread: true },
        ],
        delaysSeconds: [17],
      });
      expect(Object.isFrozen(result)).toBe(true);
      if (result.kind !== 'READY') throw new Error('Expected READY');
      expect(Object.isFrozen(result.nodes)).toBe(true);
      expect(result.nodes.every(Object.isFrozen)).toBe(true);
      expect(Object.isFrozen(result.delaysSeconds)).toBe(true);
      expect(queryRunner.query).toHaveBeenCalledTimes(3);
      expect(
        queryRunner.query.mock.calls.map(([, parameters]) => parameters),
      ).toEqual([
        [campaignId],
        [campaignId],
        [versionId, workflowId, MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES],
      ]);
      expect(
        queryRunner.query.mock.calls.some(([query]) =>
          /\b(INSERT|UPDATE|DELETE|FOR\s+UPDATE|LOCK)\b|pg_advisory/i.test(
            query,
          ),
        ),
      ).toBe(false);
      expect(manager.getRepository).not.toHaveBeenCalled();
      expect(manager.transaction).not.toHaveBeenCalled();
      expect(globalWorkspaceOrmManager.getRepository).not.toHaveBeenCalled();
      expect(
        globalWorkspaceOrmManager.getGlobalWorkspaceDataSource,
      ).not.toHaveBeenCalled();
      expect(
        globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
      expect(workflowQueue.add).not.toHaveBeenCalled();
    });

    it('accepts the strict PostgreSQL tuple result shape and null-prototype rows', async () => {
      const campaignRow = Object.assign(Object.create(null), {
        id: campaignId,
      });
      const { manager, service } = createExecutionContext({
        campaignResult: [[campaignRow], 1],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual(expect.objectContaining({ kind: 'READY' }));
    });

    it.each([
      [
        'just below',
        MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES - 1,
        executableSequence,
        'READY',
      ],
      [
        'equal to',
        MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
        executableSequence,
        'READY',
      ],
      [
        'above',
        MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES + 1,
        null,
        'BLOCKED_DEPENDENCY_INTEGRITY',
      ],
    ] as const)(
      'applies the SQL byte gate when sequence size is %s the limit',
      async (_, campaignSequenceBytes, campaignSequence, expectedKind) => {
        const { manager, queryRunner, service } = createExecutionContext({
          versionRows: [
            {
              id: versionId,
              workflowId,
              status: WorkflowVersionStatus.ACTIVE,
              campaignSequenceBytes,
              campaignSequence,
            },
          ],
        });

        const result = await service.loadExecutionPlanInTransaction(
          args,
          manager as never,
        );

        expect(result.kind).toBe(expectedKind);
        if (campaignSequenceBytes > MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES) {
          expect(result).toEqual({
            kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
            reason: 'SEQUENCE_MALFORMED',
          });
        }
        expect(queryRunner.query).toHaveBeenNthCalledWith(
          3,
          expect.stringMatching(
            /octet_length\("campaignSequence"::text\)[\s\S]+CASE[\s\S]+<= \$3/,
          ),
          [versionId, workflowId, MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES],
        );
      },
    );

    it('canonicalizes every UUID input and returned database UUID', async () => {
      const canonicalWorkspaceId = 'aaaaaaaa-1111-4111-8111-111111111111';
      const canonicalCampaignId = 'bbbbbbbb-3333-4333-8333-333333333333';
      const canonicalWorkflowId = 'cccccccc-4444-4444-8444-444444444444';
      const canonicalVersionId = 'dddddddd-5555-4555-8555-555555555555';
      const { manager, queryRunner, service } = createExecutionContext({
        campaignRows: [{ id: canonicalCampaignId.toUpperCase() }],
        workflowRows: [
          {
            id: canonicalWorkflowId.toUpperCase(),
            outreachCampaignId: canonicalCampaignId.toUpperCase(),
            lastPublishedVersionId: canonicalVersionId.toUpperCase(),
          },
        ],
        versionRows: [
          {
            id: canonicalVersionId.toUpperCase(),
            workflowId: canonicalWorkflowId.toUpperCase(),
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: serializedBytes(executableSequence),
            campaignSequence: executableSequence,
          },
        ],
      });

      await expect(
        service.loadExecutionPlanInTransaction(
          {
            campaignId: canonicalCampaignId.toUpperCase(),
            workflowVersionId: canonicalVersionId.toUpperCase(),
            workspaceId: canonicalWorkspaceId.toUpperCase(),
          },
          manager as never,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          kind: 'READY',
          workspaceId: canonicalWorkspaceId,
          campaignId: canonicalCampaignId,
          workflowId: canonicalWorkflowId,
          workflowVersionId: canonicalVersionId,
        }),
      );
      expect(queryRunner.query).toHaveBeenNthCalledWith(1, expect.any(String), [
        canonicalCampaignId,
      ]);
      expect(queryRunner.query).toHaveBeenNthCalledWith(3, expect.any(String), [
        canonicalVersionId,
        canonicalWorkflowId,
        MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
      ]);
    });

    it.each([
      ['campaign', { campaignRows: [] }, 'CAMPAIGN_NOT_FOUND'],
      ['workflow', { workflowRows: [] }, 'WORKFLOW_NOT_FOUND'],
      [
        'workflow ownership',
        {
          workflowRows: [
            {
              id: workflowId,
              outreachCampaignId: otherWorkspaceId,
              lastPublishedVersionId: versionId,
            },
          ],
        },
        'WORKFLOW_NOT_FOUND',
      ],
      ['workflow version', { versionRows: [] }, 'WORKFLOW_VERSION_NOT_FOUND'],
      [
        'workflow version ownership',
        {
          versionRows: [
            {
              id: versionId,
              workflowId: otherWorkspaceId,
              status: WorkflowVersionStatus.ACTIVE,
              campaignSequence: executableSequence,
            },
          ],
        },
        'WORKFLOW_VERSION_NOT_FOUND',
      ],
    ])(
      'returns a scoped dependency blocker for missing or mismatched %s',
      async (_, overrides, reason) => {
        const { manager, service } = createExecutionContext(overrides);

        await expect(
          service.loadExecutionPlanInTransaction(args, manager as never),
        ).resolves.toEqual({
          kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
          reason,
        });
      },
    );

    it.each([
      [
        'published pointer mismatch',
        {
          workflowRows: [
            {
              id: workflowId,
              outreachCampaignId: campaignId,
              lastPublishedVersionId: nextVersionId,
            },
          ],
        },
      ],
      [
        'non-active exact version',
        {
          versionRows: [
            {
              id: versionId,
              workflowId,
              status: WorkflowVersionStatus.DEACTIVATED,
              campaignSequence: executableSequence,
            },
          ],
        },
      ],
    ])('coalesces %s into the current-active blocker', async (_, overrides) => {
      const { manager, service } = createExecutionContext(overrides);

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'WORKFLOW_VERSION_NOT_CURRENT_ACTIVE',
      });
    });

    it.each([
      ['null', null],
      ['absent', undefined],
    ])('blocks a %s unauthored sequence', async (_, campaignSequence) => {
      const version = {
        id: versionId,
        workflowId,
        status: WorkflowVersionStatus.ACTIVE,
        ...(campaignSequence === undefined ? {} : { campaignSequence }),
      };
      const { manager, service } = createExecutionContext({
        versionRows: [version],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'SEQUENCE_NOT_AUTHORED',
      });
    });

    it.each([
      ['extra keys', { ...executableSequence, unexpected: true }],
      [
        'nonplain objects',
        Object.assign(Object.create({ inherited: true }), executableSequence),
      ],
    ])(
      'blocks malformed sequence data with %s',
      async (_, campaignSequence) => {
        const { manager, service } = createExecutionContext({
          versionRows: [
            {
              id: versionId,
              workflowId,
              status: WorkflowVersionStatus.ACTIVE,
              campaignSequenceBytes: MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
              campaignSequence,
            },
          ],
        });

        await expect(
          service.loadExecutionPlanInTransaction(args, manager as never),
        ).resolves.toEqual({
          kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
          reason: 'SEQUENCE_MALFORMED',
        });
      },
    );

    it.each(['sequence', 'message'] as const)(
      'rejects more than 10k undeclared %s properties without allocating a descriptor map',
      async (location) => {
        const oversized =
          location === 'sequence'
            ? { ...executableSequence }
            : { ...executableSequence.messages[0] };

        for (let index = 0; index < 10_001; index += 1) {
          Object.defineProperty(oversized, `unexpected${index}`, {
            enumerable: true,
            value: index,
          });
        }

        const campaignSequence =
          location === 'sequence'
            ? oversized
            : { ...executableSequence, messages: [oversized] };
        const descriptorSpy = jest.spyOn(Object, 'getOwnPropertyDescriptors');

        try {
          const { manager, service } = createExecutionContext({
            versionRows: [
              {
                id: versionId,
                workflowId,
                status: WorkflowVersionStatus.ACTIVE,
                campaignSequenceBytes: MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
                campaignSequence,
              },
            ],
          });

          await expect(
            service.loadExecutionPlanInTransaction(args, manager as never),
          ).resolves.toEqual({
            kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
            reason: 'SEQUENCE_MALFORMED',
          });
          expect(descriptorSpy).not.toHaveBeenCalled();
        } finally {
          descriptorSpy.mockRestore();
        }
      },
    );

    it('rejects a query row with more than 10k undeclared properties without allocating a descriptor map', async () => {
      const campaignRow: Record<string, unknown> = { id: campaignId };

      for (let index = 0; index < 10_001; index += 1) {
        Object.defineProperty(campaignRow, `unexpected${index}`, {
          enumerable: true,
          value: index,
        });
      }

      const descriptorSpy = jest.spyOn(Object, 'getOwnPropertyDescriptors');

      try {
        const { manager, service } = createExecutionContext({
          campaignRows: [campaignRow],
        });

        await expect(
          service.loadExecutionPlanInTransaction(args, manager as never),
        ).rejects.toEqual(
          new InternalServerErrorException(
            'Campaign sequence execution plan could not be loaded',
          ),
        );
        expect(descriptorSpy).not.toHaveBeenCalled();
      } finally {
        descriptorSpy.mockRestore();
      }
    });

    it('rejects JSON-parsed own __proto__ keys at every strict object level', async () => {
      const withOwnProto = (value: object): Record<string, unknown> =>
        JSON.parse(
          `${JSON.stringify(value).slice(0, -1)},"__proto__":{"polluted":true}}`,
        ) as Record<string, unknown>;
      const sequenceWithOwnProto = withOwnProto(executableSequence);
      const messageWithOwnProto = withOwnProto(executableSequence.messages[0]);
      const fileWithOwnProto = withOwnProto({
        id: firstFileId,
        name: 'proof.txt',
        size: 5,
        type: 'text/plain',
        createdAt: '2026-09-08T00:00:00.000Z',
      });
      const payloads = [
        sequenceWithOwnProto,
        {
          ...sequence,
          messages: [messageWithOwnProto],
        },
        {
          ...sequence,
          messages: [
            {
              ...sequence.messages[0],
              files: [fileWithOwnProto],
            },
          ],
        },
      ];

      expect(
        Object.prototype.hasOwnProperty.call(sequenceWithOwnProto, '__proto__'),
      ).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(messageWithOwnProto, '__proto__'),
      ).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(fileWithOwnProto, '__proto__'),
      ).toBe(true);

      for (const campaignSequence of payloads) {
        const { manager, service } = createExecutionContext({
          versionRows: [
            {
              id: versionId,
              workflowId,
              status: WorkflowVersionStatus.ACTIVE,
              campaignSequenceBytes: serializedBytes(campaignSequence),
              campaignSequence,
            },
          ],
        });

        await expect(
          service.loadExecutionPlanInTransaction(args, manager as never),
        ).resolves.toEqual({
          kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
          reason: 'SEQUENCE_MALFORMED',
        });
      }

      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it('rejects repeated references instead of expanding a compact DAG', async () => {
      const sharedFile = {
        id: firstFileId,
        name: 'shared.txt',
        size: 5,
        type: 'text/plain',
        createdAt: '2026-09-08T00:00:00.000Z',
      };
      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
            campaignSequence: {
              ...sequence,
              messages: [
                {
                  ...sequence.messages[0],
                  files: [sharedFile, sharedFile],
                },
              ],
            },
          },
        ],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'SEQUENCE_MALFORMED',
      });
    });

    it('rejects a 30-level shared DAG before descending into undeclared data', async () => {
      const leafAccessor = jest.fn(() => 'not reached');
      const leaf = {};
      Object.defineProperty(leaf, 'value', { get: leafAccessor });
      let sharedDag: object = leaf;

      for (let depth = 0; depth < 30; depth += 1) {
        sharedDag = { left: sharedDag, right: sharedDag };
      }

      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
            campaignSequence: {
              ...executableSequence,
              unexpected: sharedDag,
            },
          },
        ],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'SEQUENCE_MALFORMED',
      });
      expect(leafAccessor).not.toHaveBeenCalled();
    });

    it('rejects oversized authored arrays before allocating all descriptors', async () => {
      const messages = new Array(10_000).fill(sequence.messages[0]);
      const descriptorSpy = jest.spyOn(Object, 'getOwnPropertyDescriptors');
      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
            campaignSequence: {
              ...sequence,
              messages,
              delaysSeconds: new Array(messages.length - 1).fill(1),
            },
          },
        ],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'SEQUENCE_MALFORMED',
      });
      expect(
        descriptorSpy.mock.calls.some(([value]) => value === messages),
      ).toBe(false);
      descriptorSpy.mockRestore();
    });

    it('blocks a mock/runtime TipTap body that exceeds the traversal byte budget before semantic validation', async () => {
      const campaignSequence = {
        ...sequence,
        messages: [
          {
            ...sequence.messages[0],
            body: 'a'.repeat(MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES + 1),
          },
        ],
      };
      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES,
            campaignSequence,
          },
        ],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'SEQUENCE_MALFORMED',
      });
    });

    it('does not invoke persisted accessors while rejecting them as malformed', async () => {
      const getter = jest.fn(() => executableSequence);
      const version = {
        id: versionId,
        workflowId,
        status: WorkflowVersionStatus.ACTIVE,
        campaignSequenceBytes: 1,
      };

      Object.defineProperty(version, 'campaignSequence', { get: getter });
      const { manager, service } = createExecutionContext({
        versionRows: [version],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'SEQUENCE_MALFORMED',
      });
      expect(getter).not.toHaveBeenCalled();
    });

    it.each([
      [
        'nonstandard array prototype',
        Object.setPrototypeOf([{ id: campaignId }], null),
      ],
      ['sparse result array', new Array(1)],
      [
        'accessor result array',
        Object.defineProperty([], '0', {
          configurable: true,
          enumerable: true,
          get: jest.fn(() => ({ id: campaignId })),
        }),
      ],
      ['nonplain row', [Object.create({ id: campaignId })]],
    ])(
      'sanitizes malformed query data with a %s',
      async (_, campaignResult) => {
        const { manager, service } = createExecutionContext({ campaignResult });

        await expect(
          service.loadExecutionPlanInTransaction(args, manager as never),
        ).rejects.toEqual(
          new InternalServerErrorException(
            'Campaign sequence execution plan could not be loaded',
          ),
        );
      },
    );

    it.each(['query result', 'tuple rows', 'row', 'campaignSequence'] as const)(
      'rejects a live Proxy at the %s boundary without structural reflection after resolution',
      async (location) => {
        const target =
          location === 'row'
            ? { id: campaignId }
            : location === 'campaignSequence'
              ? executableSequence
              : [{ id: campaignId }];
        const { proxy, structuralTrapCount, thenTrapCount } =
          createTrapCountingProxy(target);
        const overrides =
          location === 'query result'
            ? { campaignResult: proxy }
            : location === 'tuple rows'
              ? { campaignResult: [proxy, 1] }
              : location === 'row'
                ? { campaignResult: [proxy] }
                : {
                    versionRows: [
                      {
                        id: versionId,
                        workflowId,
                        status: WorkflowVersionStatus.ACTIVE,
                        campaignSequenceBytes: 1,
                        campaignSequence: proxy,
                      },
                    ],
                  };
        const { manager, queryRunner, service } =
          createExecutionContext(overrides);
        const loading = service.loadExecutionPlanInTransaction(
          args,
          manager as never,
        );

        if (location === 'campaignSequence') {
          await expect(loading).resolves.toEqual({
            kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
            reason: 'SEQUENCE_MALFORMED',
          });
        } else {
          await expect(loading).rejects.toEqual(
            new InternalServerErrorException(
              'Campaign sequence execution plan could not be loaded',
            ),
          );
        }
        expect(structuralTrapCount()).toBe(0);
        expect(thenTrapCount()).toBe(location === 'query result' ? 1 : 0);
        expect(queryRunner.query).toHaveBeenCalledTimes(
          location === 'campaignSequence' ? 3 : 1,
        );
      },
    );

    it('rejects a revoked query-result Proxy without exposing its error', async () => {
      const { proxy, revoke } = Proxy.revocable([{ id: campaignId }], {});

      revoke();
      const { manager, service } = createExecutionContext({
        campaignResult: proxy,
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).rejects.toEqual(
        new InternalServerErrorException(
          'Campaign sequence execution plan could not be loaded',
        ),
      );
    });

    it.each(['tuple rows', 'row'] as const)(
      'rejects a revoked Proxy at the %s boundary without reflection',
      async (location) => {
        const target =
          location === 'tuple rows' ? [{ id: campaignId }] : { id: campaignId };
        const { proxy, revoke } = Proxy.revocable(target, {});

        revoke();
        const { manager, service } = createExecutionContext({
          campaignResult: location === 'tuple rows' ? [proxy, 1] : [proxy],
        });

        await expect(
          service.loadExecutionPlanInTransaction(args, manager as never),
        ).rejects.toEqual(
          new InternalServerErrorException(
            'Campaign sequence execution plan could not be loaded',
          ),
        );
      },
    );

    it('fails closed on a revoked campaignSequence Proxy without leaking its error', async () => {
      const { proxy, revoke } = Proxy.revocable(executableSequence, {});

      revoke();
      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: 1,
            campaignSequence: proxy,
          },
        ],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
        reason: 'SEQUENCE_MALFORMED',
      });
    });

    it('never returns an empty READY plan', async () => {
      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: serializedBytes({
              schemaVersion: 1,
              messages: [],
              delaysSeconds: [],
            }),
            campaignSequence: {
              schemaVersion: 1,
              messages: [],
              delaysSeconds: [],
            },
          },
        ],
      });

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).resolves.toEqual({
        kind: 'BLOCKED_SEQUENCE_INVALID',
        issues: [expect.objectContaining({ code: 'EMPTY_SEQUENCE' })],
      });
    });

    it('returns detached frozen issues and no executable plan for semantic invalidity', async () => {
      const invalidSequence = {
        schemaVersion: 1 as const,
        messages: [
          sequence.messages[0],
          { id: secondMessageId, channel: 'INSTAGRAM' as const, text: 'Hi' },
        ],
        delaysSeconds: [null],
      };
      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: serializedBytes(invalidSequence),
            campaignSequence: invalidSequence,
          },
        ],
      });

      const result = await service.loadExecutionPlanInTransaction(
        args,
        manager as never,
      );

      expect(result).toEqual({
        kind: 'BLOCKED_SEQUENCE_INVALID',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'DELAY_REQUIRED' }),
          expect.objectContaining({
            code: 'INSTAGRAM_UNAVAILABLE',
            messageId: secondMessageId,
            path: 'messages.1.channel',
          }),
        ]),
      });
      expect(result).not.toHaveProperty('nodes');
      expect(result).not.toHaveProperty('delaysSeconds');
      expect(Object.isFrozen(result)).toBe(true);
      if (result.kind !== 'BLOCKED_SEQUENCE_INVALID') {
        throw new Error('Expected sequence blocker');
      }
      expect(Object.isFrozen(result.issues)).toBe(true);
      expect(result.issues.every(Object.isFrozen)).toBe(true);
      invalidSequence.messages.length = 0;
      invalidSequence.delaysSeconds.length = 0;
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'DELAY_REQUIRED' }),
        ]),
      );
    });

    it('detaches a READY plan from later persisted-value mutation', async () => {
      const mutableSequence = {
        ...executableSequence,
        messages: executableSequence.messages.map((message) => ({
          ...message,
          files: [...message.files],
        })),
        delaysSeconds: [...executableSequence.delaysSeconds],
      };
      const { manager, service } = createExecutionContext({
        versionRows: [
          {
            id: versionId,
            workflowId,
            status: WorkflowVersionStatus.ACTIVE,
            campaignSequenceBytes: serializedBytes(mutableSequence),
            campaignSequence: mutableSequence,
          },
        ],
      });
      const result = await service.loadExecutionPlanInTransaction(
        args,
        manager as never,
      );

      mutableSequence.messages[1].replyToThread = false;
      mutableSequence.delaysSeconds[0] = 999;
      expect(result).toEqual(
        expect.objectContaining({
          nodes: [
            { messageId, channel: 'EMAIL', replyToThread: false },
            {
              messageId: secondMessageId,
              channel: 'EMAIL',
              replyToThread: true,
            },
          ],
          delaysSeconds: [17],
        }),
      );
    });

    it('sanitizes database errors', async () => {
      const { manager, queryRunner, service } = createExecutionContext();

      queryRunner.query.mockRejectedValueOnce(
        new Error('password=secret host=private-db'),
      );

      await expect(
        service.loadExecutionPlanInTransaction(args, manager as never),
      ).rejects.toEqual(
        new InternalServerErrorException(
          'Campaign sequence execution plan could not be loaded',
        ),
      );
    });
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

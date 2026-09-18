import { type QueryRunner, type Repository } from 'typeorm';

import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { type UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MEMBER_ROLE_LABEL } from 'src/engine/metadata-modules/permissions/constants/member-role-label.constants';
import { type RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { type RoleService } from 'src/engine/metadata-modules/role/role.service';
import { type UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type WorkspaceDataSourceService } from 'src/engine/workspace-datasource/workspace-datasource.service';
import { WorkspaceManagerService } from 'src/engine/workspace-manager/workspace-manager.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { type TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';

type WorkspaceManagerServiceDependencies = {
  workspaceDataSourceService: jest.Mocked<WorkspaceDataSourceService>;
  userWorkspaceRepository: jest.Mocked<Repository<UserWorkspaceEntity>>;
  roleService: jest.Mocked<RoleService>;
  userRoleService: jest.Mocked<UserRoleService>;
  twentyStandardApplicationService: jest.Mocked<TwentyStandardApplicationService>;
  workspaceRepository: jest.Mocked<Repository<WorkspaceEntity>>;
  roleRepository: jest.Mocked<WorkspaceScopedRepository<RoleEntity>>;
  applicationService: jest.Mocked<ApplicationService>;
  globalWorkspaceOrmManager: jest.Mocked<GlobalWorkspaceOrmManager>;
  myahInboxContactTriageSchemaService: jest.Mocked<MyahInboxContactTriageSchemaService>;
  rawQueryRunner: jest.Mocked<Pick<QueryRunner, 'query'>>;
};

type WorkspaceManagerServiceFixture = WorkspaceManagerServiceDependencies & {
  service: WorkspaceManagerService;
};

const workspaceId = 'workspace-id';
const userId = 'user-id';

const workspace = {
  id: workspaceId,
} as WorkspaceEntity;

const workspaceCustomFlatApplication = {
  id: 'workspace-custom-app-id',
} as FlatApplication;

const createWorkspaceManagerServiceFixture = ({
  adminRole,
  existingMemberRole,
}: {
  adminRole?: Pick<RoleEntity, 'id'> | null;
  existingMemberRole?: Pick<RoleEntity, 'id'> | null;
} = {}): WorkspaceManagerServiceFixture => {
  const userWorkspace = {
    id: 'user-workspace-id',
    userId,
    workspaceId,
  } as UserWorkspaceEntity;

  const roleRepository = {
    findOne: jest
      .fn()
      .mockResolvedValueOnce(
        adminRole === undefined ? { id: 'admin-role-id' } : adminRole,
      )
      .mockResolvedValueOnce(existingMemberRole ?? null),
  } as unknown as jest.Mocked<WorkspaceScopedRepository<RoleEntity>>;

  const workspaceDataSourceService = {
    createWorkspaceDBSchema: jest.fn().mockResolvedValue('workspace_schema'),
  } as unknown as jest.Mocked<WorkspaceDataSourceService>;

  const userWorkspaceRepository = {
    findOneOrFail: jest.fn().mockResolvedValue(userWorkspace),
  } as unknown as jest.Mocked<Repository<UserWorkspaceEntity>>;

  const roleService = {
    createMemberRole: jest.fn().mockResolvedValue({ id: 'member-role-id' }),
  } as unknown as jest.Mocked<RoleService>;

  const userRoleService = {
    assignRoleToManyUserWorkspace: jest.fn(),
  } as unknown as jest.Mocked<UserRoleService>;

  const twentyStandardApplicationService = {
    synchronizeTwentyStandardApplicationOrThrow: jest.fn(),
  } as unknown as jest.Mocked<TwentyStandardApplicationService>;

  const workspaceRepository = {
    update: jest.fn(),
  } as unknown as jest.Mocked<Repository<WorkspaceEntity>>;

  const applicationService = {
    createTwentyStandardApplication: jest.fn(),
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({ workspaceCustomFlatApplication }),
  } as unknown as jest.Mocked<ApplicationService>;

  const rawQueryRunner = {
    query: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Pick<QueryRunner, 'query'>>;
  const transactionManager = {
    query: jest.fn(() => {
      throw new Error('WorkspaceEntityManager.query is forbidden');
    }),
    queryRunner: rawQueryRunner,
  } as unknown as WorkspaceEntityManager;
  const workspaceDataSource = {
    transaction: jest.fn(
      async (
        callback: (manager: WorkspaceEntityManager) => Promise<void>,
      ): Promise<void> => callback(transactionManager),
    ),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<void>): Promise<void> => callback(),
    ),
    getGlobalWorkspaceDataSource: jest
      .fn()
      .mockResolvedValue(workspaceDataSource),
  } as unknown as jest.Mocked<GlobalWorkspaceOrmManager>;
  const myahInboxContactTriageSchemaService = {
    ensureWorkspaceTables: jest.fn(),
    initializeNewWorkspaceInTransaction: jest.fn(),
  } as unknown as jest.Mocked<MyahInboxContactTriageSchemaService>;

  const service = new WorkspaceManagerService(
    workspaceDataSourceService,
    userWorkspaceRepository,
    roleService,
    userRoleService,
    twentyStandardApplicationService,
    workspaceRepository,
    roleRepository,
    applicationService,
    globalWorkspaceOrmManager,
    myahInboxContactTriageSchemaService,
  );

  return {
    service,
    workspaceDataSourceService,
    userWorkspaceRepository,
    roleService,
    userRoleService,
    twentyStandardApplicationService,
    workspaceRepository,
    roleRepository,
    applicationService,
    globalWorkspaceOrmManager,
    myahInboxContactTriageSchemaService,
    rawQueryRunner,
  };
};

describe('WorkspaceManagerService', () => {
  describe('init', () => {
    it('assigns the standard Admin role to the first user and keeps Member as the workspace default role', async () => {
      const fixture = createWorkspaceManagerServiceFixture();

      await fixture.service.init({ workspace, userId });

      expect(
        fixture.applicationService.createTwentyStandardApplication,
      ).toHaveBeenCalledWith({
        workspaceId,
      });
      expect(
        fixture.twentyStandardApplicationService
          .synchronizeTwentyStandardApplicationOrThrow,
      ).toHaveBeenCalledWith({ workspaceId, profile: 'myah' });
      expect(
        fixture.myahInboxContactTriageSchemaService.ensureWorkspaceTables,
      ).toHaveBeenCalledWith(expect.anything(), workspaceId);
      expect(
        fixture.myahInboxContactTriageSchemaService
          .initializeNewWorkspaceInTransaction,
      ).toHaveBeenCalledWith(expect.anything(), workspaceId);
      expect(
        fixture.myahInboxContactTriageSchemaService.ensureWorkspaceTables.mock
          .invocationCallOrder[0],
      ).toBeGreaterThan(
        fixture.twentyStandardApplicationService
          .synchronizeTwentyStandardApplicationOrThrow.mock
          .invocationCallOrder[0],
      );
      expect(fixture.roleRepository.findOne).toHaveBeenNthCalledWith(
        1,
        workspaceId,
        {
          where: {
            universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
          },
        },
      );
      expect(
        fixture.userWorkspaceRepository.findOneOrFail,
      ).toHaveBeenCalledWith({
        where: { workspaceId, userId },
      });
      expect(
        fixture.userRoleService.assignRoleToManyUserWorkspace,
      ).toHaveBeenCalledWith({
        workspaceId,
        userWorkspaceIds: ['user-workspace-id'],
        roleId: 'admin-role-id',
      });
      expect(fixture.roleRepository.findOne).toHaveBeenNthCalledWith(
        2,
        workspaceId,
        {
          where: { label: MEMBER_ROLE_LABEL },
        },
      );
      expect(fixture.roleService.createMemberRole).toHaveBeenCalledWith({
        workspaceId,
        ownerFlatApplication: workspaceCustomFlatApplication,
      });
      expect(fixture.workspaceRepository.update).toHaveBeenLastCalledWith(
        workspaceId,
        {
          defaultRoleId: 'member-role-id',
        },
      );
    });

    it('provisions one READY marker through the post-synchronization raw transaction handle', async () => {
      const fixture = createWorkspaceManagerServiceFixture();
      const service = new WorkspaceManagerService(
        fixture.workspaceDataSourceService,
        fixture.userWorkspaceRepository,
        fixture.roleService,
        fixture.userRoleService,
        fixture.twentyStandardApplicationService,
        fixture.workspaceRepository,
        fixture.roleRepository,
        fixture.applicationService,
        fixture.globalWorkspaceOrmManager,
        new MyahInboxContactTriageSchemaService(),
      );

      await service.init({
        workspace: {
          ...workspace,
          id: '20202020-1c25-4d02-bf25-6aeccf7ea419',
        },
        userId,
      });

      const statements = fixture.rawQueryRunner.query.mock.calls.map(
        ([statement]) => statement,
      );

      expect(statements).toContainEqual(
        expect.stringContaining('"myahInboxTriageMigration"'),
      );
      expect(
        statements.filter((statement) =>
          statement.includes("VALUES (true, 'READY', 0, now())"),
        ),
      ).toHaveLength(1);
      expect(statements).not.toContainEqual(
        expect.stringContaining("VALUES (true, 'MIGRATING'"),
      );
      expect(fixture.rawQueryRunner.query).toHaveBeenCalledTimes(8);
      expect(
        fixture.rawQueryRunner.query.mock.invocationCallOrder[0],
      ).toBeGreaterThan(
        fixture.twentyStandardApplicationService
          .synchronizeTwentyStandardApplicationOrThrow.mock
          .invocationCallOrder[0],
      );
    });

    it('does not provision triage when standard application synchronization fails', async () => {
      const fixture = createWorkspaceManagerServiceFixture();

      fixture.twentyStandardApplicationService.synchronizeTwentyStandardApplicationOrThrow.mockRejectedValueOnce(
        new Error('standard application synchronization failed'),
      );

      await expect(fixture.service.init({ workspace, userId })).rejects.toThrow(
        'standard application synchronization failed',
      );

      expect(
        fixture.myahInboxContactTriageSchemaService.ensureWorkspaceTables,
      ).not.toHaveBeenCalled();
      expect(
        fixture.myahInboxContactTriageSchemaService
          .initializeNewWorkspaceInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        fixture.globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
    });

    it('fails loudly instead of leaving a newly initialized workspace without an Admin role', async () => {
      const fixture = createWorkspaceManagerServiceFixture({ adminRole: null });

      await expect(fixture.service.init({ workspace, userId })).rejects.toThrow(
        'Could not find the standard Admin role while initializing workspace workspace-id',
      );

      expect(
        fixture.userRoleService.assignRoleToManyUserWorkspace,
      ).not.toHaveBeenCalled();
      expect(fixture.workspaceRepository.update).not.toHaveBeenCalledWith(
        workspaceId,
        {
          defaultRoleId: 'member-role-id',
        },
      );
    });
  });
});

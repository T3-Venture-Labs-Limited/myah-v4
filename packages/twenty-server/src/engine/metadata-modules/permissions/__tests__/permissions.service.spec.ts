import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  PermissionFlagType,
  SystemPermissionFlag,
} from 'twenty-shared/constants';

import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/services/api-key-role.service';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: getWorkspaceScopedRepositoryToken(RoleEntity),
          useValue: {},
        },
        {
          provide: ApiKeyRoleService,
          useValue: {},
        },
        {
          provide: UserRoleService,
          useValue: {},
        },
        {
          provide: WorkspaceCacheService,
          useValue: {},
        },
        {
          provide: getRepositoryToken(ApplicationEntity),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });
  describe('getDefaultUserWorkspacePermissions', () => {
    it('returns an exhaustive disabled permission map including Instagram send controls', () => {
      expect(service.getDefaultUserWorkspacePermissions()).toEqual({
        permissionFlags: {
          API_KEYS_AND_WEBHOOKS: false,
          WORKSPACE: false,
          WORKSPACE_MEMBERS: false,
          ROLES: false,
          DATA_MODEL: false,
          SECURITY: false,
          WORKFLOWS: false,
          IMPERSONATE: false,
          SSO_BYPASS: false,
          APPLICATIONS: false,
          MARKETPLACE_APPS: false,
          LAYOUTS: false,
          BILLING: false,
          AI_SETTINGS: false,
          AI: false,
          VIEWS: false,
          UPLOAD_FILE: false,
          DOWNLOAD_FILE: false,
          SEND_EMAIL_TOOL: false,
          SEND_INSTAGRAM_REPLY_TOOL: false,
          SEND_INSTAGRAM_FIRST_MESSAGE_TOOL: false,
          RESOLVE_INSTAGRAM_SEND_OUTCOME: false,
          CREATE_CALENDAR_EVENT_TOOL: false,
          HTTP_REQUEST_TOOL: false,
          CODE_INTERPRETER_TOOL: false,
          IMPORT_CSV: false,
          EXPORT_CSV: false,
          CONNECTED_ACCOUNTS: false,
          PROFILE_INFORMATION: false,
        },
        objectsPermissions: {},
      });
    });
  });

  describe('checkRolePermissions', () => {
    describe('canAccessAllTools for tool permissions', () => {
      it('should grant permission when canAccessAllTools is true for a tool permission', () => {
        const roleWithAllTools: Partial<RoleEntity> = {
          id: 'test-role-id',
          label: 'Test Role',
          description: 'Test role description',
          icon: 'IconTest',
          canAccessAllTools: true,
          canUpdateAllSettings: false,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: true,
          canBeAssignedToApiKeys: true,
          rolePermissionFlags: [],
          workspaceId: 'test-workspace-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEditable: true,
        };

        // Test all tool permissions
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.UPLOAD_FILE,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.DOWNLOAD_FILE,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.AI,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.VIEWS,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.SEND_EMAIL_TOOL,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.IMPORT_CSV,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.EXPORT_CSV,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.CONNECTED_ACCOUNTS,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.RESOLVE_INSTAGRAM_SEND_OUTCOME,
          ),
        ).toBe(false);
      });

      it('should NOT grant settings permissions when canAccessAllTools is true', () => {
        const roleWithAllTools: Partial<RoleEntity> = {
          id: 'test-role-id',
          label: 'Test Role',
          description: 'Test role description',
          icon: 'IconTest',
          canAccessAllTools: true,
          canUpdateAllSettings: false,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: true,
          canBeAssignedToApiKeys: true,
          rolePermissionFlags: [],
          workspaceId: 'test-workspace-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEditable: true,
        };

        // Test that settings permissions are NOT granted
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.ROLES,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.WORKSPACE,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.DATA_MODEL,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllTools as RoleEntity,
            PermissionFlagType.SECURITY,
          ),
        ).toBe(false);
      });
    });

    describe('canUpdateAllSettings for settings permissions', () => {
      it('should grant permission when canUpdateAllSettings is true for a settings permission', () => {
        const roleWithAllSettings: Partial<RoleEntity> = {
          id: 'test-role-id',
          label: 'Test Role',
          description: 'Test role description',
          icon: 'IconTest',
          canAccessAllTools: false,
          canUpdateAllSettings: true,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: true,
          canBeAssignedToApiKeys: true,
          rolePermissionFlags: [],
          roleTargets: [],
          objectPermissions: [],
          fieldPermissions: [],
          workspaceId: 'test-workspace-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEditable: true,
        };

        // Test all settings permissions
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.ROLES,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.WORKSPACE,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.DATA_MODEL,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.SECURITY,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.WORKFLOWS,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.WORKSPACE_MEMBERS,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.API_KEYS_AND_WEBHOOKS,
          ),
        ).toBe(true);
      });

      it('should NOT grant tool permissions when canUpdateAllSettings is true', () => {
        const roleWithAllSettings: Partial<RoleEntity> = {
          id: 'test-role-id',
          label: 'Test Role',
          description: 'Test role description',
          icon: 'IconTest',
          canAccessAllTools: false,
          canUpdateAllSettings: true,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: true,
          canBeAssignedToApiKeys: true,
          rolePermissionFlags: [],
          roleTargets: [],
          objectPermissions: [],
          fieldPermissions: [],
          workspaceId: 'test-workspace-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEditable: true,
        };

        // Test that tool permissions are NOT granted
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.UPLOAD_FILE,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.DOWNLOAD_FILE,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.AI,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithAllSettings as RoleEntity,
            PermissionFlagType.VIEWS,
          ),
        ).toBe(false);
      });
    });

    describe('Granular permissions with rolePermissionFlags', () => {
      it('should grant specific tool permission when included in rolePermissionFlags even if canAccessAllTools is false', () => {
        const roleWithSpecificPermission: Partial<RoleEntity> = {
          id: 'test-role-id',
          label: 'Test Role',
          description: 'Test role description',
          icon: 'IconTest',
          canAccessAllTools: false,
          canUpdateAllSettings: false,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: true,
          canBeAssignedToApiKeys: true,
          rolePermissionFlags: [
            {
              id: 'permission-1',
              permissionFlag: {
                key: PermissionFlagType.UPLOAD_FILE,
                universalIdentifier: SystemPermissionFlag.UPLOAD_FILE,
              },
              roleId: 'test-role-id',
              workspaceId: 'test-workspace-id',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ] as any,
          workspaceId: 'test-workspace-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEditable: true,
        };

        expect(
          service.checkRolePermissions(
            roleWithSpecificPermission as RoleEntity,
            PermissionFlagType.UPLOAD_FILE,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithSpecificPermission as RoleEntity,
            PermissionFlagType.DOWNLOAD_FILE,
          ),
        ).toBe(false);
      });

      it('should grant specific settings permission when included in rolePermissionFlags even if canUpdateAllSettings is false', () => {
        const roleWithSpecificPermission: Partial<RoleEntity> = {
          id: 'test-role-id',
          label: 'Test Role',
          description: 'Test role description',
          icon: 'IconTest',
          canAccessAllTools: false,
          canUpdateAllSettings: false,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: true,
          canBeAssignedToApiKeys: true,
          rolePermissionFlags: [
            {
              id: 'permission-1',
              permissionFlag: {
                key: PermissionFlagType.ROLES,
                universalIdentifier: SystemPermissionFlag.ROLES,
              },
              roleId: 'test-role-id',
              workspaceId: 'test-workspace-id',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ] as any,
          workspaceId: 'test-workspace-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEditable: true,
        };

        expect(
          service.checkRolePermissions(
            roleWithSpecificPermission as RoleEntity,
            PermissionFlagType.ROLES,
          ),
        ).toBe(true);
        expect(
          service.checkRolePermissions(
            roleWithSpecificPermission as RoleEntity,
            PermissionFlagType.WORKSPACE,
          ),
        ).toBe(false);
      });
    });

    describe('No permissions', () => {
      it('should deny all permissions when neither canAccessAllTools nor canUpdateAllSettings are true and no specific permissions', () => {
        const roleWithNoPermissions: Partial<RoleEntity> = {
          id: 'test-role-id',
          label: 'Test Role',
          description: 'Test role description',
          icon: 'IconTest',
          canAccessAllTools: false,
          canUpdateAllSettings: false,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: true,
          canBeAssignedToApiKeys: true,
          rolePermissionFlags: [],
          roleTargets: [],
          objectPermissions: [],
          fieldPermissions: [],
          workspaceId: 'test-workspace-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEditable: true,
        };

        // Tool permissions should be denied
        expect(
          service.checkRolePermissions(
            roleWithNoPermissions as RoleEntity,
            PermissionFlagType.UPLOAD_FILE,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithNoPermissions as RoleEntity,
            PermissionFlagType.AI,
          ),
        ).toBe(false);

        // Settings permissions should be denied
        expect(
          service.checkRolePermissions(
            roleWithNoPermissions as RoleEntity,
            PermissionFlagType.ROLES,
          ),
        ).toBe(false);
        expect(
          service.checkRolePermissions(
            roleWithNoPermissions as RoleEntity,
            PermissionFlagType.WORKSPACE,
          ),
        ).toBe(false);
      });
    });
  });
});

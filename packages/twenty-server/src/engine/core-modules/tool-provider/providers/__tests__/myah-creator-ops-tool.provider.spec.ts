import { MODULE_METADATA } from '@nestjs/common/constants';
import { z } from 'zod';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-creator-ops-tool-service.token';
import { TOOL_PROVIDERS } from 'src/engine/core-modules/tool-provider/constants/tool-providers.token';
import { MyahCreatorOpsToolProvider } from 'src/engine/core-modules/tool-provider/providers/myah-creator-ops-tool.provider';
import { ToolProviderModule } from 'src/engine/core-modules/tool-provider/tool-provider.module';
import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';
import { MyahCreatorOpsToolWorkspaceService } from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.workspace-service';

jest.mock('twenty-emails', () => ({}), { virtual: true });
jest.mock('twenty-client-sdk/generate', () => ({}), { virtual: true });
const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const roleId = '20202020-0b5c-4178-bed7-d371f6411eab';
const intersectedRoleId = '20202020-0b5c-4178-bed7-d371f6411eac';
const userId = '20202020-1234-4678-9012-345678901235';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const userAuthContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};
const context = {
  workspaceId,
  roleId,
  rolePermissionConfig: { unionOf: [roleId] },
  authContext: userAuthContext,
  userId,
  userWorkspaceId,
  actorContext: {
    source: 'AGENT',
    workspaceMemberId,
    name: 'Operator',
    context: {},
  },
};
const creatorOpsToolNames = [
  'add_creators_to_creator_list',
  'remove_creator_from_creator_list',
  'get_campaign_audience',
  'add_direct_campaign_creators',
  'attach_creator_lists_to_campaign',
  'detach_creator_list_from_campaign',
  'get_campaign_creator_list_addition_candidates',
  'approve_campaign_creator_list_additions',
] as const;
const readToolNames = [
  'get_campaign_audience',
  'get_campaign_creator_list_addition_candidates',
];
const creatorOpsObjectDefinitions = [
  { name: 'creator', definition: MYAH_STANDARD_OBJECTS.creator },
  { name: 'creatorList', definition: MYAH_STANDARD_OBJECTS.creatorList },
  {
    name: 'creatorListMember',
    definition: MYAH_STANDARD_OBJECTS.creatorListMember,
  },
  { name: 'campaign', definition: MYAH_STANDARD_OBJECTS.campaign },
  {
    name: 'campaignCreator',
    definition: MYAH_STANDARD_OBJECTS.campaignCreator,
  },
  {
    name: 'campaignCreatorList',
    definition: MYAH_STANDARD_OBJECTS.campaignCreatorList,
  },
  {
    name: 'campaignCreatorListSource',
    definition: MYAH_STANDARD_OBJECTS.campaignCreatorListSource,
  },
] as const;
type CreatorOpsObjectName =
  (typeof creatorOpsObjectDefinitions)[number]['name'];
type ObjectPermissionOverrides = Partial<
  Record<
    CreatorOpsObjectName,
    {
      canReadObjectRecords?: boolean;
      canUpdateObjectRecords?: boolean;
    }
  >
>;

const createProvider = ({
  canRead = true,
  canUpdate = true,
  inactiveObjectUniversalIdentifier,
  rolePermissionsByRoleId = { [roleId]: {} },
}: {
  canRead?: boolean;
  canUpdate?: boolean;
  inactiveObjectUniversalIdentifier?: string;
  rolePermissionsByRoleId?: Record<string, ObjectPermissionOverrides>;
} = {}) => {
  const objects = creatorOpsObjectDefinitions.map(
    ({ name, definition }, index) => ({
      id: `20202020-000${index}-4000-8000-00000000000${index}`,
      name,
      universalIdentifier: definition.universalIdentifier,
      isActive:
        definition.universalIdentifier !== inactiveObjectUniversalIdentifier,
    }),
  );
  const workspaceService = {
    generateMyahCreatorOpsTools: jest.fn().mockReturnValue(
      Object.fromEntries(
        creatorOpsToolNames.map((name) => [
          name,
          {
            name,
            description: name,
            inputSchema: z.object({}).strict(),
            execute: jest.fn().mockResolvedValue({ name }),
          },
        ]),
      ),
    ),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      rolesPermissions: Object.fromEntries(
        Object.entries(rolePermissionsByRoleId).map(
          ([currentRoleId, objectPermissionOverrides]) => [
            currentRoleId,
            Object.fromEntries(
              objects.map(({ id, name }) => {
                const permissions = objectPermissionOverrides[name];

                return [
                  id,
                  {
                    canReadObjectRecords:
                      permissions?.canReadObjectRecords ?? canRead,
                    canUpdateObjectRecords:
                      permissions?.canUpdateObjectRecords ?? canUpdate,
                  },
                ];
              }),
            ),
          ],
        ),
      ),
    }),
  };
  const flatEntityMapsCacheService = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
      flatObjectMetadataMaps: {
        byUniversalIdentifier: Object.fromEntries(
          objects.map(({ id, universalIdentifier, isActive }) => [
            universalIdentifier,
            { id, universalIdentifier, isActive },
          ]),
        ),
      },
    }),
  };
  const provider = new MyahCreatorOpsToolProvider(
    workspaceService as never,
    workspaceCacheService as never,
    flatEntityMapsCacheService as never,
  );

  return { provider, workspaceService };
};

describe('MyahCreatorOpsToolProvider', () => {
  it('requires a matching current user and all active canonical object permissions', async () => {
    const readable = createProvider();
    const unreadable = createProvider({ canRead: false });
    const inactive = createProvider({
      inactiveObjectUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
    });

    await expect(readable.provider.isAvailable(context as never)).resolves.toBe(
      true,
    );
    await expect(
      unreadable.provider.isAvailable(context as never),
    ).resolves.toBe(false);
    await expect(inactive.provider.isAvailable(context as never)).resolves.toBe(
      false,
    );
    await expect(
      readable.provider.isAvailable({
        ...context,
        authContext: undefined,
      } as never),
    ).resolves.toBe(false);
    await expect(
      readable.provider.isAvailable({
        ...context,
        authContext: {
          ...userAuthContext,
          workspace: { id: '20202020-1c25-4d02-bf25-6aeccf7ea420' },
        },
      } as never),
    ).resolves.toBe(false);
    await expect(
      readable.provider.isAvailable({
        ...context,
        actorContext: { ...context.actorContext, workspaceMemberId: 'wrong' },
      } as never),
    ).resolves.toBe(false);
  });

  it('keeps the two read tools while hiding all write tools from read-only roles', async () => {
    const { provider, workspaceService } = createProvider({ canUpdate: false });

    const descriptors = await provider.generateDescriptors(context as never);

    expect(descriptors.map(({ name }) => name).sort()).toEqual(readToolNames);
    expect(workspaceService.generateMyahCreatorOpsTools).toHaveBeenCalledWith({
      authContext: userAuthContext,
    });
  });

  it('catalogues all exact Creator Ops tools for roles with applicable updates', async () => {
    const { provider } = createProvider();

    const descriptors = await provider.generateDescriptors(context as never);

    expect(descriptors.map(({ name }) => name).sort()).toEqual(
      [...creatorOpsToolNames].sort(),
    );
  });

  it('requires only Campaign update permission to detach a Creator List', async () => {
    const { provider } = createProvider({
      rolePermissionsByRoleId: {
        [roleId]: {
          creatorList: { canUpdateObjectRecords: false },
        },
      },
    });

    const descriptors = await provider.generateDescriptors(context as never);
    const names = descriptors.map(({ name }) => name);

    expect(names).toContain('detach_creator_list_from_campaign');
    expect(names).not.toContain('attach_creator_lists_to_campaign');
    expect(names).not.toContain('add_creators_to_creator_list');
    expect(names).not.toContain('remove_creator_from_creator_list');
  });

  it('keeps Creator List membership tools when Campaign reads are denied', async () => {
    const { provider } = createProvider({
      rolePermissionsByRoleId: {
        [roleId]: {
          campaign: { canReadObjectRecords: false },
          campaignCreator: { canReadObjectRecords: false },
        },
      },
    });

    await expect(provider.isAvailable(context as never)).resolves.toBe(true);

    const descriptors = await provider.generateDescriptors(context as never);
    const names = descriptors.map(({ name }) => name);

    expect(names).toEqual(
      expect.arrayContaining([
        'add_creators_to_creator_list',
        'remove_creator_from_creator_list',
      ]),
    );
    expect(names).not.toContain('get_campaign_audience');
    expect(names).not.toContain('attach_creator_lists_to_campaign');
  });

  it('denies the full tool set when one intersected role lacks a required read permission', async () => {
    const { provider } = createProvider({
      rolePermissionsByRoleId: {
        [roleId]: {},
        [intersectedRoleId]: {
          creator: { canReadObjectRecords: false },
        },
      },
    });

    const descriptors = await provider.generateDescriptors({
      ...context,
      rolePermissionConfig: { intersectionOf: [roleId, intersectedRoleId] },
    } as never);

    expect(descriptors).toEqual([]);
  });

  it('hides campaign write tools when one intersected role lacks Campaign update permission', async () => {
    const { provider } = createProvider({
      rolePermissionsByRoleId: {
        [roleId]: {},
        [intersectedRoleId]: {
          campaign: { canUpdateObjectRecords: false },
        },
      },
    });

    const descriptors = await provider.generateDescriptors({
      ...context,
      rolePermissionConfig: { intersectionOf: [roleId, intersectedRoleId] },
    } as never);

    expect(descriptors.map(({ name }) => name).sort()).toEqual(
      [
        'add_creators_to_creator_list',
        'remove_creator_from_creator_list',
        ...readToolNames,
      ].sort(),
    );
  });

  it('registers the workspace token and provider exactly once in the module catalogue', () => {
    const campaignProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCampaignLifecycleModule,
    ) as unknown[];
    const campaignExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MyahCampaignLifecycleModule,
    ) as unknown[];
    const toolProviderImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ToolProviderModule,
    ) as unknown[];
    const toolProviderProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ToolProviderModule,
    ) as Array<
      | {
          provide?: symbol;
          inject?: unknown[];
          useFactory?: (...args: unknown[]) => unknown[];
        }
      | unknown
    >;
    const tokenBinding = campaignProviders.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN,
    ) as { provide: symbol; useExisting: unknown } | undefined;
    const providerCollection = toolProviderProviders.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === TOOL_PROVIDERS,
    ) as
      | { inject: unknown[]; useFactory: (...args: unknown[]) => unknown[] }
      | undefined;

    expect(tokenBinding).toEqual({
      provide: MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN,
      useExisting: MyahCreatorOpsToolWorkspaceService,
    });
    expect(campaignExports).toContain(MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN);
    expect(
      toolProviderImports.some((moduleImport) => {
        if (moduleImport === MyahCampaignLifecycleModule) return true;

        return (
          typeof moduleImport === 'object' &&
          moduleImport !== null &&
          'forwardRef' in moduleImport &&
          (moduleImport.forwardRef as () => unknown)() ===
            MyahCampaignLifecycleModule
        );
      }),
    ).toBe(true);
    expect(
      toolProviderProviders.filter(
        (provider) => provider === MyahCreatorOpsToolProvider,
      ),
    ).toHaveLength(1);
    expect(providerCollection?.inject).toContain(MyahCreatorOpsToolProvider);

    const instances = providerCollection!.inject.map((token) => ({ token }));
    const creatorOpsIndex = providerCollection!.inject.indexOf(
      MyahCreatorOpsToolProvider,
    );

    expect(providerCollection!.useFactory(...instances)).toContain(
      instances[creatorOpsIndex],
    );
  });
});

import { MODULE_METADATA } from '@nestjs/common/constants';
import { z } from 'zod';

import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import { MYAH_INBOX_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token';
import { TOOL_PROVIDERS } from 'src/engine/core-modules/tool-provider/constants/tool-providers.token';
import { MyahInboxToolProvider } from 'src/engine/core-modules/tool-provider/providers/myah-inbox-tool.provider';
import { ToolProviderModule } from 'src/engine/core-modules/tool-provider/tool-provider.module';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const roleId = '20202020-0b5c-4178-bed7-d371f6411eab';
const messageThreadObjectId = '20202020-0b5c-4178-bed7-d371f6411eac';
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

const createProvider = ({ canRead = true }: { canRead?: boolean } = {}) => {
  const workspaceService = {
    generateMyahInboxTools: jest.fn().mockReturnValue({
      get_myah_inbox_thread_context: {
        name: 'get_myah_inbox_thread_context',
        description: 'get_myah_inbox_thread_context',
        inputSchema: z.object({ threadId: z.string().uuid() }),
        execute: jest.fn(),
      },
      generate_myah_inbox_reply_proposal: {
        name: 'generate_myah_inbox_reply_proposal',
        description: 'generate_myah_inbox_reply_proposal',
        inputSchema: z.object({ threadId: z.string().uuid() }),
        execute: jest.fn(),
      },
    }),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      rolesPermissions: {
        [roleId]: {
          [messageThreadObjectId]: {
            canReadObjectRecords: canRead,
          },
        },
      },
    }),
  };
  const flatEntityMapsCacheService = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {
          messageThread: {
            id: messageThreadObjectId,
            nameSingular: 'messageThread',
          },
        },
      },
    }),
  };
  const provider = new MyahInboxToolProvider(
    workspaceService as never,
    workspaceCacheService as never,
    flatEntityMapsCacheService as never,
  );

  return { provider, workspaceService };
};

describe('MyahInboxToolProvider', () => {
  it('uses the current user, role, and MessageThread read permission for availability', async () => {
    const readable = createProvider();
    const unreadable = createProvider({ canRead: false });

    await expect(readable.provider.isAvailable(context as never)).resolves.toBe(
      true,
    );
    await expect(
      unreadable.provider.isAvailable(context as never),
    ).resolves.toBe(false);
    await expect(
      readable.provider.isAvailable({
        ...context,
        actorContext: undefined,
      } as never),
    ).resolves.toBe(false);
  });

  it('catalogues only the two read/propose tools and executes through the workspace service', async () => {
    const { provider, workspaceService } = createProvider();

    await expect(provider.generateDescriptors(context as never)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'get_myah_inbox_thread_context' }),
        expect.objectContaining({ name: 'generate_myah_inbox_reply_proposal' }),
      ]),
    );
    const names = (
      await provider.generateDescriptors(context as never)
    ).map(({ name }) => name);

    expect(names.sort()).toEqual([
      'generate_myah_inbox_reply_proposal',
      'get_myah_inbox_thread_context',
    ]);
    expect(names).not.toEqual(
      expect.arrayContaining([
        'update_myah_inbox_thread',
        'save_myah_inbox_draft',
        'send_myah_inbox_reply',
      ]),
    );
    expect(workspaceService.generateMyahInboxTools).toHaveBeenCalledWith(
      context,
    );
  });

  it('registers the exported workspace token and provider in the existing module catalogue', () => {
    const inboxProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahInboxModule,
    ) as unknown[];
    const inboxImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MyahInboxModule,
    ) as unknown[];
    const inboxExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MyahInboxModule,
    ) as unknown[];
    const toolProviderImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ToolProviderModule,
    ) as unknown[];
    const toolProviderProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ToolProviderModule,
    ) as Array<
      | { provide?: symbol; inject?: unknown[]; useFactory?: (...args: unknown[]) => unknown[] }
      | unknown
    >;
    const tokenBinding = inboxProviders.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === MYAH_INBOX_TOOL_SERVICE_TOKEN,
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
      provide: MYAH_INBOX_TOOL_SERVICE_TOKEN,
      useExisting: MyahInboxToolWorkspaceService,
    });
    expect(inboxExports).toContain(MYAH_INBOX_TOOL_SERVICE_TOKEN);
    expect(
      inboxImports.some(
        (moduleImport) =>
          typeof moduleImport === 'object' &&
          moduleImport !== null &&
          'forwardRef' in moduleImport &&
          (moduleImport.forwardRef as () => unknown)() === ToolProviderModule,
      ),
    ).toBe(true);
    expect(
      toolProviderImports.some((moduleImport) => {
        if (moduleImport === MyahInboxModule) {
          return true;
        }

        if (
          typeof moduleImport !== 'object' ||
          moduleImport === null ||
          !('forwardRef' in moduleImport)
        ) {
          return false;
        }

        return (moduleImport.forwardRef as () => unknown)() === MyahInboxModule;
      }),
    ).toBe(true);
    expect(toolProviderProviders).toContain(MyahInboxToolProvider);
    expect(providerCollection?.inject).toContain(MyahInboxToolProvider);

    const instances = providerCollection!.inject.map((token) => ({ token }));
    const registered = providerCollection!.useFactory(...instances);
    const myahIndex = providerCollection!.inject.indexOf(MyahInboxToolProvider);

    expect(registered).toContain(instances[myahIndex]);
  });
});

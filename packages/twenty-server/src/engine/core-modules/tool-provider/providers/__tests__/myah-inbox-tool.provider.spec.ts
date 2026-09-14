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
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
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
  myahInboxSelection: {
    workspaceId,
    threadId,
  },
};

const tool = (name: string) => ({
  name,
  description: name,
  inputSchema: z.object({}).strict(),
  execute: jest.fn(),
});

const createProvider = ({
  canRead = true,
  canUpdate = false,
  canSend = false,
}: {
  canRead?: boolean;
  canUpdate?: boolean;
  canSend?: boolean;
} = {}) => {
  const workspaceService = {
    generateMyahInboxTools: jest.fn().mockReturnValue({
      search_myah_inbox_threads: tool('search_myah_inbox_threads'),
      get_myah_inbox_thread_context: tool('get_myah_inbox_thread_context'),
      generate_myah_inbox_reply_proposal: tool(
        'generate_myah_inbox_reply_proposal',
      ),
      update_myah_inbox_thread: tool('update_myah_inbox_thread'),
      save_myah_inbox_reply_draft: tool('save_myah_inbox_reply_draft'),
      get_myah_inbox_reply_send_readiness: tool(
        'get_myah_inbox_reply_send_readiness',
      ),
      get_myah_inbox_reply_send_status: tool(
        'get_myah_inbox_reply_send_status',
      ),
    }),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      rolesPermissions: {
        [roleId]: {
          [messageThreadObjectId]: {
            canReadObjectRecords: canRead,
            canUpdateObjectRecords: canUpdate,
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
  const permissionsService = {
    hasToolPermission: jest.fn().mockResolvedValue(canSend),
  };
  const provider = new MyahInboxToolProvider(
    workspaceService as never,
    workspaceCacheService as never,
    flatEntityMapsCacheService as never,
    permissionsService as never,
  );

  return { provider, workspaceService, permissionsService };
};

describe('MyahInboxToolProvider', () => {
  it('is available to the matching readable user without a thread selection', async () => {
    const readable = createProvider();

    await expect(
      readable.provider.isAvailable({
        ...context,
        myahInboxSelection: undefined,
      } as never),
    ).resolves.toBe(true);
    await expect(
      readable.provider.isAvailable({
        ...context,
        myahInboxSelection: {
          workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea420',
          threadId,
        },
      } as never),
    ).resolves.toBe(true);
    await expect(
      readable.provider.isAvailable({
        ...context,
        actorContext: undefined,
      } as never),
    ).resolves.toBe(false);
    await expect(
      createProvider({ canRead: false }).provider.isAvailable(context as never),
    ).resolves.toBe(false);
  });

  it('emits only readable tools without mutation or send permissions', async () => {
    const { provider, workspaceService, permissionsService } = createProvider();

    const names = (await provider.generateDescriptors(context as never)).map(
      ({ name }) => name,
    );

    expect(names.sort()).toEqual([
      'generate_myah_inbox_reply_proposal',
      'get_myah_inbox_thread_context',
      'search_myah_inbox_threads',
    ]);
    expect(workspaceService.generateMyahInboxTools).toHaveBeenCalledWith(
      context,
    );
    expect(permissionsService.hasToolPermission).toHaveBeenCalledWith(
      context.rolePermissionConfig,
      workspaceId,
      expect.anything(),
    );
  });

  it('emits thread mutations only with MessageThread update permission', async () => {
    const { provider } = createProvider({ canUpdate: true });

    const names = (await provider.generateDescriptors(context as never)).map(
      ({ name }) => name,
    );

    expect(names).toEqual(
      expect.arrayContaining([
        'update_myah_inbox_thread',
        'save_myah_inbox_reply_draft',
      ]),
    );
  });

  it('emits readiness and status only with SEND_EMAIL_TOOL permission and never emits send execution', async () => {
    const { provider } = createProvider({ canSend: true });

    const names = (await provider.generateDescriptors(context as never)).map(
      ({ name }) => name,
    );

    expect(names).toEqual(
      expect.arrayContaining([
        'get_myah_inbox_reply_send_readiness',
        'get_myah_inbox_reply_send_status',
      ]),
    );
    expect(names).not.toContain('send_myah_inbox_reply');
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
      | {
          provide?: symbol;
          inject?: unknown[];
          useFactory?: (...args: unknown[]) => unknown[];
        }
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
        if (moduleImport === MyahInboxModule) return true;

        return (
          typeof moduleImport === 'object' &&
          moduleImport !== null &&
          'forwardRef' in moduleImport &&
          (moduleImport.forwardRef as () => unknown)() === MyahInboxModule
        );
      }),
    ).toBe(true);
    expect(toolProviderProviders).toContain(MyahInboxToolProvider);
    expect(providerCollection?.inject).toContain(MyahInboxToolProvider);
  });
});

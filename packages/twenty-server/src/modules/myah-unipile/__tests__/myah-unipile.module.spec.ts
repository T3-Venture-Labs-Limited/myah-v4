import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import {
  MyahUnipileInstagramController,
  MyahUnipileInstagramPublicController,
} from 'src/modules/myah-unipile/controllers/myah-unipile-instagram.controller';
import { UnipileHostedAuthAttemptEntity } from 'src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramAccountRecoveryCronCommand } from 'src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.cron-command';
import { UnipileInstagramAccountRecoveryJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.job';
import {
  UNIPILE_HOSTED_AUTH_ACCOUNT_FINALIZER,
  UnipileHostedAuthService,
} from 'src/modules/myah-unipile/services/unipile-hosted-auth.service';
import { UnipileInstagramAccountProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-account-projection.service';
import { UnipileInstagramAccountRecoveryService } from 'src/modules/myah-unipile/services/unipile-instagram-account-recovery.service';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import {
  UNIPILE_FETCH,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import { ModulesModule } from 'src/modules/modules.module';

type ModuleConstructor = Function;
type Provider =
  | Function
  | {
      provide: unknown;
      useExisting?: unknown;
      useValue?: unknown;
    };

type MyahUnipileModuleModule = {
  MyahUnipileModule: ModuleConstructor;
};

const loadMyahUnipileModule = (): MyahUnipileModuleModule | undefined => {
  try {
    return require('src/modules/myah-unipile/myah-unipile.module') as MyahUnipileModuleModule;
  } catch {
    return undefined;
  }
};

const requireMyahUnipileModule = () => {
  const myahUnipileModule = loadMyahUnipileModule();

  expect(myahUnipileModule).toBeDefined();

  if (!myahUnipileModule) {
    throw new Error('MyahUnipileModule is not implemented');
  }

  return myahUnipileModule.MyahUnipileModule;
};

const providerToken = (provider: Provider) =>
  typeof provider === 'function' ? provider : provider.provide;

const moduleMetadata = (metadataKey: string, module: ModuleConstructor) =>
  (Reflect.getMetadata(metadataKey, module) ?? []) as unknown[];

const providersFor = (module: ModuleConstructor) =>
  moduleMetadata('providers', module) as Provider[];

const expectUniqueProviderTokens = (providers: Provider[]) => {
  const tokens = providers.map(providerToken);

  expect(new Set(tokens).size).toBe(tokens.length);
};

describe('MyahUnipileModule', () => {
  it('registers the Unipile module with ModulesModule', () => {
    const MyahUnipileModule = requireMyahUnipileModule();

    expect(moduleMetadata('imports', ModulesModule)).toContain(
      MyahUnipileModule,
    );
  });

  it('imports its infrastructure dependencies and TypeORM repositories', () => {
    const MyahUnipileModule = requireMyahUnipileModule();
    const importedModules = moduleMetadata('imports', MyahUnipileModule);
    const repositoryProviderTokens = importedModules.flatMap((importedModule) =>
      typeof importedModule === 'object' &&
      importedModule !== null &&
      'providers' in importedModule
        ? ((importedModule.providers ?? []) as Provider[]).map(providerToken)
        : [],
    );

    expect(importedModules).toEqual(
      expect.arrayContaining([
        AuthModule,
        PermissionsModule,
        GlobalWorkspaceDataSourceModule,
        MessageQueueModule,
        WorkspaceCacheStorageModule,
      ]),
    );
    expect(repositoryProviderTokens).toEqual(
      expect.arrayContaining([
        getRepositoryToken(WorkspaceEntity),
        getRepositoryToken(UnipileInstagramAccountBindingEntity),
        getRepositoryToken(UnipileHostedAuthAttemptEntity),
      ]),
    );
  });

  it('registers its controllers and providers exactly once', () => {
    const MyahUnipileModule = requireMyahUnipileModule();
    const providers = providersFor(MyahUnipileModule);

    expect(moduleMetadata('controllers', MyahUnipileModule)).toEqual(
      expect.arrayContaining([
        MyahUnipileInstagramController,
        MyahUnipileInstagramPublicController,
      ]),
    );
    expect(providers.map(providerToken)).toEqual(
      expect.arrayContaining([
        UnipileInstagramAvailabilityService,
        UnipileV1ClientService,
        UnipileInstagramAccountProjectionService,
        UnipileInstagramAccountService,
        UnipileHostedAuthService,
        UnipileInstagramAccountRecoveryService,
        UnipileInstagramAccountRecoveryJob,
        UnipileInstagramAccountRecoveryCronCommand,
        UNIPILE_FETCH,
        UNIPILE_HOSTED_AUTH_ACCOUNT_FINALIZER,
      ]),
    );
    expectUniqueProviderTokens(providers);
  });

  it('binds global fetch and finalizes hosted auth through the account service', () => {
    const MyahUnipileModule = requireMyahUnipileModule();
    const providers = providersFor(MyahUnipileModule);

    expect(providers).toContainEqual({
      provide: UNIPILE_FETCH,
      useValue: globalThis.fetch,
    });
    expect(providers).toContainEqual({
      provide: UNIPILE_HOSTED_AUTH_ACCOUNT_FINALIZER,
      useExisting: UnipileInstagramAccountService,
    });
  });

  it('exports the services used outside of the module', () => {
    const MyahUnipileModule = requireMyahUnipileModule();

    expect(moduleMetadata('exports', MyahUnipileModule)).toEqual(
      expect.arrayContaining([
        UnipileV1ClientService,
        UnipileInstagramAccountService,
        UnipileInstagramAccountProjectionService,
        UnipileInstagramAvailabilityService,
        UnipileInstagramAccountRecoveryCronCommand,
      ]),
    );
  });
});

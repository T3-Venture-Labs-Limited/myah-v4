import { type DynamicModule } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import {
  getDataSourceToken,
  getRepositoryToken,
  TypeOrmModule,
} from '@nestjs/typeorm';

import { MyahModule } from 'src/engine/core-modules/myah/myah.module';
import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';

import { ManagedEmailAcquisitionOperationEntity } from '../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailModule } from '../managed-email.module';
import { IcemailClient } from '../providers/icemail/icemail.client';
import { WarmupInboxClient } from '../providers/warmup-inbox/warmup-inbox.client';

const ENTITIES = [
  ManagedEmailDomainEntity,
  ManagedEmailMailboxEntity,
  ManagedEmailAcquisitionOperationEntity,
];

class ManagedEmailTestDependenciesModule {}

const dependencyProviders = [
  {
    provide: getDataSourceToken(),
    useValue: {
      entityMetadatas: [],
      getRepository: jest.fn(() => ({})),
      options: { type: 'postgres' },
    },
  },
  {
    provide: TwentyConfigService,
    useValue: { get: jest.fn() },
  },
];
const testDependenciesModule: DynamicModule = {
  exports: dependencyProviders,
  global: true,
  module: ManagedEmailTestDependenciesModule,
  providers: dependencyProviders,
};

describe('ManagedEmailModule', () => {
  it('registers TypeORM and workspace-scoped repositories for all three records', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedEmailModule,
    ) as Array<{ module?: unknown; providers?: Array<{ provide?: unknown }> }>;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ManagedEmailModule,
    ) as Array<{ provide?: unknown }>;
    const typeOrmFeature = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeature).toBeDefined();
    for (const entity of ENTITIES) {
      expect(typeOrmFeature?.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provide: getRepositoryToken(entity) }),
        ]),
      );
      expect(providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provide: getWorkspaceScopedRepositoryToken(entity),
          }),
        ]),
      );
    }
  });

  it('registers and exports only repositories and concrete provider clients', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedEmailModule,
    ) as Array<{ module?: unknown }>;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ManagedEmailModule,
    ) as unknown[];
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ManagedEmailModule) ??
      [];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ManagedEmailModule,
    ) as unknown[];
    const repositoryTokens = ENTITIES.map((entity) =>
      getWorkspaceScopedRepositoryToken(entity),
    );

    expect(imports).toHaveLength(2);
    expect(imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: TypeOrmModule }),
        SecureHttpClientModule,
      ]),
    );
    expect(controllers).toEqual([]);
    expect(providers.filter((item) => item === IcemailClient)).toHaveLength(1);
    expect(providers.filter((item) => item === WarmupInboxClient)).toHaveLength(
      1,
    );
    expect(providers).toHaveLength(repositoryTokens.length + 2);
    expect(exports).toEqual([
      ...repositoryTokens,
      IcemailClient,
      WarmupInboxClient,
    ]);
  });

  it('constructs both provider clients through the production module graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testDependenciesModule, ManagedEmailModule],
    }).compile();

    expect(moduleRef.get(IcemailClient)).toBeInstanceOf(IcemailClient);
    expect(moduleRef.get(WarmupInboxClient)).toBeInstanceOf(WarmupInboxClient);

    await moduleRef.close();
  });

  it('is registered and exported exactly once through MyahModule', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MyahModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MyahModule,
    ) as unknown[];

    expect(imports.filter((item) => item === ManagedEmailModule)).toHaveLength(
      1,
    );
    expect(exports.filter((item) => item === ManagedEmailModule)).toHaveLength(
      1,
    );
  });
});

import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';

import { MyahModule } from 'src/engine/core-modules/myah/myah.module';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';

import { ManagedEmailAcquisitionOperationEntity } from '../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailModule } from '../managed-email.module';

const ENTITIES = [
  ManagedEmailDomainEntity,
  ManagedEmailMailboxEntity,
  ManagedEmailAcquisitionOperationEntity,
];

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

  it('has no speculative imports, controllers, or services', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedEmailModule,
    ) as Array<{ module?: unknown }>;
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ManagedEmailModule) ??
      [];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ManagedEmailModule,
    ) as unknown[];

    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe(TypeOrmModule);
    expect(controllers).toEqual([]);
    expect(exports).toEqual(
      ENTITIES.map((entity) => getWorkspaceScopedRepositoryToken(entity)),
    );
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

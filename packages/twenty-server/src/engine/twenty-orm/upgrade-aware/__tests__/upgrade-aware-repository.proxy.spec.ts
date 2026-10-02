import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { Repository, type DataSource, type EntityManager } from 'typeorm';
import { type EntityMetadata } from 'typeorm/metadata/EntityMetadata';

import { WasIntroducedInUpgrade } from 'src/engine/core-modules/upgrade/decorators/was-introduced-in-upgrade.decorator';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { UpgradeAwareRepositoryState } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-repository-state';
import { UpgradeUnavailableEntityWriteException } from 'src/engine/twenty-orm/upgrade-aware/exceptions/upgrade-unavailable-entity-write.exception';
import { wrapRepositoryWithUpgradeAwareProxy } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-repository.proxy';

const INTRODUCE_STEP = '2.7.0_Introduce_1800000000000';

@WasIntroducedInUpgrade({ upgradeCommandName: INTRODUCE_STEP })
class UnavailableEntity {}

describe('wrapRepositoryWithUpgradeAwareProxy', () => {
  it('preserves a function-valued entity target through nested repository proxies', () => {
    // SWC emits decorated entity classes as functions, not native `class` text.
    function UserEntity() {}

    const metadata = { target: UserEntity, targetName: 'UserEntity' };
    const getMetadata = jest.fn((target: unknown) => {
      if (target !== UserEntity) {
        throw new Error(`No metadata for ${String(target)}`);
      }

      return metadata;
    });
    const manager = {
      connection: { getMetadata },
      createQueryBuilder: jest.fn().mockReturnValue('query-builder'),
    } as unknown as EntityManager;
    const repository = new Repository(UserEntity, manager);
    const state = UpgradeAwareRepositoryState.getInstance();
    const wrapped = wrapRepositoryWithUpgradeAwareProxy({
      repository: wrapRepositoryWithUpgradeAwareProxy({
        repository,
        entityClass: UserEntity,
        state,
      }),
      entityClass: UserEntity,
      state,
    });

    expect(wrapped.target).toBe(UserEntity);
    expect(wrapped.metadata).toBe(metadata);
    expect(wrapped.createQueryBuilder()).toBe('query-builder');
    expect(getMetadata).toHaveBeenCalledWith(UserEntity);
  });

  it('short-circuits find() to an empty array when the entity is unavailable', async () => {
    const metadata = {
      target: UnavailableEntity,
      tableName: 'unavailableEntity',
      tablePath: 'core.unavailableEntity',
      givenTableName: 'unavailableEntity',
      schema: 'core',
      columns: [],
    } as unknown as EntityMetadata;

    const dataSource = {
      entityMetadatas: [metadata],
    } as unknown as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        UpgradeAwareEntityMetadataAdapter,
        {
          provide: UpgradeMigrationService,
          useValue: {
            getLastAttemptedInstanceCommand: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: UpgradeSequenceReaderService,
          useValue: {
            getUpgradeSequence: jest
              .fn()
              .mockReturnValue([{ name: INTRODUCE_STEP }]),
          },
        },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    const adapter = moduleRef.get(UpgradeAwareEntityMetadataAdapter);

    await adapter.onModuleInit();
    await adapter.refresh();

    const find = jest.fn().mockResolvedValue([{ id: 1 }]);
    const save = jest.fn();
    const repository = {
      find,
      save,
    } as unknown as Repository<UnavailableEntity>;

    const wrapped = wrapRepositoryWithUpgradeAwareProxy({
      repository,
      entityClass: UnavailableEntity,
      state: UpgradeAwareRepositoryState.getInstance(),
    });

    await expect(wrapped.find()).resolves.toEqual([]);
    await expect(wrapped.save(new UnavailableEntity())).rejects.toBeInstanceOf(
      UpgradeUnavailableEntityWriteException,
    );
    expect(find).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

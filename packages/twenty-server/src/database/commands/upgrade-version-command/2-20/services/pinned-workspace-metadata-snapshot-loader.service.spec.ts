import { Injectable, Module } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { type QueryRunner } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

import {
  PINNED_SNAPSHOT_CALCULATORS,
  PinnedWorkspaceMetadataSnapshotLoaderService,
} from './pinned-workspace-metadata-snapshot-loader.service';

const workspaceId = 'aaf11f6e-cdde-41bf-b30f-2e94b48b58ad';
const customId = 'e30e4075-1275-4b70-b466-0314aacdfd20';
const keys = [
  ...ALL_FLAT_ENTITY_MAPS_PROPERTIES,
  'flatApplicationMaps',
  'featureFlagsMap',
];

const fixture = () => {
  let generation = 1;
  const calls: Array<[string, string, unknown]> = [];
  const findOne = jest.fn(async () => ({
    id: workspaceId,
    databaseSchema: getWorkspaceSchemaName(workspaceId),
    workspaceCustomApplicationId: customId,
    defaultRoleId: null,
  }));
  const getRepository = jest.fn((entity) => {
    if (entity !== WorkspaceEntity) throw new Error('Unexpected repository');

    return { findOne };
  });
  const manager = { getRepository } as unknown as QueryRunner['manager'];
  const runner = {
    manager,
    isReleased: false,
    isTransactionActive: true,
    hasSchema: jest.fn(async () => true),
  } as unknown as QueryRunner;

  Object.assign(manager, { queryRunner: runner });

  const providers = Object.fromEntries(
    Object.entries(PINNED_SNAPSHOT_CALCULATORS).map(([key, token]) => {
      const provider = Object.create(token.prototype) as {
        computeFromManager: jest.Mock;
        computeForCache: jest.Mock;
      };

      provider.computeForCache = jest.fn(() => {
        throw new Error('CACHE FALLBACK');
      });
      provider.computeFromManager = jest.fn(async (id, usedManager) => {
        calls.push([key, id, usedManager]);
        if (key === 'flatApplicationMaps') {
          return {
            byId: {
              standard: { marker: generation },
              [customId]: { marker: generation },
            },
            idByUniversalIdentifier: {
              [TWENTY_STANDARD_APPLICATION.universalIdentifier]: 'standard',
            },
          };
        }
        if (key === 'featureFlagsMap') return { example: generation % 2 === 0 };

        return {
          byUniversalIdentifier: {
            [`${key}-${generation}`]: { marker: generation },
          },
          universalIdentifierById: {},
          universalIdentifiersByApplicationId: {},
          // A provider-native custom index must not be projected away.
          customIndex: { generation },
        };
      });

      return [token.name, provider];
    }),
  );
  const moduleGet = jest.fn((token, options) => {
    if (options?.strict !== false)
      throw new Error('Must search the host graph');
    if (!providers[token.name]) throw new Error('Unavailable');

    return providers[token.name];
  });
  // Resolve by constructor identity/name, never by the registry's requested key.
  const loader = new PinnedWorkspaceMetadataSnapshotLoaderService(
    { get: moduleGet } as unknown as ModuleRef,
    new Reflector(),
  );

  return {
    loader,
    runner,
    manager,
    findOne,
    getRepository,
    moduleGet,
    providers,
    calls,
    setGeneration: (value: number) => {
      generation = value;
    },
  };
};

describe('pinned workspace metadata snapshot loader (source-only, no database)', () => {
  it('resolves a nonexported duplicated provider through actual Nest module hosts', async () => {
    class HostOnlyCalculator {}
    class AbsentCalculator {}
    @Injectable()
    class RootProbe {
      constructor(readonly moduleRef: ModuleRef) {}
    }

    @Module({ providers: [HostOnlyCalculator] })
    class FirstHost {}
    @Module({ providers: [HostOnlyCalculator] })
    class SecondHost {}

    const graph = await Test.createTestingModule({
      imports: [FirstHost, SecondHost],
      providers: [RootProbe],
    }).compile();

    try {
      const moduleRef = graph.get(RootProbe).moduleRef;

      expect(() => moduleRef.get(HostOnlyCalculator)).toThrow();
      expect(
        moduleRef.get(HostOnlyCalculator, { strict: false }),
      ).toBeInstanceOf(HostOnlyCalculator);
      expect(() =>
        moduleRef.get(AbsentCalculator, { strict: false }),
      ).toThrow();
    } finally {
      await graph.close();
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('resolves exactly the independent metadata inventory and two extras', () => {
    expect(new Set(keys).size).toBe(33);
    expect(Object.keys(PINNED_SNAPSHOT_CALCULATORS).sort()).toEqual(
      [...keys].sort(),
    );
  });

  it('rejects invalid workspace and runner bindings before reads or resolution', async () => {
    const f = fixture();
    const invalid = ['', 'workspace-A', '00000000-0000-0000-0000-000000000000'];

    for (const id of invalid)
      await expect(f.loader.load(id, f.runner)).rejects.toThrow();
    for (const change of [
      { isReleased: true },
      { isTransactionActive: false },
      { manager: { queryRunner: {} } },
    ]) {
      const badRunner = { ...f.runner, ...change } as QueryRunner;

      await expect(f.loader.load(workspaceId, badRunner)).rejects.toThrow();
    }
    expect(f.getRepository).not.toHaveBeenCalled();
    expect(f.moduleGet).not.toHaveBeenCalled();
  });

  it('rejects absent, mismatched and incapable calculators before SQL', async () => {
    const f = fixture();
    const key = 'flatAgentMaps';
    const original = PINNED_SNAPSHOT_CALCULATORS[key];

    try {
      delete (
        PINNED_SNAPSHOT_CALCULATORS as Partial<
          typeof PINNED_SNAPSHOT_CALCULATORS
        >
      )[key];
      await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
        'registry',
      );
      PINNED_SNAPSHOT_CALCULATORS[key] = original;
      // Runtime key/decorator correlation must detect even a resolvable wrong token.
      (PINNED_SNAPSHOT_CALCULATORS as Record<string, unknown>)[key] =
        PINNED_SNAPSHOT_CALCULATORS.flatSkillMaps;
      await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
        'invalid',
      );
      PINNED_SNAPSHOT_CALCULATORS[key] = original;

      f.moduleGet.mockImplementationOnce(() => {
        throw new Error('missing host');
      });
      await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
        'unavailable',
      );
      f.moduleGet.mockImplementationOnce(() =>
        Object.create(PINNED_SNAPSHOT_CALCULATORS.flatSkillMaps.prototype),
      );
      await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
        'invalid',
      );
      const reflector = jest.spyOn(Reflector.prototype, 'get');

      reflector.mockReturnValueOnce('wrong-decoration');
      await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
        'invalid',
      );
      reflector.mockRestore();
      const agent = f.providers[original.name];
      agent.computeFromManager = undefined as unknown as jest.Mock;
      await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
        'invalid',
      );
    } finally {
      PINNED_SNAPSHOT_CALCULATORS[key] = original;
    }
    expect(f.getRepository).not.toHaveBeenCalled();
  });

  it('uses the same manager and workspace for all 33 serial groups, without cache fallback', async () => {
    const f = fixture();
    const first = await f.loader.load(workspaceId, f.runner);

    expect(f.calls.map(([key]) => key)).toEqual(keys);
    expect(
      f.calls.every(
        ([, id, manager]) => id === workspaceId && manager === f.manager,
      ),
    ).toBe(true);
    expect(f.findOne).toHaveBeenCalledWith({
      where: { id: workspaceId },
      select: [
        'id',
        'databaseSchema',
        'workspaceCustomApplicationId',
        'defaultRoleId',
      ],
      withDeleted: true,
    });
    expect(first.queryRunner).toBe(f.runner);
    expect(first.allFlatEntityMaps.flatAgentMaps).toHaveProperty('customIndex');
    expect(
      Object.values(f.providers).every(
        (provider) => !provider.computeForCache.mock.calls.length,
      ),
    ).toBe(true);

    f.setGeneration(2);
    const second = await f.loader.load(workspaceId, f.runner);

    expect(second.allFlatEntityMaps.flatAgentMaps).not.toBe(
      first.allFlatEntityMaps.flatAgentMaps,
    );
    expect(
      first.allFlatEntityMaps.flatAgentMaps.byUniversalIdentifier,
    ).toHaveProperty('flatAgentMaps-1');
    expect(
      second.allFlatEntityMaps.flatAgentMaps.byUniversalIdentifier,
    ).toHaveProperty('flatAgentMaps-2');
    expect(first.featureFlagsMap).toEqual({ example: false });
    expect(second.featureFlagsMap).toEqual({ example: true });
  });

  it('fails closed on schema, owner, missing result, incomplete index and invalidated runner', async () => {
    const f = fixture();

    f.findOne.mockResolvedValueOnce(null as never);
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'schema mismatch',
    );
    f.findOne.mockResolvedValueOnce({
      id: workspaceId,
      databaseSchema: 'wrong',
    } as never);
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'schema mismatch',
    );
    f.runner.hasSchema = jest.fn(async () => false);
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'schema missing',
    );
    f.runner.hasSchema = jest.fn(async () => true);

    const app =
      f.providers[PINNED_SNAPSHOT_CALCULATORS.flatApplicationMaps.name];
    app.computeFromManager.mockResolvedValueOnce({
      byId: {},
      idByUniversalIdentifier: {},
    });
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'owners missing',
    );
    app.computeFromManager.mockResolvedValueOnce({
      byId: { standard: {} },
      idByUniversalIdentifier: {
        [TWENTY_STANDARD_APPLICATION.universalIdentifier]: 'standard',
      },
    });
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'owners missing',
    );
    const agent = f.providers[PINNED_SNAPSHOT_CALCULATORS.flatAgentMaps.name];
    agent.computeFromManager.mockResolvedValueOnce(undefined);
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'returned no map',
    );
    agent.computeFromManager.mockResolvedValueOnce({
      byUniversalIdentifier: {},
    });
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'indexes incomplete',
    );
    agent.computeFromManager.mockImplementationOnce(async () => {
      Object.assign(f.runner, { isTransactionActive: false });
      return {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      };
    });
    await expect(f.loader.load(workspaceId, f.runner)).rejects.toThrow(
      'active bound',
    );
  });
});

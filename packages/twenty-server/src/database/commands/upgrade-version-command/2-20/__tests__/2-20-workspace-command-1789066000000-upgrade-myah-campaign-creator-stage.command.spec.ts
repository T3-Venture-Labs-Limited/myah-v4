import { MODULE_METADATA } from '@nestjs/common/constants';
import {
  MYAH_CAMPAIGN_CREATOR_STAGES,
  MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
} from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { UpgradeMyahCampaignCreatorStageCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789066000000-upgrade-myah-campaign-creator-stage.command';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

type State = {
  storage: 'text' | 'character varying' | 'enum';
  values: (string | null)[];
  metadata: {
    type: string;
    options: unknown;
    defaultValue: unknown;
    isNullable: boolean | null;
  };
  storageIsNullable?: boolean;
  enumLabels?: readonly string[];
};

const workspaceId = '00000000-0000-4000-8000-000000000001';

const createHarness = (state: State) => {
  const statements: string[] = [];
  const runner = {
    isTransactionActive: false,
    connect: jest.fn(),
    release: jest.fn(),
    startTransaction: jest.fn(async () => {
      runner.isTransactionActive = true;
    }),
    commitTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
    }),
    rollbackTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
    }),
    query: jest.fn(async (sql: string, parameters?: unknown[]) => {
      statements.push(sql);
      if (sql.includes('FROM "core"."objectMetadata"')) return [{ exists: 1 }];
      if (sql.includes('FROM "core"."fieldMetadata"')) {
        return [{ id: 'field-1', ...state.metadata }];
      }
      if (sql.includes('FROM information_schema.columns')) {
        return [{
          dataType: state.storage === 'enum' ? 'USER-DEFINED' : state.storage,
          udtName: state.storage === 'enum' ? 'campaignCreator_stage_enum' : state.storage,
          udtSchema: getWorkspaceSchemaName(workspaceId),
          columnDefault: state.storage === 'enum' ? "'READY'::campaignCreator_stage_enum" : null,
          isNullable: state.storageIsNullable ?? true,
        }];
      }
      if (sql.includes('array_agg')) {
        return [{
          invalidValues: state.values.filter(
            (value): value is string =>
              value !== null &&
              !MYAH_CAMPAIGN_CREATOR_STAGES.includes(
                value.trim().toUpperCase() as (typeof MYAH_CAMPAIGN_CREATOR_STAGES)[number],
              ),
          ),
        }];
      }
      if (sql.includes('FROM pg_catalog.pg_type') && !sql.includes('pg_enum')) {
        return [];
      }
      if (sql.includes('FROM pg_catalog.pg_enum')) {
        return (state.enumLabels ?? MYAH_CAMPAIGN_CREATOR_STAGES).map(
          (enumLabel) => ({ enumLabel }),
        );
      }
      if (sql.includes('ALTER COLUMN "stage" TYPE')) {
        state.storage = 'enum';
        state.values = state.values.map((value) => value?.trim().toUpperCase() ?? null);
      }
      if (sql.includes('UPDATE "core"."fieldMetadata"')) {
        state.metadata = {
          type: FieldMetadataType.SELECT,
          options: JSON.parse(parameters?.[1] as string),
          defaultValue: JSON.parse(parameters?.[2] as string),
          isNullable: true,
        };
      }
      return [];
    }),
  };
  const cache = {
    flush: jest.fn(),
    invalidateAndRecompute: jest.fn(),
  };
  const versions = { incrementMetadataVersion: jest.fn() };
  const command = new UpgradeMyahCampaignCreatorStageCommand(
    {} as never,
    cache as never,
    versions as never,
  );
  const run = () =>
    command.runOnWorkspace({
      workspaceId,
      options: {},
      index: 0,
      total: 1,
      dataSource: {
        coreDataSource: { createQueryRunner: () => runner },
      } as never,
    });

  return { cache, command, run, runner, statements, versions };
};

const legacyState = (values: (string | null)[] = [' ready ', 'Contacted', null]): State => ({
  storage: 'text',
  values,
  metadata: {
    type: FieldMetadataType.TEXT,
    options: null,
    defaultValue: null,
    isNullable: true,
  },
});

describe('UpgradeMyahCampaignCreatorStageCommand', () => {
  it('uses the command identity after the prior registered command', () => {
    expect(getRegisteredWorkspaceCommandMetadata(UpgradeMyahCampaignCreatorStageCommand)).toMatchObject({
      version: '2.20.0',
      timestamp: 1789066000000,
    });
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        V2_20_UpgradeVersionCommandModule,
      ),
    ).toContain(UpgradeMyahCampaignCreatorStageCommand);
  });

  it('normalizes approved values and atomically converts storage and metadata', async () => {
    const state = legacyState();
    const harness = createHarness(state);

    await harness.run();

    expect(state).toEqual({
      storage: 'enum',
      values: ['READY', 'CONTACTED', null],
      metadata: {
        type: FieldMetadataType.SELECT,
        options: MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
        defaultValue: "'READY'",
        isNullable: true,
      },
    });
    expect(harness.runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(harness.versions.incrementMetadataVersion).toHaveBeenCalledWith(workspaceId);
    expect(harness.cache.flush.mock.invocationCallOrder[0]).toBeLessThan(
      harness.versions.incrementMetadataVersion.mock.invocationCallOrder[0],
    );
    expect(
      harness.versions.incrementMetadataVersion.mock.invocationCallOrder[0],
    ).toBeLessThan(
      harness.cache.invalidateAndRecompute.mock.invocationCallOrder[0],
    );
  });

  it.each([['blank', [' ']], ['obsolete', ['REPLIED']], ['unknown', ['SOMETHING_ELSE']]])(
    'refuses %s TEXT values before any mutation',
    async (_name, values) => {
      const state = legacyState(values);
      const before = structuredClone(state);
      const harness = createHarness(state);

      await expect(harness.run()).rejects.toThrow('blank, obsolete, or unknown');

      expect(state).toEqual(before);
      expect(harness.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(harness.statements).not.toContainEqual(expect.stringContaining('CREATE TYPE'));
      expect(harness.cache.flush).not.toHaveBeenCalled();
    },
  );

  it('rolls back and does not publish when conversion fails', async () => {
    const state = legacyState();
    const harness = createHarness(state);
    const baseQuery = harness.runner.query.getMockImplementation();

    harness.runner.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('ALTER COLUMN "stage" TYPE')) {
        throw new Error('conversion failed');
      }
      return baseQuery!(sql, parameters);
    });

    await expect(harness.run()).rejects.toThrow('conversion failed');
    expect(harness.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(harness.runner.commitTransaction).not.toHaveBeenCalled();
    expect(harness.versions.incrementMetadataVersion).not.toHaveBeenCalled();
    expect(harness.cache.flush).not.toHaveBeenCalled();
  });

  it.each([false, null])(
    'refuses legacy metadata nullability %p before mutation',
    async (isNullable) => {
      const state = legacyState();
      state.metadata.isNullable = isNullable;
      const before = structuredClone(state);
      const harness = createHarness(state);

      await expect(harness.run()).rejects.toThrow('TEXT stage metadata is noncanonical');
      expect(state).toEqual(before);
      expect(harness.statements).not.toContainEqual(expect.stringContaining('CREATE TYPE'));
      expect(harness.cache.flush).not.toHaveBeenCalled();
    },
  );

  it.each(['text', 'enum'] as const)(
    'refuses NOT NULL %s storage before mutation or publication',
    async (storage) => {
      const state =
        storage === 'text'
          ? legacyState()
          : {
              storage: 'enum' as const,
              values: ['READY'],
              metadata: {
                type: FieldMetadataType.SELECT,
                options: MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
                defaultValue: "'READY'",
                isNullable: true,
              },
            };
      state.storageIsNullable = false;
      const before = structuredClone(state);
      const harness = createHarness(state);

      await expect(harness.run()).rejects.toThrow('storage is not nullable');
      expect(state).toEqual(before);
      expect(harness.cache.flush).not.toHaveBeenCalled();
    },
  );

  it('refuses an option with extra properties while ignoring JSON key order', async () => {
    const reorderedReady = Object.fromEntries(
      Object.entries(MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS[0]).reverse(),
    );
    const state: State = {
      storage: 'enum',
      values: ['READY'],
      metadata: {
        type: FieldMetadataType.SELECT,
        options: [
          { ...reorderedReady, obsoleteProperty: true },
          ...MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS.slice(1),
        ],
        defaultValue: "'READY'",
        isNullable: true,
      },
    };
    const before = structuredClone(state);
    const harness = createHarness(state);

    await expect(harness.run()).rejects.toThrow('SELECT stage metadata is noncanonical');
    expect(state).toEqual(before);
    expect(harness.cache.flush).not.toHaveBeenCalled();
  });

  it('accepts key-reordered exact options', async () => {
    const state: State = {
      storage: 'enum',
      values: ['READY'],
      metadata: {
        type: FieldMetadataType.SELECT,
        options: MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS.map((option) =>
          Object.fromEntries(Object.entries(option).reverse()),
        ),
        defaultValue: "'READY'",
        isNullable: true,
      },
    };

    await expect(createHarness(state).run()).resolves.toBeUndefined();
  });

  it('does not publish a version when flush fails and retries safely', async () => {
    const state: State = {
      storage: 'enum',
      values: ['READY'],
      metadata: {
        type: FieldMetadataType.SELECT,
        options: MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
        defaultValue: "'READY'",
        isNullable: true,
      },
    };
    const harness = createHarness(state);
    harness.cache.flush.mockRejectedValueOnce(new Error('flush unavailable'));

    await expect(harness.run()).rejects.toThrow('flush unavailable');
    expect(harness.versions.incrementMetadataVersion).not.toHaveBeenCalled();
    expect(harness.cache.invalidateAndRecompute).not.toHaveBeenCalled();
    await expect(harness.run()).resolves.toBeUndefined();
    expect(harness.cache.flush).toHaveBeenCalledTimes(2);
    expect(harness.versions.incrementMetadataVersion).toHaveBeenCalledTimes(1);
    expect(harness.cache.invalidateAndRecompute).toHaveBeenCalledTimes(1);
  });

  it('retries publication in flush-version-recompute order', async () => {
    const state: State = {
      storage: 'enum',
      values: ['READY', null],
      metadata: {
        type: FieldMetadataType.SELECT,
        options: MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
        defaultValue: "'READY'",
        isNullable: true,
      },
    };
    const harness = createHarness(state);
    harness.cache.invalidateAndRecompute.mockRejectedValueOnce(new Error('cache unavailable'));

    await expect(harness.run()).rejects.toThrow('cache unavailable');
    await expect(harness.run()).resolves.toBeUndefined();

    expect(harness.runner.commitTransaction).toHaveBeenCalledTimes(2);
    expect(harness.cache.flush).toHaveBeenCalledTimes(2);
    expect(harness.versions.incrementMetadataVersion).toHaveBeenCalledTimes(2);
    expect(harness.cache.invalidateAndRecompute).toHaveBeenCalledTimes(2);
    const publicationCalls = [
      ...harness.cache.flush.mock.invocationCallOrder.map((order) => ({ order, name: 'flush' })),
      ...harness.versions.incrementMetadataVersion.mock.invocationCallOrder.map((order) => ({ order, name: 'version' })),
      ...harness.cache.invalidateAndRecompute.mock.invocationCallOrder.map((order) => ({ order, name: 'recompute' })),
    ]
      .sort((left, right) => left.order - right.order)
      .map(({ name }) => name);
    expect(publicationCalls).toEqual([
      'flush',
      'version',
      'recompute',
      'flush',
      'version',
      'recompute',
    ]);
    expect(harness.statements).not.toContainEqual(expect.stringContaining('ALTER COLUMN "stage" TYPE'));
  });

  it('refuses old or noncanonical enum labels without mutation or publication', async () => {
    const state: State = {
      storage: 'enum',
      values: ['READY'],
      metadata: {
        type: FieldMetadataType.TEXT,
        options: null,
        defaultValue: null,
        isNullable: true,
      },
    };
    state.enumLabels = [
      'READY',
      'CONTACTED',
      'REPLIED',
      'NEGOTIATING',
      'AGREED',
      'ONBOARDING',
      'LIVE',
      'COMPLETED',
      'DROPPED',
    ];
    const harness = createHarness(state);

    await expect(harness.run()).rejects.toThrow('noncanonical SELECT enum');
    expect(harness.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(harness.cache.flush).not.toHaveBeenCalled();
  });
});

import { resolve } from 'path';
import { DataSource, type DataSourceOptions, type EntityTarget } from 'typeorm';

jest.mock('dotenv', () => ({ config: jest.fn() }));

type CoreEntityClasses = {
  workspace: EntityTarget<object>;
  userWorkspace: EntityTarget<object>;
  accountBinding: EntityTarget<object>;
  hostedAuthAttempt: EntityTarget<object>;
  chatCheckpoint: EntityTarget<object>;
  syncRun: EntityTarget<object>;
  webhookEvent: EntityTarget<object>;
};

const buildCoreDataSourceMetadata = async (
  isBillingEnabled: boolean,
): Promise<{ dataSource: DataSource; entities: CoreEntityClasses }> => {
  jest.resetModules();
  process.env.IS_BILLING_ENABLED = String(isBillingEnabled);

  const { typeORMCoreModuleOptions } =
    await import('src/database/typeorm/core/core.datasource');
  const [
    { WorkspaceEntity },
    { UserWorkspaceEntity },
    { UnipileInstagramAccountBindingEntity },
    { UnipileHostedAuthAttemptEntity },
    { UnipileInstagramChatCheckpointEntity },
    { UnipileInstagramSyncRunEntity },
    { UnipileInstagramWebhookEventEntity },
  ] = await Promise.all([
    import('src/engine/core-modules/workspace/workspace.entity'),
    import('src/engine/core-modules/user-workspace/user-workspace.entity'),
    import('src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity'),
    import('src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity'),
    import('src/modules/myah-unipile/entities/unipile-instagram-chat-checkpoint.entity'),
    import('src/modules/myah-unipile/entities/unipile-instagram-sync-run.entity'),
    import('src/modules/myah-unipile/entities/unipile-instagram-webhook-event.entity'),
  ]);
  const dataSource = new DataSource({
    ...typeORMCoreModuleOptions,
    entities: (typeORMCoreModuleOptions.entities as string[]).map(
      (entityPath) => resolve(__dirname, '../../../..', entityPath),
    ),
  } as DataSourceOptions);

  await (
    dataSource as unknown as { buildMetadatas: () => Promise<void> }
  ).buildMetadatas();

  return {
    dataSource,
    entities: {
      workspace: WorkspaceEntity,
      userWorkspace: UserWorkspaceEntity,
      accountBinding: UnipileInstagramAccountBindingEntity,
      hostedAuthAttempt: UnipileHostedAuthAttemptEntity,
      chatCheckpoint: UnipileInstagramChatCheckpointEntity,
      syncRun: UnipileInstagramSyncRunEntity,
      webhookEvent: UnipileInstagramWebhookEventEntity,
    },
  };
};

describe('typeORMCoreModuleOptions', () => {
  const originalBillingEnabled = process.env.IS_BILLING_ENABLED;
  const originalArgv = process.argv;

  afterEach(() => {
    if (originalBillingEnabled === undefined) {
      delete process.env.IS_BILLING_ENABLED;
    } else {
      process.env.IS_BILLING_ENABLED = originalBillingEnabled;
    }
    process.argv = originalArgv;
    jest.resetModules();
  });

  it.each([true, false])(
    'loads Unipile entities and their relation targets when billing is %s',
    async (isBillingEnabled) => {
      const { dataSource, entities } =
        await buildCoreDataSourceMetadata(isBillingEnabled);

      expect(dataSource.isInitialized).toBe(false);
      expect(dataSource.options.entities).toEqual(
        expect.arrayContaining([
          expect.stringContaining('src/engine/core-modules/'),
          expect.stringContaining('src/engine/metadata-modules/'),
          expect.stringContaining('src/modules/myah-unipile/entities/'),
        ]),
      );

      for (const entity of [
        entities.accountBinding,
        entities.hostedAuthAttempt,
        entities.chatCheckpoint,
        entities.syncRun,
        entities.webhookEvent,
      ]) {
        expect(dataSource.hasMetadata(entity)).toBe(true);
      }

      expect(
        dataSource
          .getMetadata(entities.hostedAuthAttempt)
          .relations.map((relation) => relation.inverseEntityMetadata.target),
      ).toEqual(
        expect.arrayContaining([
          entities.workspace,
          entities.userWorkspace,
          entities.accountBinding,
        ]),
      );
      expect(
        dataSource
          .getMetadata(entities.accountBinding)
          .relations.map((relation) => relation.inverseEntityMetadata.target),
      ).toEqual(
        expect.arrayContaining([entities.workspace, entities.userWorkspace]),
      );
      for (const entity of [
        entities.chatCheckpoint,
        entities.syncRun,
        entities.webhookEvent,
      ]) {
        expect(
          dataSource
            .getMetadata(entity)
            .relations.map((relation) => relation.inverseEntityMetadata.target),
        ).toEqual(expect.arrayContaining([entities.accountBinding]));
      }
    },
  );

  it.each([true, false])(
    'uses dist entity globs outside Jest when billing is %s',
    async (isBillingEnabled) => {
      process.argv = ['node', 'core-datasource-check'];
      jest.resetModules();
      process.env.IS_BILLING_ENABLED = String(isBillingEnabled);

      const { typeORMCoreModuleOptions } =
        await import('src/database/typeorm/core/core.datasource');

      expect(typeORMCoreModuleOptions.entities).toEqual(
        expect.arrayContaining([
          expect.stringContaining('dist/engine/core-modules/'),
          expect.stringContaining('dist/engine/metadata-modules/'),
          expect.stringContaining('dist/modules/myah-unipile/entities/'),
        ]),
      );
    },
  );
});

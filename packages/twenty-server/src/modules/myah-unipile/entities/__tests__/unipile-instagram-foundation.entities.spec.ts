import { getMetadataArgsStorage } from 'typeorm';

type EntityConstructor = Function;

type UnipileInstagramAccountBindingEntityModule = {
  UnipileInstagramAccountBindingEntity: EntityConstructor;
  UnipileInstagramAccountBindingStatus: Record<string, string>;
};

type UnipileHostedAuthAttemptEntityModule = {
  UnipileHostedAuthAttemptEntity: EntityConstructor;
  UnipileHostedAuthAttemptOperation: Record<string, string>;
  UnipileHostedAuthAttemptStatus: Record<string, string>;
};

const loadBindingEntityModule = ():
  | UnipileInstagramAccountBindingEntityModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity') as UnipileInstagramAccountBindingEntityModule;
  } catch {
    return undefined;
  }
};

const loadHostedAuthAttemptEntityModule = ():
  | UnipileHostedAuthAttemptEntityModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity') as UnipileHostedAuthAttemptEntityModule;
  } catch {
    return undefined;
  }
};

const requireFoundationEntities = () => {
  const bindingEntityModule = loadBindingEntityModule();
  const hostedAuthAttemptEntityModule = loadHostedAuthAttemptEntityModule();

  expect(bindingEntityModule).toBeDefined();
  expect(hostedAuthAttemptEntityModule).toBeDefined();

  if (!bindingEntityModule || !hostedAuthAttemptEntityModule) {
    throw new Error(
      'Unipile Instagram foundation entities are not implemented',
    );
  }

  return { bindingEntityModule, hostedAuthAttemptEntityModule };
};

const metadataFor = (target: EntityConstructor) => {
  const metadata = getMetadataArgsStorage();

  return {
    columns: metadata.columns.filter((column) => column.target === target),
    indices: metadata.indices.filter((index) => index.target === target),
    joinColumns: metadata.joinColumns.filter(
      (joinColumn) => joinColumn.target === target,
    ),
    relations: metadata.relations.filter(
      (relation) => relation.target === target,
    ),
    table: metadata.tables.find((table) => table.target === target),
    uniques: metadata.uniques.filter((unique) => unique.target === target),
  };
};

const columnOptions = (target: EntityConstructor, propertyName: string) =>
  metadataFor(target).columns.find(
    (column) => column.propertyName === propertyName,
  )?.options;

const expectRequiredColumns = (
  target: EntityConstructor,
  propertyNames: readonly string[],
) => {
  for (const propertyName of propertyNames) {
    expect(columnOptions(target, propertyName)).toBeDefined();
    expect(columnOptions(target, propertyName)?.nullable).not.toBe(true);
  }
};

const expectNullableColumns = (
  target: EntityConstructor,
  propertyNames: readonly string[],
) => {
  for (const propertyName of propertyNames) {
    expect(columnOptions(target, propertyName)).toMatchObject({
      nullable: true,
    });
  }
};

const expectExactEnumValues = (
  value: Record<string, string>,
  expectedValues: readonly string[],
) => {
  const values = Object.values(value);

  expect(values).toHaveLength(expectedValues.length);
  expect(values).toEqual(expect.arrayContaining(expectedValues));
};

describe('Unipile Instagram foundation entities', () => {
  it('maps the binding table, its identity fields, and its lifecycle status', () => {
    const { bindingEntityModule } = requireFoundationEntities();
    const {
      UnipileInstagramAccountBindingEntity,
      UnipileInstagramAccountBindingStatus,
    } = bindingEntityModule;
    const metadata = metadataFor(UnipileInstagramAccountBindingEntity);

    expect(metadata.table).toMatchObject({
      name: 'unipileInstagramAccountBinding',
      schema: 'core',
    });
    expectExactEnumValues(UnipileInstagramAccountBindingStatus, [
      'CONNECTING',
      'ACTIVE',
      'NEEDS_RECONNECT',
      'ERROR',
      'INACTIVE',
      'DELETE_UNKNOWN',
    ]);
    expectRequiredColumns(UnipileInstagramAccountBindingEntity, [
      'id',
      'workspaceId',
      'workspaceInstagramAccountRecordId',
      'unipileAccountId',
      'instagramUserId',
      'status',
    ]);
    expectNullableColumns(UnipileInstagramAccountBindingEntity, [
      'connectedByUserWorkspaceId',
      'deactivatedAt',
    ]);
    expect(
      columnOptions(UnipileInstagramAccountBindingEntity, 'workspaceId'),
    ).toMatchObject({
      type: 'uuid',
    });
    expect(
      columnOptions(
        UnipileInstagramAccountBindingEntity,
        'workspaceInstagramAccountRecordId',
      ),
    ).toMatchObject({ type: 'uuid' });
    expect(
      columnOptions(UnipileInstagramAccountBindingEntity, 'unipileAccountId'),
    ).toMatchObject({ type: 'text' });
    expect(
      columnOptions(UnipileInstagramAccountBindingEntity, 'instagramUserId'),
    ).toMatchObject({ type: 'text' });
    expect(
      columnOptions(
        UnipileInstagramAccountBindingEntity,
        'connectedByUserWorkspaceId',
      ),
    ).toMatchObject({ type: 'uuid' });
    expect(
      columnOptions(UnipileInstagramAccountBindingEntity, 'status'),
    ).toMatchObject({
      default: 'CONNECTING',
      type: 'varchar',
    });
    expect(
      columnOptions(UnipileInstagramAccountBindingEntity, 'deactivatedAt'),
    ).toMatchObject({ nullable: true, type: 'timestamptz' });
    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ columns: ['unipileAccountId'] }),
      ]),
    );
    expect(metadata.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'IDX_UNIPILE_IG_BINDING_ACTIVE_INSTAGRAM_OWNER',
          columns: ['instagramUserId'],
          unique: true,
          where: '"deactivatedAt" IS NULL',
        }),
      ]),
    );
  });

  it('maps hosted-auth attempts, callback correlation, and completion facts', () => {
    const { hostedAuthAttemptEntityModule } = requireFoundationEntities();
    const {
      UnipileHostedAuthAttemptEntity,
      UnipileHostedAuthAttemptOperation,
      UnipileHostedAuthAttemptStatus,
    } = hostedAuthAttemptEntityModule;
    const metadata = metadataFor(UnipileHostedAuthAttemptEntity);

    expect(metadata.table).toMatchObject({
      name: 'unipileHostedAuthAttempt',
      schema: 'core',
    });
    expectExactEnumValues(UnipileHostedAuthAttemptOperation, [
      'CREATE',
      'RECONNECT',
    ]);
    expectExactEnumValues(UnipileHostedAuthAttemptStatus, [
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
    ]);
    expectRequiredColumns(UnipileHostedAuthAttemptEntity, [
      'id',
      'workspaceId',
      'operation',
      'callbackSecretHash',
      'status',
      'expiresAt',
    ]);
    expectNullableColumns(UnipileHostedAuthAttemptEntity, [
      'userWorkspaceId',
      'expectedBindingId',
      'callbackDigest',
      'callbackAccountId',
      'callbackStatus',
      'processedAt',
      'failureCode',
      'failureReason',
    ]);
    for (const propertyName of [
      'workspaceId',
      'userWorkspaceId',
      'expectedBindingId',
    ]) {
      expect(
        columnOptions(UnipileHostedAuthAttemptEntity, propertyName),
      ).toMatchObject({
        type: 'uuid',
      });
    }
    for (const propertyName of [
      'callbackSecretHash',
      'callbackDigest',
      'callbackAccountId',
      'callbackStatus',
      'failureCode',
      'failureReason',
    ]) {
      expect(
        columnOptions(UnipileHostedAuthAttemptEntity, propertyName),
      ).toMatchObject({
        type: 'text',
      });
    }
    expect(
      columnOptions(UnipileHostedAuthAttemptEntity, 'operation'),
    ).toMatchObject({
      enum: UnipileHostedAuthAttemptOperation,
      enumName: 'unipileHostedAuthAttempt_operation_enum',
      type: 'enum',
    });
    expect(
      columnOptions(UnipileHostedAuthAttemptEntity, 'status'),
    ).toMatchObject({
      default: 'PENDING',
      enum: UnipileHostedAuthAttemptStatus,
      enumName: 'unipileHostedAuthAttempt_status_enum',
      type: 'enum',
    });
    expect(
      columnOptions(UnipileHostedAuthAttemptEntity, 'expiresAt'),
    ).toMatchObject({
      type: 'timestamptz',
    });
    expect(
      columnOptions(UnipileHostedAuthAttemptEntity, 'processedAt'),
    ).toMatchObject({
      nullable: true,
      type: 'timestamptz',
    });
    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ columns: ['callbackSecretHash'] }),
      ]),
    );
  });

  it('keeps foreign-key identities and managed timestamps in entity metadata', () => {
    const { bindingEntityModule, hostedAuthAttemptEntityModule } =
      requireFoundationEntities();
    const bindingMetadata = metadataFor(
      bindingEntityModule.UnipileInstagramAccountBindingEntity,
    );
    const hostedAuthAttemptMetadata = metadataFor(
      hostedAuthAttemptEntityModule.UnipileHostedAuthAttemptEntity,
    );

    expect(bindingMetadata.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: 'workspace' }),
        expect.objectContaining({ propertyName: 'connectedByUserWorkspace' }),
      ]),
    );
    expect(bindingMetadata.joinColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'workspaceId',
          propertyName: 'workspace',
          referencedColumnName: 'id',
        }),
        expect.objectContaining({
          name: 'connectedByUserWorkspaceId',
          propertyName: 'connectedByUserWorkspace',
          referencedColumnName: 'id',
        }),
      ]),
    );
    expect(
      bindingMetadata.relations.find(
        (relation) => relation.propertyName === 'connectedByUserWorkspace',
      )?.options,
    ).toMatchObject({ onDelete: 'SET NULL' });
    expect(hostedAuthAttemptMetadata.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: 'workspace' }),
        expect.objectContaining({ propertyName: 'userWorkspace' }),
        expect.objectContaining({ propertyName: 'expectedBinding' }),
      ]),
    );
    expect(hostedAuthAttemptMetadata.joinColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'workspaceId',
          propertyName: 'workspace',
          referencedColumnName: 'id',
        }),
        expect.objectContaining({
          name: 'userWorkspaceId',
          propertyName: 'userWorkspace',
          referencedColumnName: 'id',
        }),
        expect.objectContaining({
          name: 'expectedBindingId',
          propertyName: 'expectedBinding',
          referencedColumnName: 'id',
        }),
      ]),
    );
    expect(
      hostedAuthAttemptMetadata.relations.find(
        (relation) => relation.propertyName === 'userWorkspace',
      )?.options,
    ).toMatchObject({ onDelete: 'SET NULL' });
    for (const [target, propertyName, mode] of [
      [
        bindingEntityModule.UnipileInstagramAccountBindingEntity,
        'createdAt',
        'createDate',
      ],
      [
        bindingEntityModule.UnipileInstagramAccountBindingEntity,
        'updatedAt',
        'updateDate',
      ],
      [
        hostedAuthAttemptEntityModule.UnipileHostedAuthAttemptEntity,
        'createdAt',
        'createDate',
      ],
      [
        hostedAuthAttemptEntityModule.UnipileHostedAuthAttemptEntity,
        'updatedAt',
        'updateDate',
      ],
    ] as const) {
      const column = metadataFor(target).columns.find(
        (candidate) => candidate.propertyName === propertyName,
      );

      expect(column).toMatchObject({ mode, options: { type: 'timestamptz' } });
    }
  });
});

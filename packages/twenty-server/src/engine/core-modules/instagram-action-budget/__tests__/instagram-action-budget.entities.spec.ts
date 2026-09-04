import { getMetadataArgsStorage } from 'typeorm';

type EntityConstructor = Function;

type InstagramActionReservationEntityModule = {
  InstagramActionKind: Record<string, string>;
  InstagramActionReservationEntity: EntityConstructor;
};

type InstagramActionLimitBlockEntityModule = {
  InstagramActionBlockedWindow: Record<string, string>;
  InstagramActionLimitBlockEntity: EntityConstructor;
};

const loadReservationEntityModule = ():
  | InstagramActionReservationEntityModule
  | undefined => {
  try {
    return require('../entities/instagram-action-reservation.entity') as InstagramActionReservationEntityModule;
  } catch {
    return undefined;
  }
};

const loadLimitBlockEntityModule = ():
  | InstagramActionLimitBlockEntityModule
  | undefined => {
  try {
    return require('../entities/instagram-action-limit-block.entity') as InstagramActionLimitBlockEntityModule;
  } catch {
    return undefined;
  }
};

const requireBudgetEntities = () => {
  const reservationEntityModule = loadReservationEntityModule();
  const limitBlockEntityModule = loadLimitBlockEntityModule();

  expect(reservationEntityModule).toBeDefined();
  expect(limitBlockEntityModule).toBeDefined();

  if (!reservationEntityModule || !limitBlockEntityModule) {
    throw new Error('Instagram action budget entities are not implemented');
  }

  return { limitBlockEntityModule, reservationEntityModule };
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

const expectExactColumns = (
  target: EntityConstructor,
  propertyNames: readonly string[],
) => {
  expect(
    metadataFor(target)
      .columns.map((column) => column.propertyName)
      .sort(),
  ).toEqual([...propertyNames].sort());
};

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

const expectRelation = (
  target: EntityConstructor,
  propertyName: string,
  joinColumnName: string,
  onDelete: 'CASCADE' | 'RESTRICT',
) => {
  const metadata = metadataFor(target);

  expect(metadata.relations).toEqual(
    expect.arrayContaining([expect.objectContaining({ propertyName })]),
  );
  expect(metadata.joinColumns).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: joinColumnName,
        propertyName,
        referencedColumnName: 'id',
      }),
    ]),
  );
  expect(
    metadata.relations.find(
      (relation) => relation.propertyName === propertyName,
    )?.options,
  ).toMatchObject({ onDelete });
};

describe('Instagram action budget entities', () => {
  it('maps reservations to their receipt, account, exact target fingerprint, and release facts', () => {
    const { reservationEntityModule } = requireBudgetEntities();
    const { InstagramActionKind, InstagramActionReservationEntity } =
      reservationEntityModule;
    const metadata = metadataFor(InstagramActionReservationEntity);
    const reservedAtDefault = columnOptions(
      InstagramActionReservationEntity,
      'reservedAt',
    )?.default;

    expect(metadata.table).toMatchObject({
      name: 'instagramActionReservation',
      schema: 'core',
    });
    expect(Object.values(InstagramActionKind)).toEqual(['START_CHAT', 'REPLY']);
    expectExactColumns(InstagramActionReservationEntity, [
      'id',
      'workspaceId',
      'instagramAccountRecordId',
      'actionExecutionReceiptId',
      'actionKind',
      'targetFingerprint',
      'reservedAt',
      'providerAttemptedAt',
      'releasedAt',
      'releaseReason',
      'targetLockReleasedAt',
      'createdAt',
      'updatedAt',
    ]);
    expectRequiredColumns(InstagramActionReservationEntity, [
      'id',
      'workspaceId',
      'instagramAccountRecordId',
      'actionExecutionReceiptId',
      'actionKind',
      'targetFingerprint',
      'reservedAt',
    ]);
    expectNullableColumns(InstagramActionReservationEntity, [
      'providerAttemptedAt',
      'releasedAt',
      'releaseReason',
      'targetLockReleasedAt',
    ]);
    for (const propertyName of [
      'id',
      'workspaceId',
      'instagramAccountRecordId',
      'actionExecutionReceiptId',
    ]) {
      expect(
        columnOptions(InstagramActionReservationEntity, propertyName),
      ).toMatchObject({ type: 'uuid' });
    }
    expect(
      columnOptions(InstagramActionReservationEntity, 'actionKind'),
    ).toMatchObject({
      enum: InstagramActionKind,
      enumName: 'instagramActionReservation_actionKind_enum',
      type: 'enum',
    });
    expect(
      columnOptions(InstagramActionReservationEntity, 'targetFingerprint'),
    ).toMatchObject({ length: 64, type: 'varchar' });
    for (const propertyName of [
      'reservedAt',
      'providerAttemptedAt',
      'releasedAt',
      'targetLockReleasedAt',
    ]) {
      expect(
        columnOptions(InstagramActionReservationEntity, propertyName),
      ).toMatchObject({ type: 'timestamptz' });
    }
    expect(
      columnOptions(InstagramActionReservationEntity, 'releaseReason'),
    ).toMatchObject({ type: 'text' });
    expect(reservedAtDefault).toEqual(expect.any(Function));
    expect((reservedAtDefault as () => string)()).toMatch(
      /CURRENT_TIMESTAMP|now\(\)/i,
    );
    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['actionExecutionReceiptId'],
          name: 'UQ_INSTAGRAM_ACTION_RESERVATION_RECEIPT',
        }),
      ]),
    );
    expect(metadata.uniques).toHaveLength(1);
    expect(metadata.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['workspaceId', 'instagramAccountRecordId', 'reservedAt'],
          name: 'IDX_INSTAGRAM_ACTION_RESERVATION_ACTIVE_WINDOW',
          where: '"releasedAt" IS NULL',
        }),
        expect.objectContaining({
          columns: [
            'workspaceId',
            'instagramAccountRecordId',
            'targetFingerprint',
          ],
          name: 'IDX_INSTAGRAM_ACTION_RESERVATION_START_CHAT_TARGET',
          unique: true,
          where:
            '"actionKind" = \'START_CHAT\' AND "targetLockReleasedAt" IS NULL',
        }),
      ]),
    );
    expect(metadata.indices).toHaveLength(2);
    for (const [propertyName, mode] of [
      ['createdAt', 'createDate'],
      ['updatedAt', 'updateDate'],
    ] as const) {
      const column = metadata.columns.find(
        (candidate) => candidate.propertyName === propertyName,
      );

      expect(column).toMatchObject({ mode, options: { type: 'timestamptz' } });
    }
    expectRelation(
      InstagramActionReservationEntity,
      'workspace',
      'workspaceId',
      'CASCADE',
    );
    expectRelation(
      InstagramActionReservationEntity,
      'actionExecutionReceipt',
      'actionExecutionReceiptId',
      'RESTRICT',
    );
  });

  it('maps receipt-scoped blocks with fixed action-limit evidence and nonnegative counters', () => {
    const { limitBlockEntityModule } = requireBudgetEntities();
    const { InstagramActionBlockedWindow, InstagramActionLimitBlockEntity } =
      limitBlockEntityModule;
    const metadata = metadataFor(InstagramActionLimitBlockEntity);

    expect(metadata.table).toMatchObject({
      name: 'instagramActionLimitBlock',
      schema: 'core',
    });
    expect(Object.values(InstagramActionBlockedWindow)).toEqual([
      'HOURLY',
      'DAILY',
    ]);
    expectExactColumns(InstagramActionLimitBlockEntity, [
      'id',
      'workspaceId',
      'instagramAccountRecordId',
      'actionExecutionReceiptId',
      'errorCode',
      'hourlyUsed',
      'hourlyLimit',
      'hourlyRemaining',
      'dailyUsed',
      'dailyLimit',
      'dailyRemaining',
      'blockedWindows',
      'nextEligibleAt',
      'createdAt',
      'updatedAt',
    ]);
    expectRequiredColumns(InstagramActionLimitBlockEntity, [
      'id',
      'workspaceId',
      'instagramAccountRecordId',
      'actionExecutionReceiptId',
      'errorCode',
      'hourlyUsed',
      'hourlyLimit',
      'hourlyRemaining',
      'dailyUsed',
      'dailyLimit',
      'dailyRemaining',
      'blockedWindows',
      'nextEligibleAt',
    ]);
    for (const propertyName of [
      'id',
      'workspaceId',
      'instagramAccountRecordId',
      'actionExecutionReceiptId',
    ]) {
      expect(
        columnOptions(InstagramActionLimitBlockEntity, propertyName),
      ).toMatchObject({ type: 'uuid' });
    }
    expect(
      columnOptions(InstagramActionLimitBlockEntity, 'errorCode'),
    ).toMatchObject({
      default: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      type: 'varchar',
    });
    for (const propertyName of [
      'hourlyUsed',
      'hourlyLimit',
      'hourlyRemaining',
      'dailyUsed',
      'dailyLimit',
      'dailyRemaining',
    ]) {
      expect(
        columnOptions(InstagramActionLimitBlockEntity, propertyName),
      ).toMatchObject({ type: 'integer' });
    }
    expect(
      columnOptions(InstagramActionLimitBlockEntity, 'blockedWindows'),
    ).toMatchObject({ array: true, type: 'text' });
    expect(
      columnOptions(InstagramActionLimitBlockEntity, 'nextEligibleAt'),
    ).toMatchObject({ type: 'timestamptz' });
    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['actionExecutionReceiptId'],
          name: 'UQ_INSTAGRAM_ACTION_LIMIT_BLOCK_RECEIPT',
        }),
      ]),
    );
    expect(metadata.uniques).toHaveLength(1);
    expect(metadata.indices).toHaveLength(0);
    for (const [propertyName, mode] of [
      ['createdAt', 'createDate'],
      ['updatedAt', 'updateDate'],
    ] as const) {
      const column = metadata.columns.find(
        (candidate) => candidate.propertyName === propertyName,
      );

      expect(column).toMatchObject({ mode, options: { type: 'timestamptz' } });
    }
    expectRelation(
      InstagramActionLimitBlockEntity,
      'workspace',
      'workspaceId',
      'CASCADE',
    );
    expectRelation(
      InstagramActionLimitBlockEntity,
      'actionExecutionReceipt',
      'actionExecutionReceiptId',
      'RESTRICT',
    );
  });
});

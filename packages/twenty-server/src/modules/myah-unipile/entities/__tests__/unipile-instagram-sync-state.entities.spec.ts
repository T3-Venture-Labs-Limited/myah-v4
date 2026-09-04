import { getMetadataArgsStorage } from 'typeorm';

type EntityConstructor = Function;

type UnipileInstagramSyncRunEntityModule = {
  UnipileInstagramSyncRunEntity: EntityConstructor;
  UnipileInstagramSyncRunStatus: Record<string, string>;
};

type UnipileInstagramChatCheckpointEntityModule = {
  UnipileInstagramChatCheckpointEntity: EntityConstructor;
};

type UnipileInstagramWebhookEventEntityModule = {
  UnipileInstagramWebhookEventEntity: EntityConstructor;
  UnipileInstagramWebhookEventStatus: Record<string, string>;
  UnipileInstagramWebhookEventType: Record<string, string>;
};

const loadSyncRunEntityModule = ():
  | UnipileInstagramSyncRunEntityModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/entities/unipile-instagram-sync-run.entity') as UnipileInstagramSyncRunEntityModule;
  } catch {
    return undefined;
  }
};

const loadChatCheckpointEntityModule = ():
  | UnipileInstagramChatCheckpointEntityModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/entities/unipile-instagram-chat-checkpoint.entity') as UnipileInstagramChatCheckpointEntityModule;
  } catch {
    return undefined;
  }
};

const loadWebhookEventEntityModule = ():
  | UnipileInstagramWebhookEventEntityModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/entities/unipile-instagram-webhook-event.entity') as UnipileInstagramWebhookEventEntityModule;
  } catch {
    return undefined;
  }
};

const requireSyncStateEntities = () => {
  const syncRunEntityModule = loadSyncRunEntityModule();
  const chatCheckpointEntityModule = loadChatCheckpointEntityModule();
  const webhookEventEntityModule = loadWebhookEventEntityModule();

  expect(syncRunEntityModule).toBeDefined();
  expect(chatCheckpointEntityModule).toBeDefined();
  expect(webhookEventEntityModule).toBeDefined();

  if (
    !syncRunEntityModule ||
    !chatCheckpointEntityModule ||
    !webhookEventEntityModule
  ) {
    throw new Error(
      'Unipile Instagram sync state entities are not implemented',
    );
  }

  return {
    chatCheckpointEntityModule,
    syncRunEntityModule,
    webhookEventEntityModule,
  };
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

describe('Unipile Instagram sync state entities', () => {
  it('maps a binding-scoped sync run with durable traversal and completion facts', () => {
    const { syncRunEntityModule } = requireSyncStateEntities();
    const { UnipileInstagramSyncRunEntity, UnipileInstagramSyncRunStatus } =
      syncRunEntityModule;
    const metadata = metadataFor(UnipileInstagramSyncRunEntity);

    expect(metadata.table).toMatchObject({
      name: 'unipileInstagramSyncRun',
      schema: 'core',
    });
    expectExactEnumValues(UnipileInstagramSyncRunStatus, [
      'RUNNING',
      'COMPLETED',
      'FAILED',
    ]);
    expect(
      metadata.columns.map((column) => column.propertyName).sort(),
    ).toEqual([
      'bindingId',
      'chatCursor',
      'completedAt',
      'completedChatHighWaterAt',
      'createdAt',
      'currentChatAttendeeId',
      'currentChatId',
      'failureCode',
      'failureReason',
      'id',
      'messageCursor',
      'overlapAfter',
      'status',
      'updatedAt',
    ]);
    expectRequiredColumns(UnipileInstagramSyncRunEntity, [
      'id',
      'bindingId',
      'status',
      'createdAt',
      'updatedAt',
    ]);
    expectNullableColumns(UnipileInstagramSyncRunEntity, [
      'overlapAfter',
      'chatCursor',
      'currentChatId',
      'currentChatAttendeeId',
      'messageCursor',
      'completedChatHighWaterAt',
      'completedAt',
      'failureCode',
      'failureReason',
    ]);
    expect(
      columnOptions(UnipileInstagramSyncRunEntity, 'bindingId'),
    ).toMatchObject({
      type: 'uuid',
    });
    for (const propertyName of [
      'chatCursor',
      'currentChatId',
      'currentChatAttendeeId',
      'failureCode',
      'failureReason',
    ]) {
      expect(
        columnOptions(UnipileInstagramSyncRunEntity, propertyName),
      ).toMatchObject({ type: 'text' });
    }
    for (const propertyName of [
      'overlapAfter',
      'completedChatHighWaterAt',
      'completedAt',
    ]) {
      expect(
        columnOptions(UnipileInstagramSyncRunEntity, propertyName),
      ).toMatchObject({ type: 'timestamptz' });
    }
    expect(
      columnOptions(UnipileInstagramSyncRunEntity, 'status'),
    ).toMatchObject({
      default: 'RUNNING',
      enum: UnipileInstagramSyncRunStatus,
      enumName: 'unipileInstagramSyncRun_status_enum',
      type: 'enum',
    });
    expect(metadata.indices).toEqual([
      expect.objectContaining({
        columns: ['bindingId'],
        unique: true,
        where: `"status" = 'RUNNING'`,
      }),
    ]);
  });

  it('maps one durable completion checkpoint for each provider chat in a binding', () => {
    const { chatCheckpointEntityModule } = requireSyncStateEntities();
    const { UnipileInstagramChatCheckpointEntity } = chatCheckpointEntityModule;
    const metadata = metadataFor(UnipileInstagramChatCheckpointEntity);

    expect(metadata.table).toMatchObject({
      name: 'unipileInstagramChatCheckpoint',
      schema: 'core',
    });
    expect(
      metadata.columns.map((column) => column.propertyName).sort(),
    ).toEqual([
      'bindingId',
      'completedMessageHighWaterAt',
      'createdAt',
      'id',
      'unipileChatId',
      'updatedAt',
    ]);
    expectRequiredColumns(UnipileInstagramChatCheckpointEntity, [
      'id',
      'bindingId',
      'unipileChatId',
      'createdAt',
      'updatedAt',
    ]);
    expectNullableColumns(UnipileInstagramChatCheckpointEntity, [
      'completedMessageHighWaterAt',
    ]);
    expect(
      columnOptions(UnipileInstagramChatCheckpointEntity, 'bindingId'),
    ).toMatchObject({ type: 'uuid' });
    expect(
      columnOptions(UnipileInstagramChatCheckpointEntity, 'unipileChatId'),
    ).toMatchObject({ type: 'text' });
    expect(
      columnOptions(
        UnipileInstagramChatCheckpointEntity,
        'completedMessageHighWaterAt',
      ),
    ).toMatchObject({ type: 'timestamptz' });
    expect(metadata.uniques).toEqual([
      expect.objectContaining({ columns: ['bindingId', 'unipileChatId'] }),
    ]);
  });

  it('maps idempotent webhook intake without retaining webhook payloads', () => {
    const { webhookEventEntityModule } = requireSyncStateEntities();
    const {
      UnipileInstagramWebhookEventEntity,
      UnipileInstagramWebhookEventStatus,
      UnipileInstagramWebhookEventType,
    } = webhookEventEntityModule;
    const metadata = metadataFor(UnipileInstagramWebhookEventEntity);

    expect(metadata.table).toMatchObject({
      name: 'unipileInstagramWebhookEvent',
      schema: 'core',
    });
    expectExactEnumValues(UnipileInstagramWebhookEventType, [
      'MESSAGE_RECEIVED',
      'MESSAGE_READ',
      'MESSAGE_DELIVERED',
      'MESSAGE_EDITED',
      'MESSAGE_DELETED',
      'MESSAGE_REACTION',
      'ACCOUNT_STATUS',
    ]);
    expectExactEnumValues(UnipileInstagramWebhookEventStatus, [
      'RECEIVED',
      'ENQUEUED',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
    ]);
    expect(
      metadata.columns.map((column) => column.propertyName).sort(),
    ).toEqual([
      'accountStatus',
      'attemptCount',
      'attendeeProviderId',
      'bindingId',
      'createdAt',
      'deliveryState',
      'deliveryStateUpdatedAt',
      'eventFingerprint',
      'eventType',
      'failureCode',
      'failureReason',
      'id',
      'nextAttemptAt',
      'status',
      'unipileChatId',
      'unipileMessageId',
      'updatedAt',
    ]);
    expectRequiredColumns(UnipileInstagramWebhookEventEntity, [
      'id',
      'bindingId',
      'eventFingerprint',
      'eventType',
      'status',
      'attemptCount',
      'createdAt',
      'updatedAt',
    ]);
    expectNullableColumns(UnipileInstagramWebhookEventEntity, [
      'unipileChatId',
      'unipileMessageId',
      'attendeeProviderId',
      'accountStatus',
      'deliveryState',
      'deliveryStateUpdatedAt',
      'failureCode',
      'failureReason',
      'nextAttemptAt',
    ]);
    expect(
      columnOptions(UnipileInstagramWebhookEventEntity, 'bindingId'),
    ).toMatchObject({
      type: 'uuid',
    });
    expect(
      columnOptions(UnipileInstagramWebhookEventEntity, 'attemptCount'),
    ).toMatchObject({ default: 0, type: 'int' });
    expect(
      columnOptions(UnipileInstagramWebhookEventEntity, 'nextAttemptAt'),
    ).toMatchObject({ type: 'timestamptz' });
    for (const propertyName of [
      'eventFingerprint',
      'unipileChatId',
      'unipileMessageId',
      'attendeeProviderId',
      'accountStatus',
      'deliveryState',
      'failureCode',
      'failureReason',
    ]) {
      expect(
        columnOptions(UnipileInstagramWebhookEventEntity, propertyName),
      ).toMatchObject({ type: 'text' });
    }
    expect(
      columnOptions(
        UnipileInstagramWebhookEventEntity,
        'deliveryStateUpdatedAt',
      ),
    ).toMatchObject({ type: 'timestamptz' });
    expect(
      columnOptions(UnipileInstagramWebhookEventEntity, 'eventType'),
    ).toMatchObject({
      enum: UnipileInstagramWebhookEventType,
      enumName: 'unipileInstagramWebhookEvent_eventType_enum',
      type: 'enum',
    });
    expect(
      columnOptions(UnipileInstagramWebhookEventEntity, 'status'),
    ).toMatchObject({
      default: 'RECEIVED',
      enum: UnipileInstagramWebhookEventStatus,
      enumName: 'unipileInstagramWebhookEvent_status_enum',
      type: 'enum',
    });
    expect(metadata.uniques).toEqual([
      expect.objectContaining({ columns: ['eventFingerprint'] }),
    ]);
    expect(metadata.indices).toEqual([
      expect.objectContaining({
        columns: ['status', 'nextAttemptAt', 'updatedAt'],
      }),
    ]);
  });

  it('keeps binding cascades and managed timestamps in entity metadata', () => {
    const {
      chatCheckpointEntityModule,
      syncRunEntityModule,
      webhookEventEntityModule,
    } = requireSyncStateEntities();
    const entities = [
      syncRunEntityModule.UnipileInstagramSyncRunEntity,
      chatCheckpointEntityModule.UnipileInstagramChatCheckpointEntity,
      webhookEventEntityModule.UnipileInstagramWebhookEventEntity,
    ];

    for (const entity of entities) {
      const metadata = metadataFor(entity);

      expect(metadata.relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ propertyName: 'binding' }),
        ]),
      );
      expect(metadata.joinColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'bindingId',
            propertyName: 'binding',
            referencedColumnName: 'id',
          }),
        ]),
      );
      expect(
        metadata.relations.find(
          (relation) => relation.propertyName === 'binding',
        )?.options,
      ).toMatchObject({ onDelete: 'CASCADE' });
      for (const [propertyName, mode] of [
        ['createdAt', 'createDate'],
        ['updatedAt', 'updateDate'],
      ] as const) {
        const column = metadata.columns.find(
          (candidate) => candidate.propertyName === propertyName,
        );

        expect(column).toMatchObject({
          mode,
          options: { type: 'timestamptz' },
        });
      }
    }
  });
});

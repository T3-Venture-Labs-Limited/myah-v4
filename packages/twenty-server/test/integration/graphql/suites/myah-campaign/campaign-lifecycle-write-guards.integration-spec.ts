import { randomUUID } from 'crypto';

import { createManyOperationFactory } from 'test/integration/graphql/utils/create-many-operation-factory.util';
import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { deleteManyOperationFactory } from 'test/integration/graphql/utils/delete-many-operation-factory.util';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { restoreManyOperationFactory } from 'test/integration/graphql/utils/restore-many-operation-factory.util';
import { restoreOneOperationFactory } from 'test/integration/graphql/utils/restore-one-operation-factory.util';
import { updateManyOperationFactory } from 'test/integration/graphql/utils/update-many-operation-factory.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';

const FIELDS =
  'id name objective lifecycleStatus sequenceAuthorization deletedAt';
const ERROR =
  'Campaign lifecycle and execution authority require a dedicated operation.';

const operationArgs = {
  objectMetadataSingularName: 'campaign',
  objectMetadataPluralName: 'campaigns',
  gqlFields: FIELDS,
};

const expectRejected = async (
  operation: Parameters<typeof makeGraphqlAPIRequest>[0],
) => {
  const response = await makeGraphqlAPIRequest(operation);

  expect(response.body.errors?.[0]?.message).toContain(ERROR);
  expect(response.body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  expect(Object.values(response.body.data ?? {})).toEqual([null]);
};

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replace(/"/g, '""')}"`;

const findOwnedCampaignSchema = async (ids: string[]): Promise<string> => {
  const schemas = await global.testDataSource.query<
    Array<{ table_schema: string }>
  >(
    `SELECT table_schema FROM information_schema.tables WHERE table_name = 'campaign'`,
  );

  for (const { table_schema: schema } of schemas) {
    const rows = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT "id" FROM ${quoteIdentifier(schema)}."campaign" WHERE "id" = ANY($1::uuid[]) LIMIT 1`,
      [ids],
    );

    if (rows.length > 0) return schema;
  }

  throw new Error('No owned Campaign fixture was found in PostgreSQL');
};

const readCampaign = async (id: string) => {
  const response = await makeGraphqlAPIRequest(
    findOneOperationFactory({
      objectMetadataSingularName: 'campaign',
      gqlFields: FIELDS,
      filter: { id: { eq: id } },
    }),
  );

  return response.body.data?.campaign;
};

describe('Campaign GraphQL lifecycle write guards', () => {
  const ownedIds: string[] = [];
  const trackId = () => {
    const id = randomUUID();

    ownedIds.push(id);

    return id;
  };

  afterAll(async () => {
    if (ownedIds.length === 0) return;

    const schema = await findOwnedCampaignSchema(ownedIds);

    await global.testDataSource.query(
      `UPDATE ${quoteIdentifier(schema)}."campaign" SET "deletedAt" = NULL WHERE "id" = ANY($1::uuid[])`,
      [ownedIds],
    );
    await global.testDataSource.query(
      `DELETE FROM ${quoteIdentifier(schema)}."campaign" WHERE "id" = ANY($1::uuid[])`,
      [ownedIds],
    );
    const remaining = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT "id" FROM ${quoteIdentifier(schema)}."campaign" WHERE "id" = ANY($1::uuid[])`,
      [ownedIds],
    );

    expect(remaining).toEqual([]);
  });

  it('rejects explicit lifecycle and authority creates before persistence while allowing omitted-DRAFT create', async () => {
    for (const lifecycleStatus of ['ACTIVE', 'PAUSED', 'COMPLETED']) {
      const id = trackId();
      await expectRejected(
        createOneOperationFactory({
          objectMetadataSingularName: 'campaign',
          gqlFields: FIELDS,
          data: { id, name: 'Denied', lifecycleStatus },
        }),
      );
      expect(await readCampaign(id)).toBeNull();

      const bulkId = trackId();
      await expectRejected(
        createManyOperationFactory({
          ...operationArgs,
          data: [{ id: bulkId, name: 'Denied bulk', lifecycleStatus }],
        }),
      );
      expect(await readCampaign(bulkId)).toBeNull();
    }

    const authorityId = trackId();
    await expectRejected(
      createManyOperationFactory({
        ...operationArgs,
        data: [
          {
            id: authorityId,
            name: 'Denied authority',
            sequenceAuthorization: { authorizationId: 'forged' },
          },
        ],
      }),
    );
    expect(await readCampaign(authorityId)).toBeNull();

    const deletedAtId = trackId();
    await expectRejected(
      createOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        data: {
          id: deletedAtId,
          name: 'Denied deletedAt',
          deletedAt: '2026-09-11T00:00:00.000Z',
        },
      }),
    );
    expect(await readCampaign(deletedAtId)).toBeNull();

    const allowedId = trackId();
    const allowed = await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        data: { id: allowedId, name: 'Allowed' },
      }),
    );
    expect(allowed.body.errors).toBeUndefined();
    expect(allowed.body.data.createCampaign.lifecycleStatus).toBe('DRAFT');
  });

  it('rejects updateOne/updateMany lifecycle no-ops, bulk lifecycle, and authority while preserving unrelated writes', async () => {
    const id = trackId();
    await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        data: { id, name: 'Original' },
      }),
    );

    await expectRejected(
      updateOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        recordId: id,
        data: { lifecycleStatus: 'DRAFT', name: 'Must not persist' },
      }),
    );
    await expectRejected(
      updateManyOperationFactory({
        ...operationArgs,
        filter: { id: { eq: id } },
        data: { lifecycleStatus: 'PAUSED' },
      }),
    );
    await expectRejected(
      updateOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        recordId: id,
        data: { sequenceAuthorization: { authorizationId: 'forged' } },
      }),
    );
    await expectRejected(
      updateManyOperationFactory({
        ...operationArgs,
        filter: { id: { eq: id } },
        data: { sequenceAuthorization: { authorizationId: 'forged-bulk' } },
      }),
    );
    await expectRejected(
      updateOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        recordId: id,
        data: { deletedAt: null },
      }),
    );

    const secondId = trackId();
    await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        data: { id: secondId, name: 'Second original' },
      }),
    );
    await expectRejected(
      updateManyOperationFactory({
        ...operationArgs,
        filter: { id: { in: [id, secondId] } },
        data: { lifecycleStatus: 'COMPLETED', objective: 'Must not persist' },
      }),
    );

    expect(await readCampaign(id)).toMatchObject({
      name: 'Original',
      lifecycleStatus: 'DRAFT',
      sequenceAuthorization: null,
      objective: '',
    });
    expect(await readCampaign(secondId)).toMatchObject({
      name: 'Second original',
      lifecycleStatus: 'DRAFT',
      objective: '',
    });

    const allowed = await makeGraphqlAPIRequest(
      updateOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        recordId: id,
        data: { objective: 'Allowed objective' },
      }),
    );
    expect(allowed.body.errors).toBeUndefined();
    expect(allowed.body.data.updateCampaign.objective).toBe(
      'Allowed objective',
    );
  });

  it('rejects deleteOne/deleteMany and exact restoreOne/direct restoreMany before mutation', async () => {
    const id = trackId();
    await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        data: { id, name: 'Protected' },
      }),
    );

    await expectRejected(
      deleteOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        recordId: id,
      }),
    );
    await expectRejected(
      deleteManyOperationFactory({
        ...operationArgs,
        filter: { id: { eq: id } },
      }),
    );
    await expectRejected(
      restoreOneOperationFactory({
        objectMetadataSingularName: 'campaign',
        gqlFields: FIELDS,
        recordId: id,
      }),
    );
    await expectRejected(
      restoreManyOperationFactory({
        ...operationArgs,
        filter: { id: { eq: id } },
      }),
    );

    expect(await readCampaign(id)).toMatchObject({ id, deletedAt: null });
  });
});

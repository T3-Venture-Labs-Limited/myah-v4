import { randomUUID } from 'crypto';

import { makeRestAPIRequest } from 'test/integration/rest/utils/make-rest-api-request.util';

const ERROR =
  'Campaign lifecycle and execution authority require a dedicated operation.';

const expectRejected = async (
  method: 'post' | 'patch' | 'delete',
  path: string,
  body: object | object[] = {},
) => {
  const response = await makeRestAPIRequest({ method, path, body });

  expect(response.status).toBe(400);
  expect(JSON.stringify(response.body)).toContain(ERROR);
};

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replace(/"/g, '""')}"`;

const findCampaignSchemaForIds = async (ids: string[]): Promise<string> => {
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

    if (rows.length === 1) return schema;
  }

  throw new Error('No owned Campaign fixture was found in PostgreSQL');
};

const findCampaignSchema = async (id: string): Promise<string> =>
  findCampaignSchemaForIds([id]);

const readCampaign = async (id: string) => {
  const response = await makeRestAPIRequest({
    method: 'get',
    path: `/campaigns/${id}`,
  });

  return response;
};

describe('Campaign REST lifecycle write guards', () => {
  const ownedIds: string[] = [];
  let workspaceSchema: string | undefined;
  const trackId = () => {
    const id = randomUUID();

    ownedIds.push(id);

    return id;
  };

  afterAll(async () => {
    const cleanupSchema =
      workspaceSchema ?? (await findCampaignSchemaForIds(ownedIds));

    await global.testDataSource.query(
      `UPDATE ${quoteIdentifier(cleanupSchema)}."campaign" SET "deletedAt" = NULL WHERE "id" = ANY($1::uuid[])`,
      [ownedIds],
    );
    await global.testDataSource.query(
      `DELETE FROM ${quoteIdentifier(cleanupSchema)}."campaign" WHERE "id" = ANY($1::uuid[])`,
      [ownedIds],
    );
    const remaining = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT "id" FROM ${quoteIdentifier(cleanupSchema)}."campaign" WHERE "id" = ANY($1::uuid[])`,
      [ownedIds],
    );

    expect(remaining).toEqual([]);
  });

  it('rejects explicit lifecycle and caller authority create before persistence, with omitted-DRAFT control', async () => {
    for (const lifecycleStatus of ['ACTIVE', 'PAUSED', 'COMPLETED']) {
      const id = trackId();
      await expectRejected('post', '/campaigns', {
        id,
        name: 'Denied',
        lifecycleStatus,
      });
      expect((await readCampaign(id)).status).toBe(404);

      const bulkId = trackId();
      await expectRejected('post', '/batch/campaigns', [
        { id: bulkId, name: 'Denied bulk', lifecycleStatus },
      ]);
      expect((await readCampaign(bulkId)).status).toBe(404);
    }

    const authorityId = trackId();
    await expectRejected('post', '/campaigns', {
      id: authorityId,
      name: 'Denied authority',
      sequenceAuthorization: { authorizationId: 'forged' },
    });
    expect((await readCampaign(authorityId)).status).toBe(404);

    const bulkAuthorityId = trackId();
    await expectRejected('post', '/batch/campaigns', [
      {
        id: bulkAuthorityId,
        name: 'Denied bulk authority',
        sequenceAuthorization: { authorizationId: 'forged-bulk' },
      },
    ]);
    expect((await readCampaign(bulkAuthorityId)).status).toBe(404);

    for (const deletedAt of [null, '2026-09-11T00:00:00.000Z']) {
      const deletedAtId = trackId();

      await expectRejected('post', '/campaigns', {
        id: deletedAtId,
        name: 'Denied deletedAt',
        deletedAt,
      });
      expect((await readCampaign(deletedAtId)).status).toBe(404);
    }

    const id = trackId();
    const response = await makeRestAPIRequest({
      method: 'post',
      path: '/campaigns',
      body: { id, name: 'Allowed' },
    });
    expect(response.status).toBe(201);
    expect(response.body.data.createCampaign.lifecycleStatus).toBe('DRAFT');
    workspaceSchema = await findCampaignSchema(id);
    const unexpectedlyPersisted = await global.testDataSource.query<
      Array<{ id: string }>
    >(
      `SELECT "id" FROM ${quoteIdentifier(workspaceSchema)}."campaign" WHERE "id" = ANY($1::uuid[]) AND "id" <> $2`,
      [ownedIds, id],
    );

    expect(unexpectedlyPersisted).toEqual([]);

    const mixedAllowedId = trackId();
    const mixedForbiddenId = trackId();

    await expectRejected('post', '/batch/campaigns', [
      { id: mixedAllowedId, name: 'Must roll back with mixed request' },
      {
        id: mixedForbiddenId,
        name: 'Forbidden mixed row',
        deletedAt: null,
      },
    ]);
    const mixedPersisted = await global.testDataSource.query<
      Array<{ id: string; deletedAt: Date | null }>
    >(
      `SELECT "id", "deletedAt" FROM ${quoteIdentifier(workspaceSchema)}."campaign" WHERE "id" = ANY($1::uuid[])`,
      [[mixedAllowedId, mixedForbiddenId]],
    );

    expect(mixedPersisted).toEqual([]);
  });

  it('rejects updateOne/updateMany lifecycle no-op and authority before persistence while allowing unrelated fields', async () => {
    const id = trackId();
    await makeRestAPIRequest({
      method: 'post',
      path: '/campaigns',
      body: { id, name: 'Original' },
    });

    await expectRejected('patch', `/campaigns/${id}`, {
      lifecycleStatus: 'DRAFT',
      name: 'Must not persist',
    });
    await expectRejected('patch', `/campaigns?filter=id[eq]:${id}`, {
      lifecycleStatus: 'PAUSED',
    });
    await expectRejected('patch', `/campaigns/${id}`, {
      sequenceAuthorization: { authorizationId: 'forged' },
    });
    await expectRejected('patch', `/campaigns?filter=id[eq]:${id}`, {
      sequenceAuthorization: { authorizationId: 'forged-bulk' },
    });
    await expectRejected('patch', `/campaigns/${id}`, { deletedAt: null });
    await expectRejected('patch', `/campaigns?filter=id[eq]:${id}`, {
      deletedAt: '2026-09-11T00:00:00.000Z',
    });

    const secondId = trackId();
    const secondCreate = await makeRestAPIRequest({
      method: 'post',
      path: '/campaigns',
      body: { id: secondId, name: 'Second original' },
    });

    expect(secondCreate.status).toBe(201);
    await expectRejected(
      'patch',
      `/campaigns?filter=id[in]:["${id}","${secondId}"]`,
      { lifecycleStatus: 'COMPLETED', objective: 'Must not persist' },
    );

    const unchanged = await readCampaign(id);
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data.campaign).toMatchObject({
      name: 'Original',
      lifecycleStatus: 'DRAFT',
      sequenceAuthorization: null,
      objective: '',
      deletedAt: null,
    });
    expect((await readCampaign(secondId)).body.data.campaign).toMatchObject({
      name: 'Second original',
      lifecycleStatus: 'DRAFT',
      objective: '',
      deletedAt: null,
    });

    const persisted = await global.testDataSource.query<
      Array<{
        id: string;
        name: string;
        objective: string | null;
        lifecycleStatus: string;
        sequenceAuthorization: unknown;
        deletedAt: Date | null;
      }>
    >(
      `SELECT "id", "name", "objective", "lifecycleStatus", "sequenceAuthorization", "deletedAt" FROM ${quoteIdentifier(workspaceSchema!)}."campaign" WHERE "id" = ANY($1::uuid[]) ORDER BY "id"`,
      [[id, secondId]],
    );

    expect(persisted).toHaveLength(2);
    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id,
          name: 'Original',
          objective: null,
          lifecycleStatus: 'DRAFT',
          sequenceAuthorization: null,
          deletedAt: null,
        }),
        expect.objectContaining({
          id: secondId,
          name: 'Second original',
          objective: null,
          lifecycleStatus: 'DRAFT',
          sequenceAuthorization: null,
          deletedAt: null,
        }),
      ]),
    );

    const allowed = await makeRestAPIRequest({
      method: 'patch',
      path: `/campaigns/${id}`,
      body: { objective: 'Allowed objective' },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.updateCampaign.objective).toBe(
      'Allowed objective',
    );
  });

  it('rejects deleteOne/deleteMany, restoreOne original operation, and direct restoreMany', async () => {
    const id = trackId();
    await makeRestAPIRequest({
      method: 'post',
      path: '/campaigns',
      body: { id, name: 'Protected' },
    });

    await expectRejected('delete', `/campaigns/${id}?soft_delete=true`);
    await expectRejected(
      'delete',
      `/campaigns?soft_delete=true&filter=id[eq]:${id}`,
    );
    const schema = await findCampaignSchema(id);

    await global.testDataSource.query(
      `UPDATE ${quoteIdentifier(schema)}."campaign" SET "deletedAt" = NOW() WHERE "id" = $1`,
      [id],
    );

    try {
      await expectRejected('patch', `/campaigns/${id}`, { deletedAt: null });
      await expectRejected('patch', `/restore/campaigns/${id}`);
      await expectRejected('patch', `/restore/campaigns?filter=id[eq]:${id}`);

      const persisted = await global.testDataSource.query<
        Array<{ deletedAt: Date | null; lifecycleStatus: string }>
      >(
        `SELECT "deletedAt", "lifecycleStatus" FROM ${quoteIdentifier(schema)}."campaign" WHERE "id" = $1`,
        [id],
      );

      expect(persisted[0]).toMatchObject({ lifecycleStatus: 'DRAFT' });
      expect(persisted[0].deletedAt).not.toBeNull();
    } finally {
      await global.testDataSource.query(
        `UPDATE ${quoteIdentifier(schema)}."campaign" SET "deletedAt" = NULL WHERE "id" = $1`,
        [id],
      );
    }
    const unchanged = await readCampaign(id);
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data.campaign.deletedAt).toBeNull();
  });
});

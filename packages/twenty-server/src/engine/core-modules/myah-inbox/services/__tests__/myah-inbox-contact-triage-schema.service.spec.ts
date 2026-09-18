import { type QueryRunner } from 'typeorm';

import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';

describe('MyahInboxContactTriageSchemaService', () => {
  it('creates the private triage relations, durable Email provenance, required indexes, and millisecond timestamp precision', async () => {
    const queryRunner = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<QueryRunner, 'query'>>;
    const service = new MyahInboxContactTriageSchemaService();

    await service.ensureWorkspaceTables(
      queryRunner as unknown as QueryRunner,
      workspaceId,
    );

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    );

    expect(statements).toHaveLength(7);
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"myahInboxContactIdentity"'),
        expect.stringContaining('"myahInboxContactTriage"'),
        expect.stringContaining('"myahInboxTriageTransitionReceipt"'),
        expect.stringContaining('"myahInboxTriageEmailChannelProvenance"'),
        expect.stringContaining('"myahInboxTriageMigration"'),
      ]),
    );
    const ddl = statements.join('\n');

    expect(ddl).toContain('timestamptz(3)');
    expect(ddl).toContain("\"status\" IN ('MIGRATING','READY')");
    expect(ddl).not.toContain("'CATCH_UP'");
  });

  it('skips relation DDL when the transactionally last marker already exists', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue([{ exists: true }]),
    } as unknown as jest.Mocked<Pick<QueryRunner, 'query'>>;
    const service = new MyahInboxContactTriageSchemaService();

    await service.ensureWorkspaceTables(
      queryRunner as unknown as QueryRunner,
      workspaceId,
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'SELECT to_regclass($1) IS NOT NULL AS "exists"',
      ['"workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageMigration"'],
    );
  });

  it('initializes only one READY migration marker with a zero fence', async () => {
    const queryRunner = {
      query: jest.fn(),
    } as unknown as jest.Mocked<Pick<QueryRunner, 'query'>>;
    const service = new MyahInboxContactTriageSchemaService();

    await service.initializeNewWorkspaceInTransaction(
      queryRunner as unknown as QueryRunner,
      workspaceId,
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES (true, 'READY', 0, now())"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("id") DO NOTHING'),
    );
    expect(queryRunner.query.mock.calls[0][0]).not.toContain("'MIGRATING'");
  });

  it('derives and escapes the schema rather than interpolating workspace input', async () => {
    const queryRunner = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<QueryRunner, 'query'>>;
    const service = new MyahInboxContactTriageSchemaService();
    const workspaceIdWithIdentifierLikeText =
      '00000000-0000-0000-0000-000000000001';

    await service.ensureWorkspaceTables(
      queryRunner as unknown as QueryRunner,
      workspaceIdWithIdentifierLikeText,
    );

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    );

    expect(statements.join('\n')).toContain('"workspace_1".');
    expect(statements.join('\n')).not.toContain(
      workspaceIdWithIdentifierLikeText,
    );
  });
});

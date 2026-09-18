import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EmailReplyContextActivationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-preflight.service';

const cutoverFixtureSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../test/integration/myah-inbox/myah-inbox-reply-context-cutover.integration-spec.ts',
  ),
  'utf8',
);

const fixtureTableDefinition = (tableName: string): string => {
  const tableStart = cutoverFixtureSource.indexOf(`CREATE TABLE ${tableName}`);

  if (tableStart === -1) return '';

  return cutoverFixtureSource.slice(
    tableStart,
    cutoverFixtureSource.indexOf('\n    )`', tableStart),
  );
};

const workspaceId = '10000000-0000-4000-8000-000000000001';
const threadId = '10000000-0000-4000-8000-000000000002';
const creatorId = '10000000-0000-4000-8000-000000000003';
const campaignId = '10000000-0000-4000-8000-000000000004';

const source = {
  id: threadId,
  creatorId,
  campaignId,
  markdown: 'Preserve this reply',
  blocknote: null,
  revision: 4,
};

const createQuery = (input?: {
  evidence?: number;
  changed?: boolean;
  unfinishedLegacyExecution?: boolean;
  sources?: (Omit<typeof source, 'campaignId'> & {
    campaignId: string | null;
  })[];
  generalProven?: boolean;
}) => {
  let inserted = false;
  let active = false;

  return jest.fn(async (sql: string) => {
    if (sql.includes('FROM core."myahInboxEmailGeneralProvenance"')) {
      return input?.generalProven ? [{ proven: true }] : [];
    }
    if (sql.includes('FROM core."keyValuePair"') && sql.includes('SELECT')) {
      return active ? [{ value: { status: 'ACTIVE' } }] : [];
    }
    if (sql.includes('INSERT INTO core."keyValuePair"')) {
      active = true;
      return [];
    }
    if (sql.includes('FROM "workspace_')) {
      if (sql.includes('ORDER BY id ASC')) return input?.sources ?? [source];
      if (sql.includes('.creator')) return [{ id: creatorId }];
      if (sql.includes('.campaign')) return [{ id: campaignId }];
      if (sql.includes('.message message')) {
        return [{ count: String(input?.evidence ?? 1) }];
      }
      if (sql.includes('WHERE id = $1 FOR UPDATE')) {
        return [
          input?.changed
            ? { ...source, revision: 5 }
            : (input?.sources?.[0] ?? source),
        ];
      }
    }
    if (sql.includes('FROM core."actionApprovalBinding"')) {
      return [{ exists: input?.unfinishedLegacyExecution ?? false }];
    }
    if (sql.includes('FROM core."myahInboxReplyContextDraft"')) {
      return inserted
        ? [
            {
              id: '10000000-0000-4000-8000-000000000005',
              markdown: source.markdown,
              blocknote: source.blocknote,
              revision: source.revision,
              proposalContextFingerprint: null,
              reviewedContextFingerprint: null,
            },
          ]
        : [];
    }
    if (sql.includes('INSERT INTO core."myahInboxReplyContextDraft"')) {
      inserted = true;
      return [];
    }
    return [];
  });
};

const createService = (query: jest.Mock, options?: { schemaProvisioned?: boolean }) =>
  new EmailReplyContextActivationService({
    query,
    transaction: async (
      callback: (manager: { query: typeof query }) => unknown,
    ) => callback({ query }),
    createQueryRunner: () => ({
      connect: jest.fn(),
      hasSchema: jest.fn(async () => options?.schemaProvisioned ?? true),
      release: jest.fn(),
    }),
  } as never);

describe('EmailReplyContextActivationService', () => {
  it('keeps the isolated fixture schema aligned with every unfinished-v1 preflight projection', () => {
    expect(fixtureTableDefinition('core."actionApprovalBinding"')).toContain(
      '"state" core."actionApprovalBinding_state_enum" NOT NULL DEFAULT \'PENDING\'',
    );
    expect(fixtureTableDefinition('core."actionApprovalBinding"')).toContain(
      '"expiresAt" timestamptz NOT NULL',
    );

    expect(
      fixtureTableDefinition(
        '"workspace_3sehh9hzsgs50mn757ntags1t"."messageThread"',
      ),
    ).toContain(
      'REFERENCES "workspace_3sehh9hzsgs50mn757ntags1t".campaign(id) ON DELETE SET NULL',
    );

    const requiredFixtureColumns = {
      'core."keyValuePair"': [
        '"workspaceId"',
        '"userId"',
        'key text NOT NULL',
        'value jsonb',
        'type core."keyValuePair_type_enum" NOT NULL',
        '"updatedAt" timestamptz NOT NULL DEFAULT now()',
        '"deletedAt" timestamptz',
      ],
      '"workspace_3sehh9hzsgs50mn757ntags1t".creator': [
        'id uuid PRIMARY KEY',
        '"deletedAt" timestamptz',
      ],
      '"workspace_3sehh9hzsgs50mn757ntags1t".campaign': [
        'id uuid PRIMARY KEY',
        '"deletedAt" timestamptz',
      ],
      '"workspace_3sehh9hzsgs50mn757ntags1t"."messageThread"': [
        'id uuid PRIMARY KEY',
        '"creatorId" uuid',
        '"myahCampaignId" uuid',
        '"deletedAt" timestamptz',
        '"myahReplyDraftBodyMarkdown" text',
        '"myahReplyDraftBodyBlocknote" text',
        '"myahReplyDraftRevision" integer NOT NULL',
      ],
      '"workspace_3sehh9hzsgs50mn757ntags1t".message': [
        'id uuid PRIMARY KEY',
        '"messageThreadId" uuid',
        '"deletedAt" timestamptz',
        '"isDraft" boolean NOT NULL',
        '"receivedAt" timestamptz',
      ],
      '"workspace_3sehh9hzsgs50mn757ntags1t"."messageChannelMessageAssociation"':
        [
          '"messageId" uuid',
          '"messageChannelId" uuid',
          '"deletedAt" timestamptz',
          'direction text',
        ],
      'core."messageChannel"': ['id uuid PRIMARY KEY', 'type text NOT NULL'],
      'core."actionApprovalBinding"': [
        'id uuid PRIMARY KEY',
        '"workspaceId" uuid',
        '"initiatorUserWorkspaceId" uuid NOT NULL',
        '"actionName" varchar NOT NULL',
        '"actionVersion" integer NOT NULL DEFAULT 1',
        '"actionKind" varchar',
        '"draftId" uuid NOT NULL',
        '"contentDigest" varchar(64) NOT NULL',
        '"recipientFingerprint" varchar(64)',
        '"sendingAccountFingerprint" varchar(64)',
        '"actionContextFingerprint" varchar(64)',
        '"threadId" uuid',
        '"interactionContextType" varchar',
        '"interactionContextId" uuid',
        '"state" core."actionApprovalBinding_state_enum" NOT NULL DEFAULT \'PENDING\'',
        '"expiresAt" timestamptz NOT NULL',
      ],
      'core."actionExecutionReceipt"': [
        'id uuid PRIMARY KEY',
        '"workspaceId" uuid NOT NULL',
        '"actionApprovalBindingId" uuid NOT NULL',
        '"idempotencyKey" varchar(64) NOT NULL',
        'state core."actionExecutionReceipt_state_enum" NOT NULL DEFAULT \'PROCESSING\'',
      ],
    };

    for (const [tableName, requiredColumns] of Object.entries(
      requiredFixtureColumns,
    )) {
      const definition = fixtureTableDefinition(tableName);

      for (const column of requiredColumns) {
        expect(definition).toContain(column);
      }
    }
  });

  it('copies a locked eligible Email source with its revision and null fingerprints before enabling activation', async () => {
    const query = createQuery();
    const service = createService(query);

    await expect(service.preflightEmailWorkspace(workspaceId)).resolves.toEqual(
      {
        mapped: 1,
        unmapped: 0,
        sourceChanged: 0,
      },
    );
    expect(
      query.mock.calls.some(
        ([sql]) =>
          String(sql).includes('"proposalContextFingerprint"') &&
          String(sql).includes('NULL, NULL'),
      ),
    ).toBe(true);
    await expect(
      service.isEmailContextActivationEnabled(workspaceId),
    ).resolves.toBe(true);
  });

  it('holds activation without copying when a source is ambiguous', async () => {
    const query = createQuery({ evidence: 0 });

    await expect(
      createService(query).preflightEmailWorkspace(workspaceId),
    ).resolves.toEqual({
      mapped: 0,
      unmapped: 1,
      sourceChanged: 0,
    });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO core."myahInboxReplyContextDraft"'),
      ),
    ).toBe(false);
  });

  it('holds activation when the source changes after the source lock', async () => {
    const query = createQuery({ changed: true });

    await expect(
      createService(query).preflightEmailWorkspace(workspaceId),
    ).resolves.toEqual({
      mapped: 0,
      unmapped: 1,
      sourceChanged: 1,
    });
  });

  it('holds an unfinished v1 execution and leaves no unsent contextual draft after its sent recovery clears the legacy source', async () => {
    const state: {
      unfinishedLegacyExecution: boolean;
      sources: (typeof source)[];
    } = {
      unfinishedLegacyExecution: true,
      sources: [source],
    };
    const query = createQuery(state);
    const service = createService(query);

    await expect(service.preflightEmailWorkspace(workspaceId)).resolves.toEqual(
      {
        mapped: 0,
        unmapped: 1,
        sourceChanged: 0,
      },
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO core."myahInboxReplyContextDraft"'),
      ),
    ).toBe(false);

    state.unfinishedLegacyExecution = false;
    state.sources = [];
    await expect(service.preflightEmailWorkspace(workspaceId)).resolves.toEqual(
      {
        mapped: 0,
        unmapped: 0,
        sourceChanged: 0,
      },
    );
    await expect(
      service.isEmailContextActivationEnabled(workspaceId),
    ).resolves.toBe(true);
    expect(
      query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO core."myahInboxReplyContextDraft"'),
      ),
    ).toHaveLength(0);
  });

  it.each([false, true])(
    'requires positive General provenance in release B (proven=%s)',
    async (generalProven) => {
      const query = createQuery({
        sources: [{ ...source, campaignId: null }],
        generalProven,
      });
      const service = createService(query);
      await expect(
        service.preflightEmailWorkspace(workspaceId),
      ).resolves.toEqual({
        mapped: generalProven ? 1 : 0,
        unmapped: generalProven ? 0 : 1,
        sourceChanged: 0,
      });
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO core."myahInboxReplyContextDraft"'),
        ),
      ).toBe(generalProven);
      await expect(
        service.isEmailContextActivationEnabled(workspaceId),
      ).resolves.toBe(generalProven);
    },
  );

  it('defaults activation off until an active marker is present', async () => {
    await expect(
      createService(createQuery()).isEmailContextActivationEnabled(workspaceId),
    ).resolves.toBe(false);
  });
});

describe('EmailReplyContextActivationService.assertEmailContextActivationEnabled', () => {
  it('does nothing when the workspace is already active', async () => {
    const query = jest.fn(async (sql: string) =>
      sql.includes('FROM core."keyValuePair"')
        ? [{ value: { status: 'ACTIVE' } }]
        : [],
    );
    const service = createService(query);

    await expect(
      service.assertEmailContextActivationEnabled(workspaceId),
    ).resolves.toBeUndefined();
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('FOR UPDATE')),
    ).toBe(false);
  });

  it('activates a provisioned workspace with no legacy drafts on first use', async () => {
    const query = createQuery({ sources: [] });
    const service = createService(query, { schemaProvisioned: true });

    await expect(
      service.assertEmailContextActivationEnabled(workspaceId),
    ).resolves.toBeUndefined();
    await expect(
      service.isEmailContextActivationEnabled(workspaceId),
    ).resolves.toBe(true);
  });

  it('still rejects when legacy drafts remain unmapped after the first-use attempt', async () => {
    const query = createQuery({ evidence: 0 });
    const service = createService(query, { schemaProvisioned: true });

    await expect(
      service.assertEmailContextActivationEnabled(workspaceId),
    ).rejects.toThrow('Email reply context activation is pending');
  });

  it('rejects without attempting activation when the workspace has no provisioned schema', async () => {
    const query = createQuery({ sources: [] });
    const service = createService(query, { schemaProvisioned: false });

    await expect(
      service.assertEmailContextActivationEnabled(workspaceId),
    ).rejects.toThrow('Email reply context activation is pending');
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('FOR UPDATE')),
    ).toBe(false);
  });
});

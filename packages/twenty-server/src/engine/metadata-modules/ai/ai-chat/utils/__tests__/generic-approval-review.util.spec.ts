import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import {
  createGenericApprovalReviewer,
  GenericApprovalReviewError,
  isGenericApprovalDeniedTool,
  isGenericApprovalSchemaOnlyTool,
} from 'src/engine/metadata-modules/ai/ai-chat/utils/generic-approval-review.util';
import { EXTERNAL_WRITE_POLICIES } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';
import { REGISTERED_ACTION_TOOL_NAMES } from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';

const ALICE_ID = '7f1c1c1e-0d8a-4b37-9f6a-8e9d2f1b0a11';
const TIM_ID = '2b0c1a55-6e1f-4c33-8d92-44f0e8a1c7b2';
const CAMPAIGN_ID = '5d1e0f2a-3b4c-4d5e-8f60-718293a4b5c6';

const crudEntry = (
  name: string,
  objectNameSingular: string,
  operation: string,
): ToolIndexEntry =>
  ({
    name,
    label: name,
    description: name,
    category: 'DATABASE_CRUD',
    executionRef: { kind: 'database_crud', objectNameSingular, operation },
  }) as ToolIndexEntry;

const staticEntry = (name: string): ToolIndexEntry =>
  ({
    name,
    label: `Label ${name}`,
    description: name,
    category: 'ACTION',
    executionRef: { kind: 'static', toolId: name },
  }) as ToolIndexEntry;

const catalog: ToolIndexEntry[] = [
  crudEntry('find_one_creator', 'creator', 'find_one'),
  crudEntry('find_many_creators', 'creator', 'find_many'),
  crudEntry('update_one_creator', 'creator', 'update_one'),
  crudEntry('update_many_creators', 'creator', 'update_many'),
  crudEntry('upsert_many_creators', 'creator', 'upsert_many'),
  crudEntry('delete_one_creator', 'creator', 'delete_one'),
  crudEntry('delete_many_creators', 'creator', 'delete_many'),
  crudEntry('create_one_creator', 'creator', 'create_one'),
  crudEntry('create_many_creators', 'creator', 'create_many'),
  crudEntry('find_one_campaign', 'campaign', 'find_one'),
  staticEntry('update_myah_inbox_thread'),
  staticEntry('code_interpreter'),
  staticEntry('http_request'),
  staticEntry('send_email'),
  staticEntry('send_myah_inbox_reply'),
  staticEntry('get_campaign_audience'),
];

const creatorProperties = {
  id: { type: 'string' },
  creatorStatus: { type: 'string' },
  city: { type: 'string' },
  name: { type: 'object' },
  campaignId: { type: 'string' },
  bodyV2: {
    type: 'object',
    properties: {
      blocknote: { type: 'string' },
      markdown: { type: 'string' },
    },
  },
};

const schemas: Record<string, object> = {
  update_one_creator: { type: 'object', properties: creatorProperties },
  create_one_creator: { type: 'object', properties: creatorProperties },
  update_many_creators: {
    type: 'object',
    properties: {
      filter: { type: 'object' },
      data: { type: 'object', properties: creatorProperties },
    },
  },
  upsert_many_creators: {
    type: 'object',
    properties: {
      records: { type: 'array', items: { $ref: '#/$defs/creator' } },
    },
    $defs: { creator: { type: 'object', properties: creatorProperties } },
  },
  create_many_creators: {
    type: 'object',
    properties: {
      records: { type: 'array', items: { $ref: '#/$defs/creator' } },
    },
    $defs: { creator: { type: 'object', properties: creatorProperties } },
  },
};

type CreatorRow = Record<string, unknown> & { id: string };

const buildRegistry = (
  rows: CreatorRow[],
  options: {
    hiddenFields?: string[];
    failReads?: boolean;
    failLinkedRead?: boolean;
    emptyLinkedLabel?: boolean;
    emptyTargetLabel?: boolean;
  } = {},
) => {
  const visible = (row: CreatorRow) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !(options.hiddenFields ?? []).includes(key),
      ),
    );
  const references = (records: CreatorRow[]) =>
    records.map((record) => ({
      objectNameSingular: 'creator',
      recordId: record.id,
      displayName: options.emptyTargetLabel
        ? ''
        : (record.displayName as string),
    }));

  return {
    getToolInfo: jest.fn((names: string[]) =>
      Promise.resolve(
        names.map((name) => ({ name, inputSchema: schemas[name] })),
      ),
    ),
    resolveAndExecute: jest.fn(
      (name: string, args: Record<string, unknown>) => {
        if (options.failReads) {
          return Promise.resolve({
            success: false,
            message: 'Permission denied',
          });
        }
        if (name === 'find_one_campaign') {
          if (options.failLinkedRead) {
            return Promise.resolve({
              success: false,
              message: 'Permission denied',
            });
          }
          return Promise.resolve({
            success: true,
            message: 'ok',
            result: { records: [{ id: CAMPAIGN_ID }], count: 1 },
            recordReferences: [
              {
                objectNameSingular: 'campaign',
                recordId: CAMPAIGN_ID,
                displayName: options.emptyLinkedLabel ? '' : 'Summer Launch',
              },
            ],
          });
        }
        let matched: CreatorRow[] = [];

        if (name === 'find_one_creator') {
          matched = rows.filter((row) => row.id === args.id);
        } else if (name === 'find_many_creators') {
          // The real find_many tool refuses reads without a non-empty select.
          if (!Array.isArray(args.select) || !args.select.includes('*')) {
            return Promise.resolve({
              success: false,
              error: 'Select is required',
            });
          }
          const idFilter = args.id as
            | { in?: string[]; eq?: string }
            | undefined;
          const statusFilter = args.creatorStatus as
            | { eq?: string }
            | undefined;

          matched = rows.filter(
            (row) =>
              (!idFilter?.in || idFilter.in.includes(row.id)) &&
              (!idFilter?.eq || idFilter.eq === row.id) &&
              (!statusFilter?.eq || statusFilter.eq === row.creatorStatus),
          );
        }

        return Promise.resolve({
          success: true,
          message: 'ok',
          result: { records: matched.map(visible), count: matched.length },
          recordReferences: references(matched),
        });
      },
    ),
  };
};

const alice = (): CreatorRow => ({
  id: ALICE_ID,
  displayName: 'Alice',
  creatorStatus: 'NEW',
  city: 'Paris',
  name: { firstName: 'Alice', lastName: 'Doe' },
  campaignId: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});
const tim = (): CreatorRow => ({
  id: TIM_ID,
  displayName: 'Tim',
  creatorStatus: 'NEW',
  city: 'Berlin',
  name: { firstName: 'Tim', lastName: 'Roe' },
  campaignId: null,
});

const reviewer = (
  rows: CreatorRow[],
  options?: Parameters<typeof buildRegistry>[1],
) => {
  const toolRegistry = buildRegistry(rows, options);

  return {
    toolRegistry,
    ...createGenericApprovalReviewer({
      toolRegistry: toolRegistry as never,
      toolContext: { workspaceId: 'workspace-id', roleId: 'role-id' },
      toolCatalog: catalog,
      resolveLinkedObjectNames: () =>
        Promise.resolve({ campaignId: 'campaign' }),
    }),
  };
};

const aliceQualified = { id: ALICE_ID, creatorStatus: 'QUALIFIED' };

describe('generic approval reviewer', () => {
  it('reviews Alice -> Qualified with her label, current value, and fingerprint', async () => {
    const { buildReviewedAction } = reviewer([alice(), tim()]);

    const reviewedAction = await buildReviewedAction({
      toolName: 'update_one_creator',
      proposedArguments: aliceQualified,
    });

    expect(reviewedAction).toEqual({
      version: 1,
      toolName: 'update_one_creator',
      toolLabel: 'update_one_creator',
      argumentsDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      arguments: aliceQualified,
      target: {
        kind: 'record_write',
        operation: 'update',
        objectNameSingular: 'creator',
        records: [
          {
            recordId: ALICE_ID,
            label: 'Alice',
            changes: [
              { field: 'creatorStatus', current: 'NEW', proposed: 'QUALIFIED' },
            ],
            linkedRecords: [],
          },
        ],
        totalCount: 1,
        targetFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it.each([
    ['a missing record', { id: TIM_ID, creatorStatus: 'QUALIFIED' }],
    ['a non-UUID id', { id: 'alice', creatorStatus: 'QUALIFIED' }],
    ['an unknown field', { id: ALICE_ID, favouriteColour: 'blue' }],
    ['no field change', { id: ALICE_ID }],
  ])('rejects %s', async (_label, proposedArguments) => {
    const { buildReviewedAction } = reviewer([alice()]);

    await expect(
      buildReviewedAction({
        toolName: 'update_one_creator',
        proposedArguments,
      }),
    ).rejects.toBeInstanceOf(GenericApprovalReviewError);
  });

  it('rejects a change to a field the role cannot read', async () => {
    const { buildReviewedAction } = reviewer([alice()], {
      hiddenFields: ['creatorStatus'],
    });

    await expect(
      buildReviewedAction({
        toolName: 'update_one_creator',
        proposedArguments: aliceQualified,
      }),
    ).rejects.toMatchObject({ reason: 'NOT_AUTHORIZED_OR_UNAVAILABLE' });
  });

  it('shows an unnamed target with its exact record ID', async () => {
    const reviewedAction = await reviewer([alice()], {
      emptyTargetLabel: true,
    }).buildReviewedAction({
      toolName: 'update_one_creator',
      proposedArguments: aliceQualified,
    });

    expect(reviewedAction.target).toMatchObject({
      records: [{ recordId: ALICE_ID, label: `Unnamed creator (${ALICE_ID})` }],
    });
  });

  it('rejects when the target cannot be read', async () => {
    const { buildReviewedAction } = reviewer([alice()], { failReads: true });

    await expect(
      buildReviewedAction({
        toolName: 'update_one_creator',
        proposedArguments: aliceQualified,
      }),
    ).rejects.toMatchObject({ reason: 'NOT_AUTHORIZED_OR_UNAVAILABLE' });
  });

  it('rejects a filter that matches nothing or more than 20 records', async () => {
    const many = Array.from({ length: 201 }, (_, index) => ({
      ...tim(),
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));

    await expect(
      reviewer([alice()]).buildReviewedAction({
        toolName: 'update_many_creators',
        proposedArguments: {
          filter: { creatorStatus: { eq: 'REJECTED' } },
          data: { creatorStatus: 'QUALIFIED' },
        },
      }),
    ).rejects.toThrow('does not match any record');
    await expect(
      reviewer(many).buildReviewedAction({
        toolName: 'update_many_creators',
        proposedArguments: {
          filter: { creatorStatus: { eq: 'NEW' } },
          data: { creatorStatus: 'QUALIFIED' },
        },
      }),
    ).rejects.toThrow('more than 20 records');
  });

  it.each(['update_many_creators', 'delete_many_creators'])(
    'refuses %s above 20 matches and shows all 20 allowed targets',
    async (toolName) => {
      const records = Array.from({ length: 21 }, (_, index) => ({
        ...tim(),
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      }));
      const proposedArguments = {
        filter: { creatorStatus: { eq: 'NEW' } },
        ...(toolName === 'update_many_creators'
          ? { data: { creatorStatus: 'QUALIFIED' } }
          : {}),
      };

      await expect(
        reviewer(records).buildReviewedAction({ toolName, proposedArguments }),
      ).rejects.toThrow('more than 20 records');

      const reviewed = await reviewer(records.slice(0, 20)).buildReviewedAction(
        {
          toolName,
          proposedArguments,
        },
      );

      expect(reviewed.target).toMatchObject({ totalCount: 20 });
      if (reviewed.target.kind !== 'record_write') {
        throw new Error('Expected reviewed record write');
      }
      expect(reviewed.target.records).toHaveLength(20);
    },
  );

  it('reviews every record matched by an update_many filter', async () => {
    const { buildReviewedAction, toolRegistry } = reviewer([alice(), tim()]);
    const reviewedAction = await buildReviewedAction({
      toolName: 'update_many_creators',
      proposedArguments: {
        filter: { creatorStatus: { eq: 'NEW' } },
        data: { creatorStatus: 'QUALIFIED' },
      },
    });

    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'find_many_creators',
      expect.objectContaining({ select: ['*'] }),
      expect.anything(),
    );
    expect(reviewedAction.target).toMatchObject({
      operation: 'update',
      totalCount: 2,
      records: [{ label: 'Alice' }, { label: 'Tim' }],
    });
  });

  it('requires an existing ID for every upserted record', async () => {
    const { buildReviewedAction } = reviewer([alice(), tim()]);

    await expect(
      buildReviewedAction({
        toolName: 'upsert_many_creators',
        proposedArguments: { records: [{ creatorStatus: 'QUALIFIED' }] },
      }),
    ).rejects.toThrow('distinct existing record ID');

    const reviewedAction = await buildReviewedAction({
      toolName: 'upsert_many_creators',
      proposedArguments: {
        records: [
          { id: ALICE_ID, creatorStatus: 'QUALIFIED' },
          { id: TIM_ID, city: 'Rome' },
        ],
      },
    });

    expect(reviewedAction.target).toMatchObject({
      totalCount: 2,
      records: [
        {
          label: 'Alice',
          changes: [{ field: 'creatorStatus', current: 'NEW' }],
        },
        { label: 'Tim', changes: [{ field: 'city', current: 'Berlin' }] },
      ],
    });
  });

  it.each(['create_many_creators', 'upsert_many_creators'])(
    'refuses %s when per-record values would be hidden after 20 records',
    async (toolName) => {
      const rows = Array.from({ length: 21 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        displayName: `Creator ${index + 1}`,
        city: 'Paris',
        creatorStatus: 'NEW',
      }));
      const proposedRecords = rows.map(({ id }, index) => ({
        id,
        city: `City ${index + 1}`,
      }));

      await expect(
        reviewer(rows).buildReviewedAction({
          toolName,
          proposedArguments: { records: proposedRecords },
        }),
      ).rejects.toThrow('more than 20 records');

      const reviewedAction = await reviewer(
        rows.slice(0, 20),
      ).buildReviewedAction({
        toolName,
        proposedArguments: { records: proposedRecords.slice(0, 20) },
      });

      expect(reviewedAction.target).toMatchObject({ totalCount: 20 });
      if (reviewedAction.target.kind !== 'record_write') {
        throw new Error('Expected reviewed record write');
      }
      expect(reviewedAction.target.records).toHaveLength(20);
    },
  );

  it.each(['update_many_creators', 'upsert_many_creators'])(
    'refuses %s for blocknote, which find_many select cannot read',
    async (toolName) => {
      const proposed = { bodyV2: { blocknote: '[{"type":"heading"}]' } };
      const row = {
        ...alice(),
        bodyV2: { blocknote: '[{"type":"paragraph"}]', markdown: 'Old' },
      };
      const proposedArguments =
        toolName === 'update_many_creators'
          ? { filter: { creatorStatus: { eq: 'NEW' } }, data: proposed }
          : { records: [{ id: ALICE_ID, ...proposed }] };

      await expect(
        reviewer([row]).buildReviewedAction({ toolName, proposedArguments }),
      ).rejects.toThrow('blocknote');
    },
  );

  it.each(['update_many_creators', 'upsert_many_creators'])(
    'refuses %s for unreviewable rich-text without an explicit blocknote key',
    async (toolName) => {
      const row = {
        ...alice(),
        bodyV2: { blocknote: '[{"type":"paragraph"}]', markdown: 'Old' },
      };

      for (const bodyV2 of [{}, { markdown: 'New' }, null]) {
        const proposed = { bodyV2 };
        const proposedArguments =
          toolName === 'update_many_creators'
            ? { filter: { creatorStatus: { eq: 'NEW' } }, data: proposed }
            : { records: [{ id: ALICE_ID, ...proposed }] };

        await expect(
          reviewer([row]).buildReviewedAction({ toolName, proposedArguments }),
        ).rejects.toThrow('rich-text');
      }
    },
  );

  it.each([
    {},
    null,
    { unknownSubfield: 'ignored by the write' },
    { markdown: 'New', unknownSubfield: 'ignored by the write' },
  ])(
    'refuses a single-record rich-text replacement with %p',
    async (bodyV2) => {
      await expect(
        reviewer([
          {
            ...alice(),
            bodyV2: { blocknote: '[{"type":"paragraph"}]', markdown: 'Old' },
          },
        ]).buildReviewedAction({
          toolName: 'update_one_creator',
          proposedArguments: { id: ALICE_ID, bodyV2 },
        }),
      ).rejects.toThrow('rich-text');
    },
  );

  it('still reviews single-record blocknote values', async () => {
    const reviewedAction = await reviewer([
      {
        ...alice(),
        bodyV2: { blocknote: '[{"type":"paragraph"}]', markdown: 'Old' },
      },
    ]).buildReviewedAction({
      toolName: 'update_one_creator',
      proposedArguments: {
        id: ALICE_ID,
        bodyV2: { blocknote: '[{"type":"heading"}]' },
      },
    });

    expect(reviewedAction.target).toMatchObject({
      records: [
        { changes: [{ current: { blocknote: '[{"type":"paragraph"}]' } }] },
      ],
    });
  });

  it('compares only the proposed subfields of a composite field', async () => {
    const { buildReviewedAction, verifyTarget } = reviewer([alice()]);
    const reviewedAction = await buildReviewedAction({
      toolName: 'update_one_creator',
      proposedArguments: { id: ALICE_ID, name: { firstName: 'Alicia' } },
    });

    expect(reviewedAction.target).toMatchObject({
      records: [
        {
          changes: [
            {
              field: 'name',
              current: { firstName: 'Alice' },
              proposed: { firstName: 'Alicia' },
            },
          ],
        },
      ],
    });

    const lastNameChanged = reviewer([
      { ...alice(), name: { firstName: 'Alice', lastName: 'Smith' } },
    ]);

    await expect(lastNameChanged.verifyTarget(reviewedAction)).resolves.toEqual(
      {
        ok: true,
      },
    );
    await expect(verifyTarget(reviewedAction)).resolves.toEqual({ ok: true });
  });

  it('labels a linked record on a creation and has no fingerprint', async () => {
    const reviewedAction = await reviewer([]).buildReviewedAction({
      toolName: 'create_one_creator',
      proposedArguments: { city: 'Lyon', campaignId: CAMPAIGN_ID },
    });

    expect(reviewedAction.target).toEqual({
      kind: 'record_write',
      operation: 'create',
      objectNameSingular: 'creator',
      records: [
        {
          recordId: null,
          label: null,
          changes: [
            { field: 'campaignId', proposed: CAMPAIGN_ID },
            { field: 'city', proposed: 'Lyon' },
          ],
          linkedRecords: [
            {
              field: 'campaignId',
              recordId: CAMPAIGN_ID,
              label: 'Summer Launch',
            },
          ],
        },
      ],
      totalCount: 1,
      targetFingerprint: null,
    });
  });

  it('shows an unnamed linked record next to its exact ID', async () => {
    const reviewedAction = await reviewer([], {
      emptyLinkedLabel: true,
    }).buildReviewedAction({
      toolName: 'create_one_creator',
      proposedArguments: { city: 'Lyon', campaignId: CAMPAIGN_ID },
    });

    expect(reviewedAction.target).toMatchObject({
      records: [
        {
          linkedRecords: [
            {
              field: 'campaignId',
              recordId: CAMPAIGN_ID,
              label: 'Unnamed campaign',
            },
          ],
        },
      ],
    });
  });

  it('refuses a creation when a linked record cannot be labelled', async () => {
    await expect(
      reviewer([], { failLinkedRead: true }).buildReviewedAction({
        toolName: 'create_one_creator',
        proposedArguments: { city: 'Lyon', campaignId: CAMPAIGN_ID },
      }),
    ).rejects.toThrow('could not be read');
  });

  it('reviews create_many records against the referenced schema', async () => {
    await expect(
      reviewer([]).buildReviewedAction({
        toolName: 'create_many_creators',
        proposedArguments: { records: [{ city: 'Lyon' }, { bogus: true }] },
      }),
    ).rejects.toThrow('"bogus" is not a field this tool can write');
  });

  it('binds only the exact arguments of a non-record tool', async () => {
    const reviewedAction = await reviewer([]).buildReviewedAction({
      toolName: 'update_myah_inbox_thread',
      proposedArguments: { messageThreadId: 'thread-id', state: 'CLOSED' },
    });

    expect(reviewedAction).toMatchObject({
      toolLabel: 'Label update_myah_inbox_thread',
      target: { kind: 'arguments_only' },
    });
  });

  it.each([
    'send_myah_inbox_reply',
    'code_interpreter',
    'http_request',
    'send_email',
    'get_campaign_audience',
    'find_one_creator',
    'not_in_catalog',
  ])('refuses generic approval for %s', async (toolName) => {
    await expect(
      reviewer([alice()]).buildReviewedAction({
        toolName,
        proposedArguments: { id: ALICE_ID },
      }),
    ).rejects.toBeInstanceOf(GenericApprovalReviewError);
  });

  describe('verifyTarget', () => {
    const review = async () =>
      reviewer([alice(), tim()]).buildReviewedAction({
        toolName: 'update_one_creator',
        proposedArguments: aliceQualified,
      });

    it('accepts an unchanged target, even when unrelated fields changed', async () => {
      const reviewedAction = await review();

      await expect(
        reviewer([
          { ...alice(), city: 'Nice', updatedAt: new Date() },
          tim(),
        ]).verifyTarget(reviewedAction),
      ).resolves.toEqual({ ok: true });
    });

    it('accepts unchanged multi-field arguments after jsonb reorders object keys', async () => {
      const reviewedAction = await reviewer([alice()]).buildReviewedAction({
        toolName: 'update_one_creator',
        proposedArguments: {
          id: ALICE_ID,
          creatorStatus: 'QUALIFIED',
          city: 'Rome',
        },
      });

      await expect(
        reviewer([alice()]).verifyTarget({
          ...reviewedAction,
          arguments: {
            id: ALICE_ID,
            city: 'Rome',
            creatorStatus: 'QUALIFIED',
          },
        }),
      ).resolves.toEqual({ ok: true });
    });

    it('refuses a stored update with a forged arguments-only target or missing fingerprint', async () => {
      const reviewedAction = await review();
      const current = reviewer([alice()]);

      await expect(
        current.verifyTarget({
          ...reviewedAction,
          target: { kind: 'arguments_only' },
        }),
      ).resolves.toMatchObject({ ok: false, reason: 'TARGET_CHANGED' });

      if (reviewedAction.target.kind !== 'record_write') {
        throw new Error('Expected a record write');
      }

      await expect(
        current.verifyTarget({
          ...reviewedAction,
          target: { ...reviewedAction.target, targetFingerprint: null },
        }),
      ).resolves.toMatchObject({ ok: false, reason: 'TARGET_CHANGED' });
    });

    it('refuses a stored record target whose reviewed action differs from the real write', async () => {
      const reviewedAction = await review();

      if (reviewedAction.target.kind !== 'record_write') {
        throw new Error('Expected a record write');
      }

      await expect(
        reviewer([alice()]).verifyTarget({
          ...reviewedAction,
          target: { ...reviewedAction.target, operation: 'delete' },
        }),
      ).resolves.toMatchObject({ ok: false, reason: 'TARGET_CHANGED' });
    });

    it('rechecks a linked record label before executing a creation', async () => {
      const reviewedAction = await reviewer([]).buildReviewedAction({
        toolName: 'create_one_creator',
        proposedArguments: { city: 'Lyon', campaignId: CAMPAIGN_ID },
      });

      await expect(
        reviewer([], { failLinkedRead: true }).verifyTarget(reviewedAction),
      ).resolves.toMatchObject({
        ok: false,
        reason: 'NOT_AUTHORIZED_OR_UNAVAILABLE',
      });
    });

    it('refuses when the displayed target label changed without a proposed-field change', async () => {
      const reviewedAction = await review();

      await expect(
        reviewer([{ ...alice(), displayName: 'Alicia' }]).verifyTarget(
          reviewedAction,
        ),
      ).resolves.toMatchObject({ ok: false, reason: 'TARGET_CHANGED' });
    });

    it('refuses when the reviewed field changed', async () => {
      const reviewedAction = await review();

      await expect(
        reviewer([{ ...alice(), creatorStatus: 'REJECTED' }]).verifyTarget(
          reviewedAction,
        ),
      ).resolves.toMatchObject({ ok: false, reason: 'TARGET_CHANGED' });
    });

    it('refuses when the target was deleted', async () => {
      const reviewedAction = await review();

      await expect(
        reviewer([tim()]).verifyTarget(reviewedAction),
      ).resolves.toMatchObject({ ok: false, reason: 'TARGET_CHANGED' });
    });

    it('refuses when a filter now matches a different record set', async () => {
      const { buildReviewedAction } = reviewer([alice()]);
      const reviewedAction = await buildReviewedAction({
        toolName: 'update_many_creators',
        proposedArguments: {
          filter: { creatorStatus: { eq: 'NEW' } },
          data: { creatorStatus: 'QUALIFIED' },
        },
      });

      await expect(
        reviewer([alice(), tim()]).verifyTarget(reviewedAction),
      ).resolves.toMatchObject({ ok: false, reason: 'TARGET_CHANGED' });
    });

    it('refuses when reads are now denied', async () => {
      const reviewedAction = await review();

      await expect(
        reviewer([alice()], { failReads: true }).verifyTarget(reviewedAction),
      ).resolves.toMatchObject({
        ok: false,
        reason: 'NOT_AUTHORIZED_OR_UNAVAILABLE',
      });
    });

    it('refuses when the tool left the role catalog', async () => {
      const reviewedAction = await review();
      const withoutWrite = createGenericApprovalReviewer({
        toolRegistry: buildRegistry([alice()]) as never,
        toolContext: { workspaceId: 'workspace-id', roleId: 'role-id' },
        toolCatalog: catalog.filter(
          ({ name }) => name !== 'update_one_creator',
        ),
      });

      await expect(
        withoutWrite.verifyTarget(reviewedAction),
      ).resolves.toMatchObject({
        ok: false,
        reason: 'NOT_AUTHORIZED_OR_UNAVAILABLE',
      });
    });
  });
});

describe('generic approval tool classification', () => {
  it('denies code_interpreter and every external write without a registered action', () => {
    expect(isGenericApprovalDeniedTool('code_interpreter')).toBe(true);

    for (const [toolName, policy] of Object.entries(EXTERNAL_WRITE_POLICIES)) {
      if (policy.kind === 'external-write') {
        // Every external write is either a registered send or denied here.
        expect(
          policy.actionName !== undefined ||
            isGenericApprovalDeniedTool(toolName),
        ).toBe(true);
      }
    }
    expect(isGenericApprovalDeniedTool('update_one_creator')).toBe(false);
  });

  it('never reveals send, email, external-write, or code schemas early', () => {
    for (const toolName of [
      ...Object.keys(EXTERNAL_WRITE_POLICIES),
      ...REGISTERED_ACTION_TOOL_NAMES,
    ]) {
      expect(isGenericApprovalSchemaOnlyTool(toolName)).toBe(false);
    }
    expect(isGenericApprovalSchemaOnlyTool('update_one_creator')).toBe(true);
    expect(isGenericApprovalSchemaOnlyTool('update_myah_inbox_thread')).toBe(
      true,
    );
  });
});

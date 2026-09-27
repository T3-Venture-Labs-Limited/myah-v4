import { randomUUID } from 'node:crypto';
import gql from 'graphql-tag';
import request from 'supertest';

jest.mock('@e2b/code-interpreter', () => ({}));
jest.mock('@file-type/pdf', () => ({ detectPdf: jest.fn() }));
jest.mock(
  'file-type',
  () => ({
    FileTypeParser: class {
      fromBuffer = jest.fn();
    },
    supportedMimeTypes: { has: jest.fn() },
  }),
  { virtual: true },
);

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import {
  proposeGenericApproval,
  readApprovalResult,
  runScriptedChatTurn,
} from 'test/integration/ai/utils/generic-approval-chat.util';
import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { destroyManyOperationFactory } from 'test/integration/graphql/utils/destroy-many-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';
import { createUpsertObjectPermissionsOperation } from 'test/integration/graphql/utils/upsert-object-permission-operation-factory.util';
import { updateWorkspaceMemberRole } from 'test/integration/graphql/utils/update-workspace-member-role.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';

// MYAH-315: a generic AI-chat approval authorizes only the exact reviewed
// action, at most once. Runs as seeded member Jony on a disposable role in
// the seed Apple workspace, with disposable Creators Alice and Tim. Creator
// state is read and set through the admin GraphQL API.
const marker = randomUUID();
const chatThreadId = randomUUID();
const client = request(`http://localhost:${APP_PORT}`);

let aliceId: string;
let timId: string;
let disposableRoleId: string;
let originalJonyRoleId: string;
let creatorObjectMetadataId: string;

const readStatus = async (creatorId: string) => {
  const response = await makeGraphqlAPIRequest(
    findOneOperationFactory({
      objectMetadataSingularName: 'creator',
      gqlFields: 'id creatorStatus',
      filter: { id: { eq: creatorId } },
    }),
  );

  expect(response.body.errors).toBeUndefined();

  return response.body.data.creator.creatorStatus as string;
};

const setStatus = async (creatorId: string, creatorStatus: string) => {
  const response = await makeGraphqlAPIRequest(
    updateOneOperationFactory({
      objectMetadataSingularName: 'creator',
      gqlFields: 'id',
      recordId: creatorId,
      data: { creatorStatus },
    }),
  );

  expect(response.body.errors).toBeUndefined();
};

const chatAsJony = {
  workspaceId: SEED_APPLE_WORKSPACE_ID,
  userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JONY,
  chatThreadId,
};

const approve = async (
  proposedArguments: Record<string, unknown>,
  decision: 'approved' | 'rejected' | 'changes_requested' = 'approved',
  toolName = 'update_one_creator',
) => {
  const approval = await proposeGenericApproval({
    ...chatAsJony,
    toolName,
    proposedArguments,
  });

  if (!approval.proposed) {
    throw new Error(`Expected a reviewable approval: ${approval.error}`);
  }

  await approval.decide(decision);

  return approval;
};

const runApprovedResume = async (
  approval: Awaited<ReturnType<typeof approve>>,
  executeArguments: Record<string, unknown>,
  approvalMessage?: unknown,
  toolName = 'update_one_creator',
) => {
  const { chunks } = await runScriptedChatTurn({
    ...chatAsJony,
    messages: [approvalMessage ?? (await approval.loadMessage())],
    calls: [
      {
        toolName: 'execute_tool',
        input: { toolName, arguments: executeArguments },
      },
    ],
  });

  return chunks.find(
    (chunk) =>
      chunk.type === 'tool-result' && chunk.toolName === 'execute_tool',
  )?.output as { success: boolean; message?: string; error?: string };
};

const createCreator = async (name: string) => {
  const response = await makeGraphqlAPIRequest(
    createOneOperationFactory({
      objectMetadataSingularName: 'creator',
      data: {
        name: `${name} ${marker}`,
        email: `${name.toLowerCase()}-${marker}@example.com`,
        creatorStatus: 'NEW',
      },
      gqlFields: 'id',
    }),
  );

  expect(response.body.errors).toBeUndefined();

  return response.body.data.createCreator.id as string;
};

describe('MYAH-315 generic write approval binding', () => {
  beforeAll(async () => {
    aliceId = await createCreator('Alice');
    timId = await createCreator('Tim');

    const rolesResponse = await makeMetadataAPIRequest({
      query: gql`
        query {
          getRoles {
            id
            workspaceMembers {
              id
            }
          }
        }
      `,
    });

    originalJonyRoleId = rolesResponse.body.data.getRoles.find(
      (role: { workspaceMembers: { id: string }[] }) =>
        role.workspaceMembers.some(
          ({ id }) => id === WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
        ),
    ).id;

    const roleResponse = await makeMetadataAPIRequest({
      query: gql`
        mutation CreateOneRole($label: String!) {
          createOneRole(
            createRoleInput: {
              label: $label
              description: "Disposable MYAH-315 integration role"
              canUpdateAllSettings: true
              canAccessAllTools: true
              canReadAllObjectRecords: true
              canUpdateAllObjectRecords: true
              canSoftDeleteAllObjectRecords: true
              canDestroyAllObjectRecords: false
            }
          ) {
            id
          }
        }
      `,
      variables: { label: `MYAH-315 disposable ${marker}` },
    });

    expect(roleResponse.body.errors).toBeUndefined();
    disposableRoleId = roleResponse.body.data.createOneRole.id;

    const objectsResponse = await makeMetadataAPIRequest({
      query: gql`
        query {
          objects(paging: { first: 1000 }) {
            edges {
              node {
                id
                nameSingular
              }
            }
          }
        }
      `,
    });

    creatorObjectMetadataId = objectsResponse.body.data.objects.edges.find(
      ({ node }: { node: { nameSingular: string } }) =>
        node.nameSingular === 'creator',
    ).node.id;

    await updateWorkspaceMemberRole({
      client,
      roleId: disposableRoleId,
      workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    });
    await global.testDataSource.query(
      `INSERT INTO core."agentChatThread" (id, "workspaceId", "userWorkspaceId", title)
       VALUES ($1, $2, $3, 'MYAH-315 approval binding')`,
      [
        chatThreadId,
        SEED_APPLE_WORKSPACE_ID,
        USER_WORKSPACE_DATA_SEED_IDS.JONY,
      ],
    );
  });

  afterAll(async () => {
    await updateWorkspaceMemberRole({
      client,
      roleId: originalJonyRoleId,
      workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    });
    if (disposableRoleId) {
      await makeMetadataAPIRequest({
        query: gql`
          mutation DeleteOneRole($roleId: UUID!) {
            deleteOneRole(roleId: $roleId)
          }
        `,
        variables: { roleId: disposableRoleId },
      });
    }
    await global.testDataSource.query(
      'DELETE FROM core."agentChatThread" WHERE id = $1',
      [chatThreadId],
    );
    await makeGraphqlAPIRequest(
      destroyManyOperationFactory({
        objectMetadataSingularName: 'creator',
        objectMetadataPluralName: 'creators',
        gqlFields: 'id',
        filter: { id: { in: [aliceId, timId].filter(Boolean) } },
      }),
    );
  });

  beforeEach(async () => {
    await setStatus(aliceId, 'NEW');
    await setStatus(timId, 'NEW');
  });

  it('(a) runs Alice -> Qualified exactly once and changes nothing else', async () => {
    const approval = await approve({ id: aliceId, creatorStatus: 'QUALIFIED' });
    // Snapshot of the approved message as a queued resume payload carries it.
    const approvedSnapshot = await approval.loadMessage();

    // Reordered keys are the same exact action.
    const output = await runApprovedResume(approval, {
      creatorStatus: 'QUALIFIED',
      id: aliceId,
    });

    expect(output.success).toBe(true);
    expect(await readStatus(aliceId)).toBe('QUALIFIED');
    expect(await readStatus(timId)).toBe('NEW');
    expect(await readApprovalResult(approval.messageId)).toMatchObject({
      status: 'consumed',
      executionOutcome: 'succeeded',
      reviewedAction: {
        toolName: 'update_one_creator',
        target: {
          records: [
            {
              recordId: aliceId,
              changes: [
                {
                  field: 'creatorStatus',
                  current: 'NEW',
                  proposed: 'QUALIFIED',
                },
              ],
            },
          ],
        },
      },
    });

    // (d) Replay: Alice is reset to the reviewed value, so only durable
    // consumption can stop a second write from the same approval.
    await setStatus(aliceId, 'NEW');

    // Re-streaming from stored state: the approval reads consumed, so the
    // write tool is not even unlocked.
    const storedReplay = await runApprovedResume(approval, {
      id: aliceId,
      creatorStatus: 'QUALIFIED',
    });

    expect(storedReplay).toMatchObject({
      success: false,
      error: expect.stringContaining('is not available'),
    });

    // Re-running a stale payload that still says "approved": the durable
    // conditional consume refuses it.
    const staleReplay = await runApprovedResume(
      approval,
      { id: aliceId, creatorStatus: 'QUALIFIED' },
      approvedSnapshot,
    );

    expect(staleReplay).toMatchObject({
      success: false,
      error: expect.stringContaining('APPROVAL_ALREADY_USED'),
    });
    expect(await readStatus(aliceId)).toBe('NEW');
    expect(await readApprovalResult(approval.messageId)).toMatchObject({
      status: 'consumed',
    });
  });

  it('executes an unchanged multi-field write after the stored jsonb reorders argument keys', async () => {
    const bio = `MYAH-315 multi-field ${marker}`;

    try {
      const approval = await approve({
        id: aliceId,
        creatorStatus: 'QUALIFIED',
        instagramBio: bio,
      });
      const output = await runApprovedResume(approval, {
        id: aliceId,
        instagramBio: bio,
        creatorStatus: 'QUALIFIED',
      });

      expect(output.success).toBe(true);
      expect(await readStatus(aliceId)).toBe('QUALIFIED');
      expect(await readStatus(timId)).toBe('NEW');
      const readback = await makeGraphqlAPIRequest(
        findOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id instagramBio',
          filter: { id: { eq: aliceId } },
        }),
      );

      expect(readback.body.errors).toBeUndefined();
      expect(readback.body.data.creator.instagramBio).toBe(bio);
      expect(await readApprovalResult(approval.messageId)).toMatchObject({
        status: 'consumed',
        executionOutcome: 'succeeded',
      });
    } finally {
      const restore = await makeGraphqlAPIRequest(
        updateOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id',
          recordId: aliceId,
          data: { instagramBio: null },
        }),
      );

      expect(restore.body.errors).toBeUndefined();
    }
  });

  it('runs only the two reviewed records in an update_many filter', async () => {
    const args = {
      filter: { id: { in: [aliceId, timId] } },
      data: { creatorStatus: 'QUALIFIED' },
    };
    const approval = await approve(args, 'approved', 'update_many_creators');
    const output = await runApprovedResume(
      approval,
      args,
      undefined,
      'update_many_creators',
    );

    expect(output.success).toBe(true);
    expect(await readStatus(aliceId)).toBe('QUALIFIED');
    expect(await readStatus(timId)).toBe('QUALIFIED');
    expect(await readApprovalResult(approval.messageId)).toMatchObject({
      status: 'consumed',
      executionOutcome: 'succeeded',
      reviewedAction: { target: { totalCount: 2 } },
    });
  });

  it('refuses unreviewable rich-text replacements using the real Note schema', async () => {
    const created = await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'note',
        gqlFields: 'id',
        data: {
          title: `MYAH-315 rich-text ${marker}`,
          bodyV2: { markdown: 'Original content' },
        },
      }),
    );

    expect(created.body.errors).toBeUndefined();
    const noteId = created.body.data.createNote.id as string;
    const readNote = async () => {
      const response = await makeGraphqlAPIRequest(
        findOneOperationFactory({
          objectMetadataSingularName: 'note',
          gqlFields: 'id bodyV2 { markdown blocknote }',
          filter: { id: { eq: noteId } },
        }),
      );

      expect(response.body.errors).toBeUndefined();

      return response.body.data.note.bodyV2 as {
        markdown: string | null;
        blocknote: string | null;
      };
    };

    try {
      const before = await readNote();

      expect(before.markdown).toBe('Original content');
      expect(before.blocknote).toEqual(expect.any(String));

      for (const { toolName, proposedArguments } of [
        {
          toolName: 'update_one_note',
          proposedArguments: { id: noteId, bodyV2: {} },
        },
        {
          toolName: 'update_one_note',
          proposedArguments: {
            id: noteId,
            bodyV2: { unknownSubfield: 'ignored by the write' },
          },
        },
        {
          toolName: 'update_many_notes',
          proposedArguments: {
            filter: { id: { eq: noteId } },
            data: { bodyV2: {} },
          },
        },
        {
          toolName: 'update_many_notes',
          proposedArguments: {
            filter: { id: { eq: noteId } },
            data: { bodyV2: { markdown: 'Replacement' } },
          },
        },
        {
          toolName: 'upsert_many_notes',
          proposedArguments: { records: [{ id: noteId, bodyV2: {} }] },
        },
      ]) {
        const proposal = await proposeGenericApproval({
          ...chatAsJony,
          toolName,
          proposedArguments,
        });

        expect(proposal).toMatchObject({
          proposed: false,
          error: expect.stringContaining('rich-text'),
        });
      }

      expect(await readNote()).toEqual(before);

      const explicit = await proposeGenericApproval({
        ...chatAsJony,
        toolName: 'update_one_note',
        proposedArguments: { id: noteId, bodyV2: { markdown: 'Replacement' } },
      });

      expect(explicit.proposed).toBe(true);
      if (explicit.proposed) await explicit.decide('rejected');
      expect(await readNote()).toEqual(before);
    } finally {
      const cleanup = await makeGraphqlAPIRequest(
        destroyManyOperationFactory({
          objectMetadataSingularName: 'note',
          objectMetadataPluralName: 'notes',
          gqlFields: 'id',
          filter: { id: { in: [noteId] } },
        }),
      );

      expect(cleanup.body.errors).toBeUndefined();
    }
  });

  it('refuses delete_many when another record joins the reviewed filter', async () => {
    await setStatus(timId, 'REVIEWING');
    // Keep the destructive regression scoped to this suite's disposable rows.
    const args = {
      filter: {
        id: { in: [aliceId, timId] },
        creatorStatus: { eq: 'NEW' },
      },
    };
    const approval = await approve(args, 'approved', 'delete_many_creators');

    await setStatus(timId, 'NEW');
    const output = await runApprovedResume(
      approval,
      args,
      undefined,
      'delete_many_creators',
    );

    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('TARGET_CHANGED'),
    });
    expect(await readStatus(aliceId)).toBe('NEW');
    expect(await readStatus(timId)).toBe('NEW');
  });

  it("(b) refuses Tim -> Qualified under Alice's approval and burns it", async () => {
    const approval = await approve({ id: aliceId, creatorStatus: 'QUALIFIED' });

    const output = await runApprovedResume(approval, {
      id: timId,
      creatorStatus: 'QUALIFIED',
    });

    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('ACTION_CHANGED'),
    });
    expect(await readStatus(aliceId)).toBe('NEW');
    expect(await readStatus(timId)).toBe('NEW');
    expect(await readApprovalResult(approval.messageId)).toMatchObject({
      status: 'invalidated',
      invalidReason: 'ACTION_CHANGED',
    });

    // The burnt approval cannot fall back to the original action either.
    const fallback = await runApprovedResume(approval, {
      id: aliceId,
      creatorStatus: 'QUALIFIED',
    });

    expect(fallback.success).toBe(false);
    expect(await readStatus(aliceId)).toBe('NEW');
  });

  it('(c) refuses a different value for Alice under her approval', async () => {
    // REJECTED is not a Creator status here; ARCHIVED is a valid value, so the
    // refusal can only come from the approval binding.
    const approval = await approve({ id: aliceId, creatorStatus: 'QUALIFIED' });

    const output = await runApprovedResume(approval, {
      id: aliceId,
      creatorStatus: 'ARCHIVED',
    });

    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('ACTION_CHANGED'),
    });
    expect(await readStatus(aliceId)).toBe('NEW');
  });

  it('refuses an added side effect under the same approval', async () => {
    const approval = await approve({ id: aliceId, creatorStatus: 'QUALIFIED' });

    const output = await runApprovedResume(approval, {
      id: aliceId,
      creatorStatus: 'QUALIFIED',
      location: 'Somewhere else',
    });

    expect(output.success).toBe(false);
    expect(await readStatus(aliceId)).toBe('NEW');
  });

  it('(e) refuses when Alice changed after the founder reviewed her', async () => {
    const approval = await approve({ id: aliceId, creatorStatus: 'QUALIFIED' });

    await setStatus(aliceId, 'REVIEWING');
    const output = await runApprovedResume(approval, {
      id: aliceId,
      creatorStatus: 'QUALIFIED',
    });

    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('TARGET_CHANGED'),
    });
    expect(await readStatus(aliceId)).toBe('REVIEWING');
    expect(await readApprovalResult(approval.messageId)).toMatchObject({
      status: 'invalidated',
      invalidReason: 'TARGET_CHANGED',
    });
  });

  it('(f) refuses when creator write permission is removed after approval', async () => {
    const approval = await approve({ id: aliceId, creatorStatus: 'QUALIFIED' });

    const revoke = await makeMetadataAPIRequest(
      createUpsertObjectPermissionsOperation(disposableRoleId, [
        {
          objectMetadataId: creatorObjectMetadataId,
          canReadObjectRecords: true,
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        },
      ]),
    );

    expect(revoke.body.errors).toBeUndefined();

    try {
      const output = await runApprovedResume(approval, {
        id: aliceId,
        creatorStatus: 'QUALIFIED',
      });

      expect(output.success).toBe(false);
      expect(await readStatus(aliceId)).toBe('NEW');
      expect(await readApprovalResult(approval.messageId)).toMatchObject({
        status: 'invalidated',
        invalidReason: 'NOT_AUTHORIZED_OR_UNAVAILABLE',
      });
    } finally {
      const restore = await makeMetadataAPIRequest(
        createUpsertObjectPermissionsOperation(disposableRoleId, [
          {
            objectMetadataId: creatorObjectMetadataId,
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: true,
            canDestroyObjectRecords: false,
          },
        ]),
      );

      expect(restore.body.errors).toBeUndefined();
    }
  });

  it.each(['rejected', 'changes_requested'] as const)(
    '(g) makes no write available after %s',
    async (decision) => {
      const approval = await approve(
        { id: aliceId, creatorStatus: 'QUALIFIED' },
        decision,
      );

      const output = await runApprovedResume(approval, {
        id: aliceId,
        creatorStatus: 'QUALIFIED',
      });

      expect(output.success).toBe(false);
      expect(await readStatus(aliceId)).toBe('NEW');
    },
  );

  it('(h) reveals the update schema before approval without making it runnable', async () => {
    const { chunks } = await runScriptedChatTurn({
      ...chatAsJony,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: 'Qualify Alice.' }],
        },
      ],
      calls: [
        {
          toolName: 'learn_tools',
          input: { toolNames: ['update_one_creator'], aspects: ['schema'] },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'update_one_creator',
            arguments: { id: aliceId, creatorStatus: 'QUALIFIED' },
          },
        },
      ],
    });
    const outputOf = (toolName: string) =>
      chunks.find(
        (chunk) => chunk.type === 'tool-result' && chunk.toolName === toolName,
      )?.output as Record<string, unknown>;

    expect(outputOf('learn_tools')).toMatchObject({
      tools: [
        {
          name: 'update_one_creator',
          requiresApproval: true,
          inputSchema: expect.any(Object),
        },
      ],
    });
    expect(outputOf('execute_tool')).toMatchObject({ success: false });
    expect(await readStatus(aliceId)).toBe('NEW');
  });

  it.each(['code_interpreter', 'http_request', 'send_myah_inbox_reply'])(
    '(i) creates no approval for %s through generic approval',
    async (toolName) => {
      const proposal = await proposeGenericApproval({
        ...chatAsJony,
        toolName,
        proposedArguments: { code: 'print(1)' },
      });

      expect(proposal.proposed).toBe(false);
    },
  );
});

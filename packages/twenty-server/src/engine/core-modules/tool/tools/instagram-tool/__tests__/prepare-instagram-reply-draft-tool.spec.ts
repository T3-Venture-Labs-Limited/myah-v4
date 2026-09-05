import { PrepareInstagramReplyDraftTool } from 'src/engine/core-modules/tool/tools/instagram-tool/prepare-instagram-reply-draft-tool';

const draftId = '00000000-0000-4000-8000-000000000001';
const conversationRecordId = '00000000-0000-4000-8000-000000000002';

const input = {
  draftId,
  expectedRevision: 0,
  conversationRecordId,
  body: 'Thanks for reaching out.',
};
const context = {
  workspaceId: 'workspace-id',
  userWorkspaceId: 'user-workspace-id',
  workspaceMemberId: 'workspace-member-id',
  rolePermissionConfig: { shouldBypassPermissionChecks: true as const },
  threadId: 'thread-id',
};

describe('PrepareInstagramReplyDraftTool', () => {
  it('saves only a local revision-protected Unipile reply draft', async () => {
    const draftService = {
      saveDraft: jest.fn().mockResolvedValue({
        status: 'SAVED',
        draftId,
        revision: 1,
        body: input.body,
      }),
    };
    const recordAccessService = {
      assertCanSaveDraft: jest.fn().mockResolvedValue(undefined),
    };
    const tool = new PrepareInstagramReplyDraftTool(
      draftService as never,
      recordAccessService as never,
    );

    await expect(tool.execute(input, context)).resolves.toMatchObject({
      success: true,
      message: 'Instagram reply draft prepared for approval.',
      result: { status: 'SAVED', draftId, revision: 1 },
    });
    expect(draftService.saveDraft).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      workspaceMemberId: context.workspaceMemberId,
      draftId,
      expectedRevision: 0,
      kind: 'REPLY',
      body: input.body,
      creatorRecordId: null,
      conversationRecordId,
    });
    expect(Object.keys(draftService)).toEqual(['saveDraft']);
  });

  it('rejects legacy provider-controlled inputs and missing authenticated thread context', async () => {
    const draftService = { saveDraft: jest.fn() };
    const tool = new PrepareInstagramReplyDraftTool(
      draftService as never,
      { assertCanSaveDraft: jest.fn() } as never,
    );

    await expect(
      tool.execute(
        {
          ...input,
          connectedAccountId: 'caller-controlled-account',
        } as never,
        context,
      ),
    ).resolves.toMatchObject({ success: false });
    await expect(
      tool.execute(input, { workspaceId: context.workspaceId }),
    ).resolves.toMatchObject({ success: false });
    expect(draftService.saveDraft).not.toHaveBeenCalled();
  });

  it('returns a revision conflict without claiming the draft is prepared', async () => {
    const draftService = {
      saveDraft: jest.fn().mockResolvedValue({
        status: 'CONFLICT',
        draftId,
        revision: 3,
        body: 'Newer copy',
      }),
    };
    const tool = new PrepareInstagramReplyDraftTool(
      draftService as never,
      {
        assertCanSaveDraft: jest.fn().mockResolvedValue(undefined),
        assertCanReadDraft: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(tool.execute(input, context)).resolves.toMatchObject({
      success: false,
      result: { status: 'CONFLICT', revision: 3 },
    });
  });
});

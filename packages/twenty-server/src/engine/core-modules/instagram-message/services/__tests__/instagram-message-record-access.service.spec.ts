import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const creatorId = '00000000-0000-4000-8000-000000000003';
const conversationId = '00000000-0000-4000-8000-000000000004';
const accountId = '00000000-0000-4000-8000-000000000005';
const rolePermissionConfig = { unionOf: ['role-id'] };

const buildHarness = (input?: {
  kind?: 'FIRST_MESSAGE' | 'REPLY';
  creatorReadable?: boolean;
  conversationReadable?: boolean;
  accountReadable?: boolean;
}) => {
  const kind = input?.kind ?? 'REPLY';
  const repositories = {
    myahInstagramReplyDraft: {
      findOne: jest.fn().mockResolvedValue({
        id: draftId,
        revision: 2,
        kind,
        creatorId: kind === 'FIRST_MESSAGE' ? creatorId : null,
        conversationId: kind === 'REPLY' ? conversationId : null,
      }),
    },
    creator: {
      findOne: jest
        .fn()
        .mockResolvedValue(
          input?.creatorReadable === false ? null : { id: creatorId },
        ),
    },
    myahSocialConversation: {
      findOne: jest
        .fn()
        .mockResolvedValue(
          input?.conversationReadable === false ? null : { id: conversationId },
        ),
    },
    myahInstagramAccount: {
      findOne: jest
        .fn()
        .mockResolvedValue(
          input?.accountReadable === false ? null : { id: accountId },
        ),
    },
  };
  const globalWorkspaceOrmManager = {
    getRepository: jest.fn(
      async (_workspaceId, objectName) =>
        repositories[objectName as keyof typeof repositories],
    ),
  };

  return {
    globalWorkspaceOrmManager,
    repositories,
    service: new InstagramMessageRecordAccessService(
      globalWorkspaceOrmManager as never,
    ),
  };
};

describe('InstagramMessageRecordAccessService execution checks', () => {
  it('requires current access to the exact reply draft, conversation, and active account', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).resolves.toMatchObject({
      draft: { id: draftId, kind: 'REPLY', conversationId },
      instagramAccountRecordId: accountId,
    });
    expect(
      harness.repositories.myahSocialConversation.findOne,
    ).toHaveBeenCalled();
    expect(
      harness.repositories.myahInstagramAccount.findOne,
    ).toHaveBeenCalled();
  });

  it('denies a reply when current conversation access was revoked', async () => {
    const harness = buildHarness({ conversationReadable: false });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Active Unipile conversation is unavailable');
    expect(
      harness.repositories.myahInstagramAccount.findOne,
    ).not.toHaveBeenCalled();
  });

  it('denies execution when current account-record access was revoked', async () => {
    const harness = buildHarness({ accountReadable: false });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Instagram account is unavailable');
  });

  it('requires current Creator access for a first message', async () => {
    const harness = buildHarness({
      kind: 'FIRST_MESSAGE',
      creatorReadable: false,
    });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Creator is unavailable');
  });
});

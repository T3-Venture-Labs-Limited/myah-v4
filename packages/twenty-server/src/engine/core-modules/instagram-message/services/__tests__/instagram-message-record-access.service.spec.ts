import { FieldMetadataType } from 'twenty-shared/types';

import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { IsNull, Not } from 'typeorm';

import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const creatorId = '00000000-0000-4000-8000-000000000003';
const conversationId = '00000000-0000-4000-8000-000000000004';
const accountId = '00000000-0000-4000-8000-000000000005';
const unreadableAccountId = '00000000-0000-4000-8000-000000000006';
const bindingId = '00000000-0000-4000-8000-000000000007';
const rolePermissionConfig = { unionOf: ['role-id'] };

const buildHarness = (input?: {
  kind?: 'FIRST_MESSAGE' | 'REPLY';
  creatorReadable?: boolean;
  conversationReadable?: boolean;
  accountReadable?: boolean;
  bindingReadable?: boolean;
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
          input?.conversationReadable === false
            ? null
            : { id: conversationId, instagramAccountId: accountId },
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
  const accountBindingRepository = {
    find: jest.fn().mockResolvedValue(
      input?.bindingReadable === false
        ? []
        : [
            {
              id: bindingId,
              workspaceInstagramAccountRecordId: accountId,
            },
          ],
    ),
  };
  const globalWorkspaceOrmManager = {
    getRepository: jest.fn(
      async (_workspaceId, objectName) =>
        repositories[objectName as keyof typeof repositories],
    ),
  };

  return {
    accountBindingRepository,
    globalWorkspaceOrmManager,
    repositories,
    service: new InstagramMessageRecordAccessService(
      globalWorkspaceOrmManager as never,
      accountBindingRepository as never,
    ),
  };
};

const expectExactActiveAccountLookup = (
  accountRepository: { findOne: jest.Mock },
  expectedAccountId: string,
) => {
  expect(accountRepository.findOne).toHaveBeenCalledWith({
    where: {
      id: expectedAccountId,
      deletedAt: IsNull(),
      status: 'ACTIVE',
      unipileAccountId: Not(IsNull()),
    },
    select: { id: true },
  });
};

describe('InstagramMessageRecordAccessService execution checks', () => {
  it('uses the reply conversation account rather than another readable active account', async () => {
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
    ).toHaveBeenCalledWith({
      where: {
        id: conversationId,
        deletedAt: IsNull(),
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
      },
      select: { id: true, instagramAccountId: true },
    });
    expectExactActiveAccountLookup(
      harness.repositories.myahInstagramAccount,
      accountId,
    );
    expect(harness.accountBindingRepository.find).not.toHaveBeenCalled();
  });

  it('fails closed when the active reply conversation has no account binding', async () => {
    const harness = buildHarness();
    harness.repositories.myahSocialConversation.findOne.mockResolvedValue({
      id: conversationId,
      instagramAccountId: null,
    });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Instagram account is unavailable');
    expect(
      harness.repositories.myahInstagramAccount.findOne,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when the exact reply account is unreadable, even if another account is active', async () => {
    const harness = buildHarness({ accountReadable: false });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Instagram account is unavailable');
    expectExactActiveAccountLookup(
      harness.repositories.myahInstagramAccount,
      accountId,
    );
  });

  it('uses the unique active binding account for a first message rather than another readable active account', async () => {
    const harness = buildHarness({ kind: 'FIRST_MESSAGE' });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).resolves.toMatchObject({
      draft: { id: draftId, kind: 'FIRST_MESSAGE', creatorId },
      instagramAccountRecordId: accountId,
    });
    expect(harness.accountBindingRepository.find).toHaveBeenCalledWith(
      workspaceId,
      {
        take: 2,
        where: {
          status: 'ACTIVE',
          deactivatedAt: IsNull(),
        },
      },
    );
    expectExactActiveAccountLookup(
      harness.repositories.myahInstagramAccount,
      accountId,
    );
  });

  it('fails closed when no unique active binding is available for a first message', async () => {
    const harness = buildHarness({
      kind: 'FIRST_MESSAGE',
      bindingReadable: false,
    });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Instagram account is unavailable');
    expect(
      harness.repositories.myahInstagramAccount.findOne,
    ).not.toHaveBeenCalled();
  });

  it('denies a reply when current conversation access was revoked before any account lookup', async () => {
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

  it('requires current Creator access for a first message before binding or account lookup', async () => {
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
    expect(harness.accountBindingRepository.find).not.toHaveBeenCalled();
    expect(
      harness.repositories.myahInstagramAccount.findOne,
    ).not.toHaveBeenCalled();
  });

  it('does not substitute a different account ID for an unreadable canonical account', async () => {
    const harness = buildHarness({ accountReadable: false });
    harness.repositories.myahSocialConversation.findOne.mockResolvedValue({
      id: conversationId,
      instagramAccountId: unreadableAccountId,
    });

    await expect(
      harness.service.assertCanExecuteDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Instagram account is unavailable');
    expectExactActiveAccountLookup(
      harness.repositories.myahInstagramAccount,
      unreadableAccountId,
    );
  });
});

// Model the repository's selected-column permission check with Twenty's real validator.
// Persistence and role resolution remain test doubles; this does not exercise SQL/RLS.
const validateDraftSelection = (
  select: Record<string, boolean>,
  deniedField?: string,
  canReadObjectRecords = true,
) => {
  const fields = [
    { id: 'id-field', name: 'id', type: FieldMetadataType.UUID },
    { id: 'body-field', name: 'body', type: FieldMetadataType.TEXT },
    { id: 'revision-field', name: 'revision', type: FieldMetadataType.NUMBER },
    { id: 'title-field', name: 'title', type: FieldMetadataType.TEXT },
  ];

  validateOperationIsPermittedOrThrow({
    entityName: 'myahInstagramReplyDraft',
    operationType: 'select',
    objectsPermissions: {
      'draft-object': {
        canReadObjectRecords,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        restrictedFields: deniedField
          ? { [`${deniedField}-field`]: { canRead: false } }
          : {},
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      },
    },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        'draft-object': {
          id: 'draft-object',
          universalIdentifier: 'draft-object',
          nameSingular: 'myahInstagramReplyDraft',
          isSystem: false,
          fieldIds: fields.map(({ id }) => id),
        } as FlatObjectMetadata,
      },
      universalIdentifierById: { 'draft-object': 'draft-object' },
      universalIdentifiersByApplicationId: {},
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(
        fields.map((field) => [field.id, field as FlatFieldMetadata]),
      ),
      universalIdentifierById: Object.fromEntries(
        fields.map(({ id }) => [id, id]),
      ),
      universalIdentifiersByApplicationId: {},
    },
    objectIdByNameSingular: { myahInstagramReplyDraft: 'draft-object' },
    selectedColumns: Object.keys(select).filter((column) => select[column]),
    allFieldsSelected: false,
    updatedColumns: [],
  });
};

describe('InstagramMessageRecordAccessService returned draft field checks', () => {
  it.each(['body', 'revision'])(
    'denies a readable draft ID when %s is restricted',
    async (deniedField) => {
      const harness = buildHarness();
      harness.repositories.myahInstagramReplyDraft.findOne.mockImplementation(
        async ({ select }) => {
          validateDraftSelection(select, deniedField);

          return { id: draftId };
        },
      );

      expect(() =>
        validateDraftSelection({ id: true }, deniedField),
      ).not.toThrow();
      await expect(
        harness.service.assertCanReadDraft({
          workspaceId,
          draftId,
          rolePermissionConfig,
        }),
      ).rejects.toThrow(`no permission to read field "${deniedField}"`);
    },
  );

  it('authorizes exactly the returned fields under the current workspace role, not unrelated fields', async () => {
    const harness = buildHarness();
    harness.repositories.myahInstagramReplyDraft.findOne.mockImplementation(
      async ({ select }) => {
        validateDraftSelection(select, 'title');

        return { id: draftId, revision: 2, body: 'Authorized draft' };
      },
    );

    await expect(
      harness.service.assertCanReadDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).resolves.toBeUndefined();
    expect(
      harness.globalWorkspaceOrmManager.getRepository,
    ).toHaveBeenCalledWith(
      workspaceId,
      'myahInstagramReplyDraft',
      rolePermissionConfig,
    );
    expect(
      harness.repositories.myahInstagramReplyDraft.findOne,
    ).toHaveBeenCalledWith({
      where: { id: draftId, deletedAt: IsNull() },
      select: { id: true, revision: true, body: true },
    });
  });

  it('preserves object-read denial', async () => {
    const harness = buildHarness();
    harness.repositories.myahInstagramReplyDraft.findOne.mockImplementation(
      async ({ select }) => {
        validateDraftSelection(select, undefined, false);

        return { id: draftId };
      },
    );

    await expect(
      harness.service.assertCanReadDraft({
        workspaceId,
        draftId,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('Entity performing the request does not have permission');
  });

  it.each(['absent', 'soft-deleted', 'record-hidden'])(
    'fails closed when the role repository excludes an %s draft',
    async () => {
      const harness = buildHarness();
      harness.repositories.myahInstagramReplyDraft.findOne.mockResolvedValue(
        null,
      );

      await expect(
        harness.service.assertCanReadDraft({
          workspaceId,
          draftId,
          rolePermissionConfig,
        }),
      ).rejects.toThrow('Instagram message draft is unavailable');
      expect(
        harness.repositories.myahInstagramReplyDraft.findOne,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: draftId, deletedAt: IsNull() },
        }),
      );
    },
  );
});

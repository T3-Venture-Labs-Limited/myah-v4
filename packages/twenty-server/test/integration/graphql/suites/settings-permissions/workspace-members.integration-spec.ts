import gql from 'graphql-tag';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { makeGraphqlAPIRequestWithMemberRole } from 'test/integration/graphql/utils/make-graphql-api-request-with-member-role.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';
import { makeMetadataAPIRequestWithMemberRole } from 'test/integration/metadata/suites/utils/make-metadata-api-request-with-member-role.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { PermissionsExceptionMessage } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

const WORKSPACE_MEMBER_GQL_FIELDS = `
    id
    name {
      firstName
    }
`;

describe('workspace members permissions', () => {
  it('should deny /graphql updateOne on own record for standard field name.firstName when member lacks WORKSPACE_MEMBERS', async () => {
    const graphqlOperation = updateOneOperationFactory({
      objectMetadataSingularName: 'workspaceMember',
      gqlFields: WORKSPACE_MEMBER_GQL_FIELDS,
      recordId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
      data: {
        name: {
          firstName: 'Jony',
        },
      },
    });

    const response =
      await makeGraphqlAPIRequestWithMemberRole(graphqlOperation);

    expect(response.body.data).toStrictEqual({ updateWorkspaceMember: null });
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      PermissionsExceptionMessage.PERMISSION_DENIED,
    );
    expect(response.body.errors[0].extensions.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should throw when member updates a standard field for another workspace member', async () => {
    const graphqlOperation = updateOneOperationFactory({
      objectMetadataSingularName: 'workspaceMember',
      gqlFields: WORKSPACE_MEMBER_GQL_FIELDS,
      recordId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
      data: {
        timeZone: 'Europe/Paris',
      },
    });

    const response =
      await makeGraphqlAPIRequestWithMemberRole(graphqlOperation);

    expect(response.body.data).toStrictEqual({ updateWorkspaceMember: null });
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      PermissionsExceptionMessage.PERMISSION_DENIED,
    );
    expect(response.body.errors[0].extensions.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should throw when payload only contains updatedBy-managed changes', async () => {
    const graphqlOperation = updateOneOperationFactory({
      objectMetadataSingularName: 'workspaceMember',
      gqlFields: WORKSPACE_MEMBER_GQL_FIELDS,
      recordId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
      data: {},
    });

    const response =
      await makeGraphqlAPIRequestWithMemberRole(graphqlOperation);

    expect(response.body.data).toStrictEqual({ updateWorkspaceMember: null });
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      PermissionsExceptionMessage.PERMISSION_DENIED,
    );
    expect(response.body.errors[0].extensions.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should allow self update through dedicated metadata mutation', async () => {
    const operation = {
      query: gql`
        mutation UpdateWorkspaceMemberSettings(
          $input: UpdateWorkspaceMemberSettingsInput!
        ) {
          updateWorkspaceMemberSettings(input: $input)
        }
      `,
      variables: {
        input: {
          workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
          update: {
            timeZone: 'Europe/Paris',
          },
        },
      },
    };

    const response = await makeMetadataAPIRequestWithMemberRole(operation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.updateWorkspaceMemberSettings).toBe(true);
  });

  it('should deny updating another workspace member through dedicated metadata mutation (member role - no workspace member settings permission)', async () => {
    const operation = {
      query: gql`
        mutation UpdateWorkspaceMemberSettings(
          $input: UpdateWorkspaceMemberSettingsInput!
        ) {
          updateWorkspaceMemberSettings(input: $input)
        }
      `,
      variables: {
        input: {
          workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
          update: {
            timeZone: 'Europe/Paris',
          },
        },
      },
    };

    const response = await makeMetadataAPIRequestWithMemberRole(operation);

    expect(response.body.data).toBeNull();
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      PermissionsExceptionMessage.PERMISSION_DENIED,
    );
    expect(response.body.errors[0].extensions.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should allow updating another workspace member through dedicated metadata mutation for admin (has workspace member settings permission)', async () => {
    const operation = {
      query: gql`
        mutation UpdateWorkspaceMemberSettings(
          $input: UpdateWorkspaceMemberSettingsInput!
        ) {
          updateWorkspaceMemberSettings(input: $input)
        }
      `,
      variables: {
        input: {
          workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
          update: {
            timeZone: 'Europe/London',
          },
        },
      },
    };

    const response = await makeMetadataAPIRequest(operation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.updateWorkspaceMemberSettings).toBe(true);
  });

  it('should reject empty update payload through dedicated metadata mutation', async () => {
    const operation = {
      query: gql`
        mutation UpdateWorkspaceMemberSettings(
          $input: UpdateWorkspaceMemberSettingsInput!
        ) {
          updateWorkspaceMemberSettings(input: $input)
        }
      `,
      variables: {
        input: {
          workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
          update: {},
        },
      },
    };

    const response = await makeMetadataAPIRequestWithMemberRole(operation);

    expect(response.body.data).toBeNull();
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      'Update payload cannot be empty',
    );
    expect(response.body.errors[0].extensions.code).toBe(
      ErrorCode.BAD_USER_INPUT,
    );
  });

  it('should reject unknown top-level keys through dedicated metadata mutation (allowlist)', async () => {
    const unknownKey = 'notAStandardWorkspaceMemberField';

    const operation = {
      query: gql`
        mutation UpdateWorkspaceMemberSettings(
          $input: UpdateWorkspaceMemberSettingsInput!
        ) {
          updateWorkspaceMemberSettings(input: $input)
        }
      `,
      variables: {
        input: {
          workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
          update: {
            [unknownKey]: 'value',
          },
        },
      },
    };

    const response = await makeMetadataAPIRequestWithMemberRole(operation);

    expect(response.body.data).toBeNull();
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      `Cannot update custom workspaceMember field via this endpoint: ${unknownKey}`,
    );
    expect(response.body.errors[0].extensions.code).toBe(
      ErrorCode.BAD_USER_INPUT,
    );
  });

  it('should throw when calling deleteOne ', async () => {
    const graphqlOperation = deleteOneOperationFactory({
      objectMetadataSingularName: 'workspaceMember',
      gqlFields: WORKSPACE_MEMBER_GQL_FIELDS,
      recordId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
    });

    const response =
      await makeGraphqlAPIRequestWithMemberRole(graphqlOperation);

    expect(response.body.data).toStrictEqual({ deleteWorkspaceMember: null });
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      'Please use /deleteUserFromWorkspace to remove a workspace member.',
    );
    expect(response.body.errors[0].extensions.code).toBe(
      ErrorCode.BAD_USER_INPUT,
    );
  });

  it('should throw when calling deleteMany', async () => {
    const graphqlOperation = deleteOneOperationFactory({
      objectMetadataSingularName: 'workspaceMember',
      gqlFields: WORKSPACE_MEMBER_GQL_FIELDS,
      recordId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
    });

    const response =
      await makeGraphqlAPIRequestWithMemberRole(graphqlOperation);

    expect(response.body.data).toStrictEqual({ deleteWorkspaceMember: null });
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toBe(
      'Please use /deleteUserFromWorkspace to remove a workspace member.',
    );
    expect(response.body.errors[0].extensions.code).toBe(
      ErrorCode.BAD_USER_INPUT,
    );
  });
});

import { randomUUID } from 'crypto';

import { MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

import { activateWorkspace } from 'test/integration/graphql/utils/activate-workspace.util';
import { deleteUser } from 'test/integration/graphql/utils/delete-user.util';
import { getAuthTokensFromLoginToken } from 'test/integration/graphql/utils/get-auth-tokens-from-login-token.util';
import { signUpInNewWorkspace } from 'test/integration/graphql/utils/sign-up-in-new-workspace.util';
import { signUp } from 'test/integration/graphql/utils/sign-up.util';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';
import { isDefined } from 'twenty-shared/utils';

type RoleRow = { id: string };
type ObjectMetadataRow = { nameSingular: string };

describe('Brand Brain standard metadata journey', () => {
  let createdUserAccessToken: string | undefined;

  afterAll(async () => {
    if (isDefined(createdUserAccessToken)) {
      await deleteUser({
        accessToken: createdUserAccessToken,
        expectToFail: false,
      });
    }
  });

  it('provisions Brand Brain objects and role when activating a workspace', async () => {
    const uniqueId = randomUUID();
    const email = `brand-brain-${uniqueId}@example.com`;

    const { data: signUpData } = await signUp({
      input: {
        email,
        password: 'Test123!@#',
      },
      expectToFail: false,
    });

    createdUserAccessToken =
      signUpData.signUp.tokens.accessOrWorkspaceAgnosticToken.token;

    await global.testDataSource.query(
      'UPDATE core."user" SET "isEmailVerified" = true WHERE email = $1',
      [email],
    );

    const { data: workspaceSignUpData } = await signUpInNewWorkspace({
      accessToken: createdUserAccessToken,
      displayName: `Brand Brain ${uniqueId}`,
      expectToFail: false,
    });
    const { workspace, loginToken } = workspaceSignUpData.signUpInNewWorkspace;

    const { data: authTokensData } = await getAuthTokensFromLoginToken({
      origin: workspace.workspaceUrls.subdomainUrl,
      loginToken: loginToken.token,
      expectToFail: false,
    });
    const workspaceAccessToken =
      authTokensData.getAuthTokensFromLoginToken.tokens
        .accessOrWorkspaceAgnosticToken.token;

    await activateWorkspace({
      accessToken: workspaceAccessToken,
      expectToFail: false,
    });

    const [brandBrainRole] = (await global.testDataSource.query(
      `SELECT id FROM core."role"
       WHERE "workspaceId" = $1 AND "universalIdentifier" = $2`,
      [workspace.id, MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER],
    )) as RoleRow[];

    jestExpectToBeDefined(brandBrainRole);

    const brandBrainObjects = (await global.testDataSource.query(
      `SELECT "nameSingular" FROM core."objectMetadata"
       WHERE "workspaceId" = $1
         AND "nameSingular" = ANY($2)`,
      [
        workspace.id,
        ['brandBrainPage', 'brandBrainLink', 'brandBrainUpdateProposal'],
      ],
    )) as ObjectMetadataRow[];

    expect(
      brandBrainObjects.map(({ nameSingular }) => nameSingular).sort(),
    ).toEqual(['brandBrainLink', 'brandBrainPage', 'brandBrainUpdateProposal']);
  });
});

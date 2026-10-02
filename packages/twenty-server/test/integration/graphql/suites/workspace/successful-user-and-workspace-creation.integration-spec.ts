import { randomUUID } from 'crypto';

import { activateWorkspace } from 'test/integration/graphql/utils/activate-workspace.util';
import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { deleteUser } from 'test/integration/graphql/utils/delete-user.util';
import { destroyOneOperationFactory } from 'test/integration/graphql/utils/destroy-one-operation-factory.util';
import { getAuthTokensFromLoginToken } from 'test/integration/graphql/utils/get-auth-tokens-from-login-token.util';
import { getCurrentUser } from 'test/integration/graphql/utils/get-current-user.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { signUpInNewWorkspace } from 'test/integration/graphql/utils/sign-up-in-new-workspace.util';
import { signUp } from 'test/integration/graphql/utils/sign-up.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';
import { createOneLogicFunction } from 'test/integration/metadata/suites/logic-function/utils/create-logic-function.util';
import { createOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/create-one-object-metadata.util';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';
import { isDefined } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

describe('Successful user and workspace creation', () => {
  let createdUserAccessToken: string | undefined;

  afterEach(async () => {
    if (!isDefined(createdUserAccessToken)) {
      return;
    }

    await deleteUser({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });
  });

  it('should sign up a new user and create a new workspace successfully', async () => {
    const uniqueEmail = `test-${randomUUID()}@example.com`;

    const { data } = await signUp({
      input: {
        email: uniqueEmail,
        password: 'Test123!@#',
      },

      expectToFail: false,
    });

    createdUserAccessToken =
      data.signUp.tokens.accessOrWorkspaceAgnosticToken.token;

    // Mark email as verified to bypass email verification requirement
    await testDataSource.query(
      'UPDATE core."user" SET "isEmailVerified" = true WHERE email = $1',
      [uniqueEmail],
    );

    const {
      data: { signUpInNewWorkspace: signUpInNewWorkspaceData },
    } = await signUpInNewWorkspace({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });

    const {
      data: { getAuthTokensFromLoginToken: authTokensData },
    } = await getAuthTokensFromLoginToken({
      origin: signUpInNewWorkspaceData.workspace.workspaceUrls.subdomainUrl,
      loginToken: signUpInNewWorkspaceData.loginToken.token,
      expectToFail: false,
    });

    const newWorkspaceAccessToken =
      authTokensData.tokens.accessOrWorkspaceAgnosticToken.token;

    const {
      data: { activateWorkspace: activateWorkspaceData },
    } = await activateWorkspace({
      accessToken: newWorkspaceAccessToken,
      expectToFail: false,
    });

    expect(activateWorkspaceData.activationStatus).toBe(
      WorkspaceActivationStatus.ACTIVE,
    );

    const {
      data: { currentUser },
    } = await getCurrentUser({
      accessToken: newWorkspaceAccessToken,
      expectToFail: false,
    });

    jestExpectToBeDefined(currentUser.currentWorkspace);
    const { inviteHash: _, ...expectedCurrentWorkspace } =
      activateWorkspaceData;

    jestExpectToBeDefined(currentUser.currentWorkspace);
    expect(currentUser.currentWorkspace).toMatchObject(
      expectedCurrentWorkspace,
    );

    const workspaceId = currentUser.currentWorkspace.id;
    const workspaceCustomApplicationId =
      currentUser.currentWorkspace.workspaceCustomApplicationId;
    const applications: Array<{
      id: string;
      workspaceId: string;
      universalIdentifier: string;
      name: string;
      description: string | null;
      version: string | null;
      sourcePath: string;
      sourceType: string;
    }> = await testDataSource.query(
      `SELECT id, "workspaceId", "universalIdentifier", name, description,
              version, "sourcePath", "sourceType"
       FROM core."application"
       WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
      [workspaceId],
    );

    expect(applications).toHaveLength(2);
    const twentyStandardApp = applications.find(
      (application) =>
        application.universalIdentifier ===
        TWENTY_STANDARD_APPLICATION.universalIdentifier,
    );

    jestExpectToBeDefined(twentyStandardApp);
    expect(twentyStandardApp).toMatchObject({
      ...TWENTY_STANDARD_APPLICATION,
      workspaceId,
    });

    const workspaceCustomApplication = applications.find(
      (application) => application.id === workspaceCustomApplicationId,
    );

    jestExpectToBeDefined(workspaceCustomApplication);
    expect(workspaceCustomApplication.id).not.toBe(twentyStandardApp.id);
    expect(workspaceCustomApplication.workspaceId).toBe(workspaceId);
    expect(workspaceCustomApplication.universalIdentifier).toBe(
      workspaceCustomApplication.id,
    );

    const [layoutCounts] = await testDataSource.query(
      `SELECT
        count(*) FILTER (WHERE type = $2) AS "recordPages",
        count(*) FILTER (WHERE type = $3) AS "dashboards"
       FROM core."pageLayout"
       WHERE "workspaceId" = $1`,
      [workspaceId, PageLayoutType.RECORD_PAGE, PageLayoutType.DASHBOARD],
    );

    expect(Number(layoutCounts.recordPages)).toBeGreaterThan(0);
    expect(Number(layoutCounts.dashboards)).toBe(0);

    const [dashboardComposition] = await testDataSource.query(
      `SELECT
        (SELECT count(*) FROM core."pageLayoutTab" tab
         JOIN core."pageLayout" layout ON layout.id = tab."pageLayoutId"
         WHERE tab."workspaceId" = $1 AND layout."workspaceId" = $1
           AND layout.type = $2) AS "tabs",
        (SELECT count(*) FROM core."pageLayoutWidget" widget
         JOIN core."pageLayoutTab" tab ON tab.id = widget."pageLayoutTabId"
         JOIN core."pageLayout" layout ON layout.id = tab."pageLayoutId"
         WHERE widget."workspaceId" = $1 AND tab."workspaceId" = $1
           AND layout."workspaceId" = $1 AND layout.type = $2) AS "widgets"`,
      [workspaceId, PageLayoutType.DASHBOARD],
    );

    expect(Number(dashboardComposition.tabs)).toBe(0);
    expect(Number(dashboardComposition.widgets)).toBe(0);

    // The historical dashboard table remains for compatibility, but new
    // workspaces must not receive dashboard records.
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);

    expect(workspaceSchemaName).toMatch(/^workspace_[a-z0-9]+$/);
    const dashboardCountQuery = `SELECT count(*) AS count FROM "${workspaceSchemaName}"."dashboard"`;
    const [dashboardRows] = await testDataSource.query(dashboardCountQuery);

    expect(Number(dashboardRows.count)).toBe(0);

    // The workspace GraphQL API names this mutation createDashboard (the
    // create-one operation), not createOneDashboard. Use a valid former input
    // so a schema/argument error cannot masquerade as the retirement guard.
    const dashboardId = randomUUID();
    const dashboardMutations = [
      createOneOperationFactory({
        objectMetadataSingularName: 'dashboard',
        gqlFields: 'id',
        data: { id: dashboardId, title: 'Retired dashboard', position: 0 },
      }),
      updateOneOperationFactory({
        objectMetadataSingularName: 'dashboard',
        gqlFields: 'id',
        recordId: dashboardId,
        data: { title: 'Edited retired dashboard' },
      }),
      destroyOneOperationFactory({
        objectMetadataSingularName: 'dashboard',
        gqlFields: 'id',
        recordId: dashboardId,
      }),
    ];

    for (const operation of dashboardMutations) {
      const response = await makeGraphqlAPIRequest(
        operation,
        newWorkspaceAccessToken,
      );

      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors?.[0].message).toBe(
        'Dashboard records are read-only after feature retirement',
      );
    }

    const [dashboardRowsAfterMutations] =
      await testDataSource.query(dashboardCountQuery);

    expect(Number(dashboardRowsAfterMutations.count)).toBe(0);
  });

  it('should reclaim a stale ONGOING_CREATION workspace and activate it', async () => {
    const uniqueEmail = `test-reclaim-${randomUUID()}@example.com`;

    const { data } = await signUp({
      input: {
        email: uniqueEmail,
        password: 'Test123!@#',
      },
      expectToFail: false,
    });

    createdUserAccessToken =
      data.signUp.tokens.accessOrWorkspaceAgnosticToken.token;

    await testDataSource.query(
      'UPDATE core."user" SET "isEmailVerified" = true WHERE email = $1',
      [uniqueEmail],
    );

    const {
      data: { signUpInNewWorkspace: signUpInNewWorkspaceData },
    } = await signUpInNewWorkspace({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });

    const workspaceId = signUpInNewWorkspaceData.workspace.id;

    const {
      data: { getAuthTokensFromLoginToken: authTokensData },
    } = await getAuthTokensFromLoginToken({
      origin: signUpInNewWorkspaceData.workspace.workspaceUrls.subdomainUrl,
      loginToken: signUpInNewWorkspaceData.loginToken.token,
      expectToFail: false,
    });

    const newWorkspaceAccessToken =
      authTokensData.tokens.accessOrWorkspaceAgnosticToken.token;

    // Simulate an activation attempt that was killed mid-flight: the workspace
    // is stuck in ONGOING_CREATION with a stale updatedAt. A retry should
    // reclaim the stale lock and finish activation.
    await testDataSource.query(
      `UPDATE core.workspace SET "activationStatus" = 'ONGOING_CREATION', "updatedAt" = now() - interval '10 minutes' WHERE id = $1`,
      [workspaceId],
    );

    const {
      data: { activateWorkspace: activateWorkspaceData },
    } = await activateWorkspace({
      accessToken: newWorkspaceAccessToken,
      expectToFail: false,
    });

    expect(activateWorkspaceData.activationStatus).toBe(
      WorkspaceActivationStatus.ACTIVE,
    );
  });

  it('should not reclaim a workspace whose activation is genuinely in progress', async () => {
    const uniqueEmail = `test-fresh-ongoing-${randomUUID()}@example.com`;

    const { data } = await signUp({
      input: {
        email: uniqueEmail,
        password: 'Test123!@#',
      },
      expectToFail: false,
    });

    createdUserAccessToken =
      data.signUp.tokens.accessOrWorkspaceAgnosticToken.token;

    await testDataSource.query(
      'UPDATE core."user" SET "isEmailVerified" = true WHERE email = $1',
      [uniqueEmail],
    );

    const {
      data: { signUpInNewWorkspace: signUpInNewWorkspaceData },
    } = await signUpInNewWorkspace({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });

    const workspaceId = signUpInNewWorkspaceData.workspace.id;

    const {
      data: { getAuthTokensFromLoginToken: authTokensData },
    } = await getAuthTokensFromLoginToken({
      origin: signUpInNewWorkspaceData.workspace.workspaceUrls.subdomainUrl,
      loginToken: signUpInNewWorkspaceData.loginToken.token,
      expectToFail: false,
    });

    const newWorkspaceAccessToken =
      authTokensData.tokens.accessOrWorkspaceAgnosticToken.token;

    // A fresh ONGOING_CREATION lock means another activation is genuinely in
    // progress, so a concurrent attempt must be rejected rather than reclaim it.
    await testDataSource.query(
      `UPDATE core.workspace SET "activationStatus" = 'ONGOING_CREATION', "updatedAt" = now() WHERE id = $1`,
      [workspaceId],
    );

    const { errors } = await activateWorkspace({
      accessToken: newWorkspaceAccessToken,
      expectToFail: true,
    });

    expect(errors).toBeDefined();

    // This workspace was never actually activated (no tenant schema/metadata),
    // so the standard deleteUser teardown cannot operate on it. Skip the
    // afterEach cleanup; the integration test database is reset per run.
    createdUserAccessToken = undefined;
  });

  it('should be idempotent when re-activating an already-active workspace', async () => {
    const uniqueEmail = `test-idempotent-${randomUUID()}@example.com`;

    const { data } = await signUp({
      input: {
        email: uniqueEmail,
        password: 'Test123!@#',
      },
      expectToFail: false,
    });

    createdUserAccessToken =
      data.signUp.tokens.accessOrWorkspaceAgnosticToken.token;

    await testDataSource.query(
      'UPDATE core."user" SET "isEmailVerified" = true WHERE email = $1',
      [uniqueEmail],
    );

    const {
      data: { signUpInNewWorkspace: signUpInNewWorkspaceData },
    } = await signUpInNewWorkspace({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });

    const {
      data: { getAuthTokensFromLoginToken: authTokensData },
    } = await getAuthTokensFromLoginToken({
      origin: signUpInNewWorkspaceData.workspace.workspaceUrls.subdomainUrl,
      loginToken: signUpInNewWorkspaceData.loginToken.token,
      expectToFail: false,
    });

    const newWorkspaceAccessToken =
      authTokensData.tokens.accessOrWorkspaceAgnosticToken.token;

    await activateWorkspace({
      accessToken: newWorkspaceAccessToken,
      expectToFail: false,
    });

    // A second activation (e.g. the client lost the first response and retried)
    // must succeed idempotently instead of throwing "already being created".
    const {
      data: { activateWorkspace: secondActivation },
    } = await activateWorkspace({
      accessToken: newWorkspaceAccessToken,
      expectToFail: false,
    });

    expect(secondActivation.activationStatus).toBe(
      WorkspaceActivationStatus.ACTIVE,
    );
  });

  it('should suspend and soft-delete workspace when last user is deleted', async () => {
    const uniqueEmail = `test-delete-${randomUUID()}@example.com`;

    const { data } = await signUp({
      input: {
        email: uniqueEmail,
        password: 'Test123!@#',
      },
      expectToFail: false,
    });

    createdUserAccessToken =
      data.signUp.tokens.accessOrWorkspaceAgnosticToken.token;

    // Mark email as verified to bypass email verification requirement
    await testDataSource.query(
      'UPDATE core."user" SET "isEmailVerified" = true WHERE email = $1',
      [uniqueEmail],
    );

    const {
      data: { signUpInNewWorkspace: signUpInNewWorkspaceData },
    } = await signUpInNewWorkspace({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });

    const workspaceId = signUpInNewWorkspaceData.workspace.id;

    const {
      data: { getAuthTokensFromLoginToken: authTokensData },
    } = await getAuthTokensFromLoginToken({
      origin: signUpInNewWorkspaceData.workspace.workspaceUrls.subdomainUrl,
      loginToken: signUpInNewWorkspaceData.loginToken.token,
      expectToFail: false,
    });

    const newWorkspaceAccessToken =
      authTokensData.tokens.accessOrWorkspaceAgnosticToken.token;

    await activateWorkspace({
      accessToken: newWorkspaceAccessToken,
      expectToFail: false,
    });

    await createOneObjectMetadata({
      input: {
        nameSingular: 'workspaceEviction',
        namePlural: 'workspaceEvictions',
        labelPlural: 'whatevers',
        labelSingular: 'whatever',
        isLabelSyncedWithName: false,
      },
      token: newWorkspaceAccessToken,
      expectToFail: false,
    });

    // Create a logic function for workspace deletion test
    await createOneLogicFunction({
      input: {
        name: 'test-function-for-deletion',
        description: 'A test logic function for workspace deletion test',
      },
      token: newWorkspaceAccessToken,
      expectToFail: false,
    });

    const workspaceBeforeDeletion = await testDataSource.query(
      'SELECT * FROM core.workspace WHERE id = $1',
      [workspaceId],
    );

    expect(workspaceBeforeDeletion).toHaveLength(1);

    const tablesToVerify = [
      'dataSource',
      'objectMetadata',
      'fieldMetadata',
      'indexMetadata',
      'searchFieldMetadata',
      'role',
      'roleTarget',
      'objectPermission',
      'fieldPermission',
      'permissionFlag',
      'rolePermissionFlag',
      'logicFunction',
      'agent',
      'view',
      'viewField',
      'viewFilter',
      'viewFilterGroup',
      'viewGroup',
      'viewSort',
    ];

    let totalRecordsBefore = 0;

    for (const table of tablesToVerify) {
      const result = await testDataSource.query(
        `SELECT COUNT(*) as count FROM core."${table}" WHERE "workspaceId" = $1`,
        [workspaceId],
      );

      totalRecordsBefore += parseInt(result[0].count);
    }

    expect(totalRecordsBefore).toBeGreaterThan(0);

    await deleteUser({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });

    createdUserAccessToken = undefined;

    const workspaceAfterDeletion = await testDataSource.query(
      'SELECT * FROM core.workspace WHERE id = $1',
      [workspaceId],
    );

    expect(workspaceAfterDeletion).toHaveLength(1);
    expect(workspaceAfterDeletion[0].activationStatus).toBe(
      WorkspaceActivationStatus.SUSPENDED,
    );
    expect(workspaceAfterDeletion[0].suspendedAt).not.toBeNull();
    expect(workspaceAfterDeletion[0].deletedAt).not.toBeNull();
  });
});

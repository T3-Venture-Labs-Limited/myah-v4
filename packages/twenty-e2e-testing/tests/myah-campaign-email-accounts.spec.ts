import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { backendGraphQLUrl } from '../lib/requests/backend';
import { getAccessAuthToken } from '../lib/utils/getAccessAuthToken';

const metadataGraphQLUrl = new URL(
  '/metadata',
  process.env.BACKEND_BASE_URL,
).toString();

type CampaignMailboxFixture = {
  id: string;
  availableAccountIds: [string, string];
  unavailableAccountId: string;
  approvalThreadId: string;
  approvalThreadTitle: string;
  actionApprovalBindingId: string;
  expectedFrom: string;
  expectedTo: string;
  expectedSubject: string;
  expectedBody: string;
};

type CampaignCallbackFixture = {
  connectedAccountId: string;
  callbackPath: string;
};

type CampaignMailboxFixtureStatus = {
  providerSendAttemptCount: number;
  providerDraftPreparationCount: number;
};

type CampaignEmailAccount = {
  id: string;
  connectedAccountId: string;
  senderEmail: string;
  isDefault: boolean;
  health: 'AVAILABLE' | 'RECONNECT_REQUIRED' | 'UNAVAILABLE';
};

const createCampaignMutation = `
  mutation CreateCampaign($input: CampaignCreateInput!) {
    createCampaign(data: $input) { id }
  }
`;

const deleteCampaignMutation = `
  mutation DeleteCampaign($campaignId: UUID!) {
    deleteCampaign(id: $campaignId) { id }
  }
`;

const createFixtureMutation = `
  mutation CreateMyahE2eCampaignMailboxFixture($input: CreateMyahE2eCampaignMailboxFixtureInput!) {
    createMyahE2eCampaignMailboxFixture(input: $input) {
      id
      availableAccountIds
      unavailableAccountId
      approvalThreadId
      approvalThreadTitle
      actionApprovalBindingId
      expectedFrom
      expectedTo
      expectedSubject
      expectedBody
    }
  }
`;

const createCallbackFixtureMutation = `
  mutation CreateMyahE2eCampaignCallbackFixture($input: CreateMyahE2eCallbackFixtureInput!) {
    createMyahE2eCampaignCallbackFixture(input: $input) {
      connectedAccountId
      callbackPath
    }
  }
`;

const fixtureStatusQuery = `
  query GetMyahE2eCampaignMailboxFixtureStatus($input: MyahE2eFixtureIdInput!) {
    getMyahE2eCampaignMailboxFixtureStatus(input: $input) {
      providerSendAttemptCount
      providerDraftPreparationCount
    }
  }
`;

const cleanupFixtureMutation = `
  mutation CleanupMyahE2eCampaignMailboxFixture($input: MyahE2eFixtureIdInput!) {
    cleanupMyahE2eCampaignMailboxFixture(input: $input)
  }
`;

const actionApprovalProposalQuery = `
  query GetActionApprovalProposal($bindingId: UUID!) {
    getActionApprovalProposal(bindingId: $bindingId) {
      action
      actionVersion
      state
      sendingAccountLabel
      recipientLabel
      subject
      body
    }
  }
`;

const campaignAccountsQuery = `
  query CampaignEmailAccounts($input: CampaignEmailAccountCampaignInput!) {
    campaignEmailAccounts(input: $input) {
      id
      connectedAccountId
      senderEmail
      isDefault
      health
    }
  }
`;

const campaignCandidatesQuery = `
  query CampaignEmailAccountCandidates($input: CampaignEmailAccountCampaignInput!) {
    campaignEmailAccountCandidates(input: $input) {
      id
      connectedAccountId
      senderEmail
      isDefault
      health
    }
  }
`;

const postGraphqlWithAuth = async <T>(
  request: APIRequestContext,
  authToken: string,
  query: string,
  variables: Record<string, unknown> = {},
  url = backendGraphQLUrl,
): Promise<T> => {
  const response = await request.post(url, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { query, variables },
  });

  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { data?: T; errors?: unknown };
  expect(body.errors).toBeUndefined();
  if (!body.data) throw new Error('GraphQL response did not contain data');

  return body.data;
};

const postGraphql = async <T>(
  page: Parameters<typeof getAccessAuthToken>[0],
  query: string,
  variables: Record<string, unknown> = {},
  url = backendGraphQLUrl,
): Promise<T> => {
  const { authToken } = await getAccessAuthToken(page);

  return postGraphqlWithAuth(page.request, authToken, query, variables, url);
};

const postMetadataGraphql = <T>(
  page: Parameters<typeof getAccessAuthToken>[0],
  query: string,
  variables: Record<string, unknown> = {},
) => postGraphql<T>(page, query, variables, metadataGraphQLUrl);

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const campaignPath = (campaignId: string) => `/object/campaign/${campaignId}`;

const workspaceUrl = async (
  page: Parameters<typeof getAccessAuthToken>[0],
  path: string,
) => {
  const storageState = await page.context().storageState();
  const workspaceOrigin = storageState.origins.find(
    (origin) =>
      new URL(origin.origin).hostname !== 'localhost' &&
      origin.localStorage.some(
        (item) => item.name === 'currentUserWorkspaceState',
      ),
  )?.origin;

  if (!workspaceOrigin) {
    throw new Error('Authenticated workspace origin was not found');
  }

  return new URL(path, workspaceOrigin).toString();
};

const campaignOperationsReturnPath = (
  campaignId: string,
  operationsTabId: string,
) => `${campaignPath(campaignId)}?linkConnectedAccount=1#${operationsTabId}`;

const selectOperationsTab = async (
  page: Parameters<typeof getAccessAuthToken>[0],
) => {
  const visibleOperationsTab = page.getByRole('link', {
    name: 'Operations',
    exact: true,
  });
  if (await visibleOperationsTab.isVisible()) {
    await visibleOperationsTab.click();
    return;
  }

  await page.getByRole('button', { name: /^\+\d+ More$/ }).click();
  await page.getByRole('option', { name: 'Operations', exact: true }).click();
};

const linkedAccount = (
  accounts: CampaignEmailAccount[],
  connectedAccountId: string,
) => {
  const account = accounts.find(
    (candidate) => candidate.connectedAccountId === connectedAccountId,
  );
  if (!account) throw new Error('Expected Campaign account link was not found');
  return account;
};

const getCampaignAccounts = async (
  page: Parameters<typeof getAccessAuthToken>[0],
  campaignId: string,
) =>
  postMetadataGraphql<{ campaignEmailAccounts: CampaignEmailAccount[] }>(
    page,
    campaignAccountsQuery,
    { input: { campaignId } },
  );

let cleanupState: {
  authToken?: string;
  campaignId?: string;
  fixtureId?: string;
} = {};

test.afterEach(async ({ page }, testInfo) => {
  testInfo.setTimeout(30_000);
  const { authToken, campaignId, fixtureId } = cleanupState;
  cleanupState = {};
  if (!authToken) return;

  try {
    if (fixtureId) {
      await postGraphqlWithAuth(
        page.request,
        authToken,
        cleanupFixtureMutation,
        { input: { fixtureId } },
        metadataGraphQLUrl,
      );
    }
  } finally {
    if (campaignId) {
      await postGraphqlWithAuth(
        page.request,
        authToken,
        deleteCampaignMutation,
        {
          campaignId,
        },
      );
    }
  }
});

test('Campaign email accounts', async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = randomUUID();
  let campaignId: string | undefined;
  let fixture: CampaignMailboxFixture | undefined;

  {
    const campaign = await postGraphql<{ createCampaign: { id: string } }>(
      page,
      createCampaignMutation,
      { input: { name: `MYAH-270 E2E ${suffix}` } },
    );
    campaignId = campaign.createCampaign.id;
    cleanupState = {
      authToken: (await getAccessAuthToken(page)).authToken,
      campaignId,
    };

    const fixtureResponse = await postMetadataGraphql<{
      createMyahE2eCampaignMailboxFixture: CampaignMailboxFixture;
    }>(page, createFixtureMutation, { input: { campaignId } });
    fixture = fixtureResponse.createMyahE2eCampaignMailboxFixture;
    cleanupState.fixtureId = fixture.id;

    await page.goto(await workspaceUrl(page, campaignPath(campaignId)));
    await page.getByRole('tab', { name: 'Chat', exact: true }).click();
    await page
      .getByRole('button', {
        name: new RegExp(`^${fixture.approvalThreadTitle}.*Chat actions$`),
      })
      .click();

    const approvalCard = page.getByText('Review outreach email', {
      exact: true,
    });
    await expect(approvalCard).toBeVisible();
    await expect(page.getByText('Risk: High', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Action: Send email', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`From: ${fixture.expectedFrom}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`To: ${fixture.expectedTo}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`Subject: ${fixture.expectedSubject}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(fixture.expectedBody, { exact: true }),
    ).toBeVisible();

    const requestChanges = page.getByRole('button', {
      name: 'Request changes',
      exact: true,
    });
    const reject = page.getByRole('button', { name: 'Reject', exact: true });
    const approve = page.getByRole('button', {
      name: 'Approve',
      exact: true,
    });
    await expect(requestChanges).toBeEnabled();
    await expect(reject).toBeEnabled();
    await expect(approve).toBeEnabled();
    await reject.click();
    await expect(approvalCard).toBeHidden();

    const approvalProposal = await postMetadataGraphql<{
      getActionApprovalProposal: {
        action: string;
        actionVersion: number;
        state: string;
        sendingAccountLabel: string;
        recipientLabel: string;
        subject: string;
        body: string;
      };
    }>(page, actionApprovalProposalQuery, {
      bindingId: fixture.actionApprovalBindingId,
    });
    expect(approvalProposal.getActionApprovalProposal).toMatchObject({
      action: 'send_outreach_email',
      actionVersion: 1,
      state: 'REJECTED',
      sendingAccountLabel: fixture.expectedFrom,
      recipientLabel: fixture.expectedTo,
      subject: fixture.expectedSubject,
      body: fixture.expectedBody,
    });
    const fixtureStatus = await postMetadataGraphql<{
      getMyahE2eCampaignMailboxFixtureStatus: CampaignMailboxFixtureStatus;
    }>(page, fixtureStatusQuery, { input: { fixtureId: fixture.id } });
    expect(
      fixtureStatus.getMyahE2eCampaignMailboxFixtureStatus
        .providerSendAttemptCount,
    ).toBe(0);
    expect(
      fixtureStatus.getMyahE2eCampaignMailboxFixtureStatus
        .providerDraftPreparationCount,
    ).toBe(1);

    await selectOperationsTab(page);
    await expect(
      page.getByRole('heading', { name: 'Email Accounts' }),
    ).toBeVisible();
    await expect(
      page.getByText('Email signature', { exact: true }),
    ).toBeVisible();

    const operationsTabId = new URL(page.url()).hash.slice(1);
    if (!isUuid(operationsTabId)) {
      throw new Error('Operations tab did not expose a runtime tab id');
    }

    let accounts = await getCampaignAccounts(page, campaignId);
    const prelinkedDefault = accounts.campaignEmailAccounts.find(
      (account) => account.isDefault,
    );
    if (!prelinkedDefault) throw new Error('Fixture default was not linked');

    await page
      .getByRole('button', {
        name: `Remove ${prelinkedDefault.senderEmail}`,
      })
      .click();
    await page
      .getByRole('button', { name: 'Remove account', exact: true })
      .click();
    await expect(
      page.getByText('Email account removed.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('No email accounts linked.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Default email account')).toHaveCount(0);
    accounts = await getCampaignAccounts(page, campaignId);
    expect(accounts.campaignEmailAccounts).toHaveLength(0);

    const addEmailAccount = page.getByRole('button', {
      name: 'Add email account',
      exact: true,
    });
    await addEmailAccount.click();
    const candidates = await postMetadataGraphql<{
      campaignEmailAccountCandidates: CampaignEmailAccount[];
    }>(page, campaignCandidatesQuery, { input: { campaignId } });
    const firstCandidate = linkedAccount(
      candidates.campaignEmailAccountCandidates,
      fixture.availableAccountIds[0],
    );
    const secondCandidate = linkedAccount(
      candidates.campaignEmailAccountCandidates,
      fixture.availableAccountIds[1],
    );
    const unavailableCandidate = linkedAccount(
      candidates.campaignEmailAccountCandidates,
      fixture.unavailableAccountId,
    );

    await expect(
      page.getByRole('button', {
        name: `Add ${unavailableCandidate.senderEmail}`,
      }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: `Add ${firstCandidate.senderEmail}` })
      .click();
    await expect(
      page.getByText('Email account linked.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Default email account')).toBeVisible();
    accounts = await getCampaignAccounts(page, campaignId);
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[0],
      ).isDefault,
    ).toBe(true);

    await addEmailAccount.click();
    await page
      .getByRole('button', { name: `Add ${secondCandidate.senderEmail}` })
      .click();
    await expect(
      page.getByText(secondCandidate.senderEmail, { exact: true }),
    ).toBeVisible();
    accounts = await getCampaignAccounts(page, campaignId);
    expect(
      accounts.campaignEmailAccounts.filter((account) => account.isDefault),
    ).toHaveLength(1);
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[0],
      ).isDefault,
    ).toBe(true);
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[1],
      ).isDefault,
    ).toBe(false);

    await page
      .getByRole('button', {
        name: `Make ${secondCandidate.senderEmail} default`,
      })
      .click();
    await expect(
      page.getByText('Default email account updated.', { exact: true }),
    ).toBeVisible();
    accounts = await getCampaignAccounts(page, campaignId);
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[0],
      ).isDefault,
    ).toBe(false);
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[1],
      ).isDefault,
    ).toBe(true);
    expect(
      accounts.campaignEmailAccounts.filter((account) => account.isDefault),
    ).toHaveLength(1);

    await page
      .getByRole('button', { name: `Remove ${secondCandidate.senderEmail}` })
      .click();
    await expect(
      page.getByText(
        'Removing the default account pauses email drafting. No replacement will be selected automatically.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Remove account', exact: true })
      .click();
    await expect(
      page.getByText(
        'Email drafting is paused until a default account is selected.',
      ),
    ).toBeVisible();
    accounts = await getCampaignAccounts(page, campaignId);
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[0],
      ).isDefault,
    ).toBe(false);
    expect(
      accounts.campaignEmailAccounts.filter((account) => account.isDefault),
    ).toHaveLength(0);

    const authRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.origin === new URL(backendGraphQLUrl).origin &&
        url.pathname === '/auth/google-apis'
      );
    });
    const authResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === new URL(backendGraphQLUrl).origin &&
        url.pathname === '/auth/google-apis'
      );
    });
    const externalGoogleRequest = page.waitForRequest((request) =>
      request.url().startsWith('https://accounts.google.com/'),
    );
    let resolveCallbackFixture: (fixture: CampaignCallbackFixture) => void;
    const callbackFixtureReady = new Promise<CampaignCallbackFixture>(
      (resolve) => {
        resolveCallbackFixture = resolve;
      },
    );
    const cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('Fetch.enable', {
      patterns: [
        {
          urlPattern: 'https://accounts.google.com/*',
          requestStage: 'Request',
        },
      ],
    });
    cdpSession.on('Fetch.requestPaused', async ({ requestId, request }) => {
      expect(new URL(request.url).origin).toBe('https://accounts.google.com');
      const callbackFixture = await callbackFixtureReady;
      await cdpSession.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 302,
        responseHeaders: [
          { name: 'location', value: callbackFixture.callbackPath },
        ],
      });
    });

    await addEmailAccount.click();
    const connectWithGoogle = page
      .getByRole('button', { name: 'Connect with Google', exact: true })
      .click({ noWaitAfter: true });
    const googleAuthRequest = await authRequest;
    const redirectLocation = new URL(googleAuthRequest.url()).searchParams.get(
      'redirectLocation',
    );
    if (!redirectLocation)
      throw new Error('Google OAuth initiation omitted redirectLocation');
    const callbackOperationsTabId = new URL(
      redirectLocation,
      'http://localhost:3001',
    ).hash.slice(1);
    if (!isUuid(callbackOperationsTabId))
      throw new Error(
        'Google OAuth initiation omitted a runtime Operations tab',
      );
    expect(redirectLocation).toBe(
      campaignOperationsReturnPath(campaignId, callbackOperationsTabId),
    );
    const googleAuthResponse = await authResponse;
    expect(googleAuthResponse.status()).toBe(302);
    expect(new URL(googleAuthResponse.headers().location ?? '').origin).toBe(
      'https://accounts.google.com',
    );
    const callback = await postMetadataGraphql<{
      createMyahE2eCampaignCallbackFixture: CampaignCallbackFixture;
    }>(page, createCallbackFixtureMutation, {
      input: {
        fixtureId: fixture.id,
        campaignId,
        operationsTabId: callbackOperationsTabId,
      },
    });
    const callbackFixture = callback.createMyahE2eCampaignCallbackFixture;
    expect(new URL(callbackFixture.callbackPath).origin).toBe(
      new URL(await workspaceUrl(page, campaignPath(campaignId))).origin,
    );
    resolveCallbackFixture!(callbackFixture);
    await connectWithGoogle;
    const googleAuthorizationRequest = await externalGoogleRequest;
    expect(new URL(googleAuthorizationRequest.url()).origin).toBe(
      'https://accounts.google.com',
    );
    await cdpSession.send('Fetch.disable');

    await expect(
      page.getByText('Email account linked.', { exact: true }),
    ).toBeVisible();
    if (!callbackFixture)
      throw new Error('Google callback fixture was not used');
    await expect(page).toHaveURL(
      new RegExp(`${campaignPath(campaignId)}#${callbackOperationsTabId}$`),
    );
    expect(
      new URL(page.url()).searchParams.get('linkConnectedAccount'),
    ).toBeNull();
    expect(
      new URL(page.url()).searchParams.get('connectedAccountId'),
    ).toBeNull();

    accounts = await getCampaignAccounts(page, campaignId);
    expect(
      accounts.campaignEmailAccounts.filter(
        (account) =>
          account.connectedAccountId === callbackFixture.connectedAccountId,
      ),
    ).toHaveLength(1);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Email Accounts' }),
    ).toBeVisible();
    const reloadedAccounts = await getCampaignAccounts(page, campaignId);
    expect(
      reloadedAccounts.campaignEmailAccounts.filter(
        (account) =>
          account.connectedAccountId === callbackFixture.connectedAccountId,
      ),
    ).toHaveLength(1);
  }
});

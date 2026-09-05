import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { backendGraphQLUrl } from '../lib/requests/backend';
import { getAccessAuthToken } from '../lib/utils/getAccessAuthToken';

type CampaignMailboxFixture = {
  id: string;
  availableAccountIds: [string, string];
  unavailableAccountId: string;
  approvalThreadId: string;
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

const postGraphql = async <T>(
  page: Parameters<typeof getAccessAuthToken>[0],
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> => {
  const { authToken } = await getAccessAuthToken(page);
  const response = await page.request.post(backendGraphQLUrl, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { query, variables },
  });

  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { data?: T; errors?: unknown };
  expect(body.errors).toBeUndefined();
  if (!body.data) throw new Error('GraphQL response did not contain data');

  return body.data;
};

const campaignPath = (campaignId: string) => `/object/campaign/${campaignId}`;

const operationsTab = (page: Parameters<typeof getAccessAuthToken>[0]) =>
  page.getByRole('tab', { name: 'Operations', exact: true });

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

test('Campaign email accounts keep linked mailbox defaulting, pause without a default, and return from OAuth exactly once', async ({
  page,
}) => {
  const suffix = randomUUID();
  let campaignId: string | undefined;
  let fixture: CampaignMailboxFixture | undefined;

  try {
    const campaign = await postGraphql<{ createCampaign: { id: string } }>(
      page,
      createCampaignMutation,
      { input: { name: `MYAH-270 E2E ${suffix}` } },
    );
    campaignId = campaign.createCampaign.id;

    const fixtureResponse = await postGraphql<{
      createMyahE2eCampaignMailboxFixture: CampaignMailboxFixture;
    }>(page, createFixtureMutation, { input: { campaignId } });
    fixture = fixtureResponse.createMyahE2eCampaignMailboxFixture;

    const approvalProposal = await postGraphql<{
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
      state: 'PENDING',
      sendingAccountLabel: fixture.expectedFrom,
      recipientLabel: fixture.expectedTo,
      subject: fixture.expectedSubject,
      body: fixture.expectedBody,
    });

    await page.goto(campaignPath(campaignId));
    await expect(operationsTab(page)).toBeVisible();
    await operationsTab(page).click();

    await expect(
      page.getByRole('heading', { name: 'Email Accounts' }),
    ).toBeVisible();
    await expect(
      page.getByText('Lifecycle status', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Email signature', { exact: true }),
    ).toBeVisible();

    const addEmailAccount = page.getByRole('button', {
      name: 'Add email account',
      exact: true,
    });
    await addEmailAccount.click();

    const candidates = await postGraphql<{
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
    await page
      .getByRole('button', {
        name: `Make ${firstCandidate.senderEmail} default`,
      })
      .click();
    await expect(page.getByLabel('Default email account')).toBeVisible();
    await expect(
      page.getByText(firstCandidate.senderEmail, { exact: true }),
    ).toBeVisible();

    await addEmailAccount.click();
    await page
      .getByRole('button', { name: `Add ${secondCandidate.senderEmail}` })
      .click();
    await expect(
      page.getByText(secondCandidate.senderEmail, { exact: true }),
    ).toBeVisible();

    let accounts = await postGraphql<{
      campaignEmailAccounts: CampaignEmailAccount[];
    }>(page, campaignAccountsQuery, { input: { campaignId } });
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

    accounts = await postGraphql<{
      campaignEmailAccounts: CampaignEmailAccount[];
    }>(page, campaignAccountsQuery, { input: { campaignId } });
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[1],
      ).isDefault,
    ).toBe(true);
    expect(
      linkedAccount(
        accounts.campaignEmailAccounts,
        fixture.availableAccountIds[0],
      ).isDefault,
    ).toBe(false);
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

    const callback = await postGraphql<{
      createMyahE2eCampaignCallbackFixture: CampaignCallbackFixture;
    }>(page, createCallbackFixtureMutation, {
      input: { fixtureId: fixture.id, campaignId },
    });
    const callbackFixture = callback.createMyahE2eCampaignCallbackFixture;

    await page.goto(callbackFixture.callbackPath);
    await expect(page).toHaveURL(/#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba$/);
    expect(
      new URL(page.url()).searchParams.get('linkConnectedAccount'),
    ).toBeNull();
    expect(
      new URL(page.url()).searchParams.get('connectedAccountId'),
    ).toBeNull();
    const callbackAccounts = await postGraphql<{
      campaignEmailAccounts: CampaignEmailAccount[];
    }>(page, campaignAccountsQuery, { input: { campaignId } });
    expect(
      callbackAccounts.campaignEmailAccounts.filter(
        (account) =>
          account.connectedAccountId === callbackFixture.connectedAccountId,
      ),
    ).toHaveLength(1);

    await page.reload();
    const reloadedAccounts = await postGraphql<{
      campaignEmailAccounts: CampaignEmailAccount[];
    }>(page, campaignAccountsQuery, { input: { campaignId } });
    expect(
      reloadedAccounts.campaignEmailAccounts.filter(
        (account) =>
          account.connectedAccountId === callbackFixture.connectedAccountId,
      ),
    ).toHaveLength(1);

    accounts = await postGraphql<{
      campaignEmailAccounts: CampaignEmailAccount[];
    }>(page, campaignAccountsQuery, { input: { campaignId } });
    expect(
      accounts.campaignEmailAccounts.filter(
        (account) => account.connectedAccountId === autoLinkedAccountId,
      ),
    ).toHaveLength(1);
  } finally {
    try {
      if (fixture) {
        await postGraphql(page, cleanupFixtureMutation, {
          input: { fixtureId: fixture.id },
        });
      }
    } finally {
      if (campaignId) {
        await postGraphql(page, deleteCampaignMutation, { campaignId });
      }
    }
  }
});

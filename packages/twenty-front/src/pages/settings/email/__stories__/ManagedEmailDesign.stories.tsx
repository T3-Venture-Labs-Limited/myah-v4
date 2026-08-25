import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';

import {
  createManagedDomainReview,
  createManagedEmailDesignAcquisitionOperation,
  createManagedEmailDesignMailbox,
  createManagedEmailDesignMailboxConnection,
  createManagedEmailDesignQuote,
  createManagedEmailDesignRecurringSubscription,
  createManagedMailboxReview,
  createPrewarmedBundleReview,
  emptyWorkspace,
  getManagedEmailDesignAcquisitionStatus,
  getManagedEmailDesignDomainSearchResults,
  managedEmailDesignDnsRecords,
  managedEmailDesignPricing,
  mixedWorkspace,
  normalizeManagedEmailDesignMailboxAddress,
  normalizeManagedEmailDesignDomain,
  requestManagedEmailDesignSubscriptionCancellation,
  resolveManagedEmailDesignMailboxPoolAcquisition,
  resolveManagedEmailDesignWarmupCapacityAcquisition,
  workspaceWithAvailableWarmupCapacity,
  workspaceWithoutPrewarmedInventory,
  type ManagedEmailDesignAcquisitionLine,
  type ManagedEmailDesignAcquisitionOperation,
  type ManagedEmailDesignAcquisitionSubscriptionOperation,
  type ManagedEmailDesignCapacityResolution,
  type ManagedEmailDesignDnsLifecycle,
  type ManagedEmailDesignDnsRecord,
  type ManagedEmailDesignDomainSearchLifecycle,
  type ManagedEmailDesignMailbox,
  type ManagedEmailDesignMailboxConnectionOperation,
  type ManagedEmailDesignPrewarmedBundle,
  type ManagedEmailDesignQuote,
  type ManagedEmailDesignQuoteLine,
  type ManagedEmailDesignQuoteSnapshot,
  type ManagedEmailDesignRecurringSubscription,
  type ManagedEmailDesignResourceSnapshot,
  type ManagedEmailDesignReviewDraft,
  type ManagedEmailDesignSubscriptionIntent,
  type ManagedEmailDesignWorkspace,
} from './ManagedEmailDesign.fixtures';
import {
  ManagedEmailDesignPage,
  type ManagedEmailDesignPageProps,
} from './ManagedEmailDesignPage';
import { PageDecorator } from '~/testing/decorators/PageDecorator';
import { graphqlMocks } from '~/testing/graphqlMocks';

type ManagedEmailDesignDnsRecordOverride = Partial<
  Pick<ManagedEmailDesignDnsRecord, 'observedValue' | 'safeProblem' | 'status'>
>;

const externalDnsStoryDomain = {
  id: 'story-domain-brightforge',
  name: '  BrightForge.IO  ',
};

const normalizedExternalDnsStoryDomain = normalizeManagedEmailDesignDomain(
  externalDnsStoryDomain.name,
);

const dnsRecordLocators = {
  spf: { type: 'TXT', key: '@' },
  dkim: { type: 'CNAME', key: 'myah._domainkey' },
  mx: { type: 'MX', key: '@' },
} as const;

type DnsRecordLocator =
  (typeof dnsRecordLocators)[keyof typeof dnsRecordLocators];

type DnsRecordStatusExpectation = {
  record: DnsRecordLocator;
  status: string;
};

const createDnsStoryRecords = (
  overrides: Record<string, ManagedEmailDesignDnsRecordOverride> = {},
): ManagedEmailDesignDnsRecord[] =>
  managedEmailDesignDnsRecords.map((record) => {
    const { status = record.status, ...display } = overrides[record.id] ?? {};

    return { ...record, ...display, status };
  });

const dnsRecordsAwaitingCheck = createDnsStoryRecords({
  'dns-record-spf': { status: 'pending' },
  'dns-record-dkim': { status: 'pending' },
  'dns-record-mx': { status: 'verified' },
});

const dnsRecordsCompleted = createDnsStoryRecords({
  'dns-record-spf': { status: 'verified' },
  'dns-record-dkim': { status: 'verified' },
  'dns-record-mx': { status: 'verified' },
});

const dnsRecordsWithDkimMismatch = createDnsStoryRecords({
  'dns-record-spf': { status: 'verified' },
  'dns-record-dkim': {
    status: 'action-required',
    observedValue: 'myah-dkim-previous.storybook.local',
    safeProblem:
      'The published DKIM target does not match the expected target.',
  },
  'dns-record-mx': { status: 'verified' },
});

const dnsRecordsWithMultipleIssues = createDnsStoryRecords({
  'dns-record-spf': {
    status: 'action-required',
    safeProblem: 'The SPF policy must include the expected sender.',
  },
  'dns-record-dkim': {
    status: 'pending',
    safeProblem: 'The DKIM record is awaiting publication.',
  },
  'dns-record-mx': { status: 'verified' },
});

const uncheckedDnsRecordStatuses: DnsRecordStatusExpectation[] = [
  { record: dnsRecordLocators.spf, status: 'Pending' },
  { record: dnsRecordLocators.dkim, status: 'Pending' },
  { record: dnsRecordLocators.mx, status: 'Pending' },
];

const checkingDnsRecordStatuses: DnsRecordStatusExpectation[] = [
  { record: dnsRecordLocators.spf, status: 'Pending' },
  { record: dnsRecordLocators.dkim, status: 'Pending' },
  { record: dnsRecordLocators.mx, status: 'Verified' },
];

const completedDnsRecordStatuses: DnsRecordStatusExpectation[] = [
  { record: dnsRecordLocators.spf, status: 'Verified' },
  { record: dnsRecordLocators.dkim, status: 'Verified' },
  { record: dnsRecordLocators.mx, status: 'Verified' },
];

const dnsCheckingLifecycle = {
  domain: externalDnsStoryDomain,
  operation: {
    status: 'idle',
    configuredOutcome: 'completed',
  },
  records: dnsRecordsAwaitingCheck,
  completedRecords: dnsRecordsCompleted,
  nextOperationIds: ['dns-check-brightforge-001', 'dns-check-brightforge-002'],
} satisfies ManagedEmailDesignDnsLifecycle;

const dnsFailedLifecycle = {
  domain: externalDnsStoryDomain,
  operation: {
    status: 'check-failed',
    operationId: 'dns-check-brightforge-failed-001',
    configuredOutcome: 'completed',
    safeDiagnostic:
      'The DNS verification provider could not complete this check. Try again.',
  },
  records: dnsRecordsAwaitingCheck,
  completedRecords: dnsRecordsCompleted,
} satisfies ManagedEmailDesignDnsLifecycle;

const dnsAmbiguousLifecycle = {
  domain: externalDnsStoryDomain,
  operation: {
    status: 'unknown',
    operationId: 'dns-check-brightforge-unknown-001',
    configuredOutcome: 'check-failed',
    safeDiagnostic:
      'The DNS verification provider returned an indeterminate response.',
  },
  records: dnsRecordsAwaitingCheck,
} satisfies ManagedEmailDesignDnsLifecycle;

const dnsUnknownResolutionLifecycle = {
  domain: externalDnsStoryDomain,
  operation: {
    status: 'idle',
    configuredOutcome: 'unknown',
  },
  records: dnsRecordsAwaitingCheck,
} satisfies ManagedEmailDesignDnsLifecycle;

const dnsDkimMismatchLifecycle = {
  domain: externalDnsStoryDomain,
  operation: {
    status: 'completed',
    operationId: 'dns-check-brightforge-dkim-001',
    configuredOutcome: 'completed',
  },
  records: dnsRecordsWithDkimMismatch,
} satisfies ManagedEmailDesignDnsLifecycle;

const dnsMultipleIssuesLifecycle = {
  domain: externalDnsStoryDomain,
  operation: {
    status: 'completed',
    operationId: 'dns-check-brightforge-multiple-001',
    configuredOutcome: 'completed',
  },
  records: dnsRecordsWithMultipleIssues,
} satisfies ManagedEmailDesignDnsLifecycle;

const managedDomainSearchFailureQuery = '  MOORELAND  ';
const normalizedManagedDomainSearchFailureQuery =
  normalizeManagedEmailDesignDomain(managedDomainSearchFailureQuery);

const managedDomainSearchFailureLifecycle = {
  operation: {
    status: 'failed',
    operationId: 'managed-domain-search-mooreland-001',
    configuredOutcome: 'results',
    safeDiagnostic:
      'The managed domain search could not be completed. Try again.',
  },
  configuredResults: getManagedEmailDesignDomainSearchResults(
    normalizedManagedDomainSearchFailureQuery,
  ),
} satisfies ManagedEmailDesignDomainSearchLifecycle;

const managedDomainSearchNoResultsFailureQuery = '  ZZZZ-NOMATCH  ';
const normalizedManagedDomainSearchNoResultsFailureQuery =
  normalizeManagedEmailDesignDomain(managedDomainSearchNoResultsFailureQuery);

const managedDomainSearchNoResultsFailureLifecycle = {
  operation: {
    status: 'failed',
    operationId: 'managed-domain-search-no-results-001',
    configuredOutcome: 'no-results',
    safeDiagnostic:
      'The managed domain search could not be completed. Try again.',
  },
  configuredResults: getManagedEmailDesignDomainSearchResults(
    normalizedManagedDomainSearchNoResultsFailureQuery,
  ),
} satisfies ManagedEmailDesignDomainSearchLifecycle;

const managedDomainSearchNoResultsMessage =
  'No local fixture results match this search. Try another domain name.';

const waitPastLegacyAutoResolution = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 350));

const clickStoryButton = async ({
  canvasElement,
  name,
}: {
  canvasElement: HTMLElement;
  name: string;
}) => {
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole('button', {
      name,
    }),
  );
};

const readStoryOutput = ({
  canvasElement,
  label,
}: {
  canvasElement: HTMLElement;
  label: string;
}) => {
  const output = Array.from(
    canvasElement.ownerDocument.querySelectorAll('output'),
  ).find((candidate) => candidate.getAttribute('aria-label') === label);
  if (output === undefined) {
    throw new Error(`Missing story output: ${label}`);
  }

  const value = output.textContent?.trim() ?? '';

  expect(output).toBeVisible();
  expect(value).not.toBe('');

  return value;
};
const waitForManagedEmailDesignReady = async (canvasElement: HTMLElement) => {
  await waitFor(() =>
    expect(
      Array.from(canvasElement.ownerDocument.querySelectorAll('output')).some(
        (output) =>
          output.getAttribute('aria-label') ===
          'Managed mailbox resource count',
      ),
    ).toBe(true),
  );
};

const readDnsOperationId = (canvasElement: HTMLElement) =>
  readStoryOutput({
    canvasElement,
    label: 'DNS verification operation ID',
  });

const readDnsOperationState = (canvasElement: HTMLElement) =>
  readStoryOutput({
    canvasElement,
    label: 'DNS verification state',
  });

const expectDnsOperationState = async ({
  canvasElement,
  expected,
}: {
  canvasElement: HTMLElement;
  expected: string | RegExp;
}) => {
  await waitFor(() =>
    expect(
      within(canvasElement).getByLabelText('DNS verification state'),
    ).toHaveTextContent(expected),
  );
};

const getDnsRecordRow = ({
  canvasElement,
  record,
}: {
  canvasElement: HTMLElement;
  record: DnsRecordLocator;
}) => {
  const row = within(canvasElement)
    .getAllByRole('row')
    .find((candidate) => {
      const text = candidate.textContent ?? '';

      return text.includes(record.type) && text.includes(record.key);
    });

  if (row === undefined) {
    throw new Error(
      `Expected DNS record row for ${record.type} ${record.key}.`,
    );
  }

  return row;
};

const assertDnsRecordStatus = ({
  canvasElement,
  record,
  status,
}: {
  canvasElement: HTMLElement;
  record: DnsRecordLocator;
  status: string;
}) => {
  expect(
    within(getDnsRecordRow({ canvasElement, record })).getByText(status, {
      exact: true,
    }),
  ).toBeVisible();
};

const assertDnsRecordStatuses = ({
  canvasElement,
  expectations,
}: {
  canvasElement: HTMLElement;
  expectations: DnsRecordStatusExpectation[];
}) => {
  expectations.forEach(({ record, status }) => {
    assertDnsRecordStatus({ canvasElement, record, status });
  });
};

const assertNoDnsRecordIsMarkedActionRequired = (
  canvasElement: HTMLElement,
) => {
  expect(
    within(canvasElement).queryAllByText('Action required', {
      exact: true,
    }),
  ).toHaveLength(0);
};

const assertDnsDomainContext = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  expect(
    await canvas.findByRole('heading', {
      name: `Verify DNS for ${normalizedExternalDnsStoryDomain}`,
    }),
  ).toBeVisible();
  expect(
    canvas.getByRole('table', {
      name: `DNS records for ${normalizedExternalDnsStoryDomain}`,
    }),
  ).toBeVisible();
};

const assertDnsCheckingRemainsFrozen = async ({
  canvasElement,
  operationId,
  expectations,
}: {
  canvasElement: HTMLElement;
  operationId: string;
  expectations: DnsRecordStatusExpectation[];
}) => {
  await waitPastLegacyAutoResolution();
  await expectDnsOperationState({ canvasElement, expected: /checking/i });
  expect(readDnsOperationId(canvasElement)).toBe(operationId);
  assertDnsRecordStatuses({ canvasElement, expectations });
};

const expectSingleSafeAlert = ({
  canvasElement,
  diagnostic,
}: {
  canvasElement: HTMLElement;
  diagnostic: string;
}) => {
  const alerts = within(canvasElement).getAllByRole('alert');

  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toHaveTextContent(diagnostic);
};

const readDomainSearchOperationId = (canvasElement: HTMLElement) =>
  readStoryOutput({
    canvasElement,
    label: 'Managed domain search operation ID',
  });

const readDomainSearchState = (canvasElement: HTMLElement) =>
  readStoryOutput({
    canvasElement,
    label: 'Managed domain search state',
  });

const expectDomainSearchState = async ({
  canvasElement,
  expected,
}: {
  canvasElement: HTMLElement;
  expected: string | RegExp;
}) => {
  await waitFor(() =>
    expect(
      within(canvasElement).getByLabelText('Managed domain search state'),
    ).toHaveTextContent(expected),
  );
};

const assertNormalizedDomainSearchQuery = ({
  canvasElement,
  query,
}: {
  canvasElement: HTMLElement;
  query: string;
}) => {
  expect(within(canvasElement).getByLabelText('Domain search')).toHaveValue(
    query,
  );
};

const assertDomainSearchRemainsFrozen = async ({
  canvasElement,
  operationId,
  query,
}: {
  canvasElement: HTMLElement;
  operationId: string;
  query: string;
}) => {
  await waitPastLegacyAutoResolution();
  await expectDomainSearchState({ canvasElement, expected: /loading/i });
  expect(readDomainSearchOperationId(canvasElement)).toBe(operationId);
  assertNormalizedDomainSearchQuery({ canvasElement, query });
};

const assertNoDomainSearchOutcome = (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  expect(
    canvas.queryByRole('radiogroup', { name: 'Available domains' }),
  ).not.toBeInTheDocument();
  expect(
    canvas.queryByText(managedDomainSearchNoResultsMessage),
  ).not.toBeInTheDocument();
};

const assertDomainSearchResults = async ({
  canvasElement,
  expectedDomain,
  operationId,
}: {
  canvasElement: HTMLElement;
  expectedDomain: string;
  operationId: string;
}) => {
  await expectDomainSearchState({ canvasElement, expected: /results/i });
  expect(readDomainSearchState(canvasElement)).toMatch(/results/i);
  expect(readDomainSearchOperationId(canvasElement)).toBe(operationId);

  const availableDomains = await within(canvasElement).findByRole(
    'radiogroup',
    {
      name: 'Available domains',
    },
  );

  expect(
    within(availableDomains).getByRole('radio', { name: expectedDomain }),
  ).toBeVisible();

  await waitPastLegacyAutoResolution();
  await expectDomainSearchState({ canvasElement, expected: /results/i });
  expect(readDomainSearchState(canvasElement)).toMatch(/results/i);
  expect(readDomainSearchOperationId(canvasElement)).toBe(operationId);
};

const assertDomainSearchNoResults = async ({
  canvasElement,
  operationId,
}: {
  canvasElement: HTMLElement;
  operationId: string;
}) => {
  await expectDomainSearchState({ canvasElement, expected: /no results/i });
  expect(readDomainSearchState(canvasElement)).toMatch(/no results/i);
  expect(readDomainSearchOperationId(canvasElement)).toBe(operationId);
  expect(
    within(canvasElement).queryByRole('radiogroup', {
      name: 'Available domains',
    }),
  ).not.toBeInTheDocument();
  expect(
    within(canvasElement).getByText(managedDomainSearchNoResultsMessage),
  ).toBeVisible();

  await waitPastLegacyAutoResolution();
  await expectDomainSearchState({ canvasElement, expected: /no results/i });
  expect(readDomainSearchState(canvasElement)).toMatch(/no results/i);
  expect(readDomainSearchOperationId(canvasElement)).toBe(operationId);
};

const assertCardPickerChoiceGroup = async ({
  canvasElement,
  groupName,
  selectedName,
  alternateName,
  expectedRadioCount = 2,
  initialSelectionName,
}: {
  canvasElement: HTMLElement;
  groupName: string;
  selectedName: string;
  alternateName?: string;
  expectedRadioCount?: number;
  initialSelectionName?: string;
}) => {
  const canvas = within(canvasElement);
  const group = await canvas.findByRole('radiogroup', { name: groupName });

  if (initialSelectionName !== undefined) {
    await userEvent.click(
      within(group).getByRole('radio', { name: initialSelectionName }),
    );
  }

  const selected = within(group).getByRole('radio', { name: selectedName });
  const alternate =
    alternateName === undefined
      ? null
      : within(group).getByRole('radio', { name: alternateName });
  const radios = within(group).getAllByRole('radio');

  expect(selected).toBeChecked();
  if (alternate !== null) {
    expect(alternate).not.toBeChecked();
  }
  expect(radios).toHaveLength(expectedRadioCount);
  expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  expect(
    group.querySelectorAll(
      'button, [role="button"], [role="radio"], input:not([aria-hidden="true"])',
    ),
  ).toHaveLength(expectedRadioCount);

  if (alternate !== null) {
    selected.focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(alternate).toHaveFocus();
    expect(alternate).toBeChecked();
  }

  selected.focus();
  await userEvent.keyboard('[Space]');

  expect(selected).toBeChecked();
};

const openDomainActions = async ({
  canvasElement,
  domain,
}: {
  canvasElement: HTMLElement;
  domain: string;
}) => {
  await userEvent.click(
    await within(canvasElement).findByRole('button', {
      name: `More actions for ${domain}`,
    }),
  );
};

const getDomainRow = ({
  canvasElement,
  domain,
}: {
  canvasElement: HTMLElement;
  domain: string;
}) => {
  const row = within(canvasElement)
    .getAllByRole('row')
    .find((candidate) => candidate.textContent?.includes(domain));

  if (row === undefined) {
    throw new Error(`Expected domain row for ${domain}.`);
  }

  return row;
};

const assertDomainVerification = async ({
  canvasElement,
  domain,
  verification,
}: {
  canvasElement: HTMLElement;
  domain: string;
  verification: string;
}) => {
  await waitFor(() => {
    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(verification, {
        exact: true,
      }),
    ).toBeVisible();
  });
};

const assertDnsDomainContextForDomain = async ({
  canvasElement,
  domain,
}: {
  canvasElement: HTMLElement;
  domain: string;
}) => {
  const canvas = within(canvasElement);

  expect(
    await canvas.findByRole('heading', {
      name: `Verify DNS for ${domain}`,
    }),
  ).toBeVisible();
  expect(
    canvas.getByRole('table', {
      name: `DNS records for ${domain}`,
    }),
  ).toBeVisible();
};

const assertMailboxDomainPrerequisite = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  expect(
    await canvas.findByRole('heading', {
      name: 'Create a managed mailbox',
    }),
  ).toBeVisible();
  expect(canvas.getByRole('button', { name: 'Add domain' })).toBeVisible();
  expect(
    canvas.queryByRole('radiogroup', { name: 'Verified domain' }),
  ).not.toBeInTheDocument();
};

const assertMailboxDetailsWithSelectedDomain = async ({
  canvasElement,
  domain,
}: {
  canvasElement: HTMLElement;
  domain: string;
}) => {
  const canvas = within(canvasElement);

  expect(
    await canvas.findByRole('heading', {
      name: 'Create a managed mailbox',
    }),
  ).toBeVisible();

  const domains = await canvas.findByRole('radiogroup', {
    name: 'Verified domain',
  });

  expect(
    within(domains).getByRole('radio', {
      name: domain,
    }),
  ).toBeChecked();
  expect(
    canvas.getByRole('button', {
      name: 'Review mailbox',
    }),
  ).toBeEnabled();
};

const reviewManagedMailboxFromDashboard = async ({
  canvasElement,
  domain,
  localPart = 'jamie',
}: {
  canvasElement: HTMLElement;
  domain: string;
  localPart?: string;
}) => {
  await waitForManagedEmailDesignReady(canvasElement);
  await clickStoryButton({ canvasElement, name: 'Add mailbox' });
  const canvas = within(canvasElement);
  const sourceGroup = await canvas.findByRole('radiogroup', {
    name: 'Mailbox source',
  });
  await userEvent.click(
    within(sourceGroup).getByRole('radio', {
      name: 'Create a managed mailbox',
    }),
  );
  await clickStoryButton({ canvasElement, name: 'Continue' });
  const localPartInput = await canvas.findByRole('textbox', {
    name: 'Mailbox local part',
  });
  await userEvent.clear(localPartInput);
  await userEvent.type(localPartInput, localPart);
  await assertMailboxDetailsWithSelectedDomain({ canvasElement, domain });
  await clickStoryButton({ canvasElement, name: 'Review mailbox' });
};

const assertFocusedFieldError = ({
  field,
  message,
}: {
  field: HTMLElement;
  message: string;
}) => {
  const errorId = field.getAttribute('aria-errormessage');

  expect(field).toHaveFocus();
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(errorId).not.toBeNull();
  expect(field.ownerDocument.getElementById(errorId!)).toHaveTextContent(
    message,
  );
};

const reviewManagedDomainFromDashboard = async ({
  canvasElement,
  domain,
}: {
  canvasElement: HTMLElement;
  domain: string;
}) => {
  await waitForManagedEmailDesignReady(canvasElement);
  await clickStoryButton({ canvasElement, name: 'Add domain' });
  const canvas = within(canvasElement);
  const sourceGroup = await canvas.findByRole('radiogroup', {
    name: 'Domain source',
  });
  await userEvent.click(
    within(sourceGroup).getByRole('radio', {
      name: 'Buy a Myah-managed domain',
    }),
  );
  await clickStoryButton({ canvasElement, name: 'Continue' });
  const searchInput = await canvas.findByRole('textbox', {
    name: 'Domain search',
  });
  await userEvent.clear(searchInput);
  await userEvent.type(searchInput, 'mooreland');
  await clickStoryButton({ canvasElement, name: 'Search' });
  await clickStoryButton({ canvasElement, name: 'Resolve domain search' });
  const results = await canvas.findByRole('radiogroup', {
    name: 'Available domains',
  });
  await userEvent.click(within(results).getByRole('radio', { name: domain }));
  await clickStoryButton({ canvasElement, name: 'Continue' });
  expect(
    await canvas.findByRole('heading', { name: 'Review managed domain' }),
  ).toBeVisible();
};

const storyConnectionPassword = 'storybook-secret-password';
const storyConnectionDiagnostic =
  'Authentication failed. Re-enter the password and try again.';

const createStoryConnection = ({
  address = 'rory@riveroak.io',
  operation = {
    status: 'connected',
    operationId: 'connection-operation-rory',
    configuredOutcome: 'connected',
  },
}: {
  address?: string;
  operation?: ManagedEmailDesignMailboxConnectionOperation;
} = {}) =>
  createManagedEmailDesignMailboxConnection({
    draft: {
      address,
      selectedProtocol: 'SMTP',
      host: 'smtp.riveroak.io',
      port: 587,
      connectionSecurity: 'STARTTLS',
      username: 'rory',
    },
    capabilities: ['smtp'],
    canSend: true,
    sendingCapabilityReason: null,
    operation,
  });

const createStoryConnectedMailbox = ({
  id = 'mailbox-rory',
  warmupState = {
    assignment: 'unassigned',
    lastConfirmedProviderState: 'inactive',
    operation: { status: 'idle' },
  },
  operation,
}: {
  id?: string;
  warmupState?: ManagedEmailDesignMailbox['warmupState'];
  operation?: ManagedEmailDesignMailboxConnectionOperation;
} = {}) =>
  createManagedEmailDesignMailbox({
    id,
    identity: 'Rory Blake',
    address: 'rory@riveroak.io',
    domain: 'riveroak.io',
    source: 'connected',
    subscriptionId: null,
    readiness: 'ready',
    warmupState,
    connection: createStoryConnection({ operation }),
  });

const withStoryMailbox = (
  mailbox: ManagedEmailDesignMailbox,
): ManagedEmailDesignWorkspace => ({
  ...mixedWorkspace,
  mailboxes: [
    mailbox,
    ...mixedWorkspace.mailboxes.filter(
      (candidate) => candidate.id !== mailbox.id,
    ),
  ],
});

const getMailboxRow = ({
  canvasElement,
  address,
}: {
  canvasElement: HTMLElement;
  address: string;
}) => {
  const row = within(canvasElement)
    .getAllByRole('row')
    .find((candidate) => candidate.textContent?.includes(address));

  if (row === undefined) {
    throw new Error(`Expected mailbox row for ${address}.`);
  }

  return row;
};

const openMailboxActions = async ({
  canvasElement,
  address,
}: {
  canvasElement: HTMLElement;
  address: string;
}) => {
  const trigger = await within(canvasElement).findByRole('button', {
    name: `More actions for ${address}`,
  });

  if (trigger.getAttribute('aria-expanded') === 'true') {
    return;
  }

  trigger.focus();
  await userEvent.keyboard('{Enter}');
};

const readMailboxConnectionOperationId = (canvasElement: HTMLElement) =>
  readStoryOutput({
    canvasElement,
    label: 'Mailbox connection operation ID',
  });

const readMailboxConnectionState = (canvasElement: HTMLElement) =>
  readStoryOutput({
    canvasElement,
    label: 'Mailbox connection state',
  });

const readMailboxResourceCount = (canvasElement: HTMLElement) =>
  Number(
    readStoryOutput({
      canvasElement,
      label: 'Managed mailbox resource count',
    }),
  );

const readMailboxPoolSignature = (canvasElement: HTMLElement) =>
  readStoryOutput({
    canvasElement,
    label: 'Managed mailbox pool signature',
  });

const readWarmupCapacityText = (canvasElement: HTMLElement) =>
  within(canvasElement).getByText(/Warmup capacity:/).textContent ?? '';

const task7FixtureNow = '2027-01-10T12:00:00.000Z';
const task7SubscriptionRenewsAt = '2027-02-10T12:00:00.000Z';
const task7SubscriptionChangeEffectiveAt = '2027-02-10T12:00:00.000Z';
const task7SubscriptionCancelAt = '2027-02-10T12:00:00.000Z';

type Task7SubscriptionLifecycle =
  | {
      status: 'active';
      renewsAt?: string;
    }
  | {
      status: 'pending-cancel';
      renewsAt?: string;
      cancelAt?: string;
    }
  | {
      status: 'canceled';
      canceledAt?: string;
    }
  | {
      status: 'pending-change';
      renewsAt?: string;
      pendingQuantity: number;
      changeEffectiveAt?: string;
    };

const createTask7WarmupSnapshots = (
  quantity: number,
  prefix: string,
): ManagedEmailDesignRecurringSubscription['linkedResources'] =>
  Array.from({ length: quantity }, (_, index) => ({
    id: `${prefix}-slot-${index + 1}`,
    kind: 'warmup-capacity' as const,
    label: `Warmup slot ${index + 1}`,
  }));

const createTask7MailboxSnapshots = (
  mailboxes: ManagedEmailDesignMailbox[],
): ManagedEmailDesignRecurringSubscription['linkedResources'] =>
  mailboxes
    .filter((mailbox) => mailbox.source !== 'connected')
    .map((mailbox) => ({
      id: mailbox.id,
      kind: 'mailbox' as const,
      label: `${mailbox.identity} <${mailbox.address}>`,
    }));

const createTask7Subscription = ({
  id,
  product,
  quantity,
  linkedResources,
  lifecycle = { status: 'active' },
}: {
  id: string;
  product: 'managed-mailbox' | 'managed-warmup';
  quantity: number;
  linkedResources: ManagedEmailDesignRecurringSubscription['linkedResources'];
  lifecycle?: Task7SubscriptionLifecycle;
}): ManagedEmailDesignRecurringSubscription => {
  const subscription = {
    id,
    workspaceId: 'workspace-managed-email-design',
    linkedResources,
    unitPriceCents:
      product === 'managed-warmup'
        ? managedEmailDesignPricing.managedWarmupMonthlyCents
        : managedEmailDesignPricing.managedMailboxMonthlyCents,
    product,
    cadence: 'monthly' as const,
    quantity,
  };

  switch (lifecycle.status) {
    case 'active':
      return createManagedEmailDesignRecurringSubscription({
        ...subscription,
        status: 'active',
        renewsAt: lifecycle.renewsAt ?? task7SubscriptionRenewsAt,
      });
    case 'pending-cancel':
      return createManagedEmailDesignRecurringSubscription({
        ...subscription,
        status: 'pending-cancel',
        renewsAt: lifecycle.renewsAt ?? task7SubscriptionRenewsAt,
        cancelAt: lifecycle.cancelAt ?? task7SubscriptionCancelAt,
      });
    case 'canceled':
      return createManagedEmailDesignRecurringSubscription({
        ...subscription,
        status: 'canceled',
        renewsAt: null,
        canceledAt: lifecycle.canceledAt ?? task7FixtureNow,
      });
    case 'pending-change':
      return createManagedEmailDesignRecurringSubscription({
        ...subscription,
        status: 'pending-change',
        renewsAt: lifecycle.renewsAt ?? task7SubscriptionRenewsAt,
        pendingQuantity: lifecycle.pendingQuantity,
        changeEffectiveAt:
          lifecycle.changeEffectiveAt ?? task7SubscriptionChangeEffectiveAt,
      });
  }
};

const createTask7WarmupSubscription = ({
  id = 'subscription-managed-warmup',
  quantity,
  lifecycle,
}: {
  id?: string;
  quantity: number;
  lifecycle?: Task7SubscriptionLifecycle;
}) =>
  createTask7Subscription({
    id,
    product: 'managed-warmup',
    quantity,
    linkedResources: createTask7WarmupSnapshots(quantity, id),
    lifecycle,
  });

const createTask7MailboxSubscription = ({
  id = 'subscription-managed-mailbox',
  quantity,
  mailboxes,
  lifecycle,
}: {
  id?: string;
  quantity: number;
  mailboxes: ManagedEmailDesignMailbox[];
  lifecycle?: Task7SubscriptionLifecycle;
}) =>
  createTask7Subscription({
    id,
    product: 'managed-mailbox',
    quantity,
    linkedResources: createTask7MailboxSnapshots(mailboxes),
    lifecycle,
  });

const createTask7Workspace = ({
  mailboxes,
  subscriptions,
}: {
  mailboxes: ManagedEmailDesignMailbox[];
  subscriptions: ManagedEmailDesignRecurringSubscription[];
}): ManagedEmailDesignWorkspace => ({
  domains: mixedWorkspace.domains,
  mailboxes,
  subscriptions: [
    ...mixedWorkspace.subscriptions.filter(
      (subscription) =>
        subscription.id === 'subscription-managed-domain-northstar' ||
        subscription.id === 'subscription-prewarmed-domain-fleetwave',
    ),
    ...subscriptions,
  ],
  prewarmedBundles: [],
});

const createTask7Mailbox = ({
  id,
  identity,
  address,
  domain = 'riveroak.io',
  source = 'managed',
  readiness = 'ready',
  warmupState = {
    assignment: 'unassigned',
    lastConfirmedProviderState: 'inactive',
    operation: { status: 'idle' },
  },
  connection,
}: {
  id: string;
  identity: string;
  address: string;
  domain?: string;
  source?: ManagedEmailDesignMailbox['source'];
  readiness?: ManagedEmailDesignMailbox['readiness'];
  warmupState?: ManagedEmailDesignMailbox['warmupState'];
  connection?: ManagedEmailDesignMailbox['connection'];
}) =>
  createManagedEmailDesignMailbox({
    id,
    identity,
    address,
    domain,
    source,
    subscriptionId:
      source === 'connected' ? null : 'subscription-managed-mailbox',
    readiness,
    warmupState,
    ...(source === 'connected'
      ? { connection: connection ?? createStoryConnection({ address }) }
      : {}),
  });
const interactiveResourceDashboardMailboxes = [
  ...mixedWorkspace.mailboxes,
  createTask7Mailbox({
    id: 'mailbox-sasha',
    identity: 'Sasha Nguyen',
    address: 'sasha@northstar-outreach.com',
    domain: 'northstar-outreach.com',
    warmupState: {
      assignment: 'assigned',
      lastConfirmedProviderState: 'paused',
      operation: { status: 'idle' },
    },
  }),
];
const interactiveResourceDashboardWorkspace = {
  ...createTask7Workspace({
    mailboxes: interactiveResourceDashboardMailboxes,
    subscriptions: [
      createTask7MailboxSubscription({
        quantity: 5,
        mailboxes: interactiveResourceDashboardMailboxes,
      }),
      createTask7WarmupSubscription({ quantity: 4 }),
    ],
  }),
  prewarmedBundles: mixedWorkspace.prewarmedBundles,
} satisfies ManagedEmailDesignWorkspace;

const mobileWorkspaceMailboxes = [
  createTask7Mailbox({
    id: 'mailbox-mobile-mira',
    identity: 'Mira Chen',
    address: 'mira@northstar-outreach.com',
    domain: 'northstar-outreach.com',
    warmupState: {
      assignment: 'assigned',
      lastConfirmedProviderState: 'warming',
      operation: { status: 'idle' },
    },
  }),
  createTask7Mailbox({
    id: 'mailbox-mobile-rory',
    identity: 'Rory Blake',
    address: 'rory@riveroak.io',
    source: 'connected',
  }),
];
const mobileWorkspace = createTask7Workspace({
  mailboxes: mobileWorkspaceMailboxes,
  subscriptions: [
    createTask7MailboxSubscription({
      quantity: 1,
      mailboxes: mobileWorkspaceMailboxes,
    }),
    createTask7WarmupSubscription({ quantity: 2 }),
  ],
});

const warmupCapacityExhaustedMailboxes = [
  createTask7Mailbox({
    id: 'mailbox-mira',
    identity: 'Mira Chen',
    address: 'mira@northstar-outreach.com',
    domain: 'northstar-outreach.com',
    warmupState: {
      assignment: 'assigned',
      lastConfirmedProviderState: 'warming',
      operation: { status: 'idle' },
    },
  }),
  createTask7Mailbox({
    id: 'mailbox-jordan',
    identity: 'Jordan Lee',
    address: 'jordan@northstar-outreach.com',
    domain: 'northstar-outreach.com',
    warmupState: {
      assignment: 'assigned',
      lastConfirmedProviderState: 'warming',
      operation: { status: 'idle' },
    },
  }),
  createTask7Mailbox({
    id: 'mailbox-rory',
    identity: 'Rory Blake',
    address: 'rory@riveroak.io',
    source: 'connected',
  }),
];
const warmupCapacityExhaustedWorkspace = createTask7Workspace({
  mailboxes: warmupCapacityExhaustedMailboxes,
  subscriptions: [
    createTask7MailboxSubscription({
      quantity: 2,
      mailboxes: warmupCapacityExhaustedMailboxes,
    }),
    createTask7WarmupSubscription({ quantity: 2 }),
  ],
});

const warmupControlsMailboxes = [
  createTask7Mailbox({
    id: 'mailbox-lena-controls',
    identity: 'Lena Ortiz',
    address: 'lena@northstar-outreach.com',
    domain: 'northstar-outreach.com',
    warmupState: {
      assignment: 'assigned',
      lastConfirmedProviderState: 'paused',
      operation: { status: 'idle' },
    },
  }),
  createTask7Mailbox({
    id: 'mailbox-rory-controls',
    identity: 'Rory Blake',
    address: 'rory@riveroak.io',
    source: 'connected',
  }),
];
const warmupControlsWorkspace = createTask7Workspace({
  mailboxes: warmupControlsMailboxes,
  subscriptions: [
    createTask7MailboxSubscription({
      quantity: 1,
      mailboxes: warmupControlsMailboxes,
    }),
    createTask7WarmupSubscription({ quantity: 2 }),
  ],
});

const warmupAssignmentLifecycleWorkspace = createTask7Workspace({
  mailboxes: [
    createTask7Mailbox({
      id: 'mailbox-rory-lifecycle',
      identity: 'Rory Blake',
      address: 'rory@riveroak.io',
      source: 'connected',
    }),
  ],
  subscriptions: [createTask7WarmupSubscription({ quantity: 1 })],
});

const readWarmupRowOutput = ({
  canvasElement,
  address,
  label,
}: {
  canvasElement: HTMLElement;
  address: string;
  label: string;
}) => {
  const output = within(
    getMailboxRow({ canvasElement, address }),
  ).getByLabelText(label);
  const value = output.textContent?.trim() ?? '';

  expect(output).toBeVisible();
  expect(value).not.toBe('');

  return value;
};

type Task7WarmupStateOutput =
  | 'assignment'
  | 'provider-state'
  | 'operation'
  | 'operation-id';

const readWarmupStateOutput = ({
  canvasElement,
  address,
  output,
}: {
  canvasElement: HTMLElement;
  address: string;
  output: Task7WarmupStateOutput;
}) => {
  const label =
    output === 'assignment'
      ? `Warmup assignment for ${address}`
      : output === 'provider-state'
        ? `Confirmed warmup provider state for ${address}`
        : output === 'operation'
          ? `Warmup operation for ${address}`
          : `Warmup operation ID for ${address}`;

  return readWarmupRowOutput({ canvasElement, address, label });
};

const expectWarmupState = async ({
  canvasElement,
  address,
  assignment,
  providerState,
  operation,
  operationId,
}: {
  canvasElement: HTMLElement;
  address: string;
  assignment: string | RegExp;
  providerState: string | RegExp;
  operation: string | RegExp;
  operationId?: string | RegExp;
}) => {
  await waitFor(() => {
    expect(
      readWarmupStateOutput({
        canvasElement,
        address,
        output: 'assignment',
      }),
    ).toMatch(assignment);
    expect(
      readWarmupStateOutput({
        canvasElement,
        address,
        output: 'provider-state',
      }),
    ).toMatch(providerState);
    expect(
      readWarmupStateOutput({
        canvasElement,
        address,
        output: 'operation',
      }),
    ).toMatch(operation);

    if (operationId !== undefined) {
      expect(
        readWarmupStateOutput({
          canvasElement,
          address,
          output: 'operation-id',
        }),
      ).toMatch(operationId);
    }
  });
};

const expectWarmupCapacity = async ({
  canvasElement,
  expected,
}: {
  canvasElement: HTMLElement;
  expected: string | RegExp;
}) => {
  await waitFor(() =>
    expect(readWarmupCapacityText(canvasElement)).toMatch(expected),
  );
};
const expectWarmupCapacityQuote = ({
  review,
  lineAmount,
}: {
  review: HTMLElement;
  lineAmount: string;
}) => {
  expect(
    within(review).getByLabelText('Warmup quote cadence'),
  ).toHaveTextContent('Monthly');
  expect(
    within(review).getByLabelText('Warmup quote unit price'),
  ).toHaveTextContent('$2.99');
  expect(
    within(review).getByLabelText('Warmup quote line amount'),
  ).toHaveTextContent(lineAmount);
  expect(
    within(review).getByLabelText('Warmup quote renewal date'),
  ).toHaveTextContent('Feb 10, 2027');
};

const pressFocusedButton = async (button: HTMLElement) => {
  button.focus();
  expect(button).toHaveFocus();
  await userEvent.keyboard('{Enter}');
};

const resolveWarmupOperation = async (canvasElement: HTMLElement) => {
  await clickStoryButton({
    canvasElement,
    name: 'Resolve warmup operation',
  });
};

const openManagedEmailSubscriptionPanel = async ({
  canvasElement,
  actionName = 'Manage warmup capacity',
}: {
  canvasElement: HTMLElement;
  actionName?: string;
}) => {
  const action = await within(canvasElement).findByRole('button', {
    name: actionName,
  });

  await pressFocusedButton(action);

  const panel = await within(canvasElement.ownerDocument.body).findByRole(
    'region',
    {
      name: 'Managed-email subscriptions',
    },
  );

  expect(panel).toBeVisible();

  return panel;
};

const openManagedEmailSubscription = async ({
  canvasElement,
  subscriptionId,
}: {
  canvasElement: HTMLElement;
  subscriptionId: string;
}) => {
  const panel = await openManagedEmailSubscriptionPanel({ canvasElement });
  await userEvent.click(
    within(panel).getByRole('button', {
      name: `Manage subscription ${subscriptionId}`,
    }),
  );

  return panel;
};

const chooseConnectionProtocol = async ({
  canvasElement,
  protocol,
}: {
  canvasElement: HTMLElement;
  protocol: 'IMAP' | 'SMTP' | 'CALDAV';
}) => {
  const group = await within(canvasElement).findByRole('radiogroup', {
    name: 'Connection protocol',
  });
  const choice = within(group).getByRole('radio', { name: protocol });

  choice.focus();
  await userEvent.keyboard('[Space]');

  expect(choice).toBeChecked();
};

const fillConnectionForm = async ({
  canvasElement,
  protocol = 'SMTP',
  address = 'new-mailbox@riveroak.io',
  host = 'smtp.riveroak.io',
  password = storyConnectionPassword,
}: {
  canvasElement: HTMLElement;
  protocol?: 'IMAP' | 'SMTP' | 'CALDAV';
  address?: string;
  host?: string;
  password?: string;
}) => {
  await chooseConnectionProtocol({ canvasElement, protocol });

  const canvas = within(canvasElement);
  const email = canvas.getByLabelText('Email Address');
  const server = canvas.getByLabelText(`${protocol} Server`);
  const protocolPassword = canvas.getByLabelText(`${protocol} Password`);

  await userEvent.clear(email);
  await userEvent.type(email, address);
  await userEvent.clear(server);
  await userEvent.type(server, host);
  await userEvent.clear(protocolPassword);
  await userEvent.type(protocolPassword, password);
};

const resolveMailboxConnection = async (canvasElement: HTMLElement) => {
  await clickStoryButton({
    canvasElement,
    name: 'Resolve connection result',
  });
};

const assertNoSecretInStatus = ({
  canvasElement,
  password = storyConnectionPassword,
}: {
  canvasElement: HTMLElement;
  password?: string;
}) => {
  expect(canvasElement.textContent).not.toContain(password);
  expect(
    within(canvasElement).queryByText(password, { exact: true }),
  ).not.toBeInTheDocument();
};
const task8FixtureNow = '2027-01-10T12:00:00.000Z';
const task8QuoteExpiresAt = '2027-01-10T12:15:00.000Z';
const task8AnnualRenewalAt = '2028-01-10T12:00:00.000Z';
const task8MonthlyRenewalAt = '2027-02-10T12:00:00.000Z';

type Task8CompletionEvidence =
  | {
      kind: 'commercial';
      source:
        | 'managed-domain'
        | 'managed-mailbox'
        | 'managed-warmup'
        | 'prewarmed';
      resource: string;
      acquisitionOperation: Extract<
        ManagedEmailDesignAcquisitionOperation,
        { id: string }
      >;
    }
  | {
      kind: 'external-domain';
      domain: {
        id: string;
        name: string;
      };
      dnsLifecycle: ManagedEmailDesignDnsLifecycle;
    };

type Task8FutureStoryArgs = {
  initialReviewDraft?: ManagedEmailDesignReviewDraft | null;
  initialReviewQuote?: ManagedEmailDesignQuote | null;
  initialRefreshedQuote?: ManagedEmailDesignQuote | null;
  initialAcquisitionOperation?: ManagedEmailDesignAcquisitionOperation;
  initialAcquisitionResolution?: ManagedEmailDesignCapacityResolution;
  initialCompletionEvidence?: Task8CompletionEvidence | null;
};

const withTask8StoryArgs = <
  T extends Partial<ManagedEmailDesignPageProps> & Task8FutureStoryArgs,
>(
  args: T,
) => args;

const getTask8QuoteTotals = (lines: ManagedEmailDesignQuoteLine[]) => {
  let dueTodayCents = 0;
  let monthlyRecurringCents = 0;
  let annualRecurringCents = 0;

  for (const line of lines) {
    dueTodayCents += line.amountCents;
    if (line.cadence === 'monthly') {
      monthlyRecurringCents += line.amountCents;
    } else {
      annualRecurringCents += line.amountCents;
    }
  }

  return {
    dueTodayCents,
    monthlyRecurringCents,
    annualRecurringCents,
  };
};

const createTask8Quote = ({
  id,
  lines,
  expiresAt = task8QuoteExpiresAt,
  accepted = false,
  status = 'valid',
  capacityRequest,
}: {
  id: string;
  lines: ManagedEmailDesignQuoteLine[];
  expiresAt?: string;
  accepted?: boolean;
  status?: 'valid' | 'expired';
  capacityRequest?: ManagedEmailDesignQuote['capacityRequest'];
}): ManagedEmailDesignQuote => {
  const quote = {
    id,
    expiresAt,
    acceptedQuoteId: accepted ? id : null,
    lines,
    totals: getTask8QuoteTotals(lines),
    ...(capacityRequest === undefined ? {} : { capacityRequest }),
  };

  return createManagedEmailDesignQuote({
    fixtureNow: task8FixtureNow,
    quote:
      status === 'expired'
        ? { ...quote, status: 'expired' }
        : { ...quote, status: 'valid' },
  });
};

const createTask8RepricedQuote = ({
  id,
  lines,
  previousQuote,
  expiresAt = task8QuoteExpiresAt,
}: {
  id: string;
  lines: ManagedEmailDesignQuoteLine[];
  previousQuote: ManagedEmailDesignQuoteSnapshot;
  expiresAt?: string;
}): ManagedEmailDesignQuote =>
  createManagedEmailDesignQuote({
    fixtureNow: task8FixtureNow,
    quote: {
      id,
      expiresAt,
      acceptedQuoteId: null,
      lines,
      totals: getTask8QuoteTotals(lines),
      status: 'price-changed',
      previousQuote,
    },
  });

const acceptTask8Quote = (
  quote: ManagedEmailDesignQuote,
): ManagedEmailDesignQuote => {
  if (quote.status !== 'valid') {
    throw new Error('Only a current valid quote can be accepted.');
  }

  return createManagedEmailDesignQuote({
    fixtureNow: task8FixtureNow,
    quote: {
      ...quote,
      acceptedQuoteId: quote.id,
    },
  });
};

const createTask8DomainQuoteLine = ({
  id,
  resourceLabel,
  unitPriceCents = managedEmailDesignPricing.managedDomainAnnualCents,
  startsAt = task8FixtureNow,
  renewsAt = task8AnnualRenewalAt,
}: {
  id: string;
  resourceLabel: string;
  unitPriceCents?: number;
  startsAt?: string;
  renewsAt?: string;
}): ManagedEmailDesignQuoteLine => ({
  id,
  resourceLabel,
  unitPriceCents,
  amountCents: unitPriceCents,
  startsAt,
  renewsAt,
  product: 'managed-domain',
  cadence: 'annual',
  quantity: 1,
});

const createTask8MailboxQuoteLine = ({
  id,
  resourceLabel,
  quantity = 1,
  unitPriceCents = managedEmailDesignPricing.managedMailboxMonthlyCents,
  startsAt = task8FixtureNow,
  renewsAt = task8MonthlyRenewalAt,
}: {
  id: string;
  resourceLabel: string;
  quantity?: number;
  unitPriceCents?: number;
  startsAt?: string;
  renewsAt?: string;
}): ManagedEmailDesignQuoteLine => ({
  id,
  resourceLabel,
  unitPriceCents,
  amountCents: unitPriceCents * quantity,
  startsAt,
  renewsAt,
  product: 'managed-mailbox',
  cadence: 'monthly',
  quantity,
});

type Task8AcquisitionGraph = Omit<
  Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>,
  'status'
>;

const createTask8Acquisition = ({
  quote,
  resourceSnapshots,
  graph,
}: {
  quote: ManagedEmailDesignQuote;
  resourceSnapshots: ManagedEmailDesignResourceSnapshot[];
  graph: Task8AcquisitionGraph;
}): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> => {
  const pendingOperation: Extract<
    ManagedEmailDesignAcquisitionOperation,
    { id: string }
  > = {
    ...graph,
    status: 'pending',
  };
  const status = getManagedEmailDesignAcquisitionStatus(pendingOperation);

  if (status === 'idle') {
    throw new Error('A Task 8 acquisition graph must be non-idle.');
  }

  const operation: Extract<
    ManagedEmailDesignAcquisitionOperation,
    { id: string }
  > = {
    ...pendingOperation,
    status,
  };

  const acquisition = createManagedEmailDesignAcquisitionOperation({
    operation,
    quote,
    resourceSnapshots,
    fixtureNow: task8FixtureNow,
  });

  if (acquisition.status === 'idle') {
    throw new Error('A Task 8 acquisition builder returned an idle operation.');
  }

  return acquisition;
};

type Task8PaymentOutcome = ManagedEmailDesignAcquisitionLine['paymentOutcome'];
type Task8SettledSubscriptionOutcome = Exclude<
  ManagedEmailDesignAcquisitionSubscriptionOperation['outcome'],
  'blocked'
>;
type Task8SettledResourceOutcome = Exclude<
  ManagedEmailDesignAcquisitionLine['resourceOutcome'],
  'blocked'
>;

const createTask8SingleLineAcquisition = ({
  id,
  source,
  quote,
  intent,
  resourceSnapshot,
  paymentOutcome = 'completed',
  settledSubscriptionOutcome = 'completed',
  settledResourceOutcome = 'completed',
}: {
  id: string;
  source: 'managed-domain' | 'managed-mailbox' | 'managed-warmup';
  quote: ManagedEmailDesignQuote;
  intent: ManagedEmailDesignSubscriptionIntent;
  resourceSnapshot: ManagedEmailDesignResourceSnapshot;
  paymentOutcome?: Task8PaymentOutcome;
  settledSubscriptionOutcome?: Task8SettledSubscriptionOutcome;
  settledResourceOutcome?: Task8SettledResourceOutcome;
}): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> => {
  const quoteLine = quote.lines[0];

  if (!quoteLine || quote.lines.length !== 1) {
    throw new Error(
      'A single-line Task 8 acquisition requires one quote line.',
    );
  }

  const subscriptionOutcome =
    paymentOutcome === 'completed' ? settledSubscriptionOutcome : 'blocked';
  const resourceOutcome =
    paymentOutcome === 'completed' && subscriptionOutcome === 'completed'
      ? settledResourceOutcome
      : 'blocked';
  const subscriptionOperationId = `subscription-operation-${id}`;

  return createTask8Acquisition({
    quote,
    resourceSnapshots: [resourceSnapshot],
    graph: {
      id,
      acceptedQuoteId: quote.id,
      source,
      lines: [
        {
          id: `acquisition-line-${id}`,
          quoteLineId: quoteLine.id,
          resourceSnapshotId: resourceSnapshot.id,
          dependsOnLineIds: [],
          resourceOperationId: `resource-operation-${id}`,
          subscriptionOperationId,
          paymentEvidenceId: `payment-evidence-${id}`,
          paymentOutcome,
          resourceOutcome,
        },
      ],
      subscriptionOperations: [
        {
          id: subscriptionOperationId,
          intent,
          outcome: subscriptionOutcome,
        },
      ],
    },
  });
};

const getTask8PrewarmedResources = (
  bundle: ManagedEmailDesignPrewarmedBundle,
) => ({
  domain: {
    id: `${bundle.id}-domain`,
    kind: 'domain' as const,
    label: bundle.domain,
  },
  mailboxes: bundle.mailboxIdentities.map(({ identity, address }) => ({
    id: `${bundle.id}-mailbox-${address.toLowerCase()}`,
    kind: 'mailbox' as const,
    label: `${identity} <${address.toLowerCase()}>`,
  })),
});

const createTask8PrewarmedQuote = ({
  id,
  bundle,
  accepted = false,
}: {
  id: string;
  bundle: ManagedEmailDesignPrewarmedBundle;
  accepted?: boolean;
}): ManagedEmailDesignQuote => {
  const resources = getTask8PrewarmedResources(bundle);

  return createTask8Quote({
    id,
    accepted,
    lines: [
      createTask8DomainQuoteLine({
        id: `${id}-domain`,
        resourceLabel: resources.domain.label,
      }),
      ...resources.mailboxes.map((mailbox) =>
        createTask8MailboxQuoteLine({
          id: `${id}-${mailbox.id}`,
          resourceLabel: mailbox.label,
        }),
      ),
    ],
  });
};

const createTask8PrewarmedAcquisition = ({
  id,
  quote,
  bundle,
  domainPaymentOutcome = 'completed',
  domainSettledResourceOutcome = 'completed',
  mailboxPaymentOutcomes = [],
  mailboxSettledSubscriptionOutcome = 'completed',
  mailboxPoolMode = 'increment-existing',
}: {
  id: string;
  quote: ManagedEmailDesignQuote;
  bundle: ManagedEmailDesignPrewarmedBundle;
  domainPaymentOutcome?: Task8PaymentOutcome;
  domainSettledResourceOutcome?: Task8SettledResourceOutcome;
  mailboxPaymentOutcomes?: Task8PaymentOutcome[];
  mailboxSettledSubscriptionOutcome?: Task8SettledSubscriptionOutcome;
  mailboxPoolMode?: 'create' | 'increment-existing';
}): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> => {
  const resources = getTask8PrewarmedResources(bundle);
  const domainQuoteLine = quote.lines.find(
    (line) => line.product === 'managed-domain',
  );
  const mailboxQuoteLines = quote.lines.filter(
    (line) => line.product === 'managed-mailbox',
  );

  if (
    !domainQuoteLine ||
    resources.mailboxes.length === 0 ||
    mailboxQuoteLines.length !== resources.mailboxes.length
  ) {
    throw new Error(
      'A Task 8 prewarmed acquisition requires one domain and each mailbox quote line.',
    );
  }

  const domainLineId = `acquisition-line-${id}-domain`;
  const domainSubscriptionOperationId = `subscription-operation-${id}-domain`;
  const mailboxSubscriptionOperationId = `subscription-operation-${id}-mailbox`;
  const domainSubscriptionOutcome =
    domainPaymentOutcome === 'completed' ? 'completed' : 'blocked';
  const domainResourceOutcome =
    domainPaymentOutcome === 'completed' &&
    domainSubscriptionOutcome === 'completed'
      ? domainSettledResourceOutcome
      : 'blocked';
  const mailboxPayments = resources.mailboxes.map(
    (_, index) => mailboxPaymentOutcomes[index] ?? 'completed',
  );
  const mailboxSubscriptionOutcome = mailboxPayments.every(
    (outcome) => outcome === 'completed',
  )
    ? mailboxSettledSubscriptionOutcome
    : 'blocked';
  const mailboxSnapshotIds = resources.mailboxes.map(
    ({ id: snapshotId }) => snapshotId,
  ) as [string, ...string[]];

  return createTask8Acquisition({
    quote,
    resourceSnapshots: [resources.domain, ...resources.mailboxes],
    graph: {
      id,
      acceptedQuoteId: quote.id,
      source: 'prewarmed',
      lines: [
        {
          id: domainLineId,
          quoteLineId: domainQuoteLine.id,
          resourceSnapshotId: resources.domain.id,
          dependsOnLineIds: [],
          resourceOperationId: `resource-operation-${id}-domain`,
          subscriptionOperationId: domainSubscriptionOperationId,
          paymentEvidenceId: `payment-evidence-${id}-domain`,
          paymentOutcome: domainPaymentOutcome,
          resourceOutcome: domainResourceOutcome,
        },
        ...mailboxQuoteLines.map(
          (quoteLine, index): ManagedEmailDesignAcquisitionLine => {
            const paymentOutcome = mailboxPayments[index] ?? 'completed';
            const resourceOutcome =
              paymentOutcome === 'completed' &&
              mailboxSubscriptionOutcome === 'completed' &&
              domainResourceOutcome === 'completed'
                ? 'completed'
                : 'blocked';

            return {
              id: `acquisition-line-${id}-mailbox-${index + 1}`,
              quoteLineId: quoteLine.id,
              resourceSnapshotId: resources.mailboxes[index].id,
              dependsOnLineIds: [domainLineId],
              resourceOperationId: `resource-operation-${id}-mailbox-${index + 1}`,
              subscriptionOperationId: mailboxSubscriptionOperationId,
              paymentEvidenceId: `payment-evidence-${id}-mailbox-${index + 1}`,
              paymentOutcome,
              resourceOutcome,
            };
          },
        ),
      ],
      subscriptionOperations: [
        {
          id: domainSubscriptionOperationId,
          intent: {
            product: 'managed-domain',
            mode: 'create',
            targetSubscriptionId: `subscription-${id}-domain`,
            quantityDelta: 1,
            resourceSnapshotIds: [resources.domain.id],
          },
          outcome: domainSubscriptionOutcome,
        },
        {
          id: mailboxSubscriptionOperationId,
          intent: {
            product: 'managed-mailbox',
            mode: mailboxPoolMode,
            targetSubscriptionId:
              mailboxPoolMode === 'create'
                ? `subscription-${id}-mailbox`
                : 'subscription-managed-mailbox',
            quantityDelta: resources.mailboxes.length,
            resourceSnapshotIds: mailboxSnapshotIds,
          },
          outcome: mailboxSubscriptionOutcome,
        },
      ],
    },
  });
};

type Task8ReadyCapacityResolution = Extract<
  ManagedEmailDesignCapacityResolution,
  { quote: ManagedEmailDesignQuote }
>;

const requireTask8CapacityResolution = (
  resolution: ManagedEmailDesignCapacityResolution,
): Task8ReadyCapacityResolution => {
  if (resolution.status === 'blocked') {
    throw new Error(
      `Task 8 capacity fixture is blocked: ${resolution.reason}.`,
    );
  }

  return resolution;
};

const acceptTask8CapacityResolution = (
  resolution: Task8ReadyCapacityResolution,
): Task8ReadyCapacityResolution => ({
  ...resolution,
  quote: acceptTask8Quote(resolution.quote),
});
type Task8AcceptedCapacityResolution = Task8ReadyCapacityResolution & {
  status: 'ready';
  subscription: ManagedEmailDesignRecurringSubscription;
};

const requireTask8AcceptedCapacityResolution = (
  resolution: ManagedEmailDesignCapacityResolution,
): Task8AcceptedCapacityResolution => {
  if (resolution.status === 'ready') {
    if (
      resolution.subscription !== undefined &&
      resolution.quote.acceptedQuoteId === resolution.quote.id
    ) {
      return {
        ...resolution,
        status: 'ready',
        subscription: resolution.subscription,
      };
    }
  }

  throw new Error(
    'Task 8 capacity fixture must retain an accepted quote and subscription.',
  );
};

const createTask8SucceededWarmupCapacityAcquisition = (
  resolution: Task8AcceptedCapacityResolution,
): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> => {
  const primarySnapshotId = resolution.intent.resourceSnapshotIds[0];

  if (primarySnapshotId === undefined) {
    throw new Error(
      'A Task 8 warmup-capacity acquisition requires a resource snapshot.',
    );
  }

  const operationId = `acquisition-${resolution.quote.id}`;
  const subscriptionOperationId = `subscription-operation-${operationId}-managed-warmup`;

  return createTask8Acquisition({
    quote: resolution.quote,
    resourceSnapshots: resolution.subscription.linkedResources,
    graph: {
      id: operationId,
      acceptedQuoteId: resolution.quote.id,
      source: 'managed-warmup',
      lines: resolution.quote.lines.map((quoteLine) => ({
        id: `acquisition-line-${operationId}-${quoteLine.id}`,
        quoteLineId: quoteLine.id,
        resourceSnapshotId: primarySnapshotId,
        dependsOnLineIds: [],
        resourceOperationId: `resource-operation-${operationId}-${quoteLine.id}`,
        subscriptionOperationId,
        paymentEvidenceId: `payment-evidence-${operationId}-${quoteLine.id}`,
        paymentOutcome: 'completed',
        resourceOutcome: 'completed',
      })),
      subscriptionOperations: [
        {
          id: subscriptionOperationId,
          intent: resolution.intent,
          outcome: 'completed',
        },
      ],
    },
  });
};
const createTask8SucceededWarmupCapacityFixture = ({
  mailboxes,
  subscriptions,
  requestedQuantity,
  targetSubscriptionId,
}: {
  mailboxes: ManagedEmailDesignMailbox[];
  subscriptions: ManagedEmailDesignRecurringSubscription[];
  requestedQuantity: number;
  targetSubscriptionId: string;
}) => {
  const proposal = requireTask8CapacityResolution(
    resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId: 'workspace-managed-email-design',
      subscriptions,
      mailboxes,
      requestedQuantity,
      targetSubscriptionId,
      fixtureNow: task8FixtureNow,
    }),
  );
  const resolution = requireTask8AcceptedCapacityResolution(
    resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId: 'workspace-managed-email-design',
      subscriptions,
      mailboxes,
      requestedQuantity,
      targetSubscriptionId,
      fixtureNow: task8FixtureNow,
      quote: acceptTask8Quote(proposal.quote),
    }),
  );

  return {
    resolution,
    operation: createTask8SucceededWarmupCapacityAcquisition(resolution),
  };
};
const createTask8CommercialCompletionFixture = ({
  id,
  paymentOutcome = 'completed',
  settledResourceOutcome = 'completed',
}: {
  id: string;
  paymentOutcome?: Task8PaymentOutcome;
  settledResourceOutcome?: Task8SettledResourceOutcome;
}) => {
  const resource = `completion-${id}.test`;
  const quote = createTask8Quote({
    id: `quote-${id}`,
    accepted: true,
    lines: [
      createTask8DomainQuoteLine({
        id: `quote-line-${id}`,
        resourceLabel: resource,
      }),
    ],
  });
  const operation = createTask8SingleLineAcquisition({
    id: `acquisition-${id}`,
    source: 'managed-domain',
    quote,
    intent: {
      product: 'managed-domain',
      mode: 'create',
      targetSubscriptionId: `subscription-${id}`,
      quantityDelta: 1,
      resourceSnapshotIds: [`domain-${id}`],
    },
    resourceSnapshot: {
      id: `domain-${id}`,
      kind: 'domain',
      label: resource,
    },
    paymentOutcome,
    settledResourceOutcome,
  });

  return { operation, quote, resource };
};

const task8CommercialEvidenceOutputLabels = [
  'Acquisition operation ID',
  'Acquisition operation status',
  'Accepted quote ID',
  'Acquisition line IDs',
  'Quote line IDs',
  'Dependency edge IDs',
  'Resource operation IDs',
  'Payment evidence IDs',
  'Subscription operation IDs',
  'Target subscription IDs',
  'Resource snapshot IDs',
  'Recorded local charge count',
] as const;

type Task8AcquisitionIdentityProjection = {
  acquisitionOperationId: string;
  acceptedQuoteId: string;
  acquisitionLineIds: string;
  quoteLineIds: string;
  dependencyEdgeIds: string;
  resourceOperationIds: string;
  paymentEvidenceIds: string;
  subscriptionOperationIds: string;
  targetSubscriptionIds: string;
  resourceSnapshotIds: string;
};

const formatTask8AcquisitionIdentityIds = (ids: string[]) =>
  ids.join(', ') || 'None';

const readTask8AcquisitionIdentityProjection = (
  canvasElement: HTMLElement,
): Task8AcquisitionIdentityProjection => ({
  acquisitionOperationId: readStoryOutput({
    canvasElement,
    label: 'Acquisition operation ID',
  }),
  acceptedQuoteId: readStoryOutput({
    canvasElement,
    label: 'Accepted quote ID',
  }),
  acquisitionLineIds: readStoryOutput({
    canvasElement,
    label: 'Acquisition line IDs',
  }),
  quoteLineIds: readStoryOutput({
    canvasElement,
    label: 'Quote line IDs',
  }),
  dependencyEdgeIds: readStoryOutput({
    canvasElement,
    label: 'Dependency edge IDs',
  }),
  resourceOperationIds: readStoryOutput({
    canvasElement,
    label: 'Resource operation IDs',
  }),
  paymentEvidenceIds: readStoryOutput({
    canvasElement,
    label: 'Payment evidence IDs',
  }),
  subscriptionOperationIds: readStoryOutput({
    canvasElement,
    label: 'Subscription operation IDs',
  }),
  targetSubscriptionIds: readStoryOutput({
    canvasElement,
    label: 'Target subscription IDs',
  }),
  resourceSnapshotIds: readStoryOutput({
    canvasElement,
    label: 'Resource snapshot IDs',
  }),
});

const expectTask8AcquisitionIdentityProjection = ({
  canvasElement,
  operation,
}: {
  canvasElement: HTMLElement;
  operation: Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;
}) => {
  const projection = readTask8AcquisitionIdentityProjection(canvasElement);

  expect(projection).toEqual({
    acquisitionOperationId: operation.id,
    acceptedQuoteId: operation.acceptedQuoteId,
    acquisitionLineIds: formatTask8AcquisitionIdentityIds(
      operation.lines.map((line) => line.id),
    ),
    quoteLineIds: formatTask8AcquisitionIdentityIds(
      operation.lines.map((line) => line.quoteLineId),
    ),
    dependencyEdgeIds: formatTask8AcquisitionIdentityIds(
      operation.lines.flatMap((line) =>
        line.dependsOnLineIds.map(
          (dependencyLineId) => `${line.id} -> ${dependencyLineId}`,
        ),
      ),
    ),
    resourceOperationIds: formatTask8AcquisitionIdentityIds(
      operation.lines.map((line) => line.resourceOperationId),
    ),
    paymentEvidenceIds: formatTask8AcquisitionIdentityIds(
      operation.lines.map((line) => line.paymentEvidenceId),
    ),
    subscriptionOperationIds: formatTask8AcquisitionIdentityIds(
      operation.subscriptionOperations.map((operation) => operation.id),
    ),
    targetSubscriptionIds: formatTask8AcquisitionIdentityIds(
      operation.subscriptionOperations.map(
        (operation) => operation.intent.targetSubscriptionId,
      ),
    ),
    resourceSnapshotIds: formatTask8AcquisitionIdentityIds(
      operation.subscriptionOperations.flatMap(
        (operation) => operation.intent.resourceSnapshotIds,
      ),
    ),
  });

  return projection;
};
const expectTask8NoCommercialCompletionEvidence = (
  canvasElement: HTMLElement,
) => {
  const canvas = within(canvasElement);

  for (const label of task8CommercialEvidenceOutputLabels) {
    expect(canvas.queryByLabelText(label)).not.toBeInTheDocument();
  }
  expect(canvas.queryByText(/Purchase reference:/)).not.toBeInTheDocument();
  expect(canvas.queryByText(/Quote reference:/)).not.toBeInTheDocument();
  expect(canvas.queryByText(/Subscription reference:/)).not.toBeInTheDocument();
};

const expectTask8CommercialCompletionToFailClosed = async ({
  canvasElement,
  heading,
  source,
  resource,
}: {
  canvasElement: HTMLElement;
  heading: string;
  source: string;
  resource?: string;
}) => {
  const canvas = within(canvasElement);

  expect(
    await canvas.findByRole('heading', { name: 'Completion unavailable' }),
  ).toBeVisible();
  expect(
    canvas.getByText(
      'No local resource was recorded from this completion evidence.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    canvas.queryByRole('heading', { name: heading }),
  ).not.toBeInTheDocument();
  expect(canvas.queryByText(source, { exact: true })).not.toBeInTheDocument();
  if (resource !== undefined) {
    expect(
      canvas.queryByText(`Resource: ${resource}`, { exact: true }),
    ).not.toBeInTheDocument();
  }
  expectTask8NoCommercialCompletionEvidence(canvasElement);
};

const expectTask8SucceededWarmupCapacityModalCompletion = async ({
  canvasElement,
  operation,
}: {
  canvasElement: HTMLElement;
  operation: Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;
}) => {
  const canvas = within(canvasElement);

  expect(operation.status).toBe('succeeded');
  expect(
    await canvas.findByRole('heading', { name: 'Warmup capacity added' }),
  ).toBeVisible();
  expect(
    canvas.getByText('Source: Managed warmup capacity', { exact: true }),
  ).toBeVisible();
  expect(
    canvas.getByText(`Quote reference: ${operation.acceptedQuoteId}`, {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    canvas.getByText(`Purchase reference: ${operation.id}`, { exact: true }),
  ).toBeVisible();
  for (const subscriptionOperation of operation.subscriptionOperations) {
    expect(
      canvas.getByText(
        `Subscription reference: ${subscriptionOperation.intent.targetSubscriptionId}`,
        { exact: true },
      ),
    ).toBeVisible();
  }
};
const expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard = async ({
  canvasElement,
  operation,
}: {
  canvasElement: HTMLElement;
  operation: Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;
}) => {
  await expectTask8SucceededWarmupCapacityModalCompletion({
    canvasElement,
    operation,
  });

  const canvas = within(canvasElement);
  await pressFocusedButton(
    canvas.getByRole('button', { name: 'Return to dashboard' }),
  );
  expect(
    await canvas.findByRole('heading', { name: 'Managed email resources' }),
  ).toBeVisible();
};
const expectTask8WarmupSubscriptionResourceLinks = ({
  panel,
  resolution,
}: {
  panel: HTMLElement;
  resolution: Task8AcceptedCapacityResolution;
}) => {
  const subscriptionId = resolution.intent.targetSubscriptionId;
  const resources = within(panel).getByLabelText(
    `Subscription resource snapshots for ${subscriptionId}`,
  );

  expect(resources.children).toHaveLength(
    resolution.subscription.linkedResources.length,
  );
  for (const resource of resolution.subscription.linkedResources) {
    expect(
      within(resources).getByText(resource.label, { exact: true }),
    ).toBeVisible();
  }
};

const expectTask8MailboxPoolIdentityProjection = ({
  canvasElement,
  quoteId,
  quoteLineIds,
  targetSubscriptionId,
  resourceSnapshotIds,
}: {
  canvasElement: HTMLElement;
  quoteId: string;
  quoteLineIds: string[];
  targetSubscriptionId: string;
  resourceSnapshotIds: string[];
}) => {
  const projection = readTask8AcquisitionIdentityProjection(canvasElement);
  const acquisitionOperationId = `acquisition-${quoteId}`;

  expect(projection).toEqual({
    acquisitionOperationId,
    acceptedQuoteId: quoteId,
    acquisitionLineIds: formatTask8AcquisitionIdentityIds(
      quoteLineIds.map(
        (quoteLineId) =>
          `acquisition-line-${acquisitionOperationId}-${quoteLineId}`,
      ),
    ),
    quoteLineIds: formatTask8AcquisitionIdentityIds(quoteLineIds),
    dependencyEdgeIds: 'None',
    resourceOperationIds: formatTask8AcquisitionIdentityIds(
      quoteLineIds.map(
        (quoteLineId) =>
          `resource-operation-${acquisitionOperationId}-${quoteLineId}`,
      ),
    ),
    paymentEvidenceIds: formatTask8AcquisitionIdentityIds(
      quoteLineIds.map(
        (quoteLineId) =>
          `payment-evidence-${acquisitionOperationId}-${quoteLineId}`,
      ),
    ),
    subscriptionOperationIds: `subscription-operation-${acquisitionOperationId}-managed-mailbox`,
    targetSubscriptionIds: targetSubscriptionId,
    resourceSnapshotIds: formatTask8AcquisitionIdentityIds(resourceSnapshotIds),
  });

  return projection;
};

type Task8ReviewChargeRow = {
  service: string;
  resource: string;
  cadence: string;
  unitPrice: string;
  quantity: string;
  amount: string;
};

const formatTask8ReviewDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));

const expectTask8ReviewCharges = async ({
  canvasElement,
  rows,
  dueToday,
  annualRenewal,
  monthlyRenewal,
}: {
  canvasElement: HTMLElement;
  rows: Task8ReviewChargeRow[];
  dueToday: string;
  annualRenewal?: {
    amount: string;
    date: string;
    effectiveDate?: string;
  };
  monthlyRenewal?: {
    amount: string;
    date: string;
    effectiveDate?: string;
  };
}) => {
  const canvas = within(canvasElement);
  const charges = await canvas.findByRole('table', {
    name: 'Charges included in this purchase review',
  });

  expect(
    within(charges)
      .getAllByRole('columnheader')
      .map(({ textContent }) => textContent?.trim()),
  ).toEqual([
    'Service',
    'Resource',
    'Cadence',
    'Unit price',
    'Quantity',
    'Amount',
  ]);
  const rowgroup = within(charges).getByRole('rowgroup');
  const dataRows = within(rowgroup).getAllByRole('row');
  expect(dataRows).toHaveLength(rows.length);
  for (const [index, expectedRow] of rows.entries()) {
    const cells = within(dataRows[index]!).getAllByRole('cell');

    expect(cells).toHaveLength(6);
    expect(cells.map((cell) => cell.textContent?.trim() ?? '')).toEqual([
      expectedRow.service,
      expectedRow.resource,
      expectedRow.cadence,
      expectedRow.unitPrice,
      expectedRow.quantity,
      expectedRow.amount,
    ]);
  }
  expect(
    canvas.getByText(`Due today: ${dueToday}`, { exact: true }),
  ).toBeVisible();
  if (annualRenewal) {
    if (annualRenewal.effectiveDate !== undefined) {
      expect(
        canvas.getByText(
          `Annual effective date: ${formatTask8ReviewDate(annualRenewal.effectiveDate)}`,
          { exact: true },
        ),
      ).toBeVisible();
    }
    expect(
      canvas.getByText(
        `Renews annually: ${annualRenewal.amount} on ${formatTask8ReviewDate(annualRenewal.date)}`,
        { exact: true },
      ),
    ).toBeVisible();
  } else {
    expect(canvas.queryByText(/^Renews annually:/)).not.toBeInTheDocument();
  }
  if (monthlyRenewal) {
    if (monthlyRenewal.effectiveDate !== undefined) {
      expect(
        canvas.getByText(
          `Monthly effective date: ${formatTask8ReviewDate(monthlyRenewal.effectiveDate)}`,
          { exact: true },
        ),
      ).toBeVisible();
    }
    expect(
      canvas.getByText(
        `Renews monthly: ${monthlyRenewal.amount} on ${formatTask8ReviewDate(monthlyRenewal.date)}`,
        { exact: true },
      ),
    ).toBeVisible();
  } else {
    expect(canvas.queryByText(/^Renews monthly:/)).not.toBeInTheDocument();
  }
  expect(canvas.queryByText('AI prepaid balance')).not.toBeInTheDocument();
};

const getTask8QuoteCadenceDates = ({
  quote,
  cadence,
}: {
  quote: ManagedEmailDesignQuote;
  cadence: 'annual' | 'monthly';
}) => {
  const lines = quote.lines.filter((line) => line.cadence === cadence);
  const [firstLine] = lines;

  if (
    firstLine === undefined ||
    lines.some(
      (line) =>
        line.startsAt !== firstLine.startsAt ||
        line.renewsAt !== firstLine.renewsAt,
    )
  ) {
    throw new Error(
      `Expected Task 8 ${cadence} quote lines with matching effective and renewal dates.`,
    );
  }

  return {
    startsAt: firstLine.startsAt,
    renewsAt: firstLine.renewsAt,
  };
};

const task8ReviewDomainName = 'amaranth-mail.com';
const task8DomainReviewDraft = createManagedDomainReview(task8ReviewDomainName);
const task8ExpiredQuote = createTask8Quote({
  id: 'quote-task8-domain-expired-001',
  accepted: true,
  expiresAt: '2027-01-10T11:59:59.000Z',
  status: 'expired',
  lines: [
    createTask8DomainQuoteLine({
      id: 'quote-line-task8-domain-expired-001',
      resourceLabel: task8ReviewDomainName,
    }),
  ],
});
const task8RefreshedDomainQuote = createTask8Quote({
  id: 'quote-task8-domain-refreshed-001',
  lines: [
    createTask8DomainQuoteLine({
      id: 'quote-line-task8-domain-refreshed-001',
      resourceLabel: task8ReviewDomainName,
    }),
  ],
});
const task8PreviousPriceQuote = createTask8Quote({
  id: 'quote-task8-domain-price-before-001',
  accepted: true,
  lines: [
    createTask8DomainQuoteLine({
      id: 'quote-line-task8-domain-price-before-001',
      resourceLabel: task8ReviewDomainName,
    }),
  ],
});
const task8PriceChangedQuote = createTask8RepricedQuote({
  id: 'quote-task8-domain-price-after-001',
  previousQuote: {
    id: task8PreviousPriceQuote.id,
    lines: task8PreviousPriceQuote.lines,
    totals: task8PreviousPriceQuote.totals,
  },
  lines: [
    createTask8DomainQuoteLine({
      id: 'quote-line-task8-domain-price-after-001',
      resourceLabel: task8ReviewDomainName,
      unitPriceCents: 1599,
    }),
  ],
});
const task8RefreshedPriceQuote = createTask8Quote({
  id: 'quote-task8-domain-price-refreshed-001',
  lines: task8PriceChangedQuote.lines,
});
const task8PaymentFailureQuote = createTask8Quote({
  id: 'quote-task8-domain-payment-failure-001',
  accepted: true,
  lines: [
    createTask8DomainQuoteLine({
      id: 'quote-line-task8-domain-payment-failure-001',
      resourceLabel: task8ReviewDomainName,
    }),
  ],
});

const task8MailboxReviewAddress = 'maren@amaranth-mail.com';
const task8MailboxReviewDraft = createManagedMailboxReview({
  address: task8MailboxReviewAddress,
  domain: task8ReviewDomainName,
});
const task8PaymentAmbiguousQuote = createTask8Quote({
  id: 'quote-task8-mailbox-payment-ambiguous-001',
  accepted: true,
  lines: [
    createTask8MailboxQuoteLine({
      id: 'quote-line-task8-mailbox-payment-ambiguous-001',
      resourceLabel: task8MailboxReviewAddress,
    }),
  ],
});

const task8PrewarmedBundle = (() => {
  const bundle = mixedWorkspace.prewarmedBundles.find(
    ({ id }) => id === 'prewarmed-harborline-01',
  );

  if (!bundle) {
    throw new Error('Expected the harborline Storybook prewarmed bundle.');
  }

  return bundle;
})();
const task8PrewarmedCapacityResolution = (() => {
  const targetSubscription = mixedWorkspace.subscriptions.find(
    (subscription) =>
      subscription.product === 'managed-mailbox' &&
      subscription.status !== 'canceled',
  );
  if (targetSubscription === undefined) {
    throw new Error(
      'Expected the mixed Storybook workspace to have an active mailbox pool.',
    );
  }

  const selectedMailboxes = task8PrewarmedBundle.mailboxIdentities.map(
    (mailbox) =>
      createManagedEmailDesignMailbox({
        id: `story-mailbox-${normalizeManagedEmailDesignMailboxAddress(
          mailbox.address,
        )}`,
        identity: mailbox.identity,
        address: mailbox.address,
        domain: task8PrewarmedBundle.domain,
        source: 'prewarmed',
        subscriptionId: targetSubscription.id,
        warmupState: {
          assignment: 'unassigned',
          lastConfirmedProviderState: 'inactive',
          operation: { status: 'idle' },
        },
      }),
  );
  const resolutionInput = {
    workspaceId: 'workspace-managed-email-design',
    subscriptions: mixedWorkspace.subscriptions,
    mailboxes: mixedWorkspace.mailboxes,
    selectedMailboxes,
    targetSubscriptionId: targetSubscription.id,
    fixtureNow: task8FixtureNow,
  };
  const proposedResolution = requireTask8CapacityResolution(
    resolveManagedEmailDesignMailboxPoolAcquisition(resolutionInput),
  );

  return requireTask8AcceptedCapacityResolution(
    resolveManagedEmailDesignMailboxPoolAcquisition({
      ...resolutionInput,
      quote: acceptTask8Quote(proposedResolution.quote),
    }),
  );
})();
const task8PrewarmedReviewDraft =
  createPrewarmedBundleReview(task8PrewarmedBundle);
const task8StockConflictQuote = createTask8PrewarmedQuote({
  id: 'quote-task8-prewarmed-stock-conflict-001',
  bundle: task8PrewarmedBundle,
  accepted: true,
});
const task8PartialPrewarmedQuote = createTask8PrewarmedQuote({
  id: 'quote-task8-prewarmed-partial-001',
  bundle: task8PrewarmedBundle,
  accepted: true,
});
const task8PartialPrewarmedOperation = createTask8PrewarmedAcquisition({
  id: 'acquisition-task8-prewarmed-partial-001',
  quote: task8PartialPrewarmedQuote,
  bundle: task8PrewarmedBundle,
  mailboxPaymentOutcomes: ['completed', 'failed'],
});
const task8PendingDomainPrewarmedOperation = createTask8PrewarmedAcquisition({
  id: 'acquisition-task8-prewarmed-domain-pending-001',
  quote: task8PartialPrewarmedQuote,
  bundle: task8PrewarmedBundle,
  domainSettledResourceOutcome: 'pending',
});
const task8CompletedPrewarmedQuote = createTask8PrewarmedQuote({
  id: 'quote-task8-prewarmed-completed-001',
  bundle: task8PrewarmedBundle,
  accepted: true,
});
const task8CompletedPrewarmedOperation = createTask8PrewarmedAcquisition({
  id: 'acquisition-task8-prewarmed-completed-001',
  quote: task8CompletedPrewarmedQuote,
  bundle: task8PrewarmedBundle,
});

const task8PoolExistingMailbox = createManagedEmailDesignMailbox({
  id: 'mailbox-task8-pool-existing-001',
  identity: 'Dara Moss',
  address: 'dara@amaranth-mail.com',
  domain: task8ReviewDomainName,
  source: 'managed',
  subscriptionId: 'subscription-task8-mailbox-pool-001',
  readiness: 'ready',
  warmupState: {
    assignment: 'unassigned',
    lastConfirmedProviderState: 'inactive',
    operation: { status: 'idle' },
  },
});
const task8PoolSelectedMailbox = createManagedEmailDesignMailbox({
  id: 'mailbox-task8-pool-covered-001',
  identity: 'Casey Reed',
  address: 'casey@amaranth-mail.com',
  domain: task8ReviewDomainName,
  source: 'managed',
  subscriptionId: null,
  readiness: 'not-ready',
  warmupState: {
    assignment: 'unassigned',
    lastConfirmedProviderState: 'inactive',
    operation: { status: 'idle' },
  },
});
const task8ActiveMailboxPool = createManagedEmailDesignRecurringSubscription({
  id: 'subscription-task8-mailbox-pool-001',
  workspaceId: 'workspace-managed-email-design',
  linkedResources: [
    {
      id: task8PoolExistingMailbox.id,
      kind: 'mailbox',
      label: `${task8PoolExistingMailbox.identity} <${task8PoolExistingMailbox.address}>`,
    },
  ],
  unitPriceCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
  product: 'managed-mailbox',
  cadence: 'monthly',
  quantity: 2,
  status: 'active',
  renewsAt: task8MonthlyRenewalAt,
});
const task8MailboxPoolWorkspace: ManagedEmailDesignWorkspace = {
  domains: [],
  mailboxes: [task8PoolExistingMailbox],
  prewarmedBundles: [],
  subscriptions: [task8ActiveMailboxPool],
};
const task8CoveredMailboxResolution = requireTask8CapacityResolution(
  resolveManagedEmailDesignMailboxPoolAcquisition({
    workspaceId: 'workspace-managed-email-design',
    subscriptions: [task8ActiveMailboxPool],
    mailboxes: [task8PoolExistingMailbox],
    selectedMailboxes: [task8PoolSelectedMailbox],
    targetSubscriptionId: task8ActiveMailboxPool.id,
    fixtureNow: task8FixtureNow,
  }),
);
const task8AcceptedCoveredMailboxResolution = acceptTask8CapacityResolution(
  task8CoveredMailboxResolution,
);

const task8WarmupTargetMailbox = createTask7Mailbox({
  id: 'mailbox-task8-warmup-target-001',
  identity: 'Rory Blake',
  address: 'rory@riveroak.io',
  source: 'connected',
});
const task8WarmupWorkspace = createTask7Workspace({
  mailboxes: [task8WarmupTargetMailbox],
  subscriptions: [],
});
const task8FirstWarmupResolution = requireTask8CapacityResolution(
  resolveManagedEmailDesignWarmupCapacityAcquisition({
    workspaceId: 'workspace-managed-email-design',
    subscriptions: [],
    mailboxes: [task8WarmupTargetMailbox],
    requestedQuantity: 1,
    targetSubscriptionId: 'subscription-task8-warmup-capacity-001',
    fixtureNow: task8FixtureNow,
  }),
);
const task8AcceptedFirstWarmupResolution = requireTask8CapacityResolution(
  resolveManagedEmailDesignWarmupCapacityAcquisition({
    workspaceId: 'workspace-managed-email-design',
    subscriptions: [],
    mailboxes: [task8WarmupTargetMailbox],
    requestedQuantity: 1,
    targetSubscriptionId: 'subscription-task8-warmup-capacity-001',
    fixtureNow: task8FixtureNow,
    quote: acceptTask8Quote(task8FirstWarmupResolution.quote),
  }),
);
const task8CompletionWarmupCapacityResolution =
  requireTask8AcceptedCapacityResolution(task8AcceptedFirstWarmupResolution);
const task8CompletionWarmupCapacityOperation =
  createTask8SucceededWarmupCapacityAcquisition(
    task8CompletionWarmupCapacityResolution,
  );
const task8CompletionWarmupCapacityWorkspace = createTask7Workspace({
  mailboxes: [task8WarmupTargetMailbox],
  subscriptions: [task8CompletionWarmupCapacityResolution.subscription],
});

const task8CompletionDomainName = 'cobalt-mail.com';
const task8CompletionDomainQuote = createTask8Quote({
  id: 'quote-task8-completion-domain-001',
  accepted: true,
  lines: [
    createTask8DomainQuoteLine({
      id: 'quote-line-task8-completion-domain-001',
      resourceLabel: task8CompletionDomainName,
    }),
  ],
});
const task8CompletionDomainOperation = createTask8SingleLineAcquisition({
  id: 'acquisition-task8-completion-domain-001',
  source: 'managed-domain',
  quote: task8CompletionDomainQuote,
  intent: {
    product: 'managed-domain',
    mode: 'create',
    targetSubscriptionId: 'subscription-task8-completion-domain-001',
    quantityDelta: 1,
    resourceSnapshotIds: ['domain-task8-completion-domain-001'],
  },
  resourceSnapshot: {
    id: 'domain-task8-completion-domain-001',
    kind: 'domain',
    label: task8CompletionDomainName,
  },
});
const task8CompletionMailboxAddress = 'maren@cobalt-mail.com';
const task8CompletionMailboxQuote = createTask8Quote({
  id: 'quote-task8-completion-mailbox-001',
  accepted: true,
  lines: [
    createTask8MailboxQuoteLine({
      id: 'quote-line-task8-completion-mailbox-001',
      resourceLabel: task8CompletionMailboxAddress,
    }),
  ],
});
const task8CompletionMailboxOperation = createTask8SingleLineAcquisition({
  id: 'acquisition-task8-completion-mailbox-001',
  source: 'managed-mailbox',
  quote: task8CompletionMailboxQuote,
  intent: {
    product: 'managed-mailbox',
    mode: 'create',
    targetSubscriptionId: 'subscription-task8-completion-mailbox-001',
    quantityDelta: 1,
    resourceSnapshotIds: ['mailbox-task8-completion-mailbox-001'],
  },
  resourceSnapshot: {
    id: 'mailbox-task8-completion-mailbox-001',
    kind: 'mailbox',
    label: task8CompletionMailboxAddress,
  },
});
const task8MalformedCompletionMailboxOperation: ManagedEmailDesignAcquisitionOperation =
  {
    ...task8CompletionMailboxOperation,
    subscriptionOperations: [],
  };
const task8CompletedExternalDnsLifecycle = {
  domain: {
    id: 'domain-task8-external-completion-001',
    name: normalizedExternalDnsStoryDomain,
  },
  purpose: 'verify',
  operation: {
    status: 'completed',
    operationId: 'dns-check-task8-external-completion-001',
    configuredOutcome: 'completed',
  },
  records: dnsRecordsCompleted,
} satisfies ManagedEmailDesignDnsLifecycle;

const task8IncompleteExternalDnsLifecycle = {
  ...task8CompletedExternalDnsLifecycle,
  operation: {
    ...task8CompletedExternalDnsLifecycle.operation,
    status: 'checking' as const,
  },
} satisfies ManagedEmailDesignDnsLifecycle;

const task8PooledCancellationSubscriptionId =
  'subscription-task8-pooled-cancellation-001';
const task8PooledCancellationMailboxes = [
  {
    ...createTask7Mailbox({
      id: 'mailbox-task8-cancel-managed-001',
      identity: 'Mira Chen',
      address: 'mira@northstar-outreach.com',
      domain: 'northstar-outreach.com',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    }),
    subscriptionId: task8PooledCancellationSubscriptionId,
  },
  {
    ...createTask7Mailbox({
      id: 'mailbox-task8-cancel-prewarmed-001',
      identity: 'Avery Miles',
      address: 'avery@fleetwave-mail.com',
      domain: 'fleetwave-mail.com',
      source: 'prewarmed',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    }),
    subscriptionId: task8PooledCancellationSubscriptionId,
  },
];
const task8PooledCancellationWorkspace = createTask7Workspace({
  mailboxes: task8PooledCancellationMailboxes,
  subscriptions: [
    createTask7MailboxSubscription({
      id: task8PooledCancellationSubscriptionId,
      quantity: 2,
      mailboxes: task8PooledCancellationMailboxes,
    }),
    createTask7WarmupSubscription({ quantity: 1 }),
  ],
});

const withPendingSubscriptionCancellation = ({
  workspace,
  subscriptionId,
  cancelAt,
}: {
  workspace: ManagedEmailDesignWorkspace;
  subscriptionId: string;
  cancelAt: string;
}): ManagedEmailDesignWorkspace => ({
  ...workspace,
  subscriptions: workspace.subscriptions.map((subscription) =>
    subscription.id === subscriptionId
      ? requestManagedEmailDesignSubscriptionCancellation({
          subscription,
          cancelAt,
        })
      : subscription,
  ),
});

const createManagedEmailViewport = (width: number, height: number) => ({
  viewport: {
    options: {
      managedEmailViewport: {
        name: `Managed email ${width} × ${height}`,
        styles: { width: `${width}px`, height: `${height}px` },
      },
    },
    defaultViewport: 'managedEmailViewport',
  },
});

const assertManagedEmailCurrentStep = ({
  canvasElement,
  label,
  position,
  setSize,
}: {
  canvasElement: HTMLElement;
  label: string;
  position: number;
  setSize: number;
}) => {
  const canvas = within(canvasElement);
  const expectedAccessibleName = `Step ${position} of ${setSize} ${label} current`;
  const currentStep = canvas.getByRole('listitem', {
    name: expectedAccessibleName,
  });

  expect(canvas.getAllByRole('listitem')).toHaveLength(setSize);
  expect(currentStep).toHaveAttribute('aria-current', 'step');
  expect(currentStep).toHaveAccessibleName(expectedAccessibleName);
};

const assertNoDocumentHorizontalOverflow = (canvasElement: HTMLElement) => {
  const managedEmailRegion = within(canvasElement).getByRole('region', {
    name: 'Managed email design',
  });
  const documentElement = canvasElement.ownerDocument.documentElement;

  expect(managedEmailRegion.scrollWidth).toBeLessThanOrEqual(
    managedEmailRegion.clientWidth,
  );
  expect(documentElement.scrollWidth).toBeLessThanOrEqual(
    documentElement.clientWidth,
  );
};

const assertStoryEvidenceIsVisuallyHidden = (canvasElement: HTMLElement) => {
  const evidence = within(canvasElement).getByTestId(
    'managed-email-story-evidence',
  );
  const bounds = evidence.getBoundingClientRect();

  expect(evidence).toHaveAttribute('aria-hidden', 'true');
  expect(bounds.width).toBeLessThanOrEqual(1);
  expect(bounds.height).toBeLessThanOrEqual(1);
  expect(getComputedStyle(evidence).overflow).toBe('hidden');

  const journeyEvidenceOutputs = Array.from(
    canvasElement.ownerDocument.querySelectorAll('output[aria-hidden="true"]'),
  );

  for (const output of journeyEvidenceOutputs) {
    const outputBounds = output.getBoundingClientRect();

    expect(outputBounds.width).toBeLessThanOrEqual(1);
    expect(outputBounds.height).toBeLessThanOrEqual(1);
    expect(getComputedStyle(output).overflow).toBe('hidden');
  }
};

const assertVisibleButtonTouchTargets = (canvasElement: HTMLElement) => {
  const managedEmailRegion = within(canvasElement).getByRole('region', {
    name: 'Managed email design',
  });
  const visibleButtons = within(managedEmailRegion)
    .getAllByRole('button')
    .filter((button) => button.getClientRects().length > 0);

  for (const button of visibleButtons) {
    const { height, width } = button.getBoundingClientRect();
    const label =
      [
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.textContent?.trim(),
      ].find(Boolean) ?? button.outerHTML.slice(0, 240);

    expect(width, `${label} touch-target width`).toBeGreaterThanOrEqual(32);
    expect(height, `${label} touch-target height`).toBeGreaterThanOrEqual(32);
  }
};

const meta = {
  title: 'Pages/Settings/Email/ManagedEmailDesign',
  component: ManagedEmailDesignPage,
  decorators: [PageDecorator],
  args: {
    routePath: '/settings/email/managed-email-design',
    routeParams: {},
    additionalRoutes: ['/settings/workspace'],
    initialWorkspace: mixedWorkspace,
  },
  parameters: {
    msw: graphqlMocks,
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Storybook-only managed-email design prototype. Every interaction uses deterministic local fixture state; no provider, GraphQL, DNS, credential, purchase, billing, subscription, warmup, campaign, or production mutation is wired from this surface. Managed-email review excludes the separately owned AI prepaid balance.',
      },
    },
  },
} satisfies Meta<typeof ManagedEmailDesignPage>;

export default meta;

export type Story = StoryObj<typeof meta>;

export const InteractiveResourceDashboard: Story = {
  args: {
    initialWorkspace: interactiveResourceDashboardWorkspace,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive walkthrough for the richer two-resource dashboard, branched domain acquisition, mailbox creation and connection, prewarmed bundles, reviews, local completion, reset, and inline warmup controls.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    expect(readMailboxResourceCount(canvasElement)).toBe(6);
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 3 of 4 assigned · 1 slot available.',
    });
    await expectWarmupState({
      canvasElement,
      address: 'sasha@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Paused',
      operation: 'Idle',
    });
  },
};

export const MixedWorkspace: Story = {
  args: {
    initialWorkspace: mixedWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    expect(readMailboxResourceCount(canvasElement)).toBe(5);
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
    });
    await expectWarmupState({
      canvasElement,
      address: 'rory@riveroak.io',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
  },
};

export const EmptyWorkspace: Story = {
  args: {
    initialWorkspace: emptyWorkspace,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addDomain = await canvas.findByRole('button', {
      name: 'Add domain',
    });

    expect(addDomain).toHaveAttribute('data-variant', 'primary');
    expect(canvas.getByRole('button', { name: 'Add mailbox' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    expect(
      canvas.getAllByRole('button', { name: 'Browse prewarmed mailboxes' }),
    ).toHaveLength(1);
    expect(
      canvas.queryByRole('button', { name: 'Manage subscriptions' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Manage warmup capacity' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Review warmup capacity' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('Warmup capacity availability'),
    ).not.toBeInTheDocument();
  },
};
export const MobileWorkspace: Story = {
  args: {
    initialWorkspace: mobileWorkspace,
  },
  parameters: createManagedEmailViewport(390, 844),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const canvas = within(canvasElement);
    expect(readMailboxResourceCount(canvasElement)).toBe(2);
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 2 assigned · 1 slot available.',
    });
    expect(
      canvas.getByText('Mira Chen — mira@northstar-outreach.com', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText('Rory Blake — rory@riveroak.io', { exact: true }),
    ).toBeVisible();
    assertVisibleButtonTouchTargets(canvasElement);
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const ReviewAtMobileBoundary: Story = {
  args: {
    initialFlow: 'review',
    initialReview: 'prewarmed-bundle',
  },
  parameters: createManagedEmailViewport(768, 900),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findAllByRole('region', { name: /^Review charge for / }),
    ).toHaveLength(3);
    expect(
      canvas.queryByRole('table', {
        name: 'Charges included in this purchase review',
      }),
    ).not.toBeInTheDocument();
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const ReviewAboveMobileBoundary: Story = {
  args: {
    initialFlow: 'review',
    initialReview: 'prewarmed-bundle',
  },
  parameters: createManagedEmailViewport(769, 900),
  play: async ({ canvasElement }) => {
    expect(
      await within(canvasElement).findByRole('table', {
        name: 'Charges included in this purchase review',
      }),
    ).toBeVisible();
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const DashboardAtCompactBoundary: Story = {
  parameters: createManagedEmailViewport(1023, 900),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);

    expect(
      canvas.queryByRole('table', { name: 'Managed email domains' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('table', { name: 'Managed email mailboxes' }),
    ).not.toBeInTheDocument();
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const DashboardAboveCompactBoundary: Story = {
  parameters: createManagedEmailViewport(1024, 900),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);

    expect(
      canvas.getByRole('table', { name: 'Managed email domains' }),
    ).toBeVisible();
    expect(
      canvas.getByRole('table', { name: 'Managed email mailboxes' }),
    ).toBeVisible();
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const ManagedDomainSearchAtDesktop: Story = {
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchQuery: 'mooreland',
    initialDomainSearchStatus: 'results',
  },
  parameters: createManagedEmailViewport(1280, 900),
  play: async ({ canvasElement }) => {
    const results = await within(canvasElement).findByRole('region', {
      name: 'Managed domain search results',
    });

    expect(
      within(results).getByRole('radiogroup', { name: 'Available domains' }),
    ).toBeVisible();
    expect(
      within(results).getByRole('button', { name: 'Continue' }),
    ).toBeVisible();
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const DashboardAtWideDesktop: Story = {
  parameters: createManagedEmailViewport(1440, 1000),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);

    expect(
      canvas.getByRole('table', { name: 'Managed email domains' }),
    ).toBeVisible();
    expect(
      canvas.getByRole('table', { name: 'Managed email mailboxes' }),
    ).toBeVisible();
    assertNoDocumentHorizontalOverflow(canvasElement);
    assertStoryEvidenceIsVisuallyHidden(canvasElement);
  },
};

export const DomainSourceSelection: Story = {
  args: {
    initialFlow: 'domain-source',
    initialDomainSource: 'managed',
  },
  play: async ({ canvasElement }) => {
    await assertCardPickerChoiceGroup({
      canvasElement,
      groupName: 'Domain source',
      selectedName: 'Buy a Myah-managed domain',
      alternateName: 'Connect a customer-owned domain',
    });
  },
};

export const ManagedDomainSearchIdle: Story = {
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchStatus: 'idle',
  },
};

export const ManagedDomainSearchLoading: Story = {
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchQuery: 'mooreland',
    initialDomainSearchStatus: 'loading',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole('button', { name: 'Search' });

    expect(search).not.toHaveAttribute('aria-busy', 'true');
    expect(
      canvas.getByRole('status', { name: 'Managed domain search pending' }),
    ).toHaveTextContent('Searching local fixtures');
    expect(
      canvas.getByRole('button', { name: 'Resolve domain search' }),
    ).toBeEnabled();
  },
};

export const ManagedDomainSearch: Story = {
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchQuery: 'mooreland',
    initialDomainSearchStatus: 'results',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await assertCardPickerChoiceGroup({
      canvasElement,
      groupName: 'Available domains',
      selectedName: 'mooreland.com',
      alternateName: 'mooreland-outreach.com',
      expectedRadioCount: 3,
      initialSelectionName: 'mooreland.com',
    });
    expect(canvas.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(canvas.getByRole('button', { name: 'Search' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    const results = canvas.getByRole('region', {
      name: 'Managed domain search results',
    });
    expect(
      within(results).getByRole('radiogroup', {
        name: 'Available domains',
      }),
    ).toBeVisible();
    expect(
      within(results).getByRole('button', { name: 'Continue' }),
    ).toBeEnabled();
    await clickStoryButton({ canvasElement, name: 'Continue' });
    expect(
      await canvas.findByRole('heading', { name: 'Review managed domain' }),
    ).toBeVisible();
    expect(
      canvas.getByRole('region', { name: 'Review managed domain screen' }),
    ).toHaveFocus();
    await clickStoryButton({
      canvasElement,
      name: 'Complete locally — $14.29',
    });
    await clickStoryButton({ canvasElement, name: 'Return to dashboard' });
    await clickStoryButton({ canvasElement, name: 'Reset local prototype' });

    await expectDomainSearchState({ canvasElement, expected: /results/i });
    const restoredDomains = await canvas.findByRole('radiogroup', {
      name: 'Available domains',
    });

    expect(within(restoredDomains).getAllByRole('radio')).toHaveLength(3);
    expect(
      within(restoredDomains).getByRole('radio', { name: 'mooreland.com' }),
    ).toBeVisible();
    expect(
      within(restoredDomains).getByRole('radio', {
        name: 'mooreland-outreach.com',
      }),
    ).toBeVisible();
    const restoredSelection = within(restoredDomains).getByRole('radio', {
      name: 'getmooreland.com',
    });

    expect(restoredSelection).toBeVisible();
    await userEvent.click(restoredSelection);
    expect(restoredSelection).toBeChecked();
    expect(canvas.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await clickStoryButton({ canvasElement, name: 'Continue' });
    expect(
      await canvas.findByRole('heading', { name: 'Review managed domain' }),
    ).toBeVisible();
  },
};

export const ManagedDomainUnavailable: Story = {
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchQuery: 'fleetwave-mail.com',
    initialDomainSearchStatus: 'results',
  },
};

export const ManagedDomainNoResults: Story = {
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchQuery: 'zzzz-nomatch',
    initialDomainSearchStatus: 'no-results',
  },
};

export const ManagedDomainSearchFailed: Story = {
  name: 'Managed Domain Search Failed',
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchQuery: managedDomainSearchFailureQuery,
    initialDomainSearchStatus: 'loading',
    initialManagedDomainSearchLifecycle: managedDomainSearchFailureLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDomainSearchState({ canvasElement, expected: /failed/i });
    const failedState = readDomainSearchState(canvasElement);
    expect(failedState).toMatch(/failed/i);
    const operationId = readDomainSearchOperationId(canvasElement);
    assertNormalizedDomainSearchQuery({
      canvasElement,
      query: normalizedManagedDomainSearchFailureQuery,
    });

    expect(operationId).toBe('managed-domain-search-mooreland-001');
    expectSingleSafeAlert({
      canvasElement,
      diagnostic:
        'The managed domain search could not be completed. Try again.',
    });
    assertNoDomainSearchOutcome(canvasElement);
    expect(
      canvas.getByRole('button', { name: 'Retry domain search' }),
    ).toBeEnabled();

    await clickStoryButton({
      canvasElement,
      name: 'Retry domain search',
    });
    await expectDomainSearchState({ canvasElement, expected: /loading/i });
    expect(readDomainSearchOperationId(canvasElement)).toBe(operationId);
    assertNormalizedDomainSearchQuery({
      canvasElement,
      query: normalizedManagedDomainSearchFailureQuery,
    });
    await assertDomainSearchRemainsFrozen({
      canvasElement,
      operationId,
      query: normalizedManagedDomainSearchFailureQuery,
    });

    await clickStoryButton({
      canvasElement,
      name: 'Resolve domain search',
    });
    await assertDomainSearchResults({
      canvasElement,
      expectedDomain: 'mooreland.com',
      operationId,
    });
    const results = canvas.getByRole('region', {
      name: 'Managed domain search results',
    });
    await waitFor(() => expect(results).toHaveFocus());
  },
};

export const ManagedDomainSearchFailedNoResults: Story = {
  name: 'Managed Domain Search Failed — No Results',
  args: {
    initialFlow: 'managed-domain-search',
    initialDomainSearchQuery: managedDomainSearchNoResultsFailureQuery,
    initialDomainSearchStatus: 'loading',
    initialManagedDomainSearchLifecycle:
      managedDomainSearchNoResultsFailureLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDomainSearchState({ canvasElement, expected: /failed/i });
    const failedState = readDomainSearchState(canvasElement);
    expect(failedState).toMatch(/failed/i);
    const operationId = readDomainSearchOperationId(canvasElement);
    assertNormalizedDomainSearchQuery({
      canvasElement,
      query: normalizedManagedDomainSearchNoResultsFailureQuery,
    });

    expect(operationId).toBe('managed-domain-search-no-results-001');
    expectSingleSafeAlert({
      canvasElement,
      diagnostic:
        'The managed domain search could not be completed. Try again.',
    });
    assertNoDomainSearchOutcome(canvasElement);
    expect(
      canvas.getByRole('button', { name: 'Retry domain search' }),
    ).toBeEnabled();

    await clickStoryButton({
      canvasElement,
      name: 'Retry domain search',
    });
    await expectDomainSearchState({ canvasElement, expected: /loading/i });
    expect(readDomainSearchOperationId(canvasElement)).toBe(operationId);
    await assertDomainSearchRemainsFrozen({
      canvasElement,
      operationId,
      query: normalizedManagedDomainSearchNoResultsFailureQuery,
    });

    await clickStoryButton({
      canvasElement,
      name: 'Resolve domain search',
    });
    await assertDomainSearchNoResults({ canvasElement, operationId });
    const search = canvas.getByRole('button', { name: 'Search' });
    await waitFor(() => expect(search).toHaveFocus());
  },
};

export const ExternalDomainEntry: Story = {
  args: {
    initialFlow: 'external-domain-entry',
    initialDomainSource: 'external',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const domain = await canvas.findByRole('textbox', {
      name: 'Customer-owned domain',
    });

    await userEvent.clear(domain);
    await userEvent.type(domain, 'not a domain');
    assertFocusedFieldError({
      field: domain,
      message: 'Enter a valid domain name, such as example.com.',
    });

    await userEvent.clear(domain);
    await userEvent.type(domain, 'riveroak.io');
    assertFocusedFieldError({
      field: domain,
      message: 'riveroak.io already exists in this local domain inventory.',
    });
  },
};

export const ExternalDomainDnsRequired: Story = {
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'verification-required',
  },
  play: async ({ canvasElement }) => {
    await expectDnsOperationState({ canvasElement, expected: /idle/i });
    assertDnsRecordStatuses({
      canvasElement,
      expectations: uncheckedDnsRecordStatuses,
    });
    assertNoDnsRecordIsMarkedActionRequired(canvasElement);
    expect(
      within(canvasElement).queryAllByText('Verified', { exact: true }),
    ).toHaveLength(0);

    await clickStoryButton({ canvasElement, name: 'Check verification' });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });
    const operationId = readDnsOperationId(canvasElement);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: uncheckedDnsRecordStatuses,
    });

    await clickStoryButton({
      canvasElement,
      name: 'Resolve DNS verification',
    });
    await expectDnsOperationState({ canvasElement, expected: /completed/i });
    expect(readDnsOperationId(canvasElement)).toBe(operationId);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: completedDnsRecordStatuses,
    });
  },
};

export const ExternalDomainDnsAtMobile: Story = {
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'verification-required',
  },
  parameters: createManagedEmailViewport(390, 844),
  play: async ({ canvasElement }) => {
    await expectDnsOperationState({ canvasElement, expected: /idle/i });
    assertVisibleButtonTouchTargets(canvasElement);
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const ExternalDomainDnsActionRequired: Story = {
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'action-required',
  },
};

export const ExternalDomainDnsVerified: Story = {
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'verified',
  },
};

export const ExternalDomainDnsChecking: Story = {
  name: 'External Domain DNS Checking',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'verification-required',
    initialDnsLifecycle: dnsCheckingLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await clickStoryButton({ canvasElement, name: 'Check verification' });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });
    const operationId = readDnsOperationId(canvasElement);
    await assertDnsDomainContext(canvasElement);

    expect(operationId).toBe('dns-check-brightforge-001');
    assertDnsRecordStatuses({
      canvasElement,
      expectations: checkingDnsRecordStatuses,
    });
    const resolveDnsVerification = canvas.getByRole('button', {
      name: 'Resolve DNS verification',
    });
    expect(resolveDnsVerification).toBeEnabled();
    await waitFor(() => expect(resolveDnsVerification).toHaveFocus());
    expect(
      canvas.getByRole('status', { name: 'DNS verification pending' }),
    ).toHaveTextContent('Checking DNS');
    expect(
      canvas.getByRole('button', { name: 'Check verification' }),
    ).not.toHaveAttribute('aria-busy', 'true');
    await assertDnsCheckingRemainsFrozen({
      canvasElement,
      operationId,
      expectations: checkingDnsRecordStatuses,
    });

    await clickStoryButton({
      canvasElement,
      name: 'Resolve DNS verification',
    });
    await expectDnsOperationState({ canvasElement, expected: /completed/i });
    expect(readDnsOperationId(canvasElement)).toBe(operationId);
    expect(readDnsOperationState(canvasElement)).toMatch(/completed/i);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: completedDnsRecordStatuses,
    });

    await clickStoryButton({
      canvasElement,
      name: 'Check verification again',
    });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });
    const freshOperationId = readDnsOperationId(canvasElement);

    expect(freshOperationId).not.toBe(operationId);
    await assertDnsCheckingRemainsFrozen({
      canvasElement,
      operationId: freshOperationId,
      expectations: completedDnsRecordStatuses,
    });
  },
};

export const ExternalDomainDnsChangedDomainOperationSequence: Story = {
  name: 'External Domain DNS Changed Domain Operation Sequence',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'verification-required',
    initialDnsLifecycle: dnsCheckingLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await clickStoryButton({ canvasElement, name: 'Check verification' });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });
    const brightforgeOperationId = readDnsOperationId(canvasElement);

    expect(brightforgeOperationId).toBe('dns-check-brightforge-001');
    await assertDnsDomainContext(canvasElement);
    await clickStoryButton({ canvasElement, name: 'Back' });
    expect(
      await canvas.findByRole('heading', { name: 'Enter your domain' }),
    ).toBeVisible();

    const domainInput = canvas.getByRole('textbox', {
      name: 'Customer-owned domain',
    });

    await userEvent.clear(domainInput);
    await userEvent.type(domainInput, 'lumenbridge.io');
    await clickStoryButton({ canvasElement, name: 'Continue' });
    await assertDnsDomainContextForDomain({
      canvasElement,
      domain: 'lumenbridge.io',
    });
    await clickStoryButton({ canvasElement, name: 'Check verification' });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });

    const changedDomainOperationId = readDnsOperationId(canvasElement);

    expect(changedDomainOperationId).toBe(
      'dns-check-story-domain-lumenbridge.io-001',
    );
    expect(changedDomainOperationId).not.toBe(brightforgeOperationId);
    expect(changedDomainOperationId).not.toMatch(/brightforge/);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: uncheckedDnsRecordStatuses,
    });
  },
};

export const ExternalDomainDnsCheckFailed: Story = {
  name: 'External Domain DNS Check Failed',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'action-required',
    initialDnsLifecycle: dnsFailedLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDnsOperationState({ canvasElement, expected: /failed/i });
    const failedState = readDnsOperationState(canvasElement);
    expect(failedState).toMatch(/failed/i);
    const operationId = readDnsOperationId(canvasElement);

    expect(operationId).toBe('dns-check-brightforge-failed-001');
    expectSingleSafeAlert({
      canvasElement,
      diagnostic:
        'The DNS verification provider could not complete this check. Try again.',
    });
    assertDnsRecordStatuses({
      canvasElement,
      expectations: checkingDnsRecordStatuses,
    });
    assertNoDnsRecordIsMarkedActionRequired(canvasElement);
    expect(
      canvas.getByRole('button', { name: 'Retry DNS verification' }),
    ).toBeEnabled();

    await clickStoryButton({
      canvasElement,
      name: 'Retry DNS verification',
    });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });
    expect(readDnsOperationId(canvasElement)).toBe(operationId);
    assertNoDnsRecordIsMarkedActionRequired(canvasElement);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: checkingDnsRecordStatuses,
    });
    await assertDnsCheckingRemainsFrozen({
      canvasElement,
      operationId,
      expectations: checkingDnsRecordStatuses,
    });

    await clickStoryButton({
      canvasElement,
      name: 'Resolve DNS verification',
    });
    await expectDnsOperationState({ canvasElement, expected: /completed/i });
    expect(readDnsOperationId(canvasElement)).toBe(operationId);
    expect(readDnsOperationState(canvasElement)).toMatch(/completed/i);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: completedDnsRecordStatuses,
    });
  },
};

export const ExternalDomainDnsCheckFailedAtMobile: Story = {
  name: 'External Domain DNS Check Failed At Mobile',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'action-required',
    initialDnsLifecycle: dnsFailedLifecycle,
  },
  parameters: createManagedEmailViewport(390, 844),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dkimRecord = managedEmailDesignDnsRecords.find(
      (record) => record.id === 'dns-record-dkim',
    );
    if (dkimRecord === undefined) {
      throw new Error('Expected deterministic DKIM fixture record.');
    }

    expect(
      await canvas.findByRole('heading', {
        name: `Verify DNS for ${normalizedExternalDnsStoryDomain}`,
      }),
    ).toBeVisible();
    expectSingleSafeAlert({
      canvasElement,
      diagnostic:
        'The DNS verification provider could not complete this check. Try again.',
    });
    for (const { record, status } of checkingDnsRecordStatuses) {
      const recordCard = canvas.getByRole('article', {
        name: `${record.type} record ${record.key}`,
      });

      expect(
        within(recordCard).getByText(status, { exact: true }),
      ).toBeVisible();
    }
    const dkimCard = canvas.getByRole('article', {
      name: `CNAME record ${dnsRecordLocators.dkim.key}`,
    });
    expect(
      within(dkimCard).getByText(dkimRecord.value, { exact: true }),
    ).toBeVisible();
    const copyDkimValue = within(dkimCard).getByRole('button', {
      name: `Copy value for CNAME record ${dnsRecordLocators.dkim.key} on ${normalizedExternalDnsStoryDomain}`,
    });
    expect(copyDkimValue).toBeVisible();
    expect(copyDkimValue).toBeEnabled();
    expect(
      canvas.getByRole('button', { name: 'Retry DNS verification' }),
    ).toBeEnabled();
    expect(
      canvas.getByText(
        'These records and every verification result are local Storybook fixtures for inspection only. No DNS publication or query occurs.',
        { exact: true },
      ),
    ).toBeVisible();
    assertVisibleButtonTouchTargets(canvasElement);
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const ExternalDomainDnsCheckAmbiguous: Story = {
  name: 'External Domain DNS Check Ambiguous',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'action-required',
    initialDnsLifecycle: dnsAmbiguousLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDnsOperationState({ canvasElement, expected: /unknown/i });
    const unknownState = readDnsOperationState(canvasElement);
    expect(unknownState).toMatch(/unknown/i);
    expect(unknownState).not.toMatch(/completed|success|verified/i);
    const operationId = readDnsOperationId(canvasElement);

    expect(operationId).toBe('dns-check-brightforge-unknown-001');
    expectSingleSafeAlert({
      canvasElement,
      diagnostic:
        'The DNS verification provider returned an indeterminate response.',
    });
    assertNoDnsRecordIsMarkedActionRequired(canvasElement);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: checkingDnsRecordStatuses,
    });
    expect(
      canvas.getByRole('button', { name: 'Reconcile DNS verification' }),
    ).toBeEnabled();

    await clickStoryButton({
      canvasElement,
      name: 'Reconcile DNS verification',
    });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });
    expect(readDnsOperationId(canvasElement)).toBe(operationId);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: checkingDnsRecordStatuses,
    });
    await assertDnsCheckingRemainsFrozen({
      canvasElement,
      operationId,
      expectations: checkingDnsRecordStatuses,
    });

    await clickStoryButton({
      canvasElement,
      name: 'Resolve DNS verification',
    });
    await expectDnsOperationState({ canvasElement, expected: /failed/i });
    expect(readDnsOperationId(canvasElement)).toBe(operationId);
    const reconciledState = readDnsOperationState(canvasElement);

    expect(reconciledState).toMatch(/failed/i);
    expect(reconciledState).not.toMatch(/completed|success|verified/i);
    assertNoDnsRecordIsMarkedActionRequired(canvasElement);
    assertDnsRecordStatuses({
      canvasElement,
      expectations: checkingDnsRecordStatuses,
    });
    const retryDnsVerification = canvas.getByRole('button', {
      name: 'Retry DNS verification',
    });
    await waitFor(() => expect(retryDnsVerification).toHaveFocus());
  },
};

export const ExternalDomainDnsResolveUnknown: Story = {
  name: 'External Domain DNS Resolve Unknown',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'verification-required',
    initialDnsLifecycle: dnsUnknownResolutionLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await clickStoryButton({ canvasElement, name: 'Check verification' });
    await expectDnsOperationState({ canvasElement, expected: /checking/i });
    const operationId = readDnsOperationId(canvasElement);

    await clickStoryButton({
      canvasElement,
      name: 'Resolve DNS verification',
    });
    await expectDnsOperationState({ canvasElement, expected: /unknown/i });
    expect(readDnsOperationId(canvasElement)).toBe(operationId);

    const reconcileDnsVerification = canvas.getByRole('button', {
      name: 'Reconcile DNS verification',
    });
    expect(reconcileDnsVerification).toBeEnabled();
    await waitFor(() => expect(reconcileDnsVerification).toHaveFocus());
  },
};

export const ExternalDomainDnsActionRequiredDkimMismatch: Story = {
  name: 'External Domain DNS Action Required — DKIM mismatch',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'action-required',
    initialDnsLifecycle: dnsDkimMismatchLifecycle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDnsOperationState({ canvasElement, expected: /completed/i });
    expect(readDnsOperationId(canvasElement)).toBe(
      'dns-check-brightforge-dkim-001',
    );
    const dkimRow = getDnsRecordRow({
      canvasElement,
      record: dnsRecordLocators.dkim,
    });

    expect(within(dkimRow).getByText('Action required')).toBeVisible();
    const expectedValue = within(dkimRow).getByText(
      'myah-dkim.storybook.local',
    );
    const observedValue = within(dkimRow).getByText(
      'myah-dkim-previous.storybook.local',
    );
    const valueCell = within(dkimRow).getAllByRole('cell')[2];

    expect(expectedValue).toBeVisible();
    expect(expectedValue).toHaveTextContent('myah-dkim.storybook.local');
    expect(observedValue).toBeVisible();
    expect(observedValue).toHaveTextContent(
      'myah-dkim-previous.storybook.local',
    );
    expect(valueCell).toHaveAccessibleName(/myah-dkim\.storybook\.local/);
    expect(valueCell).toHaveAccessibleName(
      /myah-dkim-previous\.storybook\.local/,
    );
    expect(
      within(dkimRow).getByText(
        'The published DKIM target does not match the expected target.',
      ),
    ).toBeVisible();
    assertDnsRecordStatus({
      canvasElement,
      record: dnsRecordLocators.spf,
      status: 'Verified',
    });
    assertDnsRecordStatus({
      canvasElement,
      record: dnsRecordLocators.mx,
      status: 'Verified',
    });
    expect(
      canvas.getByRole('button', { name: 'Check verification again' }),
    ).toBeEnabled();
    assertStoryEvidenceIsVisuallyHidden(canvasElement);
  },
};

export const ExternalDomainDnsMultipleIssues: Story = {
  name: 'External Domain DNS Multiple Issues',
  args: {
    initialFlow: 'external-dns',
    initialDomainSource: 'external',
    initialDnsStatus: 'action-required',
    initialDnsLifecycle: dnsMultipleIssuesLifecycle,
  },
  play: async ({ canvasElement }) => {
    await expectDnsOperationState({ canvasElement, expected: /completed/i });
    expect(readDnsOperationId(canvasElement)).toBe(
      'dns-check-brightforge-multiple-001',
    );
    const spfRow = getDnsRecordRow({
      canvasElement,
      record: dnsRecordLocators.spf,
    });
    const dkimRow = getDnsRecordRow({
      canvasElement,
      record: dnsRecordLocators.dkim,
    });

    expect(within(spfRow).getByText('Action required')).toBeVisible();
    expect(
      within(spfRow).getByText(
        'The SPF policy must include the expected sender.',
      ),
    ).toBeVisible();
    expect(
      within(spfRow).getByText('v=spf1 include:storybook.local ~all'),
    ).toBeVisible();
    expect(within(dkimRow).getByText('Pending')).toBeVisible();
    expect(
      within(dkimRow).getByText('The DKIM record is awaiting publication.'),
    ).toBeVisible();
    expect(
      within(dkimRow).getByText('myah-dkim.storybook.local'),
    ).toBeVisible();
    assertDnsRecordStatus({
      canvasElement,
      record: dnsRecordLocators.mx,
      status: 'Verified',
    });
  },
};

export const MailboxSourceSelection: Story = {
  args: {
    initialFlow: 'mailbox-source',
    initialMailboxSource: 'create',
  },
  play: async ({ canvasElement }) => {
    await assertCardPickerChoiceGroup({
      canvasElement,
      groupName: 'Mailbox source',
      selectedName: 'Create a managed mailbox',
      alternateName: 'Connect an existing mailbox',
    });
  },
};

export const CreateMailboxOnExistingDomain: Story = {
  args: {
    initialFlow: 'mailbox-details',
    initialMailboxSource: 'create',
  },
  play: async ({ canvasElement }) => {
    await assertCardPickerChoiceGroup({
      canvasElement,
      groupName: 'Verified domain',
      selectedName: 'northstar-outreach.com',
      alternateName: 'riveroak.io',
      expectedRadioCount: 3,
    });
    const canvas = within(canvasElement);
    const localPart = canvas.getByRole('textbox', {
      name: 'Mailbox local part',
    });

    await userEvent.clear(localPart);
    await userEvent.type(localPart, 'bad@local');
    assertFocusedFieldError({
      field: localPart,
      message: 'Use a valid mailbox local part without @.',
    });

    await userEvent.clear(localPart);
    await userEvent.type(localPart, 'mira');
    assertFocusedFieldError({
      field: localPart,
      message: 'That mailbox already exists in this local inventory.',
    });
  },
};

export const PrewarmedInventoryAllConflicts: Story = {
  args: {
    initialFlow: 'prewarmed-inventory',
    initialWorkspace: {
      ...mixedWorkspace,
      mailboxes: [
        ...mixedWorkspace.mailboxes,
        createManagedEmailDesignMailbox({
          id: 'mailbox-prewarmed-conflict-samira',
          identity: 'Samira Bell',
          address: 'samira@harborline-mail.com',
          domain: 'harborline-mail.com',
          source: 'managed',
          subscriptionId: 'subscription-managed-mailbox',
          warmupState: {
            assignment: 'unassigned',
            lastConfirmedProviderState: 'inactive',
            operation: { status: 'idle' },
          },
        }),
        createManagedEmailDesignMailbox({
          id: 'mailbox-prewarmed-conflict-theo',
          identity: 'Theo Walsh',
          address: 'theo@harborline-mail.com',
          domain: 'harborline-mail.com',
          source: 'managed',
          subscriptionId: 'subscription-managed-mailbox',
          warmupState: {
            assignment: 'unassigned',
            lastConfirmedProviderState: 'inactive',
            operation: { status: 'idle' },
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);

    expect(
      canvas.getByText(
        'Cannot select this fixed bundle because these identities already exist: samira@harborline-mail.com, theo@harborline-mail.com.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Cannot select this fixed bundle because its domain already exists: fleetwave-mail.com.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'No complete prewarmed bundle is selectable because of the listed local-inventory collisions. Create a managed mailbox or connect an existing mailbox instead.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.queryByRole('radiogroup', {
        name: 'Prewarmed mailbox bundle',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Review selected bundle' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: 'Create a managed mailbox' }),
    ).toBeEnabled();
    expect(
      canvas.getByRole('button', { name: 'Connect an existing mailbox' }),
    ).toBeEnabled();
  },
};

export const PrewarmedInventoryAddressConflict: Story = {
  args: {
    initialFlow: 'prewarmed-inventory',
    initialWorkspace: {
      ...mixedWorkspace,
      domains: mixedWorkspace.domains.filter(
        (domain) => domain.name !== 'fleetwave-mail.com',
      ),
      subscriptions: mixedWorkspace.subscriptions.filter(
        (subscription) => subscription.product !== 'managed-domain',
      ),
      mailboxes: [
        ...mixedWorkspace.mailboxes.filter(
          (mailbox) => mailbox.domain !== 'fleetwave-mail.com',
        ),
        createManagedEmailDesignMailbox({
          id: 'mailbox-prewarmed-address-conflict-samira',
          identity: 'Samira Bell',
          address: 'samira@harborline-mail.com',
          domain: 'harborline-mail.com',
          source: 'managed',
          subscriptionId: 'subscription-managed-mailbox',
          warmupState: {
            assignment: 'unassigned',
            lastConfirmedProviderState: 'inactive',
            operation: { status: 'idle' },
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);

    expect(
      canvas.getByText(
        'Cannot select this fixed bundle because this identity already exists: samira@harborline-mail.com.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.queryByText(/because its domain already exists:/),
    ).not.toBeInTheDocument();
    const availableBundle = canvas.getByRole('radio', {
      name: 'fleetwave-mail.com',
    });
    const reviewButton = canvas.getByRole('button', {
      name: 'Review selected bundle',
    });

    expect(reviewButton).toBeDisabled();
    await userEvent.click(availableBundle);
    expect(availableBundle).toBeChecked();
    expect(reviewButton).toBeEnabled();
  },
};

export const AddMailboxUsesActiveSparePool: Story = {
  name: 'Add Mailbox Uses Active Spare Pool',
  args: withTask8StoryArgs({
    initialWorkspace: {
      ...task8MailboxPoolWorkspace,
      domains: [
        {
          id: 'domain-task8-ordinary-mailbox-pool-verified-001',
          name: task8ReviewDomainName,
          source: 'external',
          verification: 'verified',
          subscriptionId: null,
        },
      ],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const newAddress = `jamie@${task8ReviewDomainName}`;
    const newMailboxId = `story-mailbox-${newAddress}`;
    const expectedPoolSignature = `${task8ActiveMailboxPool.id}:active:2:${task8PoolExistingMailbox.id},${newMailboxId}`;

    await reviewManagedMailboxFromDashboard({
      canvasElement,
      domain: task8ReviewDomainName,
    });
    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Managed mailbox',
          resource: `jamie <${newAddress}>`,
          cadence: 'Monthly',
          unitPrice: '$5.00',
          quantity: '0',
          amount: '$0.00',
        },
      ],
      dueToday: '$0.00',
      monthlyRenewal: {
        amount: '$0.00',
        date: '2027-02-10',
      },
    });
    expect(
      canvas.getByText(
        'Covered by existing capacity. This mailbox uses one paid spare pool slot and adds no local charge.',
        { exact: true },
      ),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Complete locally — $0.00' }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Managed mailbox capacity applied',
      }),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Target subscription IDs',
      }),
    ).toBe(task8ActiveMailboxPool.id);
    const poolResources = canvas.getByRole('list', {
      name: 'Managed mailbox pool resources',
    });
    expect(within(poolResources).getAllByRole('listitem')).toHaveLength(2);
    for (const address of [task8PoolExistingMailbox.address, newAddress]) {
      expect(
        within(poolResources).getByText(address, { exact: true }),
      ).toBeVisible();
    }
    expect(readMailboxResourceCount(canvasElement)).toBe(2);
    expect(readMailboxPoolSignature(canvasElement)).toBe(expectedPoolSignature);
  },
};

export const ReplacementAfterCancellation: Story = (() => {
  const canceledPoolId = 'subscription-managed-mailbox';
  const existingMailbox = createManagedEmailDesignMailbox({
    ...task8PoolExistingMailbox,
    subscriptionId: canceledPoolId,
  });
  const canceledPool = createManagedEmailDesignRecurringSubscription({
    ...task8ActiveMailboxPool,
    id: canceledPoolId,
    linkedResources: [
      {
        id: existingMailbox.id,
        kind: 'mailbox',
        label: `${existingMailbox.identity} <${existingMailbox.address}>`,
      },
    ],
    quantity: 1,
    status: 'canceled',
    renewsAt: null,
    pendingQuantity: undefined,
    changeEffectiveAt: undefined,
    cancelAt: undefined,
    canceledAt: task8FixtureNow,
  });
  const newAddress = `jamie@${task8ReviewDomainName}`;
  const newMailboxId = `story-mailbox-${newAddress}`;
  const expectedPoolSignature = `${canceledPoolId}:active:2:${existingMailbox.id},${newMailboxId}`;

  return {
    name: 'Replacement After Cancellation',
    args: withTask8StoryArgs({
      initialWorkspace: {
        domains: [
          {
            id: 'domain-task8-canceled-mailbox-pool-verified-001',
            name: task8ReviewDomainName,
            source: 'external',
            verification: 'verified',
            subscriptionId: null,
          },
        ],
        mailboxes: [existingMailbox],
        prewarmedBundles: [],
        subscriptions: [canceledPool],
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await reviewManagedMailboxFromDashboard({
        canvasElement,
        domain: task8ReviewDomainName,
      });
      await userEvent.click(
        canvas.getByRole('button', {
          name: 'Review recovered mailbox capacity',
        }),
      );
      expect(
        await canvas.findByText(
          'Canceled mailbox history leaves 1 live mailbox uncovered. This refreshed quote includes it and the new mailbox.',
        ),
      ).toBeVisible();
      const complete = canvas.getByRole('button', {
        name: 'Complete locally — $10.00',
      });
      expect(complete).toBeDisabled();
      await userEvent.click(
        canvas.getByRole('button', {
          name: 'Accept recovered quote — $10.00',
        }),
      );
      expect(complete).toBeEnabled();
      await waitFor(() => expect(complete).toHaveFocus());
      expect(canvasElement.ownerDocument.body).not.toHaveFocus();
      await userEvent.click(complete);
      expect(
        await canvas.findByRole('heading', {
          name: 'Managed mailbox capacity applied',
        }),
      ).toBeVisible();
      expect(readMailboxResourceCount(canvasElement)).toBe(2);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedPoolSignature,
      );
    },
  };
})();

export const AddMailboxBlocksAgainstPendingMailboxPool: Story = (() => {
  if (
    task8ActiveMailboxPool.product !== 'managed-mailbox' ||
    task8ActiveMailboxPool.status !== 'active'
  ) {
    throw new Error('Expected an active managed-mailbox pool fixture.');
  }
  const pendingPool = createManagedEmailDesignRecurringSubscription({
    ...task8ActiveMailboxPool,
    status: 'pending-change',
    pendingQuantity: 1,
    changeEffectiveAt: task8MonthlyRenewalAt,
  });
  const expectedPoolSignature = `${pendingPool.id}:pending-change:2:${task8PoolExistingMailbox.id}`;

  return {
    name: 'Add Mailbox Blocks Against Pending Mailbox Pool',
    args: withTask8StoryArgs({
      initialWorkspace: {
        ...task8MailboxPoolWorkspace,
        domains: [
          {
            id: 'domain-task8-ordinary-mailbox-pending-verified-001',
            name: task8ReviewDomainName,
            source: 'external',
            verification: 'verified',
            subscriptionId: null,
          },
        ],
        subscriptions: [pendingPool],
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await reviewManagedMailboxFromDashboard({
        canvasElement,
        domain: task8ReviewDomainName,
      });
      expect(
        await canvas.findByRole('button', {
          name: 'Complete locally — $5.00',
        }),
      ).toBeDisabled();
      expect(readMailboxResourceCount(canvasElement)).toBe(1);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedPoolSignature,
      );
      expect(
        canvas.queryByRole('heading', {
          name: 'Managed mailbox capacity applied',
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const NormalMailboxCommercialIdentityIsResourceScoped: Story = {
  name: 'Normal Mailbox Commercial Identity Is Resource Scoped',
  args: withTask8StoryArgs({
    initialWorkspace: {
      ...emptyWorkspace,
      domains: [
        {
          id: 'domain-task8-ordinary-mailbox-identity-verified-001',
          name: task8ReviewDomainName,
          source: 'external',
          verification: 'verified',
          subscriptionId: null,
        },
      ],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await reviewManagedMailboxFromDashboard({
      canvasElement,
      domain: task8ReviewDomainName,
    });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Complete locally — $5.00' }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Managed mailbox capacity applied',
      }),
    ).toBeVisible();
    const firstIdentity = readTask8AcquisitionIdentityProjection(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Return to dashboard' }),
    );

    await reviewManagedMailboxFromDashboard({
      canvasElement,
      domain: task8ReviewDomainName,
      localPart: 'alex',
    });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Complete locally — $5.00' }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Managed mailbox capacity applied',
      }),
    ).toBeVisible();
    const secondIdentity =
      readTask8AcquisitionIdentityProjection(canvasElement);

    expect(secondIdentity.acceptedQuoteId).not.toBe(
      firstIdentity.acceptedQuoteId,
    );
    expect(secondIdentity.acquisitionOperationId).not.toBe(
      firstIdentity.acquisitionOperationId,
    );
    expect(secondIdentity.quoteLineIds).not.toBe(firstIdentity.quoteLineIds);
  },
};

export const ManagedDomainCommercialIdentityIsResourceScoped: Story = {
  name: 'Managed Domain Commercial Identity Is Resource Scoped',
  args: withTask8StoryArgs({ initialWorkspace: emptyWorkspace }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await reviewManagedDomainFromDashboard({
      canvasElement,
      domain: 'mooreland.com',
    });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Complete locally — $14.29' }),
    );
    expect(
      await canvas.findByRole('heading', { name: 'Managed domain acquired' }),
    ).toBeVisible();
    const firstIdentity = readTask8AcquisitionIdentityProjection(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Return to dashboard' }),
    );

    await reviewManagedDomainFromDashboard({
      canvasElement,
      domain: 'mooreland-outreach.com',
    });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Complete locally — $14.29' }),
    );
    expect(
      await canvas.findByRole('heading', { name: 'Managed domain acquired' }),
    ).toBeVisible();
    const secondIdentity =
      readTask8AcquisitionIdentityProjection(canvasElement);

    expect(secondIdentity.acceptedQuoteId).not.toBe(
      firstIdentity.acceptedQuoteId,
    );
    expect(secondIdentity.acquisitionOperationId).not.toBe(
      firstIdentity.acquisitionOperationId,
    );
    expect(secondIdentity.quoteLineIds).not.toBe(firstIdentity.quoteLineIds);
    expect(secondIdentity.resourceOperationIds).not.toBe(
      firstIdentity.resourceOperationIds,
    );
    expect(secondIdentity.paymentEvidenceIds).not.toBe(
      firstIdentity.paymentEvidenceIds,
    );
    expect(secondIdentity.subscriptionOperationIds).not.toBe(
      firstIdentity.subscriptionOperationIds,
    );
  },
};
export const CreateMailboxWithoutVerifiedDomain: Story = {
  args: {
    initialFlow: 'mailbox-details',
    initialMailboxSource: 'create',
    initialWorkspace: emptyWorkspace,
  },
};

export const ConnectExistingMailbox: Story = {
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
  },
};

export const ConnectExistingMailboxProtocolChoice: Story = {
  name: 'Connect Existing Mailbox — Protocol Choice',
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = await canvas.findByLabelText('Email Address');
    const protocolChoices = await canvas.findByRole('radiogroup', {
      name: 'Connection protocol',
    });

    expect(
      email.compareDocumentPosition(protocolChoices) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(canvas.queryByLabelText('IMAP Server')).not.toBeInTheDocument();

    await chooseConnectionProtocol({ canvasElement, protocol: 'SMTP' });

    const smtpServer = canvas.getByLabelText('SMTP Server');
    const smtpPassword = canvas.getByLabelText('SMTP Password');
    const passwordVisibility = canvas.getByRole('button', {
      name: 'Show SMTP Password',
    });

    expect(smtpServer).toBeVisible();
    expect(canvas.queryByLabelText('IMAP Server')).not.toBeInTheDocument();
    expect(passwordVisibility).toHaveAttribute('aria-pressed', 'false');
    await pressFocusedButton(passwordVisibility);
    expect(
      canvas.getByRole('button', { name: 'Hide SMTP Password' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(smtpPassword).toHaveAttribute('name', 'SMTP.password');

    await chooseConnectionProtocol({ canvasElement, protocol: 'IMAP' });
    const imapPassword = canvas.getByLabelText('IMAP Password');
    expect(
      canvas.getByRole('button', { name: 'Show IMAP Password' }),
    ).toHaveAttribute('aria-pressed', 'false');
    const imapPasswordVisibility = canvas.getByRole('button', {
      name: 'Show IMAP Password',
    });
    await pressFocusedButton(imapPasswordVisibility);
    expect(
      canvas.getByRole('button', { name: 'Hide IMAP Password' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await chooseConnectionProtocol({ canvasElement, protocol: 'CALDAV' });
    const caldavServer = canvas.getByLabelText('CalDAV Server');
    const caldavPassword = canvas.getByLabelText('CalDAV Password');
    expect(caldavServer).toBeVisible();
    expect(caldavPassword).toHaveAttribute('type', 'password');
    expect(caldavPassword).toHaveAttribute('name', 'CALDAV.password');
    expect(canvas.queryByLabelText('IMAP Server')).not.toBeInTheDocument();

    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });

    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAttribute('name', 'handle');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-errormessage');

    const errorId = email.getAttribute('aria-errormessage');
    expect(errorId).not.toBeNull();
    expect(
      canvasElement.ownerDocument.getElementById(errorId ?? ''),
    ).toHaveTextContent(/invalid email|at least one account type/i);

    await userEvent.type(email, 'not-an-email');
    await userEvent.tab();
    expect(email).toHaveAttribute('aria-invalid', 'true');
  },
};

export const ConnectExistingMailboxSendingRequired: Story = {
  name: 'Connect Existing Mailbox — Sending Required',
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
    initialMailboxConnectionOutcome: 'connected',
  },
  play: async ({ canvasElement }) => {
    await fillConnectionForm({
      canvasElement,
      protocol: 'IMAP',
      address: 'imap-only@riveroak.io',
      host: 'imap.riveroak.io',
    });

    expect(
      within(canvasElement).getByLabelText('Mailbox sending capability'),
    ).toHaveTextContent(/cannot send|smtp is not configured/i);

    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    await resolveMailboxConnection(canvasElement);

    const row = getMailboxRow({
      canvasElement,
      address: 'imap-only@riveroak.io',
    });

    expect(
      within(row).queryByRole('button', {
        name: 'Start warmup for imap-only@riveroak.io',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(row).getByRole('button', {
        name: 'Configure SMTP for imap-only@riveroak.io',
      }),
    ).toBeVisible();
    expect(row).toHaveTextContent(/cannot send|smtp/i);
  },
};

export const TestingMailboxConnection: Story = {
  name: 'Testing Mailbox Connection',
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
    initialMailboxConnectionOutcome: 'connected',
    initialWorkspace: withStoryMailbox(
      createStoryConnectedMailbox({
        operation: {
          status: 'connected',
          operationId: 'mailbox-connection-001',
          configuredOutcome: 'connected',
        },
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const resourceCountBefore = readMailboxResourceCount(canvasElement);

    await fillConnectionForm({
      canvasElement,
      address: 'testing@riveroak.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });

    const operationId = readMailboxConnectionOperationId(canvasElement);
    const canvas = within(canvasElement);

    expect(operationId).toBe('mailbox-connection-002');
    expect(readMailboxConnectionState(canvasElement)).toBe('Testing');
    expect(
      await canvas.findByRole('status', {
        name: 'Mailbox connection pending',
      }),
    ).toHaveTextContent('Testing connection');
    expect(canvas.getByLabelText('Email address')).toBeDisabled();
    expect(canvas.queryByLabelText('SMTP Password')).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Connect mailbox locally' }),
    ).not.toBeInTheDocument();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
  },
};

export const MailboxConnectionFailed: Story = {
  name: 'Mailbox Connection Failed',
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
    initialMailboxConnectionOutcome: 'failed',
  },
  play: async ({ canvasElement }) => {
    await fillConnectionForm({
      canvasElement,
      address: 'failure@riveroak.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });

    const operationId = readMailboxConnectionOperationId(canvasElement);
    await resolveMailboxConnection(canvasElement);

    expect(readMailboxConnectionState(canvasElement)).toBe('Failed');
    expect(readMailboxConnectionOperationId(canvasElement)).toBe(operationId);
    expectSingleSafeAlert({
      canvasElement,
      diagnostic: storyConnectionDiagnostic,
    });
    assertNoSecretInStatus({ canvasElement });
    const retryConnection = within(canvasElement).getByRole('button', {
      name: 'Retry connection',
    });
    await waitFor(() => expect(retryConnection).toHaveFocus());

    await pressFocusedButton(retryConnection);

    const canvas = within(canvasElement);
    const password = await canvas.findByLabelText('SMTP Password');
    expect(password).toHaveValue('');
    expect(password).toHaveFocus();
    expect(canvas.getByLabelText('Email Address')).toBeDisabled();
    expect(
      canvas.getByRole('button', { name: 'Connect mailbox locally' }),
    ).toBeDisabled();

    await userEvent.type(password, storyConnectionPassword);
    expect(
      canvas.getByRole('button', { name: 'Connect mailbox locally' }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Connect mailbox locally' }),
    );
    expect(readMailboxConnectionState(canvasElement)).toBe('Testing');
    expect(readMailboxConnectionOperationId(canvasElement)).toBe(operationId);
  },
};

export const MailboxConnectionAmbiguous: Story = {
  name: 'Mailbox Connection Ambiguous',
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
    initialMailboxConnectionOutcome: 'unknown',
    initialMailboxConnectionReconcileOutcome: 'connected',
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const resourceCountBefore = readMailboxResourceCount(canvasElement);

    await fillConnectionForm({
      canvasElement,
      address: 'ambiguous@riveroak.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });

    const operationId = readMailboxConnectionOperationId(canvasElement);
    await resolveMailboxConnection(canvasElement);

    const canvas = within(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Unknown');
    expect(readMailboxConnectionOperationId(canvasElement)).toBe(operationId);
    expect(canvas.queryByLabelText('SMTP Password')).not.toBeInTheDocument();
    assertNoSecretInStatus({ canvasElement });
    expect(canvas.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    const reconcileConnection = canvas.getByRole('button', {
      name: 'Reconcile connection',
    });
    await waitFor(() => expect(reconcileConnection).toHaveFocus());
    await userEvent.click(reconcileConnection);

    await waitFor(() =>
      expect(
        getMailboxRow({
          canvasElement,
          address: 'ambiguous@riveroak.io',
        }),
      ).toBeVisible(),
    );
    expect(readMailboxResourceCount(canvasElement)).toBe(
      resourceCountBefore + 1,
    );
    expect(
      within(canvasElement).getByLabelText(
        'Connection operation for ambiguous@riveroak.io',
      ),
    ).toHaveTextContent(operationId);
  },
};

export const MailboxConnectionRecovered: Story = {
  name: 'Mailbox Connection Recovered',
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
    initialMailboxConnectionOutcomes: ['failed', 'connected', 'unknown'],
    initialMailboxConnectionReconcileOutcome: 'connected',
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const resourceCountBefore = readMailboxResourceCount(canvasElement);

    await fillConnectionForm({
      canvasElement,
      address: 'recovered@riveroak.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });

    const failedOperationId = readMailboxConnectionOperationId(canvasElement);
    await resolveMailboxConnection(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Failed');

    await clickStoryButton({ canvasElement, name: 'Retry connection' });
    const retryPassword =
      await within(canvasElement).findByLabelText('SMTP Password');
    await userEvent.type(retryPassword, storyConnectionPassword);
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    expect(readMailboxConnectionOperationId(canvasElement)).toBe(
      failedOperationId,
    );
    await resolveMailboxConnection(canvasElement);

    await waitFor(() =>
      expect(
        getMailboxRow({
          canvasElement,
          address: 'recovered@riveroak.io',
        }),
      ).toBeVisible(),
    );
    expect(readMailboxResourceCount(canvasElement)).toBe(
      resourceCountBefore + 1,
    );
    expect(
      within(canvasElement).getByLabelText(
        'Connection operation for recovered@riveroak.io',
      ),
    ).toHaveTextContent(failedOperationId);

    await openMailboxActions({
      canvasElement,
      address: 'recovered@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Retest/Reconnect',
      }),
    );

    const retestPassword =
      await within(canvasElement).findByLabelText('SMTP Password');
    await userEvent.type(retestPassword, storyConnectionPassword);
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });

    const reconciliationOperationId =
      readMailboxConnectionOperationId(canvasElement);
    await resolveMailboxConnection(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Unknown');
    await clickStoryButton({ canvasElement, name: 'Reconcile connection' });

    await waitFor(() =>
      expect(
        within(canvasElement).getByLabelText(
          'Connection operation for recovered@riveroak.io',
        ),
      ).toHaveTextContent(reconciliationOperationId),
    );
    expect(readMailboxResourceCount(canvasElement)).toBe(
      resourceCountBefore + 1,
    );
  },
};

export const MailboxDraftPreserved: Story = {
  name: 'Mailbox Draft Preserved',
  args: {
    initialFlow: 'mailbox-connection',
    initialMailboxSource: 'connect',
  },
  play: async ({ canvasElement }) => {
    await fillConnectionForm({
      canvasElement,
      address: 'draft@riveroak.io',
      host: 'smtp.draft.riveroak.io',
    });

    await clickStoryButton({ canvasElement, name: 'Back' });
    expect(
      await within(canvasElement.ownerDocument.body).findByRole('heading', {
        name: 'Discard connection passwords?',
      }),
    ).toBeVisible();
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(within(canvasElement).getByLabelText('SMTP Password')).toHaveValue(
      storyConnectionPassword,
    );

    await clickStoryButton({ canvasElement, name: 'Back' });
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('button', {
        name: 'Discard passwords and go back',
      }),
    );
    await clickStoryButton({ canvasElement, name: 'Continue' });

    const canvas = within(canvasElement);
    expect(await canvas.findByLabelText('Email Address')).toHaveValue(
      'draft@riveroak.io',
    );
    expect(canvas.getByLabelText('SMTP Server')).toHaveValue(
      'smtp.draft.riveroak.io',
    );
    expect(canvas.getByLabelText('SMTP Password')).toHaveValue('');
    assertNoSecretInStatus({ canvasElement });
  },
};

export const ConnectedMailboxNeedsAttention: Story = {
  name: 'Connected Mailbox Needs Attention',
  args: {
    initialWorkspace: withStoryMailbox(
      createStoryConnectedMailbox({
        operation: {
          status: 'failed',
          operationId: 'connection-operation-rory-attention-001',
          configuredOutcome: 'failed',
          safeDiagnostic: storyConnectionDiagnostic,
        },
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const row = getMailboxRow({
      canvasElement,
      address: 'rory@riveroak.io',
    });

    expect(row).toHaveTextContent('Connection failed');
    expect(row).toHaveTextContent('Ready');
    await expectWarmupState({
      canvasElement,
      address: 'rory@riveroak.io',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    const attention = within(canvasElement).getByRole('region', {
      name: 'Needs attention',
    });
    expect(attention).toHaveTextContent(
      'rory@riveroak.io connection needs attention.',
    );
    expect(
      within(attention).getByRole('button', { name: 'Retest/Reconnect' }),
    ).toBeEnabled();

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });

    const actions = within(canvasElement.ownerDocument.body);
    expect(
      await actions.findByRole('button', { name: 'Edit connection' }),
    ).toBeVisible();
    expect(
      actions.getAllByRole('button', { name: 'Retest/Reconnect' }),
    ).toHaveLength(2);
    expect(actions.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  },
};

export const ConnectedMailboxReconciliationRequired: Story = {
  name: 'Connected Mailbox Reconciliation Required',
  args: {
    initialWorkspace: withStoryMailbox(
      createManagedEmailDesignMailbox({
        ...createStoryConnectedMailbox(),
        connection: {
          draft: { address: 'rory@riveroak.io' },
          capabilities: ['imap', 'smtp'],
          operation: {
            status: 'unknown',
            operationId: 'connection-operation-rory-unknown-001',
            configuredOutcome: 'unknown',
            safeDiagnostic: storyConnectionDiagnostic,
          },
        },
      }),
    ),
    initialMailboxConnectionReconcileOutcome: 'connected',
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });

    const documentCanvas = within(canvasElement.ownerDocument.body);
    expect(
      await documentCanvas.findByRole('button', {
        name: 'Reconcile connection',
      }),
    ).toBeVisible();
    expect(
      documentCanvas.queryByRole('button', { name: 'Edit connection' }),
    ).not.toBeInTheDocument();
    expect(
      documentCanvas.queryByRole('button', { name: 'Retest/Reconnect' }),
    ).not.toBeInTheDocument();
    const disabledDisconnect = documentCanvas.getByRole('button', {
      name: 'Disconnect',
    });
    expect(disabledDisconnect).toBeDisabled();
    expect(disabledDisconnect).toHaveAccessibleDescription(
      'Reconcile the connection result before disconnecting this mailbox.',
    );

    await userEvent.click(
      documentCanvas.getByRole('button', { name: 'Reconcile connection' }),
    );

    const canvas = within(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Unknown');
    expect(readMailboxConnectionOperationId(canvasElement)).toBe(
      'connection-operation-rory-unknown-001',
    );
    expect(canvas.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconcile connection' }),
    );

    await waitFor(() =>
      expect(
        getMailboxRow({
          canvasElement,
          address: 'rory@riveroak.io',
        }),
      ).toHaveTextContent('Connected'),
    );
    expect(
      within(canvasElement).getByLabelText(
        'Connection operation for rory@riveroak.io',
      ),
    ).toHaveTextContent('connection-operation-rory-unknown-001');
    expect(
      within(canvasElement).getByLabelText(
        'Connection draft for rory@riveroak.io',
      ),
    ).toHaveTextContent('Protocol not selected');
    expect(
      getMailboxRow({
        canvasElement,
        address: 'rory@riveroak.io',
      }),
    ).not.toHaveTextContent(
      'SMTP is not configured, so this mailbox cannot send mail.',
    );
  },
};

export const StoredMailboxReconciliationFailedRetryConnected: Story = {
  name: 'Stored Mailbox Reconciliation Failed Retry Connected',
  args: {
    initialWorkspace: withStoryMailbox(
      createManagedEmailDesignMailbox({
        ...createStoryConnectedMailbox(),
        connection: {
          draft: {
            address: 'rory@riveroak.io',
            selectedProtocol: 'SMTP',
            host: 'smtp-old.riveroak.io',
            port: 465,
            connectionSecurity: 'SSL_TLS',
            username: 'rory',
          },
          capabilities: ['imap', 'smtp'],
          canSend: false,
          sendingCapabilityReason:
            'SMTP is not configured, so this mailbox cannot send mail.',
          operation: {
            status: 'unknown',
            operationId: 'connection-operation-rory-unknown-retry-001',
            configuredOutcome: 'unknown',
            safeDiagnostic: storyConnectionDiagnostic,
          },
        },
      }),
    ),
    initialMailboxConnectionOutcomes: ['unknown'],
    initialMailboxConnectionReconcileOutcomes: ['failed', 'connected'],
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    const documentCanvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await documentCanvas.findByRole('button', {
        name: 'Reconcile connection',
      }),
    );

    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconcile connection' }),
    );
    expect(readMailboxConnectionState(canvasElement)).toBe('Failed');

    await clickStoryButton({ canvasElement, name: 'Retry connection' });
    const server = canvas.getByLabelText('SMTP Server');
    const password = canvas.getByLabelText('SMTP Password');
    await userEvent.clear(server);
    await userEvent.type(server, 'smtp.riveroak.io');
    await userEvent.type(password, storyConnectionPassword);
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });

    expect(readMailboxConnectionOperationId(canvasElement)).toBe(
      'connection-operation-rory-unknown-retry-001',
    );
    await resolveMailboxConnection(canvasElement);

    expect(readMailboxConnectionState(canvasElement)).toBe('Unknown');
    await clickStoryButton({
      canvasElement,
      name: 'Reconcile connection',
    });
    await waitFor(() =>
      expect(
        getMailboxRow({
          canvasElement,
          address: 'rory@riveroak.io',
        }),
      ).toHaveTextContent('Eligible'),
    );
    expect(
      canvas.getByLabelText('Connection draft for rory@riveroak.io'),
    ).toHaveTextContent('SMTP · smtp.riveroak.io · 465 · SSL_TLS');
  },
};

export const ConnectedMailboxCheckPending: Story = {
  name: 'Connected Mailbox Check Pending',
  args: {
    initialWorkspace: withStoryMailbox(
      createStoryConnectedMailbox({
        operation: {
          status: 'testing',
          operationId: 'connection-operation-rory-testing-001',
          configuredOutcome: 'connected',
        },
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });

    const documentCanvas = within(canvasElement.ownerDocument.body);
    expect(
      await documentCanvas.findByRole('button', {
        name: 'Resume connection check',
      }),
    ).toBeVisible();
    expect(
      documentCanvas.queryByRole('button', { name: 'Edit connection' }),
    ).not.toBeInTheDocument();
    expect(
      documentCanvas.queryByRole('button', { name: 'Retest/Reconnect' }),
    ).not.toBeInTheDocument();
    const disconnectButton = documentCanvas.getByRole('button', {
      name: 'Disconnect',
    });
    expect(disconnectButton).toBeDisabled();
    expect(disconnectButton).toHaveAccessibleDescription(
      'Wait for the connection check to finish before disconnecting this mailbox.',
    );

    await userEvent.click(
      documentCanvas.getByRole('button', { name: 'Resume connection check' }),
    );

    const canvas = within(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Testing');
    expect(readMailboxConnectionOperationId(canvasElement)).toBe(
      'connection-operation-rory-testing-001',
    );
    expect(canvas.getByLabelText('Email address')).toBeDisabled();
    expect(canvas.queryByLabelText('SMTP Password')).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Resolve connection result' }),
    );

    await waitFor(() =>
      expect(
        getMailboxRow({
          canvasElement,
          address: 'rory@riveroak.io',
        }),
      ).toHaveTextContent('Connected'),
    );
    expect(
      within(canvasElement).getByLabelText(
        'Connection operation for rory@riveroak.io',
      ),
    ).toHaveTextContent('connection-operation-rory-testing-001');
  },
};

export const ConnectedMailboxLegacyProtocolSelection: Story = {
  name: 'Connected Mailbox Legacy Protocol Selection',
  args: {
    initialWorkspace: withStoryMailbox(
      createManagedEmailDesignMailbox({
        ...createStoryConnectedMailbox(),
        connection: {
          draft: {
            address: 'rory@riveroak.io',
          },
          capabilities: ['imap'],
          operation: {
            status: 'connected',
            operationId: 'connection-operation-rory-legacy-001',
            configuredOutcome: 'connected',
          },
        },
      }),
    ),
    initialMailboxConnectionOutcomes: ['connected'],
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const resourceCountBefore = readMailboxResourceCount(canvasElement);

    const roryRow = getMailboxRow({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    expect(
      within(roryRow).getByLabelText('Warmup eligibility for rory@riveroak.io'),
    ).toHaveTextContent('Provider cannot send');
    expect(
      within(roryRow).queryByRole('button', {
        name: 'Start warmup for rory@riveroak.io',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(roryRow).getByRole('button', {
        name: 'Configure SMTP for rory@riveroak.io',
      }),
    ).toBeEnabled();

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Edit connection',
      }),
    );

    const canvas = within(canvasElement);
    expect(await canvas.findByLabelText('Email Address')).toBeDisabled();
    const protocolChoices = canvas.getByRole('radiogroup', {
      name: 'Connection protocol',
    });
    for (const protocolChoice of within(protocolChoices).getAllByRole(
      'radio',
    )) {
      expect(protocolChoice).toBeEnabled();
    }

    await chooseConnectionProtocol({
      canvasElement,
      protocol: 'SMTP',
    });

    for (const protocolChoice of within(protocolChoices).getAllByRole(
      'radio',
    )) {
      expect(protocolChoice).toBeDisabled();
    }
    const server = canvas.getByLabelText('SMTP Server');
    const password = canvas.getByLabelText('SMTP Password');
    const submit = canvas.getByRole('button', {
      name: 'Connect mailbox locally',
    });
    expect(password).toBeEnabled();
    expect(password).toHaveValue('');
    expect(submit).toBeDisabled();
    await userEvent.type(server, 'smtp.legacy.riveroak.io');
    expect(submit).toBeDisabled();

    await clickStoryButton({ canvasElement, name: 'Back' });
    await clickStoryButton({ canvasElement, name: 'Continue' });

    const serverAfterBack = await canvas.findByLabelText('SMTP Server');
    const passwordAfterBack = canvas.getByLabelText('SMTP Password');
    const submitAfterBack = canvas.getByRole('button', {
      name: 'Connect mailbox locally',
    });
    expect(serverAfterBack).toHaveValue('smtp.legacy.riveroak.io');
    expect(passwordAfterBack).toBeEnabled();
    expect(passwordAfterBack).toHaveValue('');
    expect(submitAfterBack).toBeDisabled();
    await userEvent.type(passwordAfterBack, storyConnectionPassword);
    expect(submitAfterBack).toBeEnabled();
    await userEvent.click(submitAfterBack);
    await resolveMailboxConnection(canvasElement);

    await waitFor(() =>
      expect(
        within(canvasElement).getByLabelText(
          'Connection draft for rory@riveroak.io',
        ),
      ).toHaveTextContent('smtp.legacy.riveroak.io'),
    );
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
  },
};

export const DisconnectConnectedMailboxWithConfirmedWarmup: Story = {
  name: 'Disconnect Connected Mailbox With Confirmed Warmup',
  args: {
    initialWorkspace: {
      ...workspaceWithAvailableWarmupCapacity,
      mailboxes: [
        createStoryConnectedMailbox({
          warmupState: {
            assignment: 'assigned',
            lastConfirmedProviderState: 'warming',
            operation: { status: 'idle' },
          },
        }),
        ...workspaceWithAvailableWarmupCapacity.mailboxes.filter(
          (mailbox) => mailbox.id !== 'mailbox-rory',
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const poolSignature = readMailboxPoolSignature(canvasElement);
    expect(readWarmupCapacityText(canvasElement)).toContain(
      '3 of 3 assigned · 0 slots available',
    );

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect',
      }),
    );

    expect(
      await within(canvasElement).findByText(
        'Stop warmup and wait for confirmed provider inactivity before removing this mailbox.',
      ),
    ).toBeVisible();
    await expectWarmupState({
      canvasElement,
      address: 'rory@riveroak.io',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Stop warmup',
      }),
    );
    const stopWarmupDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', { name: 'Stop warmup?' });
    await userEvent.click(
      within(stopWarmupDialog).getByRole('button', {
        name: 'Stop warmup',
      }),
    );
    await resolveWarmupOperation(canvasElement);

    await expectWarmupState({
      canvasElement,
      address: 'rory@riveroak.io',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    expect(readWarmupCapacityText(canvasElement)).toContain(
      '2 of 3 assigned · 1 slot available',
    );
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect',
      }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect mailbox',
      }),
    );

    await waitFor(() =>
      expect(
        within(canvasElement).queryByText('rory@riveroak.io'),
      ).not.toBeInTheDocument(),
    );
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);
    expect(
      within(canvasElement).getByText('riveroak.io', { exact: true }),
    ).toBeVisible();
  },
};

export const DisconnectLastMailboxRequiresDomainVerification: Story = {
  name: 'Disconnect Last Mailbox Requires Domain Verification',
  args: {
    initialWorkspace: {
      ...withStoryMailbox(createStoryConnectedMailbox()),
      domains: mixedWorkspace.domains.map((domain) =>
        domain.name === 'riveroak.io'
          ? { ...domain, verification: 'mailbox-connected' }
          : domain,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect',
      }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect mailbox',
      }),
    );

    await waitFor(() =>
      expect(
        within(canvasElement).queryByText('rory@riveroak.io'),
      ).not.toBeInTheDocument(),
    );
    await assertDomainVerification({
      canvasElement,
      domain: 'riveroak.io',
      verification: 'Verification required',
    });
    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    expect(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Verify DNS',
      }),
    ).toBeVisible();
  },
};

export const MailboxRemovalRestoresStableFocus: Story = {
  name: 'Mailbox Removal Restores Stable Focus',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-removal-focus-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        source: 'connected',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const address = 'rory@riveroak.io';
    const mailboxActions = await canvas.findByRole('button', {
      name: `More actions for ${address}`,
    });
    const openRemovalDialog = async () => {
      await openMailboxActions({ canvasElement, address });
      await userEvent.click(
        await body.findByRole('button', { name: 'Disconnect' }),
      );

      return body.findByRole('dialog', {
        name: `Disconnect ${address}?`,
      });
    };

    const cancelDialog = await openRemovalDialog();
    await userEvent.click(
      within(cancelDialog).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: `Disconnect ${address}?` }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(mailboxActions).toHaveFocus());

    const escapeDialog = await openRemovalDialog();
    expect(escapeDialog).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: `Disconnect ${address}?` }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(mailboxActions).toHaveFocus());

    const addMailbox = canvas.getByRole('button', { name: 'Add mailbox' });
    const confirmDialog = await openRemovalDialog();
    await userEvent.click(
      within(confirmDialog).getByRole('button', {
        name: 'Disconnect mailbox',
      }),
    );

    await waitFor(() =>
      expect(
        canvas.queryByRole('button', {
          name: `More actions for ${address}`,
        }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(addMailbox).toHaveFocus());
  },
};

export const StopWarmupRestoresStableFocus: Story = {
  name: 'Stop Warmup Restores Stable Focus',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-stop-focus-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 1, mailboxes }),
          createTask7WarmupSubscription({ quantity: 1 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const address = 'rory@riveroak.io';
    const mailboxActions = await canvas.findByRole('button', {
      name: `More actions for ${address}`,
    });
    const openStopWarmupDialog = async () => {
      await openMailboxActions({ canvasElement, address });
      await userEvent.click(
        await body.findByRole('button', { name: 'Stop warmup' }),
      );

      return body.findByRole('dialog', { name: 'Stop warmup?' });
    };

    const cancelDialog = await openStopWarmupDialog();
    await userEvent.click(
      within(cancelDialog).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Stop warmup?' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(mailboxActions).toHaveFocus());

    const escapeDialog = await openStopWarmupDialog();
    expect(escapeDialog).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Stop warmup?' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(mailboxActions).toHaveFocus());

    const confirmDialog = await openStopWarmupDialog();
    await userEvent.click(
      within(confirmDialog).getByRole('button', { name: 'Stop warmup' }),
    );

    const resolveWarmupOperation = await canvas.findByRole('button', {
      name: 'Resolve warmup operation',
    });
    await waitFor(() => expect(resolveWarmupOperation).toHaveFocus());
  },
};

export const EditConnectedMailbox: Story = {
  name: 'Edit Connected Mailbox',
  args: {
    initialWorkspace: withStoryMailbox(createStoryConnectedMailbox()),
    initialMailboxConnectionOutcomes: ['connected'],
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    const poolSignature = readMailboxPoolSignature(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Edit connection',
      }),
    );

    const canvas = within(canvasElement);
    const server = await canvas.findByLabelText('SMTP Server');
    const password = canvas.getByLabelText('SMTP Password');

    expect(canvas.getByLabelText('Mailbox connection mode')).toHaveTextContent(
      'Edit',
    );
    const email = canvas.getByLabelText('Email Address');
    const changePassword = canvas.getByRole('button', {
      name: 'Change password',
    });

    expect(email).toBeDisabled();
    const protocolChoices = canvas.getByRole('radiogroup', {
      name: 'Connection protocol',
    });
    expect(
      within(protocolChoices).getByRole('radio', { name: 'SMTP' }),
    ).toBeChecked();
    for (const protocolChoice of within(protocolChoices).getAllByRole(
      'radio',
    )) {
      expect(protocolChoice).toBeDisabled();
    }
    expect(password).toBeDisabled();
    changePassword.focus();
    await userEvent.keyboard('{Enter}');
    expect(password).toBeEnabled();
    await userEvent.clear(server);
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    expect(server).toHaveFocus();

    await userEvent.type(server, 'smtp.edited.riveroak.io');
    await userEvent.type(password, storyConnectionPassword);
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    await resolveMailboxConnection(canvasElement);

    await waitFor(() =>
      expect(
        within(canvasElement).getByLabelText(
          'Connection draft for rory@riveroak.io',
        ),
      ).toHaveTextContent('smtp.edited.riveroak.io'),
    );
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);

    const row = getMailboxRow({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    expect(row).toHaveTextContent('riveroak.io');
    expect(row).toHaveTextContent('Ready');
    await expectWarmupState({
      canvasElement,
      address: 'rory@riveroak.io',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
  },
};

export const AddMailboxAfterAbandonedEdit: Story = {
  name: 'Add Mailbox After Abandoned Edit',
  args: {
    initialWorkspace: withStoryMailbox(createStoryConnectedMailbox()),
    initialMailboxConnectionOutcomes: ['connected'],
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const resourceCountBefore = readMailboxResourceCount(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Edit connection',
      }),
    );
    await clickStoryButton({ canvasElement, name: 'Back' });
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole('radio', {
          name: 'Connect an existing mailbox',
        }),
      ).toHaveFocus(),
    );
    await clickStoryButton({ canvasElement, name: 'Back' });
    await clickStoryButton({ canvasElement, name: 'Add mailbox' });

    const canvas = within(canvasElement);
    const sourceGroup = await canvas.findByRole('radiogroup', {
      name: 'Mailbox source',
    });
    const connectSource = within(sourceGroup).getByRole('radio', {
      name: 'Connect an existing mailbox',
    });

    await userEvent.click(connectSource);
    await clickStoryButton({ canvasElement, name: 'Continue' });

    expect(
      await canvas.findByLabelText('Mailbox connection mode'),
    ).toHaveTextContent('Add');
    await fillConnectionForm({
      canvasElement,
      address: 'fresh@riveroak.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    const firstOperationId = readMailboxConnectionOperationId(canvasElement);
    await resolveMailboxConnection(canvasElement);

    await waitFor(() =>
      expect(
        getMailboxRow({
          canvasElement,
          address: 'fresh@riveroak.io',
        }),
      ).toBeVisible(),
    );
    expect(
      getMailboxRow({
        canvasElement,
        address: 'rory@riveroak.io',
      }),
    ).toBeVisible();
    expect(readMailboxResourceCount(canvasElement)).toBe(
      resourceCountBefore + 1,
    );

    await clickStoryButton({ canvasElement, name: 'Add mailbox' });
    const secondSourceGroup = await canvas.findByRole('radiogroup', {
      name: 'Mailbox source',
    });
    await userEvent.click(
      within(secondSourceGroup).getByRole('radio', {
        name: 'Connect an existing mailbox',
      }),
    );
    await clickStoryButton({ canvasElement, name: 'Continue' });
    await fillConnectionForm({
      canvasElement,
      address: 'second-fresh@riveroak.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    expect(readMailboxConnectionOperationId(canvasElement)).not.toBe(
      firstOperationId,
    );
  },
};

export const RetestReconnectConnectedMailbox: Story = {
  name: 'Retest/Reconnect Connected Mailbox',
  args: {
    initialWorkspace: withStoryMailbox(createStoryConnectedMailbox()),
    initialMailboxConnectionOutcomes: ['failed', 'unknown'],
    initialMailboxConnectionReconcileOutcome: 'connected',
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    const poolSignature = readMailboxPoolSignature(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Retest/Reconnect',
      }),
    );

    await userEvent.type(
      await within(canvasElement).findByLabelText('SMTP Password'),
      storyConnectionPassword,
    );

    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    const operationId = readMailboxConnectionOperationId(canvasElement);
    await resolveMailboxConnection(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Failed');
    assertNoSecretInStatus({ canvasElement });

    await clickStoryButton({ canvasElement, name: 'Retry connection' });
    await userEvent.type(
      await within(canvasElement).findByLabelText('SMTP Password'),
      storyConnectionPassword,
    );
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    expect(readMailboxConnectionOperationId(canvasElement)).toBe(operationId);
    await resolveMailboxConnection(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Unknown');
    await clickStoryButton({ canvasElement, name: 'Reconcile connection' });

    await waitFor(() =>
      expect(
        within(canvasElement).getByLabelText(
          'Connection operation for rory@riveroak.io',
        ),
      ).toHaveTextContent(operationId),
    );
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);
  },
};

export const RemoveManagedMailbox: Story = {
  name: 'Remove Managed Mailbox',
  args: {
    initialWorkspace: withStoryMailbox(
      createManagedEmailDesignMailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        source: 'managed',
        readiness: 'not-ready',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const poolSignature = readMailboxPoolSignature(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    expect(
      within(canvasElement.ownerDocument.body).getByRole('button', {
        name: 'Remove mailbox',
      }),
    ).toHaveAccessibleDescription(
      'Stop warmup and wait for confirmed provider inactivity before removing this mailbox.',
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Manage mailbox capacity',
      }),
    );
    expect(
      within(canvasElement).getByLabelText('Mailbox capacity subscription ID'),
    ).toHaveTextContent('subscription-managed-mailbox');

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox',
      }),
    );

    expect(
      await within(canvasElement).findByText(
        'Stop warmup and wait for confirmed provider inactivity before removing this mailbox.',
      ),
    ).toBeVisible();
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Stop warmup',
      }),
    );
    const stopWarmupDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', { name: 'Stop warmup?' });
    await userEvent.click(
      within(stopWarmupDialog).getByRole('button', {
        name: 'Stop warmup',
      }),
    );
    await resolveWarmupOperation(canvasElement);

    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox',
      }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox resource',
      }),
    );

    await waitFor(() =>
      expect(
        within(canvasElement).queryByText('mira@northstar-outreach.com'),
      ).not.toBeInTheDocument(),
    );
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);
    expect(
      within(canvasElement).getByText('jordan@northstar-outreach.com', {
        exact: true,
      }),
    ).toBeVisible();
  },
};

export const RemovePrewarmedMailbox: Story = {
  name: 'Remove Prewarmed Mailbox',
  args: {
    initialWorkspace: withStoryMailbox(
      createManagedEmailDesignMailbox({
        id: 'mailbox-avery',
        identity: 'Avery Miles',
        address: 'avery@fleetwave-mail.com',
        domain: 'fleetwave-mail.com',
        source: 'prewarmed',
        readiness: 'not-ready',
        warmupState: {
          assignment: 'unassigned',
          lastConfirmedProviderState: 'inactive',
          operation: { status: 'idle' },
        },
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const poolSignature = readMailboxPoolSignature(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Manage mailbox capacity',
      }),
    );
    expect(
      within(canvasElement).getByLabelText('Mailbox capacity subscription ID'),
    ).toHaveTextContent('subscription-managed-mailbox');

    await openMailboxActions({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox',
      }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox resource',
      }),
    );

    await waitFor(() =>
      expect(
        within(canvasElement).queryByText('avery@fleetwave-mail.com'),
      ).not.toBeInTheDocument(),
    );
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);
    expect(
      within(canvasElement).getByText('fleetwave-mail.com', { exact: true }),
    ).toBeVisible();
    expect(
      within(canvasElement).getByText('rowan@fleetwave-mail.com', {
        exact: true,
      }),
    ).toBeVisible();
  },
};

export const DomainRemovalAfterMailboxAction: Story = {
  name: 'Domain Removal After Mailbox Action',
  args: {
    initialWorkspace: withStoryMailbox(createStoryConnectedMailbox()),
  },
  play: async ({ canvasElement }) => {
    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect domain',
      }),
    );
    expect(
      within(canvasElement).getByText(
        /Cannot disconnect riveroak\.io: 1 linked mailbox is/i,
      ),
    ).toBeVisible();
    await clickStoryButton({ canvasElement, name: 'View linked mailboxes' });

    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole('heading', {
        name: 'Linked mailboxes for riveroak.io',
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Disconnect mailbox rory@riveroak.io',
      }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect mailbox',
      }),
    );
    expect(
      canvas.queryByText('rory@riveroak.io', { exact: true }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Back to domains' }),
    );
    const domainActions = await canvas.findByRole('button', {
      name: 'More actions for riveroak.io',
    });
    expect(domainActions).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect domain',
      }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect domain',
      }),
    );

    await waitFor(() =>
      expect(
        within(canvasElement).queryByText('riveroak.io', { exact: true }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(canvasElement).getByText('northstar-outreach.com', {
        exact: true,
      }),
    ).toBeVisible();
  },
};

export const DomainRemovalRestoresStableFocus: Story = {
  name: 'Domain Removal Restores Stable Focus',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      domains: mixedWorkspace.domains.filter(
        (domain) => domain.name === 'riveroak.io',
      ),
      mailboxes: [],
      prewarmedBundles: [],
      subscriptions: [],
    } satisfies ManagedEmailDesignWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const domain = 'riveroak.io';
    const domainActions = await canvas.findByRole('button', {
      name: `More actions for ${domain}`,
    });
    const openRemovalDialog = async () => {
      await openDomainActions({ canvasElement, domain });
      await userEvent.click(
        await body.findByRole('button', { name: 'Disconnect domain' }),
      );

      return body.findByRole('dialog', {
        name: `Disconnect domain ${domain}?`,
      });
    };

    const cancelDialog = await openRemovalDialog();
    await userEvent.click(
      within(cancelDialog).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: `Disconnect domain ${domain}?` }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(domainActions).toHaveFocus());

    const escapeDialog = await openRemovalDialog();
    expect(escapeDialog).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: `Disconnect domain ${domain}?` }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(domainActions).toHaveFocus());

    const confirmDialog = await openRemovalDialog();
    await userEvent.click(
      within(confirmDialog).getByRole('button', {
        name: 'Disconnect domain',
      }),
    );

    await waitFor(() =>
      expect(
        canvas.queryByRole('button', {
          name: `More actions for ${domain}`,
        }),
      ).not.toBeInTheDocument(),
    );
    const addDomain = await canvas.findByRole('button', {
      name: 'Add domain',
    });
    await waitFor(() => expect(addDomain).toHaveFocus());
  },
};

export const PrewarmedInventoryAvailable: Story = {
  args: {
    initialFlow: 'prewarmed-inventory',
  },
  play: async ({ canvasElement }) => {
    await assertCardPickerChoiceGroup({
      canvasElement,
      groupName: 'Prewarmed mailbox bundle',
      selectedName: 'harborline-mail.com',
      expectedRadioCount: 1,
      initialSelectionName: 'harborline-mail.com',
    });
    expect(
      within(canvasElement).queryByText('Ready on delivery', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      within(canvasElement).getByText('Available in local inventory', {
        exact: true,
      }),
    ).toBeVisible();
    await userEvent.click(
      within(canvasElement).getByRole('button', {
        name: 'Review selected bundle',
      }),
    );
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('heading', {
        name: 'Review prewarmed bundle',
      }),
    ).toBeVisible();
    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Prewarmed bundle domain',
          resource: task8PrewarmedBundle.domain,
          cadence: 'Annual',
          unitPrice: '$14.29',
          quantity: '1',
          amount: '$14.29',
        },
        ...task8PrewarmedBundle.mailboxIdentities.map(
          ({ identity, address }) => ({
            service: 'Prewarmed managed mailbox',
            resource: `${identity} <${address}>`,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '1',
            amount: '$5.00',
          }),
        ),
      ],
      dueToday: '$24.29',
      annualRenewal: {
        amount: '$14.29',
        date: '2028-01-10',
        effectiveDate: '2027-01-10T12:00:00.000Z',
      },
      monthlyRenewal: {
        amount: '$10.00',
        date: '2027-02-10',
        effectiveDate: '2027-01-10T12:00:00.000Z',
      },
    });
    expect(
      canvas.queryByRole('checkbox', {
        name: 'Continue managed warmup',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('row', { name: /Managed warmup capacity/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Complete locally — $24.29' }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Prewarmed mailboxes acquired',
      }),
    ).toBeVisible();
    const completedResources = canvas.getByRole('list', {
      name: 'Completed local resources',
    });
    expect(within(completedResources).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(completedResources).getByText(task8PrewarmedBundle.domain, {
        exact: true,
      }),
    ).toBeVisible();
    for (const mailbox of task8PrewarmedBundle.mailboxIdentities) {
      expect(
        within(completedResources).getByText(mailbox.address, {
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Acquisition operation status',
      }),
    ).toBe('Succeeded');
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Recorded local charge count',
      }),
    ).toBe('3');
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Managed mailbox resource count',
      }),
    ).toBe('7');
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Prewarmed inventory count',
      }),
    ).toBe('1');
    const ownershipSignature = readStoryOutput({
      canvasElement,
      label: 'Managed mailbox ownership signature',
    });
    expect(ownershipSignature).toContain(
      'story-mailbox-samira@harborline-mail.com:subscription-managed-mailbox',
    );
    expect(ownershipSignature).toContain(
      'story-mailbox-theo@harborline-mail.com:subscription-managed-mailbox',
    );

    await userEvent.click(
      canvas.getByRole('button', { name: 'Return to dashboard' }),
    );
    expect(
      await canvas.findByLabelText(
        'Warmup assignment for samira@harborline-mail.com',
      ),
    ).toHaveTextContent('Unassigned');
    expect(
      canvas.getByLabelText('Warmup assignment for theo@harborline-mail.com'),
    ).toHaveTextContent('Unassigned');
    expect(
      canvas.getByLabelText(
        'Warmup eligibility for samira@harborline-mail.com',
      ),
    ).toHaveTextContent('Ready without ongoing warmup');
    expect(
      canvas.getByLabelText('Warmup eligibility for theo@harborline-mail.com'),
    ).toHaveTextContent('Ready without ongoing warmup');
  },
};

export const PrewarmedInventoryUsesSpareMailboxCapacity: Story = (() => {
  const currentMailboxPool = mixedWorkspace.subscriptions.find(
    (
      subscription,
    ): subscription is ManagedEmailDesignRecurringSubscription & {
      product: 'managed-mailbox';
      status: 'active';
    } =>
      subscription.product === 'managed-mailbox' &&
      subscription.status === 'active',
  );
  if (currentMailboxPool === undefined) {
    throw new Error('Expected the mixed workspace mailbox pool.');
  }

  return {
    args: {
      initialFlow: 'prewarmed-inventory',
      initialWorkspace: {
        ...mixedWorkspace,
        subscriptions: mixedWorkspace.subscriptions.map((subscription) =>
          subscription.id === currentMailboxPool.id
            ? createManagedEmailDesignRecurringSubscription({
                ...currentMailboxPool,
                quantity: 6,
              })
            : subscription,
        ),
      },
    },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await assertCardPickerChoiceGroup({
        canvasElement,
        groupName: 'Prewarmed mailbox bundle',
        selectedName: 'harborline-mail.com',
        expectedRadioCount: 1,
        initialSelectionName: 'harborline-mail.com',
      });

      await userEvent.click(
        await canvas.findByRole('button', {
          name: 'Review selected bundle',
        }),
      );
      await expectTask8ReviewCharges({
        canvasElement,
        rows: [
          {
            service: 'Prewarmed bundle domain',
            resource: task8PrewarmedBundle.domain,
            cadence: 'Annual',
            unitPrice: '$14.29',
            quantity: '1',
            amount: '$14.29',
          },
          ...task8PrewarmedBundle.mailboxIdentities.map(
            ({ identity, address }) => ({
              service: 'Prewarmed managed mailbox',
              resource: `${identity} <${address}>`,
              cadence: 'Monthly',
              unitPrice: '$5.00',
              quantity: '0',
              amount: '$0.00',
            }),
          ),
        ],
        dueToday: '$14.29',
        annualRenewal: {
          amount: '$14.29',
          date: '2028-01-10',
          effectiveDate: '2027-01-10T12:00:00.000Z',
        },
        monthlyRenewal: {
          amount: '$0.00',
          date: '2027-02-10',
          effectiveDate: '2027-01-10T12:00:00.000Z',
        },
      });
      const completeButton = canvas.getByRole('button', {
        name: 'Complete locally — $14.29',
      });
      expect(completeButton).toBeEnabled();
      await userEvent.click(completeButton);
      expect(
        await canvas.findByRole('heading', {
          name: 'Prewarmed mailboxes acquired',
        }),
      ).toBeVisible();
      const completedResources = canvas.getByRole('list', {
        name: 'Completed local resources',
      });
      expect(within(completedResources).getAllByRole('listitem')).toHaveLength(
        3,
      );
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Managed mailbox resource count',
        }),
      ).toBe('7');
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        `${currentMailboxPool.id}:active:6:${[
          ...currentMailboxPool.linkedResources.map(({ id }) => id),
          ...task8PrewarmedBundle.mailboxIdentities.map(
            ({ address }) =>
              `story-mailbox-${normalizeManagedEmailDesignMailboxAddress(
                address,
              )}`,
          ),
        ].join(',')}`,
      );
    },
  };
})();

export const PrewarmedInventoryBlockedByPendingMailboxPool: Story = (() => {
  const currentMailboxPool = mixedWorkspace.subscriptions.find(
    (
      subscription,
    ): subscription is ManagedEmailDesignRecurringSubscription & {
      product: 'managed-mailbox';
      status: 'active';
    } =>
      subscription.product === 'managed-mailbox' &&
      subscription.status === 'active',
  );
  if (currentMailboxPool === undefined) {
    throw new Error('Expected the mixed workspace mailbox pool.');
  }

  return {
    args: {
      initialFlow: 'prewarmed-inventory',
      initialWorkspace: {
        ...mixedWorkspace,
        subscriptions: mixedWorkspace.subscriptions.map((subscription) =>
          subscription.id === currentMailboxPool.id
            ? createManagedEmailDesignRecurringSubscription({
                ...currentMailboxPool,
                status: 'pending-change',
                pendingQuantity: 3,
                changeEffectiveAt: task8MonthlyRenewalAt,
              })
            : subscription,
        ),
      },
    },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await assertCardPickerChoiceGroup({
        canvasElement,
        groupName: 'Prewarmed mailbox bundle',
        selectedName: 'harborline-mail.com',
        expectedRadioCount: 1,
        initialSelectionName: 'harborline-mail.com',
      });

      await userEvent.click(
        await canvas.findByRole('button', {
          name: 'Review selected bundle',
        }),
      );
      expect(await canvas.findByRole('alert')).toHaveTextContent(
        'Apply the pending mailbox-pool quantity change before acquiring a prewarmed bundle.',
      );
      expect(
        canvas.getByRole('heading', {
          name: 'Choose a prewarmed mailbox bundle',
        }),
      ).toBeVisible();
      expect(
        canvas.queryByRole('heading', { name: 'Review prewarmed bundle' }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const PrewarmedInventoryRecoversCanceledPool: Story = (() => {
  const currentMailboxPool = mixedWorkspace.subscriptions.find(
    (
      subscription,
    ): subscription is ManagedEmailDesignRecurringSubscription & {
      product: 'managed-mailbox';
      status: 'active';
    } =>
      subscription.product === 'managed-mailbox' &&
      subscription.status === 'active',
  );
  if (currentMailboxPool === undefined) {
    throw new Error('Expected the mixed workspace mailbox pool.');
  }

  const recoveredMailboxSnapshots = currentMailboxPool.linkedResources.filter(
    (snapshot) =>
      snapshot.kind === 'mailbox' &&
      mixedWorkspace.mailboxes.some((mailbox) => mailbox.id === snapshot.id),
  );
  const selectedMailboxSnapshots = task8PrewarmedBundle.mailboxIdentities.map(
    ({ identity, address }) => ({
      id: `story-mailbox-${normalizeManagedEmailDesignMailboxAddress(address)}`,
      label: `${identity} <${address}>`,
    }),
  );
  const expectedMailboxSnapshots = [
    ...recoveredMailboxSnapshots,
    ...selectedMailboxSnapshots,
  ];
  const monthlyCents =
    expectedMailboxSnapshots.length *
    managedEmailDesignPricing.managedMailboxMonthlyCents;
  const dueTodayCents =
    managedEmailDesignPricing.managedDomainAnnualCents + monthlyCents;
  const formatCents = (amountCents: number) =>
    `$${(amountCents / 100).toFixed(2)}`;

  return {
    args: {
      initialFlow: 'prewarmed-inventory',
      initialWorkspace: {
        ...mixedWorkspace,
        subscriptions: mixedWorkspace.subscriptions.map((subscription) =>
          subscription.id === currentMailboxPool.id
            ? createManagedEmailDesignRecurringSubscription({
                ...currentMailboxPool,
                status: 'canceled',
                renewsAt: null,
                canceledAt: task8MonthlyRenewalAt,
              })
            : subscription,
        ),
      },
    },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await assertCardPickerChoiceGroup({
        canvasElement,
        groupName: 'Prewarmed mailbox bundle',
        selectedName: 'harborline-mail.com',
        expectedRadioCount: 1,
        initialSelectionName: 'harborline-mail.com',
      });

      await userEvent.click(
        await canvas.findByRole('button', {
          name: 'Review selected bundle',
        }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Review prewarmed bundle',
        }),
      ).toBeVisible();
      await expectTask8ReviewCharges({
        canvasElement,
        rows: [
          {
            service: 'Prewarmed bundle domain',
            resource: task8PrewarmedBundle.domain,
            cadence: 'Annual',
            unitPrice: '$14.29',
            quantity: '1',
            amount: '$14.29',
          },
          ...expectedMailboxSnapshots.map(({ label }) => ({
            service: 'Prewarmed managed mailbox',
            resource: label,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '1',
            amount: '$5.00',
          })),
        ],
        dueToday: formatCents(dueTodayCents),
        annualRenewal: {
          amount: '$14.29',
          date: '2028-01-10',
          effectiveDate: '2027-01-10T12:00:00.000Z',
        },
        monthlyRenewal: {
          amount: formatCents(monthlyCents),
          date: '2027-02-10',
          effectiveDate: '2027-01-10T12:00:00.000Z',
        },
      });

      await userEvent.click(
        canvas.getByRole('button', {
          name: `Complete locally — ${formatCents(dueTodayCents)}`,
        }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Prewarmed mailboxes acquired',
        }),
      ).toBeVisible();
      const completedResources = canvas.getByRole('list', {
        name: 'Completed local resources',
      });
      expect(within(completedResources).getAllByRole('listitem')).toHaveLength(
        expectedMailboxSnapshots.length + 1,
      );
      expect(readMailboxResourceCount(canvasElement)).toBe(
        mixedWorkspace.mailboxes.length +
          task8PrewarmedBundle.mailboxIdentities.length,
      );
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        `${currentMailboxPool.id}:active:${expectedMailboxSnapshots.length}:${expectedMailboxSnapshots
          .map(({ id }) => id)
          .join(',')}`,
      );
    },
  };
})();

export const PrewarmedInventoryEmpty: Story = {
  args: {
    initialFlow: 'prewarmed-inventory',
    initialWorkspace: workspaceWithoutPrewarmedInventory,
  },
};

export const ReviewDomainOnly: Story = {
  args: {
    initialFlow: 'review',
    initialReview: 'domain-only',
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);
    assertManagedEmailCurrentStep({
      canvasElement,
      label: 'Review',
      position: 3,
      setSize: 3,
    });

    const charges = await canvas.findByRole('table', {
      name: 'Charges included in this purchase review',
    });

    expect(
      within(charges)
        .getAllByRole('columnheader')
        .map(({ textContent }) => textContent),
    ).toEqual([
      'Service',
      'Resource',
      'Cadence',
      'Unit price',
      'Quantity',
      'Amount',
    ]);
    const rowgroup = within(charges).getByRole('rowgroup');
    const dataRows = within(rowgroup).getAllByRole('row');

    expect(dataRows).toHaveLength(1);
    const cells = within(dataRows[0]!).getAllByRole('cell');

    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent('Myah-managed sending domain');
    expect(cells[1]).toHaveTextContent('mooreland.com');
    expect(cells[2]).toHaveTextContent('Annual');
    expect(cells[3]).toHaveTextContent('$14.29');
    expect(cells[4]).toHaveTextContent('1');
    expect(cells[5]).toHaveTextContent('$14.29');
    expect(
      canvas.getByText('Due today: $14.29', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText('Renews annually: $14.29 on Jan 10, 2028', {
        exact: true,
      }),
    ).toBeVisible();
    expect(canvas.queryByText('AI prepaid balance')).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: 'Complete locally — $14.29' }),
    ).toBeEnabled();
  },
};

export const ReviewMailboxOnly: Story = {
  args: {
    initialFlow: 'review',
    initialReview: 'mailbox-only',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const charges = await canvas.findByRole('table', {
      name: 'Charges included in this purchase review',
    });

    expect(
      within(charges)
        .getAllByRole('columnheader')
        .map(({ textContent }) => textContent),
    ).toEqual([
      'Service',
      'Resource',
      'Cadence',
      'Unit price',
      'Quantity',
      'Amount',
    ]);
    const rowgroup = within(charges).getByRole('rowgroup');
    const dataRows = within(rowgroup).getAllByRole('row');

    expect(dataRows).toHaveLength(1);
    const cells = within(dataRows[0]!).getAllByRole('cell');

    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent('Managed mailbox');
    expect(cells[1]).toHaveTextContent('jamie@northstar-outreach.com');
    expect(cells[2]).toHaveTextContent('Monthly');
    expect(cells[3]).toHaveTextContent('$5.00');
    expect(cells[4]).toHaveTextContent('1');
    expect(cells[5]).toHaveTextContent('$5.00');
    expect(canvas.getByText('Due today: $5.00', { exact: true })).toBeVisible();
    expect(
      canvas.getByText('Renews monthly: $5.00 on Feb 10, 2027', {
        exact: true,
      }),
    ).toBeVisible();
  },
};
export const ReviewDomainOnlyMobileCards: Story = {
  name: 'Review Domain Only Mobile Cards',
  args: {
    initialFlow: 'review',
    initialReview: 'domain-only',
  },
  parameters: createManagedEmailViewport(390, 844),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);
    const managedEmailRegion = canvas.getByRole('region', {
      name: 'Managed email design',
    });
    const card = await canvas.findByRole('region', {
      name: 'Review charge for mooreland.com',
    });

    for (const value of [
      'Myah-managed sending domain',
      'Resource: mooreland.com',
      'Cadence: Annual',
      'Unit price: $14.29',
      'Quantity: 1',
      'Amount: $14.29',
    ]) {
      expect(within(card).getByText(value, { exact: true })).toBeVisible();
    }
    expect(
      canvas.queryByRole('table', {
        name: 'Charges included in this purchase review',
      }),
    ).not.toBeInTheDocument();
    const completeButton = within(managedEmailRegion).getByRole('button', {
      name: 'Complete locally — $14.29',
    });

    expect(completeButton).toBeVisible();
    expect(completeButton).toBeEnabled();
    assertVisibleButtonTouchTargets(canvasElement);
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const ReviewMailboxOnlyMobileCards: Story = {
  name: 'Review Mailbox Only Mobile Cards',
  args: {
    initialFlow: 'review',
    initialReview: 'mailbox-only',
  },
  parameters: createManagedEmailViewport(390, 844),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);
    const managedEmailRegion = canvas.getByRole('region', {
      name: 'Managed email design',
    });
    const card = await canvas.findByRole('region', {
      name: 'Review charge for jamie@northstar-outreach.com',
    });

    for (const value of [
      'Managed mailbox',
      'Resource: jamie@northstar-outreach.com',
      'Cadence: Monthly',
      'Unit price: $5.00',
      'Quantity: 1',
      'Amount: $5.00',
    ]) {
      expect(within(card).getByText(value, { exact: true })).toBeVisible();
    }
    expect(
      canvas.queryByRole('table', {
        name: 'Charges included in this purchase review',
      }),
    ).not.toBeInTheDocument();
    const completeButton = within(managedEmailRegion).getByRole('button', {
      name: 'Complete locally — $5.00',
    });

    expect(completeButton).toBeVisible();
    expect(completeButton).toBeEnabled();
    assertVisibleButtonTouchTargets(canvasElement);
    assertNoDocumentHorizontalOverflow(canvasElement);
  },
};

export const ReviewPrewarmedBundle: Story = {
  args: {
    initialFlow: 'review',
    initialReview: 'prewarmed-bundle',
  },
  parameters: {
    viewport: {
      options: {
        myahManagedEmailMobile: {
          name: 'Myah managed email mobile',
          styles: { width: '390px', height: '844px' },
        },
      },
      defaultViewport: 'myahManagedEmailMobile',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cards = await canvas.findAllByRole('region', {
      name: /^Review charge for /,
    });

    expect(cards).toHaveLength(3);
    for (const charge of [
      {
        resource: 'harborline-mail.com',
        service: 'Prewarmed bundle domain',
        cadence: 'Annual',
        unitPrice: '$14.29',
        amount: '$14.29',
        renewalDate: '2028-01-10',
      },
      {
        resource: 'Samira Bell <samira@harborline-mail.com>',
        service: 'Prewarmed managed mailbox',
        cadence: 'Monthly',
        unitPrice: '$5.00',
        amount: '$5.00',
        renewalDate: '2027-02-10',
      },
      {
        resource: 'Theo Walsh <theo@harborline-mail.com>',
        service: 'Prewarmed managed mailbox',
        cadence: 'Monthly',
        unitPrice: '$5.00',
        amount: '$5.00',
        renewalDate: '2027-02-10',
      },
    ]) {
      const card = canvas.getByRole('region', {
        name: `Review charge for ${charge.resource}`,
      });

      expect(card).toHaveTextContent(charge.service);
      expect(card).toHaveTextContent(`Resource: ${charge.resource}`);
      expect(card).toHaveTextContent(`Cadence: ${charge.cadence}`);
      expect(card).toHaveTextContent(`Unit price: ${charge.unitPrice}`);
      expect(card).toHaveTextContent('Quantity: 1');
      expect(card).toHaveTextContent(`Amount: ${charge.amount}`);
    }
    expect(
      canvas.getByText('Due today: $24.29', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText('Renews annually: $14.29 on Jan 10, 2028', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText('Renews monthly: $10.00 on Feb 10, 2027', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText('Included annual domain: harborline-mail.com', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Included monthly mailboxes: Samira Bell <samira@harborline-mail.com>, Theo Walsh <theo@harborline-mail.com>',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Bundled readiness applies at delivery to the included prewarmed resources; it is not ongoing warmup capacity.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(canvas.queryByText(/AI prepaid balance/i)).not.toBeInTheDocument();
  },
};

export const WarmupCapacityExhausted: Story = {
  name: 'Warmup Capacity Exhausted',
  args: {
    initialWorkspace: warmupCapacityExhaustedWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    expect(readMailboxResourceCount(canvasElement)).toBe(3);

    const roryRow = getMailboxRow({
      canvasElement,
      address: 'rory@riveroak.io',
    });

    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
    });
    await expectWarmupState({
      canvasElement,
      address: 'rory@riveroak.io',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    expect(
      within(roryRow).queryByRole('button', {
        name: 'Start warmup for rory@riveroak.io',
      }),
    ).not.toBeInTheDocument();

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
      actionName: 'Review warmup capacity',
    });

    expect(
      within(panel).getByText(
        'All 2 managed warmup subscription slots are assigned.',
      ),
    ).toBeVisible();
    expect(
      within(panel).getByRole('button', {
        name: 'Increase warmup capacity',
      }),
    ).toBeEnabled();
  },
};
export const WarmupControls: Story = {
  name: 'Warmup Controls',
  args: {
    initialWorkspace: warmupControlsWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    expect(readMailboxResourceCount(canvasElement)).toBe(2);
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 2 assigned · 1 slot available.',
    });
    await expectWarmupState({
      canvasElement,
      address: 'lena@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Paused',
      operation: 'Idle',
    });
    expect(
      within(
        getMailboxRow({
          canvasElement,
          address: 'lena@northstar-outreach.com',
        }),
      ).getByRole('button', {
        name: 'Resume warmup for lena@northstar-outreach.com',
      }),
    ).toBeEnabled();
    expect(
      within(
        getMailboxRow({
          canvasElement,
          address: 'rory@riveroak.io',
        }),
      ).getByRole('button', {
        name: 'Start warmup for rory@riveroak.io',
      }),
    ).toBeEnabled();
  },
};

export const WarmupAssignmentLifecycle: Story = {
  name: 'Warmup Assignment Lifecycle',
  args: {
    initialWorkspace: warmupAssignmentLifecycleWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'rory@riveroak.io';
    const roryRow = getMailboxRow({ canvasElement, address });
    const start = await within(roryRow).findByRole('button', {
      name: `Start warmup for ${address}`,
    });

    await pressFocusedButton(start);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Inactive',
      operation: 'Pending start',
    });
    const firstStartOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect(firstStartOperationId).not.toBe('No active operation');
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 1 assigned · 0 slots available.',
    });

    await resolveWarmupOperation(canvasElement);
    const pause = await within(
      getMailboxRow({ canvasElement, address }),
    ).findByRole('button', {
      name: `Pause warmup for ${address}`,
    });
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await waitFor(() => expect(pause).toHaveFocus());

    await pressFocusedButton(pause);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Pending pause',
    });
    const firstPauseOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect(firstPauseOperationId).not.toBe(firstStartOperationId);
    await resolveWarmupOperation(canvasElement);
    const resume = await within(
      getMailboxRow({ canvasElement, address }),
    ).findByRole('button', {
      name: `Resume warmup for ${address}`,
    });
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Paused',
      operation: 'Idle',
    });
    await waitFor(() => expect(resume).toHaveFocus());

    await pressFocusedButton(resume);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Paused',
      operation: 'Pending resume',
    });
    const firstResumeOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect([firstStartOperationId, firstPauseOperationId]).not.toContain(
      firstResumeOperationId,
    );
    await resolveWarmupOperation(canvasElement);
    const pauseAfterResume = await within(
      getMailboxRow({ canvasElement, address }),
    ).findByRole('button', {
      name: `Pause warmup for ${address}`,
    });
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await waitFor(() => expect(pauseAfterResume).toHaveFocus());

    await pressFocusedButton(pauseAfterResume);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Pending pause',
    });
    const secondPauseOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect([
      firstStartOperationId,
      firstPauseOperationId,
      firstResumeOperationId,
    ]).not.toContain(secondPauseOperationId);
    await resolveWarmupOperation(canvasElement);

    const resumeAfterSecondPause = await within(
      getMailboxRow({ canvasElement, address }),
    ).findByRole('button', {
      name: `Resume warmup for ${address}`,
    });
    await waitFor(() => expect(resumeAfterSecondPause).toHaveFocus());
    await pressFocusedButton(resumeAfterSecondPause);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Paused',
      operation: 'Pending resume',
    });
    const secondResumeOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect([
      firstStartOperationId,
      firstPauseOperationId,
      firstResumeOperationId,
      secondPauseOperationId,
    ]).not.toContain(secondResumeOperationId);
    await resolveWarmupOperation(canvasElement);

    await openMailboxActions({ canvasElement, address });
    const stop = await within(canvasElement.ownerDocument.body).findByRole(
      'button',
      {
        name: 'Stop warmup',
      },
    );
    await pressFocusedButton(stop);
    const stopDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', { name: 'Stop warmup?' });
    const confirmStop = within(stopDialog).getByRole('button', {
      name: 'Stop warmup',
    });
    await pressFocusedButton(confirmStop);

    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Pending stop',
    });
    const firstStopOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect([
      firstStartOperationId,
      firstPauseOperationId,
      firstResumeOperationId,
      secondPauseOperationId,
      secondResumeOperationId,
    ]).not.toContain(firstStopOperationId);
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 1 assigned · 0 slots available.',
    });
    await resolveWarmupOperation(canvasElement);
    const restart = await within(
      getMailboxRow({ canvasElement, address }),
    ).findByRole('button', {
      name: `Start warmup for ${address}`,
    });
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 0 of 1 assigned · 1 slot available.',
    });
    await waitFor(() => expect(restart).toHaveFocus());

    await pressFocusedButton(restart);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Inactive',
      operation: 'Pending start',
    });
    const secondStartOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect([
      firstStartOperationId,
      firstPauseOperationId,
      firstResumeOperationId,
      secondPauseOperationId,
      secondResumeOperationId,
      firstStopOperationId,
    ]).not.toContain(secondStartOperationId);
    await resolveWarmupOperation(canvasElement);

    await openMailboxActions({ canvasElement, address });
    const secondStop = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('button', {
      name: 'Stop warmup',
    });
    await pressFocusedButton(secondStop);
    const secondStopDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', { name: 'Stop warmup?' });
    await pressFocusedButton(
      within(secondStopDialog).getByRole('button', { name: 'Stop warmup' }),
    );
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Pending stop',
    });
    const secondStopOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect([
      firstStartOperationId,
      firstPauseOperationId,
      firstResumeOperationId,
      secondPauseOperationId,
      secondResumeOperationId,
      firstStopOperationId,
      secondStartOperationId,
    ]).not.toContain(secondStopOperationId);
    await resolveWarmupOperation(canvasElement);
  },
};

export const DomainRemovalBlockedByLinkedMailboxes: Story = {
  name: 'Domain Removal Blocked by Linked Mailboxes',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Remove from workspace',
    });

    expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();

    const removalStatusRegions = canvas
      .getAllByRole('status')
      .filter((status) => {
        const text = status.textContent ?? '';

        return (
          text.includes('northstar-outreach.com') &&
          text.includes('2 linked mailboxes')
        );
      });

    expect(removalStatusRegions).toHaveLength(1);
    expect(removalStatusRegions[0]).toBeVisible();
    expect(removalStatusRegions[0]).toHaveTextContent('northstar-outreach.com');
    expect(removalStatusRegions[0]).toHaveTextContent('2 linked mailboxes');

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'View linked mailboxes',
      }),
    );

    expect(
      await canvas.findByRole('heading', {
        name: 'Linked mailboxes for northstar-outreach.com',
      }),
    ).toBeVisible();
    expect(canvas.getByText('Mira Chen', { exact: true })).toBeVisible();
    expect(canvas.getByText('Jordan Lee', { exact: true })).toBeVisible();
    expect(
      canvas.getByText('northstar-outreach.com', { exact: true }),
    ).toBeVisible();
    await pressFocusedButton(
      canvas.getByRole('button', {
        name: 'Remove mailbox mira@northstar-outreach.com',
      }),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole('heading', {
          name: 'Linked mailboxes for northstar-outreach.com',
        }),
      ).not.toBeInTheDocument(),
    );
    const miraActions = canvas.getByRole('button', {
      name: 'More actions for mira@northstar-outreach.com',
    });
    await waitFor(() => expect(miraActions).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    expect(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Stop warmup',
      }),
    ).toBeEnabled();
  },
};

export const ManagedDomainRenewal: Story = {
  name: 'Managed Domain Renewal',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const assertActiveRenewal = () => {
      const row = getDomainRow({
        canvasElement,
        domain: 'northstar-outreach.com',
      });
      expect(
        within(row).getByText('$14.29 / year', { exact: true }),
      ).toBeVisible();
      expect(
        within(row).getByText('Renews Oct 12, 2027', { exact: true }),
      ).toBeVisible();
      expect(within(row).getByText('Active', { exact: true })).toBeVisible();
    };

    await waitFor(assertActiveRenewal);
    const cancellationTrigger = canvas.getByRole('button', {
      name: 'More actions for northstar-outreach.com',
    });

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });
    expect(
      await canvas.findByRole('button', { name: 'Cancel renewal' }),
    ).toBeVisible();
    expect(
      canvas.getByRole('button', { name: 'Remove from workspace' }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Cancel renewal',
    });

    let cancellationDialog = await canvas.findByRole('dialog');

    expect(cancellationDialog).toHaveTextContent('effective Oct 12, 2027');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(cancellationDialog).not.toBeInTheDocument());
    await waitFor(() => expect(cancellationTrigger).toHaveFocus());

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Cancel renewal',
    });
    cancellationDialog = await canvas.findByRole('dialog');
    await userEvent.click(
      within(cancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );

    await waitFor(() =>
      expect(
        within(
          getDomainRow({
            canvasElement,
            domain: 'northstar-outreach.com',
          }),
        ).getByText('Cancels Oct 12, 2027', {
          exact: true,
        }),
      ).toBeVisible(),
    );
    expect(
      within(
        getDomainRow({
          canvasElement,
          domain: 'northstar-outreach.com',
        }),
      ).queryByText('Renews Oct 12, 2027', { exact: true }),
    ).not.toBeInTheDocument();

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });
    expect(
      await canvas.findByRole('button', {
        name: 'Undo cancellation',
      }),
    ).toBeVisible();
    expect(
      canvas.getByRole('button', {
        name: 'Apply cancellation effective Oct 12, 2027',
      }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Undo cancellation',
    });

    await waitFor(assertActiveRenewal);

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Cancel renewal',
    });

    const repeatedCancellationDialog = await canvas.findByRole('dialog');

    expect(repeatedCancellationDialog).toHaveTextContent(
      'effective Oct 12, 2027',
    );
    await userEvent.click(
      within(repeatedCancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );

    await waitFor(() =>
      expect(
        within(
          getDomainRow({
            canvasElement,
            domain: 'northstar-outreach.com',
          }),
        ).getByText('Cancels Oct 12, 2027', {
          exact: true,
        }),
      ).toBeVisible(),
    );

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Apply cancellation effective Oct 12, 2027',
    });

    await waitFor(() =>
      expect(
        within(
          getDomainRow({
            canvasElement,
            domain: 'northstar-outreach.com',
          }),
        ).getByText('Canceled on Oct 12, 2027', {
          exact: true,
        }),
      ).toBeVisible(),
    );
    expect(
      canvas.getByText('northstar-outreach.com', { exact: true }),
    ).toBeVisible();

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });
    expect(
      await canvas.findByRole('button', {
        name: 'Remove from workspace',
      }),
    ).toBeVisible();
  },
};

export const ExpiredDomainCancellation: Story = {
  name: 'Expired Domain Cancellation',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      subscriptions: mixedWorkspace.subscriptions.map((subscription) =>
        subscription.id === 'subscription-managed-domain-northstar'
          ? requestManagedEmailDesignSubscriptionCancellation({
              subscription,
              cancelAt: '2027-01-09T12:00:00.000Z',
            })
          : subscription,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await openDomainActions({
      canvasElement,
      domain: 'northstar-outreach.com',
    });

    expect(
      canvas.queryByRole('button', {
        name: 'Undo cancellation',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', {
        name: 'Apply cancellation effective Jan 9, 2027',
      }),
    ).toBeVisible();

    await clickStoryButton({
      canvasElement,
      name: 'Apply cancellation effective Jan 9, 2027',
    });

    await waitFor(() =>
      expect(
        within(
          getDomainRow({
            canvasElement,
            domain: 'northstar-outreach.com',
          }),
        ).getByText('Canceled on Jan 9, 2027', {
          exact: true,
        }),
      ).toBeVisible(),
    );
    expect(
      canvas.getByText('northstar-outreach.com', { exact: true }),
    ).toBeVisible();
  },
};

export const PrewarmedDomainRenewal: Story = {
  name: 'Prewarmed Domain Renewal',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const assertActiveRenewal = () => {
      const row = getDomainRow({
        canvasElement,
        domain: 'fleetwave-mail.com',
      });

      expect(
        within(row).getByText('$14.29 / year', { exact: true }),
      ).toBeVisible();
      expect(
        within(row).getByText('Renews Jan 18, 2028', { exact: true }),
      ).toBeVisible();
      expect(within(row).getByText('Active', { exact: true })).toBeVisible();
    };

    await waitFor(assertActiveRenewal);

    await openDomainActions({
      canvasElement,
      domain: 'fleetwave-mail.com',
    });
    expect(
      await canvas.findByRole('button', { name: 'Cancel renewal' }),
    ).toBeVisible();
    expect(
      canvas.getByRole('button', { name: 'Remove from workspace' }),
    ).toBeVisible();
    expect(
      canvas.queryByText('Prewarmed bundle subscription', {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText('Prewarmed bundle product', {
        exact: false,
      }),
    ).not.toBeInTheDocument();

    await clickStoryButton({
      canvasElement,
      name: 'Cancel renewal',
    });

    const cancellationDialog = await canvas.findByRole('dialog');

    expect(cancellationDialog).toHaveTextContent('effective Jan 18, 2028');
    await userEvent.click(
      within(cancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );

    await waitFor(() =>
      expect(
        within(
          getDomainRow({
            canvasElement,
            domain: 'fleetwave-mail.com',
          }),
        ).getByText('Cancels Jan 18, 2028', {
          exact: true,
        }),
      ).toBeVisible(),
    );

    await openDomainActions({
      canvasElement,
      domain: 'fleetwave-mail.com',
    });
    expect(
      await canvas.findByRole('button', {
        name: 'Undo cancellation',
      }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Undo cancellation',
    });

    await waitFor(assertActiveRenewal);
  },
};

export const CustomerOwnedDomainDisconnect: Story = {
  name: 'Customer-Owned Domain Disconnect',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      mailboxes: mixedWorkspace.mailboxes.filter(
        (mailbox) => mailbox.domain !== 'riveroak.io',
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    expect(
      await canvas.findByRole('button', {
        name: 'Disconnect domain',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('button', {
        name: 'Cancel renewal',
      }),
    ).not.toBeInTheDocument();

    await clickStoryButton({
      canvasElement,
      name: 'Disconnect domain',
    });

    const disconnectDialog = await canvas.findByRole('dialog');

    expect(disconnectDialog).toHaveTextContent('riveroak.io');
    expect(disconnectDialog).toHaveTextContent('local connection');
    expect(disconnectDialog).toHaveTextContent('linked mailboxes are gone');
    expect(disconnectDialog).toHaveTextContent(
      'does not change a managed-domain subscription',
    );
    await userEvent.click(
      within(disconnectDialog).getByRole('button', {
        name: 'Disconnect domain',
      }),
    );

    await waitFor(() =>
      expect(
        canvas.queryByText('riveroak.io', { exact: true }),
      ).not.toBeInTheDocument(),
    );
    expect(
      canvas.getByText('northstar-outreach.com', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText('fleetwave-mail.com', { exact: true }),
    ).toBeVisible();
  },
};

export const DomainVerificationRequired: Story = {
  name: 'Domain Verification Required',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      domains: mixedWorkspace.domains.map((domain) =>
        domain.name === 'riveroak.io'
          ? { ...domain, verification: 'verification-required' }
          : domain,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertDomainVerification({
      canvasElement,
      domain: 'riveroak.io',
      verification: 'Verification required',
    });
    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    expect(
      await canvas.findByRole('button', { name: 'Verify DNS' }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Verify DNS',
    });
    await assertDnsDomainContextForDomain({
      canvasElement,
      domain: 'riveroak.io',
    });
  },
};

export const DomainVerificationChecking: Story = {
  name: 'Domain Verification Checking',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      domains: mixedWorkspace.domains.map((domain) =>
        domain.name === 'riveroak.io'
          ? { ...domain, verification: 'checking-dns' }
          : domain,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertDomainVerification({
      canvasElement,
      domain: 'riveroak.io',
      verification: 'Checking DNS',
    });
    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    expect(
      await canvas.findByRole('button', {
        name: 'View DNS check',
      }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'View DNS check',
    });
    await assertDnsDomainContextForDomain({
      canvasElement,
      domain: 'riveroak.io',
    });
  },
};

export const DomainVerificationActionRequired: Story = {
  name: 'Domain Verification Action Required',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      domains: mixedWorkspace.domains.map((domain) =>
        domain.name === 'riveroak.io'
          ? { ...domain, verification: 'action-required' }
          : domain,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertDomainVerification({
      canvasElement,
      domain: 'riveroak.io',
      verification: 'Action required',
    });
    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    expect(
      await canvas.findByRole('button', { name: 'Repair DNS' }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Repair DNS',
    });
    await assertDnsDomainContextForDomain({
      canvasElement,
      domain: 'riveroak.io',
    });
  },
};

export const DomainVerificationRecovered: Story = {
  name: 'Domain Verification Recovered',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      domains: mixedWorkspace.domains.map((domain) =>
        domain.name === 'riveroak.io'
          ? { ...domain, verification: 'verified' }
          : domain,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertDomainVerification({
      canvasElement,
      domain: 'riveroak.io',
      verification: 'Verified',
    });
    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    expect(
      await canvas.findByRole('button', { name: 'Reverify DNS' }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Reverify DNS',
    });
    await assertDnsDomainContextForDomain({
      canvasElement,
      domain: 'riveroak.io',
    });
  },
};

export const ExistingDomainDnsRepair: Story = {
  name: 'Existing Domain DNS Repair',
  args: {
    initialWorkspace: {
      ...mixedWorkspace,
      domains: mixedWorkspace.domains.map((domain) =>
        domain.name === 'riveroak.io'
          ? { ...domain, verification: 'action-required' }
          : domain.name === 'fleetwave-mail.com'
            ? { ...domain, verification: 'verification-required' }
            : domain,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertDomainVerification({
      canvasElement,
      domain: 'riveroak.io',
      verification: 'Action required',
    });
    await assertDomainVerification({
      canvasElement,
      domain: 'fleetwave-mail.com',
      verification: 'Verification required',
    });

    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Repair DNS',
    });
    await assertDnsDomainContextForDomain({
      canvasElement,
      domain: 'riveroak.io',
    });

    await clickStoryButton({
      canvasElement,
      name: 'Check verification',
    });
    await expectDnsOperationState({
      canvasElement,
      expected: 'Checking',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Resolve DNS verification',
    });
    await expectDnsOperationState({
      canvasElement,
      expected: 'Completed',
    });
    expect(
      canvas.getByRole('button', {
        name: 'Finish DNS repair',
      }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Finish DNS repair',
    });

    expect(
      await canvas.findByRole('heading', {
        name: 'Domains',
      }),
    ).toBeVisible();
    await assertDomainVerification({
      canvasElement,
      domain: 'riveroak.io',
      verification: 'Verified',
    });
    await assertDomainVerification({
      canvasElement,
      domain: 'fleetwave-mail.com',
      verification: 'Verification required',
    });
  },
};

export const ResumeMailboxAfterAddingExternalDomain: Story = {
  name: 'Resume Mailbox After Adding External Domain',
  args: {
    initialWorkspace: {
      ...emptyWorkspace,
    },
    initialFlow: 'mailbox-details',
    initialMailboxSource: 'create',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertMailboxDomainPrerequisite(canvasElement);
    await clickStoryButton({
      canvasElement,
      name: 'Add domain',
    });
    expect(
      await canvas.findByRole('heading', {
        name: 'Add domain',
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('radio', {
        name: 'Connect a customer-owned domain',
      }),
    );
    await clickStoryButton({
      canvasElement,
      name: 'Continue',
    });
    expect(
      await canvas.findByRole('heading', {
        name: 'Enter your domain',
      }),
    ).toBeVisible();

    const domainInput = canvas.getByRole('textbox', {
      name: 'Customer-owned domain',
    });

    await userEvent.clear(domainInput);
    await userEvent.type(domainInput, 'brightforge.io');
    await clickStoryButton({
      canvasElement,
      name: 'Continue',
    });
    await assertDnsDomainContextForDomain({
      canvasElement,
      domain: 'brightforge.io',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Check verification',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Resolve DNS verification',
    });
    await expectDnsOperationState({
      canvasElement,
      expected: 'Completed',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Complete domain locally',
    });

    await assertMailboxDetailsWithSelectedDomain({
      canvasElement,
      domain: 'brightforge.io',
    });
    expect(
      canvas.queryByRole('heading', {
        name: 'Local completion recorded',
      }),
    ).not.toBeInTheDocument();
  },
};

export const ResumeMailboxAfterAddingManagedDomain: Story = {
  name: 'Resume Mailbox After Adding Managed Domain',
  args: {
    initialWorkspace: {
      ...emptyWorkspace,
    },
    initialFlow: 'mailbox-details',
    initialMailboxSource: 'create',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertMailboxDomainPrerequisite(canvasElement);
    await clickStoryButton({
      canvasElement,
      name: 'Add domain',
    });
    await userEvent.click(
      canvas.getByRole('radio', {
        name: 'Buy a Myah-managed domain',
      }),
    );
    await clickStoryButton({
      canvasElement,
      name: 'Continue',
    });
    expect(
      await canvas.findByRole('heading', {
        name: 'Find a domain',
      }),
    ).toBeVisible();

    const searchInput = canvas.getByRole('textbox', {
      name: 'Domain search',
    });

    await userEvent.type(searchInput, 'mooreland');
    await clickStoryButton({
      canvasElement,
      name: 'Search',
    });
    await clickStoryButton({
      canvasElement,
      name: 'Resolve domain search',
    });

    const availableDomains = await canvas.findByRole('radiogroup', {
      name: 'Available domains',
    });

    await userEvent.click(
      within(availableDomains).getByRole('radio', {
        name: 'mooreland.com',
      }),
    );
    await clickStoryButton({
      canvasElement,
      name: 'Continue',
    });
    expect(
      await canvas.findByRole('heading', {
        name: 'Review managed domain',
      }),
    ).toBeVisible();
    expect(
      await canvas.findByRole('region', {
        name: 'Review charges',
      }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Complete locally — $14.29',
    });

    await assertMailboxDetailsWithSelectedDomain({
      canvasElement,
      domain: 'mooreland.com',
    });
    expect(
      canvas.queryByRole('heading', {
        name: 'Local completion recorded',
      }),
    ).not.toBeInTheDocument();
  },
};

export const ResumeMailboxAfterAddingDomainBack: Story = {
  name: 'Resume Mailbox After Adding Domain Back',
  args: {
    initialWorkspace: {
      ...emptyWorkspace,
    },
    initialFlow: 'mailbox-details',
    initialMailboxSource: 'create',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await assertMailboxDomainPrerequisite(canvasElement);
    await clickStoryButton({
      canvasElement,
      name: 'Add domain',
    });
    await userEvent.click(
      canvas.getByRole('radio', {
        name: 'Connect a customer-owned domain',
      }),
    );
    await clickStoryButton({
      canvasElement,
      name: 'Continue',
    });
    expect(
      await canvas.findByRole('heading', {
        name: 'Enter your domain',
      }),
    ).toBeVisible();

    await clickStoryButton({
      canvasElement,
      name: 'Back',
    });
    expect(
      await canvas.findByRole('heading', {
        name: 'Add domain',
      }),
    ).toBeVisible();
    await clickStoryButton({
      canvasElement,
      name: 'Back',
    });

    await assertMailboxDomainPrerequisite(canvasElement);
    expect(
      canvas.queryByRole('radio', {
        name: 'brightforge.io',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText('brightforge.io', {
        exact: true,
      }),
    ).not.toBeInTheDocument();
  },
};

export const PrewarmedReadyWithoutOngoingWarmup: Story = {
  name: 'Prewarmed Ready Without Ongoing Warmup',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-avery',
        identity: 'Avery Miles',
        address: 'avery@fleetwave-mail.com',
        domain: 'fleetwave-mail.com',
        source: 'prewarmed',
        readiness: 'ready',
        warmupState: {
          assignment: 'unassigned',
          lastConfirmedProviderState: 'inactive',
          operation: { status: 'idle' },
        },
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 1, mailboxes }),
          createTask7WarmupSubscription({ quantity: 1 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'avery@fleetwave-mail.com';
    const averyRow = getMailboxRow({ canvasElement, address });

    expect(averyRow).toHaveTextContent('Prewarmed');
    expect(
      within(averyRow).getByLabelText(`Mailbox readiness for ${address}`),
    ).toHaveTextContent('Ready');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 0 of 1 assigned · 1 slot available.',
    });
    expect(
      within(averyRow).queryByRole('button', {
        name: `Start warmup for ${address}`,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(averyRow).queryByRole('button', {
        name: new RegExp('(Pause|Resume|Stop) warmup'),
      }),
    ).not.toBeInTheDocument();
  },
};

export const ReadyWarmupStop: Story = {
  name: 'Ready Warmup Stop',
  args: {
    initialWorkspace: createTask7Workspace({
      mailboxes: [
        createTask7Mailbox({
          id: 'mailbox-rory',
          identity: 'Rory Blake',
          address: 'rory@riveroak.io',
          source: 'connected',
          readiness: 'ready',
          warmupState: {
            assignment: 'assigned',
            lastConfirmedProviderState: 'warming',
            operation: { status: 'idle' },
          },
        }),
      ],
      subscriptions: [createTask7WarmupSubscription({ quantity: 1 })],
    }),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'rory@riveroak.io';
    const row = getMailboxRow({ canvasElement, address });
    expect(
      within(row).getByLabelText(`Mailbox readiness for ${address}`),
    ).toHaveTextContent('Ready');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 1 assigned · 0 slots available.',
    });

    await openMailboxActions({ canvasElement, address });
    const stop = await within(canvasElement.ownerDocument.body).findByRole(
      'button',
      { name: 'Stop warmup' },
    );
    await pressFocusedButton(stop);
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: 'Stop warmup?' },
    );
    await pressFocusedButton(
      within(dialog).getByRole('button', { name: 'Stop warmup' }),
    );

    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Pending stop',
    });
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 1 assigned · 0 slots available.',
    });

    await resolveWarmupOperation(canvasElement);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 0 of 1 assigned · 1 slot available.',
    });
    expect(
      within(getMailboxRow({ canvasElement, address })).getByLabelText(
        `Mailbox readiness for ${address}`,
      ),
    ).toHaveTextContent('Ready');
  },
};

export const WarmupStartFailed: Story = {
  name: 'Warmup Start Failed',
  args: {
    initialWorkspace: createTask7Workspace({
      mailboxes: [
        createTask7Mailbox({
          id: 'mailbox-rory',
          identity: 'Rory Blake',
          address: 'rory@riveroak.io',
          source: 'connected',
          warmupState: {
            assignment: 'unassigned',
            lastConfirmedProviderState: 'inactive',
            operation: {
              status: 'failed',
              action: 'start',
              operationId: 'warmup-start-rory-001',
              safeDiagnostic:
                'The provider rejected the warmup start. Retry without buying another slot.',
            },
          },
        }),
        createTask7Mailbox({
          id: 'mailbox-avery',
          identity: 'Avery Miles',
          address: 'avery@fleetwave-mail.com',
          domain: 'fleetwave-mail.com',
          warmupState: {
            assignment: 'assigned',
            lastConfirmedProviderState: 'inactive',
            operation: {
              status: 'unknown',
              action: 'start',
              operationId: 'warmup-start-avery-001',
              safeDiagnostic:
                'The provider did not confirm whether warmup started. Reconcile this mailbox before changing capacity.',
            },
          },
        }),
      ],
      subscriptions: [createTask7WarmupSubscription({ quantity: 2 })],
    }),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'rory@riveroak.io';
    const averyAddress = 'avery@fleetwave-mail.com';
    const roryRow = getMailboxRow({ canvasElement, address });
    const averyRow = getMailboxRow({
      canvasElement,
      address: averyAddress,
    });

    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Failed start',
      operationId: 'warmup-start-rory-001',
    });
    const failedStartOperationId = readWarmupStateOutput({
      canvasElement,
      address,
      output: 'operation-id',
    });
    expect(failedStartOperationId).toBe('warmup-start-rory-001');
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 2 assigned · 1 slot available.',
    });
    expect(
      within(roryRow).getByText(
        'The provider rejected the warmup start. Retry without buying another slot.',
      ),
    ).toBeVisible();
    await openMailboxActions({ canvasElement, address });
    expect(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect',
      }),
    ).toBeEnabled();
    await userEvent.click(
      within(roryRow).getByRole('button', {
        name: `More actions for ${address}`,
      }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('button', {
          name: 'Disconnect',
        }),
      ).not.toBeInTheDocument(),
    );
    await expectWarmupState({
      canvasElement,
      address: averyAddress,
      assignment: 'Assigned',
      providerState: 'Inactive',
      operation: 'Unknown start',
      operationId: 'warmup-start-avery-001',
    });
    expect(
      within(averyRow).getByText(
        'The provider did not confirm whether warmup started. Reconcile this mailbox before changing capacity.',
      ),
    ).toBeVisible();
    expect(
      within(averyRow).getByRole('button', {
        name: `Reconcile warmup start for ${averyAddress}`,
      }),
    ).toBeEnabled();

    const retry = within(roryRow).getByRole('button', {
      name: `Retry warmup start for ${address}`,
    });
    await pressFocusedButton(retry);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Inactive',
      operation: 'Pending start',
      operationId: 'warmup-start-rory-001',
    });
    expect(
      readWarmupStateOutput({
        canvasElement,
        address,
        output: 'operation-id',
      }),
    ).toBe(failedStartOperationId);
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
    });

    await resolveWarmupOperation(canvasElement);
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await expectWarmupState({
      canvasElement,
      address: averyAddress,
      assignment: 'Assigned',
      providerState: 'Inactive',
      operation: 'Unknown start',
      operationId: 'warmup-start-avery-001',
    });
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
    });

    await pressFocusedButton(
      within(
        getMailboxRow({
          canvasElement,
          address: averyAddress,
        }),
      ).getByRole('button', {
        name: `Reconcile warmup start for ${averyAddress}`,
      }),
    );
    await expectWarmupState({
      canvasElement,
      address: averyAddress,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(
      readWarmupStateOutput({
        canvasElement,
        address: averyAddress,
        output: 'operation-id',
      }),
    ).toBe('No active operation');
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
    });
  },
};

export const WarmupStopFailedAmbiguous: Story = {
  name: 'Warmup Stop Failed / Ambiguous',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: {
            status: 'failed',
            action: 'stop',
            operationId: 'warmup-stop-mira-001',
            safeDiagnostic:
              'The provider did not confirm the stop. Retry or reconcile before removing this mailbox.',
          },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        source: 'connected',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: {
            status: 'unknown',
            action: 'stop',
            operationId: 'warmup-stop-rory-001',
            safeDiagnostic:
              'The provider result is unknown. Reconcile before disconnecting this mailbox.',
          },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: {
            status: 'pending',
            action: 'stop',
            operationId: 'warmup-stop-jordan-pending-001',
          },
        },
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 2, mailboxes }),
          createTask7WarmupSubscription({ quantity: 3 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 3 of 3 assigned · 0 slots available.',
    });
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Failed stop',
      operationId: 'warmup-stop-mira-001',
    });
    await expectWarmupState({
      canvasElement,
      address: 'rory@riveroak.io',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Unknown stop',
      operationId: 'warmup-stop-rory-001',
    });
    await expectWarmupState({
      canvasElement,
      address: 'jordan@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Pending stop',
      operationId: 'warmup-stop-jordan-pending-001',
    });

    const miraRow = getMailboxRow({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    expect(
      within(miraRow).getByText(
        'The provider did not confirm the stop. Retry or reconcile before removing this mailbox.',
      ),
    ).toBeVisible();
    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    expect(
      within(canvasElement.ownerDocument.body).getByRole('button', {
        name: 'Remove mailbox',
      }),
    ).toBeDisabled();

    const roryRow = getMailboxRow({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    expect(
      within(roryRow).getByText(
        'The provider result is unknown. Reconcile before disconnecting this mailbox.',
      ),
    ).toBeVisible();
    await openMailboxActions({
      canvasElement,
      address: 'rory@riveroak.io',
    });
    expect(
      within(canvasElement.ownerDocument.body).getByRole('button', {
        name: 'Disconnect',
      }),
    ).toBeDisabled();
    expect(
      within(roryRow).getByRole('button', {
        name: 'Reconcile warmup stop for rory@riveroak.io',
      }),
    ).toBeEnabled();
    await openMailboxActions({
      canvasElement,
      address: 'jordan@northstar-outreach.com',
    });
    expect(
      within(canvasElement.ownerDocument.body).getByRole('button', {
        name: 'Remove mailbox',
      }),
    ).toBeDisabled();
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 3 of 3 assigned · 0 slots available.',
    });
  },
};

const createWarmupProviderUnsupportedWorkspace = () =>
  createTask7Workspace({
    mailboxes: [
      createTask7Mailbox({
        id: 'mailbox-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        source: 'connected',
        connection: createManagedEmailDesignMailboxConnection({
          draft: {
            address: 'rory@riveroak.io',
            selectedProtocol: 'IMAP',
            host: 'imap.riveroak.io',
            port: 993,
            connectionSecurity: 'SSL_TLS',
            username: 'rory',
          },
          capabilities: ['imap'],
          canSend: false,
          sendingCapabilityReason:
            'SMTP is not configured, so this mailbox cannot send mail.',
          mailboxId: 'mailbox-rory',
          operation: {
            status: 'connected',
            operationId: 'connection-operation-rory-unsupported',
            configuredOutcome: 'connected',
          },
        }),
      }),
    ],
    subscriptions: [createTask7WarmupSubscription({ quantity: 1 })],
  });

export const WarmupProviderUnsupported: Story = {
  name: 'Warmup Provider Unsupported',
  args: {
    initialWorkspace: createWarmupProviderUnsupportedWorkspace(),
    initialMailboxConnectionOutcomes: ['failed'],
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'rory@riveroak.io';
    const row = getMailboxRow({ canvasElement, address });

    expect(
      within(row).getByText(
        'SMTP is not configured, so this mailbox cannot send mail.',
      ),
    ).toBeVisible();
    expect(
      within(row).getByLabelText(`Warmup eligibility for ${address}`),
    ).toHaveTextContent('Provider cannot send');
    expect(
      within(row).queryByRole('button', {
        name: `Start warmup for ${address}`,
      }),
    ).not.toBeInTheDocument();

    const configureSmtp = within(row).getByRole('button', {
      name: `Configure SMTP for ${address}`,
    });
    await pressFocusedButton(configureSmtp);
    expect(
      await within(canvasElement).findByRole('heading', {
        name: `Configure SMTP for ${address}`,
      }),
    ).toBeVisible();
    expect(within(canvasElement).getByLabelText('SMTP Server')).toBeVisible();
    const canvas = within(canvasElement);
    const smtpServer = canvas.getByLabelText('SMTP Server');
    const smtpPassword = canvas.getByLabelText('SMTP Password');
    await userEvent.clear(smtpServer);
    await userEvent.type(smtpServer, 'smtp.riveroak.io');
    await userEvent.type(smtpPassword, storyConnectionPassword);
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    expect(readMailboxConnectionState(canvasElement)).toBe('Testing');
    await resolveMailboxConnection(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Failed');
    await clickStoryButton({ canvasElement, name: 'Cancel' });

    const failedEditRow = getMailboxRow({ canvasElement, address });
    expect(
      within(failedEditRow).getByText(
        'SMTP is not configured, so this mailbox cannot send mail.',
      ),
    ).toBeVisible();
    expect(
      within(failedEditRow).getByLabelText(`Warmup eligibility for ${address}`),
    ).toHaveTextContent('Provider cannot send');
    expect(
      within(failedEditRow).queryByRole('button', {
        name: `Start warmup for ${address}`,
      }),
    ).not.toBeInTheDocument();
  },
};

export const WarmupProviderReconciliationEnablesSending: Story = {
  name: 'Warmup Provider Reconciliation Enables Sending',
  args: {
    initialWorkspace: createWarmupProviderUnsupportedWorkspace(),
    initialMailboxConnectionOutcomes: ['unknown'],
    initialMailboxConnectionReconcileOutcome: 'connected',
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'rory@riveroak.io';
    const row = getMailboxRow({ canvasElement, address });
    await pressFocusedButton(
      within(row).getByRole('button', {
        name: `Configure SMTP for ${address}`,
      }),
    );

    const canvas = within(canvasElement);
    const smtpServer = await canvas.findByLabelText('SMTP Server');
    const smtpPassword = canvas.getByLabelText('SMTP Password');
    await userEvent.clear(smtpServer);
    await userEvent.type(smtpServer, 'smtp.riveroak.io');
    await userEvent.type(smtpPassword, storyConnectionPassword);
    await clickStoryButton({
      canvasElement,
      name: 'Connect mailbox locally',
    });
    expect(readMailboxConnectionState(canvasElement)).toBe('Testing');
    await resolveMailboxConnection(canvasElement);
    expect(readMailboxConnectionState(canvasElement)).toBe('Unknown');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconcile connection' }),
    );

    const reconciledRow = await waitFor(() => {
      const currentRow = getMailboxRow({ canvasElement, address });
      expect(
        within(currentRow).getByLabelText(`Warmup eligibility for ${address}`),
      ).toHaveTextContent('Eligible');

      return currentRow;
    });
    expect(
      within(reconciledRow).getByRole('button', {
        name: `Start warmup for ${address}`,
      }),
    ).toBeEnabled();
  },
};

export const FirstRecoveredWarmupCapacityPurchase: Story = (() => {
  const mailboxes = [
    createTask7Mailbox({
      id: 'mailbox-rory',
      identity: 'Rory Blake',
      address: 'rory@riveroak.io',
      source: 'connected',
    }),
  ];
  const workspace = createTask7Workspace({
    mailboxes,
    subscriptions: [],
  });
  const { operation, resolution } = createTask8SucceededWarmupCapacityFixture({
    mailboxes,
    subscriptions: workspace.subscriptions,
    requestedQuantity: 1,
    targetSubscriptionId: 'subscription-managed-warmup',
  });

  return {
    name: 'First / Recovered Warmup Capacity Purchase',
    args: withTask8StoryArgs({
      initialWorkspace: workspace,
    }),
    play: async ({ canvasElement }) => {
      await waitForManagedEmailDesignReady(canvasElement);

      await expectWarmupCapacity({
        canvasElement,
        expected: 'Warmup capacity: 0 of 0 assigned · 0 slots available.',
      });
      const roryRow = getMailboxRow({
        canvasElement,
        address: 'rory@riveroak.io',
      });
      await pressFocusedButton(
        within(roryRow).getByRole('button', {
          name: 'Review warmup capacity',
        }),
      );
      const panel = await within(canvasElement.ownerDocument.body).findByRole(
        'region',
        {
          name: 'Managed-email subscriptions',
        },
      );
      expect(
        within(panel).getByText(
          'No active managed-warmup subscription is available for this workspace.',
        ),
      ).toBeVisible();

      const quantity = within(panel).getByRole('spinbutton', {
        name: 'Warmup capacity quantity',
      });
      await userEvent.clear(quantity);
      await userEvent.type(quantity, '1');
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      );

      const review = await within(canvasElement.ownerDocument.body).findByRole(
        'dialog',
        { name: 'Review warmup capacity purchase' },
      );
      expect(
        within(review).getByText('First managed warmup subscription'),
      ).toBeVisible();
      expect(
        within(review).getByLabelText('Warmup subscription intent'),
      ).toHaveTextContent('Create · 1 slot');
      expectWarmupCapacityQuote({
        review,
        lineAmount: '$2.99',
      });
      const quoteTable = within(review).getByRole('table', {
        name: 'Warmup capacity quote charges',
      });
      const [quoteHeaderRowGroup, quoteChargeRowGroup] =
        within(quoteTable).getAllByRole('rowgroup');
      expect(quoteHeaderRowGroup).toBeDefined();
      expect(quoteChargeRowGroup).toBeDefined();
      if (
        quoteHeaderRowGroup === undefined ||
        quoteChargeRowGroup === undefined
      ) {
        throw new Error('Warmup capacity quote table must group its rows.');
      }
      const quoteHeaderRow = within(quoteHeaderRowGroup).getByRole('row');
      const quoteChargeRow = within(quoteChargeRowGroup).getByRole('row');
      const quoteHeaders = within(quoteHeaderRow).getAllByRole('columnheader');
      expect(quoteHeaders).toHaveLength(6);
      expect(quoteHeaders[0]).toHaveTextContent('Service');
      expect(quoteHeaders[1]).toHaveTextContent('Resource');
      expect(quoteHeaders[2]).toHaveTextContent('Cadence');
      expect(quoteHeaders[3]).toHaveTextContent('Unit price');
      expect(quoteHeaders[4]).toHaveTextContent('Quantity');
      expect(quoteHeaders[5]).toHaveTextContent('Amount');
      const quoteCells = within(quoteChargeRow).getAllByRole('cell');
      expect(quoteCells).toHaveLength(6);
      expect(quoteCells[0]).toHaveTextContent('Managed warmup capacity');
      expect(quoteCells[1]).toHaveTextContent('1 new warmup slot');
      expect(quoteCells[2]).toHaveTextContent('Monthly');
      expect(quoteCells[3]).toHaveTextContent('$2.99');
      expect(quoteCells[4]).toHaveTextContent('1');
      expect(quoteCells[5]).toHaveTextContent('$2.99');
      expect(
        within(review).getByLabelText('Warmup quote effective date'),
      ).toHaveTextContent('Jan 10, 2027');
      expect(
        within(review).getByLabelText('Warmup quote due today'),
      ).toHaveTextContent('$2.99');
      expect(
        within(review).getByLabelText('Warmup quote monthly recurring'),
      ).toHaveTextContent('$2.99');

      await pressFocusedButton(
        within(review).getByRole('button', {
          name: 'Accept warmup capacity quote',
        }),
      );
      await expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard({
        canvasElement,
        operation,
      });
      await waitFor(() =>
        expect(
          within(canvasElement.ownerDocument.body).queryByRole('region', {
            name: 'Managed-email subscriptions',
          }),
        ).not.toBeInTheDocument(),
      );
      const start = await within(
        getMailboxRow({
          canvasElement,
          address: 'rory@riveroak.io',
        }),
      ).findByRole('button', {
        name: 'Start warmup for rory@riveroak.io',
      });
      await waitFor(() => expect(start).toBeEnabled());
      await expectWarmupState({
        canvasElement,
        address: 'rory@riveroak.io',
        assignment: 'Unassigned',
        providerState: 'Inactive',
        operation: 'Idle',
      });

      await expectWarmupCapacity({
        canvasElement,
        expected: 'Warmup capacity: 0 of 1 assigned · 1 slot available.',
      });
      const firstCapacityPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expectTask8WarmupSubscriptionResourceLinks({
        panel: firstCapacityPanel,
        resolution,
      });
      await pressFocusedButton(
        within(firstCapacityPanel).getByRole('button', {
          name: 'Back to email infrastructure',
        }),
      );
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Warmup capacity subscription ID',
        }),
      ).toBe(resolution.intent.targetSubscriptionId);
      await pressFocusedButton(start);
      await expectWarmupState({
        canvasElement,
        address: 'rory@riveroak.io',
        assignment: 'Assigned',
        providerState: 'Inactive',
        operation: 'Pending start',
      });
    },
  };
})();

export const RecoveredWarmupCapacityPurchase: Story = (() => {
  const mailboxes = [
    createTask7Mailbox({
      id: 'mailbox-mira',
      identity: 'Mira Chen',
      address: 'mira@northstar-outreach.com',
      domain: 'northstar-outreach.com',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    }),
  ];
  const initialSubscriptions = [
    createTask7MailboxSubscription({ quantity: 1, mailboxes }),
    createTask7WarmupSubscription({
      quantity: 1,
      lifecycle: {
        status: 'canceled',
        canceledAt: task7FixtureNow,
      },
    }),
  ];
  const workspace = createTask7Workspace({
    mailboxes,
    subscriptions: initialSubscriptions,
  });
  const firstRecovery = createTask8SucceededWarmupCapacityFixture({
    mailboxes,
    subscriptions: workspace.subscriptions,
    requestedQuantity: 1,
    targetSubscriptionId: 'subscription-managed-warmup-recovered',
  });
  const canceledFirstRecoveredSubscription =
    createManagedEmailDesignRecurringSubscription({
      id: firstRecovery.resolution.subscription.id,
      workspaceId: firstRecovery.resolution.subscription.workspaceId,
      linkedResources: firstRecovery.resolution.subscription.linkedResources,
      unitPriceCents: firstRecovery.resolution.subscription.unitPriceCents,
      product: 'managed-warmup',
      cadence: 'monthly',
      quantity: firstRecovery.resolution.subscription.quantity,
      status: 'canceled',
      renewsAt: null,
      canceledAt: task7SubscriptionCancelAt,
    });
  const secondRecovery = createTask8SucceededWarmupCapacityFixture({
    mailboxes,
    subscriptions: [
      ...workspace.subscriptions,
      canceledFirstRecoveredSubscription,
    ],
    requestedQuantity: 1,
    targetSubscriptionId: 'subscription-managed-warmup-recovered-2',
  });

  return {
    name: 'Recovered Warmup Capacity Purchase',
    args: withTask8StoryArgs({
      initialWorkspace: workspace,
    }),
    play: async ({ canvasElement }) => {
      await waitForManagedEmailDesignReady(canvasElement);
      const originalCanceledSubscriptionId = readStoryOutput({
        canvasElement,
        label: 'Warmup capacity subscription ID',
      });
      expect(originalCanceledSubscriptionId).toBe(
        'subscription-managed-warmup',
      );

      await expectWarmupState({
        canvasElement,
        address: 'mira@northstar-outreach.com',
        assignment: 'Assigned',
        providerState: 'Warming',
        operation: 'Idle',
      });
      const panel = await openManagedEmailSubscriptionPanel({
        canvasElement,
        actionName: 'Review warmup capacity',
      });
      expect(
        within(panel).getByText(
          '1 unresolved warmup assignment must be recovered before new capacity can be added.',
        ),
      ).toBeVisible();

      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Recover warmup capacity',
        }),
      );
      const review = await within(canvasElement.ownerDocument.body).findByRole(
        'dialog',
        { name: 'Review warmup capacity purchase' },
      );
      expect(
        within(review).getByLabelText('Warmup subscription intent'),
      ).toHaveTextContent('Create · 2 slots');
      expect(
        within(review).getByText('Mira Chen <mira@northstar-outreach.com>'),
      ).toBeVisible();
      expectWarmupCapacityQuote({
        review,
        lineAmount: '$5.98',
      });

      await userEvent.click(
        within(review).getByRole('button', {
          name: 'Accept warmup capacity quote',
        }),
      );
      await expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard({
        canvasElement,
        operation: firstRecovery.operation,
      });
      await expectWarmupState({
        canvasElement,
        address: 'mira@northstar-outreach.com',
        assignment: 'Assigned',
        providerState: 'Warming',
        operation: 'Idle',
      });
      await expectWarmupCapacity({
        canvasElement,
        expected: 'Warmup capacity: 1 of 2 assigned · 1 slot available.',
      });
      const firstRecoveredSubscriptionId = readStoryOutput({
        canvasElement,
        label: 'Warmup capacity subscription ID',
      });
      expect(firstRecoveredSubscriptionId).not.toBe(
        originalCanceledSubscriptionId,
      );
      expect(firstRecoveredSubscriptionId).toBe(
        firstRecovery.resolution.intent.targetSubscriptionId,
      );

      const firstRecoveryPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
        actionName: 'Manage warmup capacity',
      });
      expect(
        within(firstRecoveryPanel).getByLabelText(
          `Subscription status for ${firstRecoveredSubscriptionId}`,
        ),
      ).toHaveTextContent('Active');
      expectTask8WarmupSubscriptionResourceLinks({
        panel: firstRecoveryPanel,
        resolution: firstRecovery.resolution,
      });
      await pressFocusedButton(
        within(firstRecoveryPanel).getByRole('button', {
          name: 'Cancel managed warmup renewal',
        }),
      );
      const firstRecoveryCancellationDialog = await within(
        canvasElement.ownerDocument.body,
      ).findByRole('dialog', {
        name: 'Cancel managed warmup renewal?',
      });
      await pressFocusedButton(
        within(firstRecoveryCancellationDialog).getByRole('button', {
          name: 'Cancel renewal',
        }),
      );

      const pendingFirstRecoveryPanel = await within(
        canvasElement.ownerDocument.body,
      ).findByRole('region', {
        name: 'Managed-email subscriptions',
      });
      expect(
        within(pendingFirstRecoveryPanel).getByLabelText(
          `Subscription status for ${firstRecoveredSubscriptionId}`,
        ),
      ).toHaveTextContent('Pending cancellation');
      await pressFocusedButton(
        within(pendingFirstRecoveryPanel).getByRole('button', {
          name: 'Apply managed warmup cancellation effective Feb 10, 2027',
        }),
      );

      const canceledFirstRecoveryPanel = await within(
        canvasElement.ownerDocument.body,
      ).findByRole('region', {
        name: 'Managed-email subscriptions',
      });
      expect(
        within(canceledFirstRecoveryPanel).getByLabelText(
          `Subscription status for ${firstRecoveredSubscriptionId}`,
        ),
      ).toHaveTextContent('Canceled');
      await pressFocusedButton(
        within(canceledFirstRecoveryPanel).getByRole('button', {
          name: 'Recover warmup capacity',
        }),
      );

      const secondReview = await within(
        canvasElement.ownerDocument.body,
      ).findByRole('dialog', { name: 'Review warmup capacity purchase' });
      expect(
        within(secondReview).getByLabelText('Warmup subscription intent'),
      ).toHaveTextContent('Create · 2 slots');
      await pressFocusedButton(
        within(secondReview).getByRole('button', {
          name: 'Accept warmup capacity quote',
        }),
      );
      await expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard({
        canvasElement,
        operation: secondRecovery.operation,
      });
      await expectWarmupCapacity({
        canvasElement,
        expected: 'Warmup capacity: 1 of 2 assigned · 1 slot available.',
      });

      const secondRecoveredSubscriptionId = readStoryOutput({
        canvasElement,
        label: 'Warmup capacity subscription ID',
      });
      expect(secondRecoveredSubscriptionId).not.toBe(
        originalCanceledSubscriptionId,
      );
      expect(secondRecoveredSubscriptionId).not.toBe(
        firstRecoveredSubscriptionId,
      );
      expect(secondRecoveredSubscriptionId).toBe(
        secondRecovery.resolution.intent.targetSubscriptionId,
      );

      const secondRecoveryPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
        actionName: 'Manage warmup capacity',
      });
      expectTask8WarmupSubscriptionResourceLinks({
        panel: secondRecoveryPanel,
        resolution: secondRecovery.resolution,
      });
      await pressFocusedButton(
        within(secondRecoveryPanel).getByRole('button', {
          name: 'View managed-email subscription inventory',
        }),
      );
      const inventory = within(secondRecoveryPanel).getByRole('list', {
        name: 'Managed-email subscription inventory',
      });
      for (const subscriptionId of [
        originalCanceledSubscriptionId,
        firstRecoveredSubscriptionId,
        secondRecoveredSubscriptionId,
      ]) {
        expect(
          within(inventory).getByText(subscriptionId, { exact: true }),
        ).toBeVisible();
      }
    },
  };
})();

export const WarmupCapacityPurchaseBlockedIncremented: Story = (() => {
  const mira = createTask7Mailbox({
    id: 'mailbox-mira',
    identity: 'Mira Chen',
    address: 'mira@northstar-outreach.com',
    domain: 'northstar-outreach.com',
    warmupState: {
      assignment: 'assigned',
      lastConfirmedProviderState: 'warming',
      operation: { status: 'idle' },
    },
  });
  const rory = createTask7Mailbox({
    id: 'mailbox-rory',
    identity: 'Rory Blake',
    address: 'rory@riveroak.io',
    source: 'connected',
  });
  const mailboxes = [mira, rory];
  const activeWarmupSubscription = createTask7WarmupSubscription({
    quantity: 2,
  });
  const workspace = createTask7Workspace({
    mailboxes,
    subscriptions: [
      createTask7MailboxSubscription({ quantity: 1, mailboxes }),
      activeWarmupSubscription,
    ],
  });
  const increment = createTask8SucceededWarmupCapacityFixture({
    mailboxes: [
      mira,
      {
        ...rory,
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      },
    ],
    subscriptions: workspace.subscriptions,
    requestedQuantity: 1,
    targetSubscriptionId: activeWarmupSubscription.id,
  });

  return {
    name: 'Warmup Capacity Purchase Blocked / Incremented',
    args: withTask8StoryArgs({
      initialWorkspace: workspace,
    }),
    play: async ({ canvasElement }) => {
      await waitForManagedEmailDesignReady(canvasElement);

      await expectWarmupCapacity({
        canvasElement,
        expected: 'Warmup capacity: 1 of 2 assigned · 1 slot available.',
      });
      const blockedPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expect(
        within(blockedPanel).getByText(
          '1 warmup slot is already available. Assign it before buying more capacity.',
        ),
      ).toBeVisible();
      expect(
        within(blockedPanel).queryByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      ).not.toBeInTheDocument();

      await pressFocusedButton(
        within(blockedPanel).getByRole('button', {
          name: 'Back to email infrastructure',
        }),
      );
      const address = 'rory@riveroak.io';
      const start = await within(
        getMailboxRow({ canvasElement, address }),
      ).findByRole('button', {
        name: `Start warmup for ${address}`,
      });
      await pressFocusedButton(start);
      await resolveWarmupOperation(canvasElement);
      await expectWarmupCapacity({
        canvasElement,
        expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
      });

      const incrementPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      const additionalSlots = within(incrementPanel).getByRole('spinbutton', {
        name: 'Additional warmup slots',
      });
      await userEvent.clear(additionalSlots);
      await userEvent.type(additionalSlots, '1');
      await userEvent.click(
        within(incrementPanel).getByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      );
      const review = await within(canvasElement.ownerDocument.body).findByRole(
        'dialog',
        { name: 'Review warmup capacity purchase' },
      );
      expect(
        within(review).getByLabelText('Warmup subscription intent'),
      ).toHaveTextContent('Add to existing · 1 slot');
      expectWarmupCapacityQuote({
        review,
        lineAmount: '$2.99',
      });

      await userEvent.click(
        within(review).getByRole('button', {
          name: 'Accept warmup capacity quote',
        }),
      );
      await expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard({
        canvasElement,
        operation: increment.operation,
      });

      await expectWarmupState({
        canvasElement,
        address: 'mira@northstar-outreach.com',
        assignment: 'Assigned',
        providerState: 'Warming',
        operation: 'Idle',
      });
      await expectWarmupState({
        canvasElement,
        address,
        assignment: 'Assigned',
        providerState: 'Warming',
        operation: 'Idle',
      });
      await expectWarmupCapacity({
        canvasElement,
        expected: 'Warmup capacity: 2 of 3 assigned · 1 slot available.',
      });
      const incrementResultPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expectTask8WarmupSubscriptionResourceLinks({
        panel: incrementResultPanel,
        resolution: increment.resolution,
      });
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Warmup capacity subscription ID',
        }),
      ).toBe(increment.resolution.intent.targetSubscriptionId);
    },
  };
})();

export const ManagedEmailSubscriptionManagement: Story = {
  name: 'Managed-Email Subscription Management',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira-recreated',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
    ];
    const historicalMailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({
            quantity: 2,
            mailboxes: historicalMailboxes,
          }),
          createTask7WarmupSubscription({ quantity: 1 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const manageWarmupCapacity = await within(canvasElement).findByRole(
      'button',
      {
        name: 'Manage warmup capacity',
      },
    );
    await pressFocusedButton(manageWarmupCapacity);
    const warmupPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });

    expect(
      within(warmupPanel).getByLabelText('Selected managed-email subscription'),
    ).toHaveTextContent('subscription-managed-warmup');
    const warmupInventoryButton = within(warmupPanel).getByRole('button', {
      name: 'View managed-email subscription inventory',
    });
    expect(warmupInventoryButton).toBeEnabled();
    await pressFocusedButton(warmupInventoryButton);
    const warmupInventoryPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    const warmupInventory = await within(warmupInventoryPanel).findByRole(
      'list',
      {
        name: 'Managed-email subscription inventory',
      },
    );
    expect(
      within(warmupInventory).getByText('subscription-managed-warmup'),
    ).toBeVisible();
    expect(
      within(warmupInventory).getByText('subscription-managed-mailbox'),
    ).toBeVisible();
    expect(
      within(warmupInventory).getByText(
        'subscription-managed-domain-northstar',
      ),
    ).toBeVisible();
    expect(
      within(warmupInventory).getByText(
        'subscription-prewarmed-domain-fleetwave',
      ),
    ).toBeVisible();

    expect(canvasElement.ownerDocument.location.pathname).not.toContain(
      '/settings/billing',
    );

    await pressFocusedButton(
      within(warmupInventoryPanel).getByRole('button', {
        name: 'Back to email infrastructure',
      }),
    );
    await waitFor(() => expect(manageWarmupCapacity).toHaveFocus());

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    const manageMailboxCapacity = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('button', {
      name: 'Manage mailbox capacity',
    });
    await pressFocusedButton(manageMailboxCapacity);

    const mailboxPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    const mailboxInventoryButton = within(mailboxPanel).getByRole('button', {
      name: 'View managed-email subscription inventory',
    });
    expect(mailboxInventoryButton).toBeEnabled();
    await pressFocusedButton(mailboxInventoryButton);
    const mailboxInventoryPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    const mailboxInventory = await within(mailboxInventoryPanel).findByRole(
      'list',
      {
        name: 'Managed-email subscription inventory',
      },
    );
    expect(
      within(mailboxInventory).getByText('subscription-managed-warmup'),
    ).toBeVisible();
    expect(
      within(mailboxInventory).getByText('subscription-managed-mailbox'),
    ).toBeVisible();
    await pressFocusedButton(
      within(mailboxInventoryPanel).getByRole('button', {
        name: 'Manage subscription subscription-managed-domain-northstar',
      }),
    );
    expect(
      within(mailboxInventoryPanel).getByLabelText(
        'Selected managed-email subscription',
      ),
    ).toHaveTextContent('subscription-managed-domain-northstar');
    expect(
      within(mailboxInventoryPanel).getByLabelText(
        'Subscription cadence for subscription-managed-domain-northstar',
      ),
    ).toHaveTextContent('Annual');
    expect(
      within(mailboxInventoryPanel).getByLabelText(
        'Subscription unit price for subscription-managed-domain-northstar',
      ),
    ).toHaveTextContent('$14.29');
    expect(
      within(mailboxInventoryPanel).getByLabelText(
        'Subscription renewal for subscription-managed-domain-northstar',
      ),
    ).toHaveTextContent('Oct 12, 2027');
    expect(
      within(
        within(mailboxInventoryPanel).getByLabelText(
          'Subscription resource snapshots for subscription-managed-domain-northstar',
        ),
      ).queryByText('Retained after resource removal'),
    ).not.toBeInTheDocument();
    expect(
      within(mailboxInventoryPanel).getByRole('button', {
        name: 'Cancel renewal for subscription-managed-domain-northstar',
      }),
    ).toBeEnabled();
    await pressFocusedButton(
      within(mailboxInventoryPanel).getByRole('button', {
        name: 'Cancel renewal for subscription-managed-domain-northstar',
      }),
    );
    const domainCancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed domain renewal?',
    });
    expect(domainCancellationDialog).toHaveTextContent(
      'Cancellation takes effect on Oct 12, 2027.',
    );
    expect(domainCancellationDialog).not.toHaveTextContent(
      'Cancellation takes effect on Feb 10, 2027.',
    );
    await pressFocusedButton(
      within(domainCancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );
    expect(
      within(mailboxInventoryPanel).getByLabelText(
        'Subscription cancellation effective at for subscription-managed-domain-northstar',
      ),
    ).toHaveTextContent('Oct 12, 2027');
    await pressFocusedButton(
      within(mailboxInventoryPanel).getByRole('button', {
        name: 'Undo managed domain cancellation',
      }),
    );
    expect(
      within(mailboxInventoryPanel).getByLabelText(
        'Subscription status for subscription-managed-domain-northstar',
      ),
    ).toHaveTextContent('Active');

    await pressFocusedButton(
      within(mailboxInventoryPanel).getByRole('button', {
        name: 'Manage subscription subscription-managed-mailbox',
      }),
    );
    const mailboxSnapshots = within(mailboxInventoryPanel).getByLabelText(
      'Subscription resource snapshots for subscription-managed-mailbox',
    );
    expect(
      within(mailboxSnapshots).getByText(
        'Mira Chen <mira@northstar-outreach.com>',
      ),
    ).toBeVisible();
    expect(
      within(mailboxSnapshots).queryByText('Retained after resource removal'),
    ).not.toBeInTheDocument();

    await pressFocusedButton(
      within(mailboxInventoryPanel).getByRole('button', {
        name: 'Cancel managed mailbox renewal',
      }),
    );
    const mailboxCancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed mailbox renewal?',
    });
    expect(mailboxCancellationDialog).toHaveTextContent(
      'Mira Chen <mira@northstar-outreach.com>',
    );
    await userEvent.click(
      within(mailboxCancellationDialog).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog', {
          name: 'Cancel managed mailbox renewal?',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(mailboxInventoryPanel).getByLabelText(
        'Subscription status for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('Active');
    const mailboxQuantity = within(mailboxInventoryPanel).getByRole(
      'spinbutton',
      {
        name: 'Managed mailbox subscription quantity',
      },
    );
    await userEvent.clear(mailboxQuantity);
    await userEvent.type(mailboxQuantity, '1');
    await pressFocusedButton(
      within(mailboxInventoryPanel).getByRole('button', {
        name: 'Schedule managed mailbox quantity reduction',
      }),
    );
    const mailboxQuantityDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Confirm managed mailbox quantity reduction?',
    });
    expect(mailboxQuantityDialog).toHaveTextContent(
      'Mira Chen <mira@northstar-outreach.com>',
    );
    await userEvent.click(
      within(mailboxQuantityDialog).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog', {
          name: 'Confirm managed mailbox quantity reduction?',
        }),
      ).not.toBeInTheDocument(),
    );

    expect(canvasElement.ownerDocument.location.pathname).not.toContain(
      '/settings/billing',
    );
  },
};

export const RemoveResourceBeforeManagingSubscription: Story = {
  name: 'Remove Resource Before Managing Subscription',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 2, mailboxes }),
          createTask7WarmupSubscription({ quantity: 1 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const poolSignature = readMailboxPoolSignature(canvasElement);
    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox',
      }),
    );
    const removalDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Remove mira@northstar-outreach.com?',
    });
    await pressFocusedButton(
      within(removalDialog).getByRole('button', {
        name: 'Remove mailbox resource',
      }),
    );

    await waitFor(() =>
      expect(
        within(canvasElement).queryByText('mira@northstar-outreach.com', {
          exact: true,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Manage subscription subscription-managed-mailbox',
      }),
    );
    expect(
      within(panel).getByLabelText(
        'Subscription quantity for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('2');
    expect(
      within(panel).getByLabelText(
        'Subscription resource snapshots for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('Mira Chen <mira@northstar-outreach.com>');
    expect(
      within(panel).getByText('Retained after resource removal'),
    ).toBeVisible();

    const quantity = within(panel).getByRole('spinbutton', {
      name: 'Managed mailbox subscription quantity',
    });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '1');
    await pressFocusedButton(
      within(panel).getByRole('button', {
        name: 'Schedule managed mailbox quantity reduction',
      }),
    );
    const quantityReductionDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Confirm managed mailbox quantity reduction?',
    });
    expect(
      within(quantityReductionDialog).getByText(
        'Jordan Lee <jordan@northstar-outreach.com>',
      ),
    ).toBeVisible();
    expect(
      within(quantityReductionDialog).queryByText(
        'Mira Chen <mira@northstar-outreach.com>',
      ),
    ).not.toBeInTheDocument();
    expect(
      within(quantityReductionDialog).queryByText(
        'Retained after resource removal',
      ),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(quantityReductionDialog).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog', {
          name: 'Confirm managed mailbox quantity reduction?',
        }),
      ).not.toBeInTheDocument(),
    );
    const documentCanvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await documentCanvas.findByRole('button', {
        name: 'Manage subscription subscription-managed-mailbox',
      }),
    );
    await waitFor(() =>
      expect(
        documentCanvas.getByLabelText('Selected managed-email subscription'),
      ).toHaveTextContent('subscription-managed-mailbox'),
    );
    await pressFocusedButton(
      await documentCanvas.findByRole('button', {
        name: 'Cancel managed mailbox renewal',
      }),
    );
    const cancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed mailbox renewal?',
    });
    expect(
      within(cancellationDialog).getByText(
        'Jordan Lee <jordan@northstar-outreach.com>',
      ),
    ).toBeVisible();
    expect(
      within(cancellationDialog).queryByText(
        'Mira Chen <mira@northstar-outreach.com>',
      ),
    ).not.toBeInTheDocument();
    expect(
      within(cancellationDialog).queryByText('Retained after resource removal'),
    ).not.toBeInTheDocument();
    await pressFocusedButton(
      within(cancellationDialog).getByRole('button', { name: 'Cancel' }),
    );
  },
};

export const RemoveLastResourceKeepsSubscriptionReachable: Story = {
  name: 'Remove Last Resource Keeps Subscription Reachable',
  args: (() => {
    const mailbox = createTask7Mailbox({
      id: 'mailbox-last-retained',
      identity: 'Mira Chen',
      address: 'mira@northstar-outreach.com',
      domain: 'northstar-outreach.com',
    });

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes: [mailbox],
        subscriptions: [
          createTask7MailboxSubscription({
            quantity: 1,
            mailboxes: [mailbox],
          }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox',
      }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      {
        name: 'Remove mira@northstar-outreach.com?',
      },
    );
    await pressFocusedButton(
      within(dialog).getByRole('button', {
        name: 'Remove mailbox resource',
      }),
    );

    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.queryByText('mira@northstar-outreach.com', { exact: true }),
      ).not.toBeInTheDocument(),
    );
    expect(
      canvas.getByRole('button', { name: 'Manage subscriptions' }),
    ).toBeVisible();
  },
};

export const RemoveLastManagedDomainKeepsAnnualSubscriptionReachable: Story =
  (() => {
    const domain = mixedWorkspace.domains.find(
      (candidate) => candidate.name === 'northstar-outreach.com',
    );
    const subscription = mixedWorkspace.subscriptions.find(
      (candidate) =>
        candidate.product === 'managed-domain' &&
        candidate.id === domain?.subscriptionId,
    );
    if (domain === undefined || subscription === undefined) {
      throw new Error('Expected a managed domain and annual subscription.');
    }

    return {
      name: 'Remove Last Managed Domain Keeps Annual Subscription Reachable',
      args: {
        initialWorkspace: {
          ...mixedWorkspace,
          domains: [domain],
          mailboxes: [],
          prewarmedBundles: [],
          subscriptions: [subscription],
        },
      },
      play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);

        await openDomainActions({
          canvasElement,
          domain: domain.name,
        });
        await userEvent.click(
          await within(canvasElement.ownerDocument.body).findByRole('button', {
            name: 'Remove from workspace',
          }),
        );
        const removalDialog = await within(
          canvasElement.ownerDocument.body,
        ).findByRole('dialog');
        expect(removalDialog).toHaveTextContent(domain.name);
        await userEvent.click(
          within(removalDialog).getByRole('button', {
            name: 'Remove from workspace',
          }),
        );
        await waitFor(() =>
          expect(
            canvas.queryByText(domain.name, { exact: true }),
          ).not.toBeInTheDocument(),
        );

        const panel = await openManagedEmailSubscriptionPanel({
          canvasElement,
          actionName: 'Manage subscriptions',
        });
        await userEvent.click(
          within(panel).getByRole('button', {
            name: `Manage subscription ${subscription.id}`,
          }),
        );
        expect(
          within(panel).getByLabelText(
            `Subscription cadence for ${subscription.id}`,
          ),
        ).toHaveTextContent('Annual');
        expect(
          within(panel).getByLabelText(
            `Subscription resource snapshots for ${subscription.id}`,
          ),
        ).toHaveTextContent(domain.name);
        expect(
          within(panel).getByRole('button', {
            name: `Cancel renewal for ${subscription.id}`,
          }),
        ).toBeEnabled();
      },
    };
  })();

export const MailboxQuantityReductionBlocked: Story = {
  name: 'Mailbox Quantity Reduction Blocked',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
      createTask7Mailbox({
        id: 'mailbox-avery',
        identity: 'Avery Miles',
        address: 'avery@fleetwave-mail.com',
        domain: 'fleetwave-mail.com',
        source: 'prewarmed',
        readiness: 'ready',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 3, mailboxes }),
          createTask7WarmupSubscription({ quantity: 1 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Manage mailbox capacity',
      }),
    );
    const panel = await within(canvasElement.ownerDocument.body).findByRole(
      'region',
      {
        name: 'Managed-email subscriptions',
      },
    );
    expect(panel).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(panel).toHaveFocus());
    const quantity = within(panel).getByRole('spinbutton', {
      name: 'Managed mailbox subscription quantity',
    });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Schedule managed mailbox quantity reduction',
      }),
    );

    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Cannot reduce to 2: 3 retained mailbox resource snapshots still require this subscription.',
    );
    const blockers = within(panel).getByLabelText(
      'Quantity reduction blockers',
    );
    for (const [identity, address] of [
      ['Mira Chen', 'mira@northstar-outreach.com'],
      ['Jordan Lee', 'jordan@northstar-outreach.com'],
      ['Avery Miles', 'avery@fleetwave-mail.com'],
    ]) {
      expect(
        within(blockers).getByText(`${identity} <${address}>`),
      ).toBeVisible();
      expect(
        within(blockers).getByRole('button', {
          name: `Review ${address}`,
        }),
      ).toBeEnabled();
    }

    expect(
      within(panel).getByLabelText(
        'Subscription quantity for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('3');
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('Active');
    expect(
      within(panel).queryByLabelText('Scheduled change effective at'),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', {
        name: 'Apply managed mailbox quantity change effective Feb 10, 2027',
      }),
    ).not.toBeInTheDocument();

    const averyRow = getMailboxRow({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
    });
    expect(
      within(averyRow).queryByRole('button', {
        name: 'Start warmup for avery@fleetwave-mail.com',
      }),
    ).not.toBeInTheDocument();
    const reviewAvery = within(blockers).getByRole('button', {
      name: 'Review avery@fleetwave-mail.com',
    });
    await pressFocusedButton(reviewAvery);
    const averyActions = await within(canvasElement).findByRole('button', {
      name: 'More actions for avery@fleetwave-mail.com',
    });
    await waitFor(() => expect(averyActions).toHaveFocus());
  },
};

export const MailboxPendingReductionEffective: Story = {
  name: 'Mailbox Pending Reduction / Effective',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 3, mailboxes }),
          createTask7WarmupSubscription({ quantity: 1 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Manage mailbox capacity',
      }),
    );
    const panel = await within(canvasElement.ownerDocument.body).findByRole(
      'region',
      {
        name: 'Managed-email subscriptions',
      },
    );
    const quantity = within(panel).getByRole('spinbutton', {
      name: 'Managed mailbox subscription quantity',
    });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Schedule managed mailbox quantity reduction',
      }),
    );
    const mailboxReductionConfirmation = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Confirm managed mailbox quantity reduction?',
    });
    expect(mailboxReductionConfirmation).toHaveTextContent('Feb 10, 2027');
    expect(
      within(mailboxReductionConfirmation).getByText(
        'Mira Chen <mira@northstar-outreach.com>',
      ),
    ).toBeVisible();
    expect(
      within(mailboxReductionConfirmation).getByText(
        'Jordan Lee <jordan@northstar-outreach.com>',
      ),
    ).toBeVisible();
    expect(
      within(panel).getByLabelText(
        'Subscription quantity for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('3');
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('Active');
    await pressFocusedButton(
      within(mailboxReductionConfirmation).getByRole('button', {
        name: 'Confirm managed mailbox quantity reduction',
      }),
    );

    expect(
      within(panel).getByText('Reduction to 2 takes effect on Feb 10, 2027.'),
    ).toBeVisible();
    expect(
      within(panel).getByLabelText(
        'Subscription quantity for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('3');
    expect(
      within(panel).getByLabelText(
        'Effective subscription quantity for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('2');

    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Apply managed mailbox quantity change effective Feb 10, 2027',
      }),
    );
    expect(
      within(panel).getByLabelText(
        'Subscription quantity for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('2');
    expect(
      within(panel).getByText('Mira Chen <mira@northstar-outreach.com>'),
    ).toBeVisible();
    expect(
      within(panel).getByText('Jordan Lee <jordan@northstar-outreach.com>'),
    ).toBeVisible();
  },
};

export const WarmupQuantityReductionBlocked: Story = {
  name: 'Warmup Quantity Reduction Blocked',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 2, mailboxes }),
          createTask7WarmupSubscription({ quantity: 2 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    const quantity = within(panel).getByRole('spinbutton', {
      name: 'Managed warmup subscription quantity',
    });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '1');
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Schedule managed warmup quantity reduction',
      }),
    );

    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Cannot reduce to 1: 2 assigned mailboxes still require warmup capacity.',
    );
    for (const [identity, address] of [
      ['Mira Chen', 'mira@northstar-outreach.com'],
      ['Jordan Lee', 'jordan@northstar-outreach.com'],
    ]) {
      expect(within(panel).getByText(`${identity} <${address}>`)).toBeVisible();
      expect(
        within(panel).getByRole('button', {
          name: `Review ${address}`,
        }),
      ).toBeEnabled();
    }

    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
    });
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Active');
    expect(
      within(panel).queryByLabelText('Scheduled change effective at'),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', {
        name: 'Apply managed warmup quantity change effective Feb 10, 2027',
      }),
    ).not.toBeInTheDocument();

    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(panel).queryByLabelText('Quantity reduction blockers'),
    ).not.toBeInTheDocument();
  },
};

export const WarmupPendingReductionCapacity: Story = {
  name: 'Warmup Pending Reduction Capacity',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        source: 'connected',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 2, mailboxes }),
          createTask7WarmupSubscription({ quantity: 3 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const roryAddress = 'rory@riveroak.io';
    const roryStart = await within(
      getMailboxRow({ canvasElement, address: roryAddress }),
    ).findByRole('button', {
      name: `Start warmup for ${roryAddress}`,
    });

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    const quantity = within(panel).getByRole('spinbutton', {
      name: 'Managed warmup subscription quantity',
    });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Schedule managed warmup quantity reduction',
      }),
    );
    const warmupReductionConfirmation = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Confirm managed warmup quantity reduction?',
    });
    expect(warmupReductionConfirmation).toHaveTextContent('Feb 10, 2027');
    expect(
      within(warmupReductionConfirmation).getByText(
        'Mira Chen <mira@northstar-outreach.com>',
      ),
    ).toBeVisible();
    expect(
      within(warmupReductionConfirmation).getByText(
        'Jordan Lee <jordan@northstar-outreach.com>',
      ),
    ).toBeVisible();

    // This test-harness injection models a concurrent fixture update, not user interaction through the inert modal.
    fireEvent.click(roryStart);
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '#managed-email-warmup-action-mailbox-rory',
        ),
      ).toHaveAccessibleName('Resolve warmup operation'),
    );
    fireEvent.click(
      canvasElement.querySelector('#managed-email-warmup-action-mailbox-rory')!,
    );
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '#managed-email-warmup-action-mailbox-rory',
        ),
      ).toHaveAccessibleName(`Pause warmup for ${roryAddress}`),
    );
    await pressFocusedButton(
      within(warmupReductionConfirmation).getByRole('button', {
        name: 'Confirm managed warmup quantity reduction',
      }),
    );

    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 3 of 3 assigned · 0 slots available.',
    });
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Cannot reduce to 2: 3 assigned mailboxes still require warmup capacity.',
    );
    expect(
      within(panel).getByLabelText(
        'Subscription quantity for subscription-managed-warmup',
      ),
    ).toHaveTextContent('3');
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Active');
    expect(
      within(panel).queryByLabelText('Scheduled change effective at'),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', {
        name: 'Apply managed warmup quantity change effective Feb 10, 2027',
      }),
    ).not.toBeInTheDocument();
    const blockers = within(panel).getByLabelText(
      'Quantity reduction blockers',
    );
    for (const [identity, address] of [
      ['Mira Chen', 'mira@northstar-outreach.com'],
      ['Jordan Lee', 'jordan@northstar-outreach.com'],
      ['Rory Blake', roryAddress],
    ]) {
      expect(
        within(blockers).getByText(`${identity} <${address}>`),
      ).toBeVisible();
      expect(
        within(blockers).getByRole('button', {
          name: `Review ${address}`,
        }),
      ).toBeEnabled();
    }
  },
};

export const WarmupSubscriptionPendingChangeEffective: Story = {
  name: 'Warmup Subscription Pending Change Effective',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        source: 'connected',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 2, mailboxes }),
          createTask7WarmupSubscription({
            quantity: 3,
            lifecycle: {
              status: 'pending-change',
              pendingQuantity: 2,
              changeEffectiveAt: task7SubscriptionChangeEffectiveAt,
            },
          }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    expect(
      within(panel).getByLabelText('Scheduled change effective at'),
    ).toHaveTextContent('Feb 10, 2027');
    expect(
      within(panel).getByLabelText(
        'Effective subscription quantity for subscription-managed-warmup',
      ),
    ).toHaveTextContent('2');

    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Apply managed warmup quantity change effective Feb 10, 2027',
      }),
    );
    expect(
      within(panel).getByLabelText(
        'Subscription quantity for subscription-managed-warmup',
      ),
    ).toHaveTextContent('2');
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 2 of 2 assigned · 0 slots available.',
    });
    expect(
      within(
        getMailboxRow({
          canvasElement,
          address: 'rory@riveroak.io',
        }),
      ).queryByRole('button', {
        name: 'Start warmup for rory@riveroak.io',
      }),
    ).not.toBeInTheDocument();
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await expectWarmupState({
      canvasElement,
      address: 'jordan@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
  },
};

export const SubscriptionCancelUndoEffective: Story = {
  name: 'Subscription Cancel / Undo / Effective',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 1, mailboxes }),
          createTask7WarmupSubscription({ quantity: 2 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'mira@northstar-outreach.com';
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 1 of 2 assigned · 1 slot available.',
    });
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    const mailboxPoolSignatureBefore = readMailboxPoolSignature(canvasElement);

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Cancel managed warmup renewal',
      }),
    );
    const cancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed warmup renewal?',
    });
    expect(cancellationDialog).toHaveTextContent(
      'Cancellation takes effect on Feb 10, 2027.',
    );
    expect(cancellationDialog).toHaveTextContent(
      'Mira Chen <mira@northstar-outreach.com>',
    );
    await pressFocusedButton(
      within(cancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );

    const pendingPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    expect(
      within(pendingPanel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Pending cancellation');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(
      within(canvasElement).getByLabelText('Warmup capacity availability'),
    ).toHaveTextContent('0 new slots · 1 unresolved assignment');
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(
      mailboxPoolSignatureBefore,
    );

    await pressFocusedButton(
      within(pendingPanel).getByRole('button', {
        name: 'Undo managed warmup cancellation',
      }),
    );
    const activePanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    expect(
      within(activePanel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Active');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(
      mailboxPoolSignatureBefore,
    );

    await userEvent.click(
      within(activePanel).getByRole('button', {
        name: 'Cancel managed warmup renewal',
      }),
    );
    await userEvent.click(
      within(
        await within(canvasElement.ownerDocument.body).findByRole('dialog', {
          name: 'Cancel managed warmup renewal?',
        }),
      ).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );
    const pendingAgainPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    await userEvent.click(
      within(pendingAgainPanel).getByRole('button', {
        name: 'Apply managed warmup cancellation effective Feb 10, 2027',
      }),
    );

    const canceledPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    expect(
      within(canceledPanel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Canceled');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(
      within(canvasElement).getByLabelText('Warmup capacity availability'),
    ).toHaveTextContent('0 new slots · 1 unresolved assignment');
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(
      mailboxPoolSignatureBefore,
    );
  },
};

export const WarmupSubscriptionPendingCancel: Story = {
  name: 'Warmup Subscription Pending Cancel',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 1, mailboxes }),
          createTask7WarmupSubscription({ quantity: 2 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'mira@northstar-outreach.com';
    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    const mailboxPoolBefore = readMailboxPoolSignature(canvasElement);
    const cancellationTrigger = within(panel).getByRole('button', {
      name: 'Cancel managed warmup renewal',
    });
    await pressFocusedButton(cancellationTrigger);
    const cancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed warmup renewal?',
    });
    expect(cancellationDialog).toHaveAttribute('aria-modal', 'true');
    const cancelButton = within(cancellationDialog).getByRole('button', {
      name: 'Cancel',
    });
    const cancelRenewalButton = within(cancellationDialog).getByRole('button', {
      name: 'Cancel renewal',
    });
    await waitFor(() => expect(cancelButton).toHaveFocus());
    await userEvent.tab();
    expect(cancelRenewalButton).toHaveFocus();
    await userEvent.tab();
    expect(cancelButton).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(cancelRenewalButton).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog', {
          name: 'Cancel managed warmup renewal?',
        }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(cancellationTrigger).toHaveFocus());
    const requestCancellation = async () => {
      await pressFocusedButton(
        within(panel).getByRole('button', {
          name: 'Cancel managed warmup renewal',
        }),
      );
      const cancellationDialog = await within(
        canvasElement.ownerDocument.body,
      ).findByRole('dialog', {
        name: 'Cancel managed warmup renewal?',
      });
      expect(cancellationDialog).toHaveTextContent(
        'Cancellation takes effect on Feb 10, 2027.',
      );
      await pressFocusedButton(
        within(cancellationDialog).getByRole('button', {
          name: 'Cancel renewal',
        }),
      );
    };

    await requestCancellation();
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Pending cancellation');
    expect(
      within(panel).getByLabelText(
        'Subscription cancellation effective at for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Feb 10, 2027');
    expect(
      within(panel).getByRole('button', {
        name: 'Undo managed warmup cancellation',
      }),
    ).toBeEnabled();
    expect(
      within(panel).getByRole('button', {
        name: 'Apply managed warmup cancellation effective Feb 10, 2027',
      }),
    ).toBeEnabled();
    expect(
      within(panel).queryByRole('button', {
        name: 'Cancel managed warmup renewal',
      }),
    ).not.toBeInTheDocument();
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(
      within(canvasElement).getByLabelText('Warmup capacity availability'),
    ).toHaveTextContent('0 new slots · 1 unresolved assignment');
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(mailboxPoolBefore);

    await pressFocusedButton(
      within(panel).getByRole('button', {
        name: 'Undo managed warmup cancellation',
      }),
    );
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Active');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(mailboxPoolBefore);

    await requestCancellation();
    await pressFocusedButton(
      within(panel).getByRole('button', {
        name: 'Apply managed warmup cancellation effective Feb 10, 2027',
      }),
    );
    const canceledPanel = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('region', {
      name: 'Managed-email subscriptions',
    });
    expect(
      within(canceledPanel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Canceled');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(mailboxPoolBefore);
  },
};

export const SubscriptionCancellationEffective: Story = {
  name: 'Subscription Cancellation Effective',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        source: 'connected',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 1, mailboxes }),
          createTask7WarmupSubscription({
            quantity: 1,
            lifecycle: {
              status: 'canceled',
              canceledAt: task7FixtureNow,
            },
          }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
      actionName: 'Review warmup capacity',
    });
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-warmup',
      ),
    ).toHaveTextContent('Canceled');
    expect(
      within(canvasElement).getByLabelText('Warmup capacity availability'),
    ).toHaveTextContent('0 new slots · 1 unresolved assignment');
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    expect(
      within(
        getMailboxRow({
          canvasElement,
          address: 'rory@riveroak.io',
        }),
      ).queryByRole('button', {
        name: 'Start warmup for rory@riveroak.io',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole('button', {
        name: 'Recover warmup capacity',
      }),
    ).toBeEnabled();
  },
};

export const PrewarmedResourcePendingCancel: Story = {
  name: 'Prewarmed Resource Pending Cancel',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-avery',
        identity: 'Avery Miles',
        address: 'avery@fleetwave-mail.com',
        domain: 'fleetwave-mail.com',
        source: 'prewarmed',
        readiness: 'ready',
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({
            quantity: 1,
            mailboxes,
            lifecycle: {
              status: 'pending-cancel',
              cancelAt: task7SubscriptionCancelAt,
            },
          }),
          createTask7WarmupSubscription({ quantity: 1 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const address = 'avery@fleetwave-mail.com';
    const row = getMailboxRow({ canvasElement, address });
    expect(row).toHaveTextContent('Prewarmed');
    expect(
      within(row).getByLabelText(
        `Mailbox subscription lifecycle for ${address}`,
      ),
    ).toHaveTextContent('Pending cancellation');
    await expectWarmupState({
      canvasElement,
      address,
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });

    await openMailboxActions({ canvasElement, address });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Remove mailbox',
      }),
    );
    const removalDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Remove avery@fleetwave-mail.com?',
    });
    await userEvent.click(
      within(removalDialog).getByRole('button', {
        name: 'Remove mailbox resource',
      }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement).queryByText(address, { exact: true }),
      ).not.toBeInTheDocument(),
    );

    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Manage subscription subscription-managed-mailbox',
      }),
    );
    expect(
      within(panel).getByLabelText(
        'Subscription status for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('Pending cancellation');
    expect(
      within(panel).getByLabelText(
        'Subscription resource snapshots for subscription-managed-mailbox',
      ),
    ).toHaveTextContent('Avery Miles <avery@fleetwave-mail.com>');
  },
};

export const MailboxRemovalDisconnectDuringWarmupOperation: Story = {
  name: 'Mailbox Removal / Disconnect During Warmup Operation',
  args: (() => {
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-mira',
        identity: 'Mira Chen',
        address: 'mira@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-rory',
        identity: 'Rory Blake',
        address: 'rory@riveroak.io',
        source: 'connected',
        connection: createStoryConnection({
          operation: {
            status: 'unknown',
            operationId: 'connection-operation-rory-unknown-001',
            configuredOutcome: 'unknown',
            safeDiagnostic:
              'The connection result is unknown. Reconcile it before trying again.',
          },
        }),
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: {
            status: 'unknown',
            action: 'stop',
            operationId: 'warmup-stop-rory-unknown-001',
            safeDiagnostic:
              'The provider outcome is unknown. Reconcile warmup before disconnecting this mailbox.',
          },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-avery',
        identity: 'Avery Miles',
        address: 'avery@fleetwave-mail.com',
        domain: 'fleetwave-mail.com',
        source: 'prewarmed',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: {
            status: 'failed',
            action: 'stop',
            operationId: 'warmup-stop-avery-failed-001',
            safeDiagnostic:
              'The prewarmed provider did not confirm the stop. Retry or reconcile first.',
          },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-jordan',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        domain: 'northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: {
            status: 'unknown',
            action: 'stop',
            operationId: 'warmup-stop-jordan-unknown-001',
            safeDiagnostic:
              'The provider outcome is unknown. Reconcile it before removing this mailbox.',
          },
        },
      }),
    ];

    return {
      initialWorkspace: createTask7Workspace({
        mailboxes,
        subscriptions: [
          createTask7MailboxSubscription({ quantity: 3, mailboxes }),
          createTask7WarmupSubscription({ quantity: 4 }),
        ],
      }),
    };
  })(),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const poolSignature = readMailboxPoolSignature(canvasElement);
    const scenarios = [
      {
        address: 'mira@northstar-outreach.com',
        source: 'Purchased',
        removalAction: 'Remove mailbox',
        operation: 'Idle',
      },
      {
        address: 'rory@riveroak.io',
        source: 'Connected',
        removalAction: 'Disconnect',
        operation: 'Unknown stop',
      },
      {
        address: 'avery@fleetwave-mail.com',
        source: 'Prewarmed',
        removalAction: 'Remove mailbox',
        operation: 'Failed stop',
      },
      {
        address: 'jordan@northstar-outreach.com',
        source: 'Purchased',
        removalAction: 'Remove mailbox',
        operation: 'Unknown stop',
      },
    ] as const;

    for (const { address, source, removalAction, operation } of scenarios) {
      await expectWarmupState({
        canvasElement,
        address,
        assignment: 'Assigned',
        providerState: 'Warming',
        operation,
      });
      const row = getMailboxRow({ canvasElement, address });
      expect(row).toHaveTextContent(source);
      expect(
        within(row).getByText(
          'This mailbox cannot be removed or disconnected until warmup reaches confirmed provider inactivity.',
        ),
      ).toBeVisible();
      if (address === 'rory@riveroak.io') {
        expect(within(row).getByText('Connection unknown')).toBeVisible();
        expect(
          within(row).getByRole('button', {
            name: 'Reconcile warmup stop for rory@riveroak.io',
          }),
        ).toBeEnabled();
      }

      await openMailboxActions({ canvasElement, address });
      expect(
        within(canvasElement.ownerDocument.body).getByRole('button', {
          name: removalAction,
        }),
      ).toBeDisabled();
    }

    expect(readMailboxResourceCount(canvasElement)).toBe(4);
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignature);
    await expectWarmupCapacity({
      canvasElement,
      expected: 'Warmup capacity: 4 of 4 assigned · 0 slots available.',
    });
    await openDomainActions({
      canvasElement,
      domain: 'riveroak.io',
    });
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('button', {
        name: 'Disconnect domain',
      }),
    );
    await clickStoryButton({ canvasElement, name: 'View linked mailboxes' });
    const documentCanvas = within(canvasElement.ownerDocument.body);
    expect(
      await documentCanvas.findByRole('heading', {
        name: 'Linked mailboxes for riveroak.io',
      }),
    ).toBeVisible();
    await pressFocusedButton(
      documentCanvas.getByRole('button', {
        name: 'Disconnect mailbox rory@riveroak.io',
      }),
    );
    expect(
      documentCanvas.queryByRole('dialog', {
        name: 'Disconnect rory@riveroak.io?',
      }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        documentCanvas.queryByRole('heading', {
          name: 'Linked mailboxes for riveroak.io',
        }),
      ).not.toBeInTheDocument(),
    );
    const roryActions = within(canvasElement).getByRole('button', {
      name: 'More actions for rory@riveroak.io',
    });
    await waitFor(() => expect(roryActions).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    expect(
      await documentCanvas.findByRole('button', {
        name: 'Reconcile connection',
      }),
    ).toBeEnabled();
  },
};

export const ReviewQuoteExpired: Story = {
  name: 'Review Quote Expired',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8DomainReviewDraft,
    initialReviewQuote: task8ExpiredQuote,
    initialRefreshedQuote: task8RefreshedDomainQuote,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Myah-managed sending domain',
          resource: task8ReviewDomainName,
          cadence: 'Annual',
          unitPrice: '$14.29',
          quantity: '1',
          amount: '$14.29',
        },
      ],
      dueToday: '$14.29',
      annualRenewal: {
        amount: '$14.29',
        date: '2028-01-10',
      },
    });
    expect(
      canvas.getByText(
        'This quote expired. Refresh it before completing this local review.',
      ),
    ).toBeVisible();
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $14.29',
      }),
    ).toBeDisabled();

    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Refresh quote' }),
    );
    expect(
      await canvas.findByText(
        'Fresh quote ready. Accept it to complete locally.',
      ),
    ).toBeVisible();
    expect(
      canvas.queryByText(
        'This quote expired. Refresh it before completing this local review.',
      ),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('status', { name: 'Managed email outcome' }),
    ).toHaveTextContent('Fresh quote ready. Accept it to complete locally.');
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $14.29',
      }),
    ).toBeDisabled();
    expect(
      canvas.getByRole('button', {
        name: 'Accept refreshed quote — $14.29',
      }),
    ).toBeEnabled();
    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Accept refreshed quote — $14.29',
      }),
    );
    const completeReview = canvas.getByRole('button', {
      name: 'Complete locally — $14.29',
    });
    expect(completeReview).toBeEnabled();
    await waitFor(() => expect(completeReview).toHaveFocus());
    expect(canvasElement.ownerDocument.body).not.toHaveFocus();
    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByText(task8ReviewDomainName, { exact: true }),
    ).toBeVisible();
  },
};

export const ReviewValidUnacceptedQuote: Story = {
  name: 'Review Valid Unaccepted Quote',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8DomainReviewDraft,
    initialReviewQuote: task8RefreshedDomainQuote,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('button', {
        name: 'Complete locally — $14.29',
      }),
    ).toBeDisabled();
    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();
  },
};

export const ReviewPriceChanged: Story = {
  name: 'Review Price Changed',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8DomainReviewDraft,
    initialReviewQuote: task8PriceChangedQuote,
    initialRefreshedQuote: task8RefreshedPriceQuote,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Myah-managed sending domain',
          resource: task8ReviewDomainName,
          cadence: 'Annual',
          unitPrice: '$15.99',
          quantity: '1',
          amount: '$15.99',
        },
      ],
      dueToday: '$15.99',
      annualRenewal: {
        amount: '$15.99',
        date: '2028-01-10',
      },
    });
    expect(canvas.getByText('Price changed before completion.')).toBeVisible();
    expect(
      canvas.getByText('Previous due today: $14.29', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText('Previous annual renewal: $14.29 on Jan 10, 2028', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText('New due today: $15.99', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $15.99',
      }),
    ).toBeDisabled();
    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Refresh quote' }),
    );
    const acceptRefreshedPriceQuote = await canvas.findByRole('button', {
      name: 'Accept refreshed quote — $15.99',
    });
    expect(
      canvas.queryByText('Price changed before completion.'),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('status', { name: 'Managed email outcome' }),
    ).toHaveTextContent('Fresh quote ready. Accept it to complete locally.');
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $15.99',
      }),
    ).toBeDisabled();
    expect(acceptRefreshedPriceQuote).toBeEnabled();
    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();
    await userEvent.click(acceptRefreshedPriceQuote);
    const completeReview = canvas.getByRole('button', {
      name: 'Complete locally — $15.99',
    });
    expect(completeReview).toBeEnabled();
    await waitFor(() => expect(completeReview).toHaveFocus());
    expect(canvasElement.ownerDocument.body).not.toHaveFocus();
    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();
    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Myah-managed sending domain',
          resource: task8ReviewDomainName,
          cadence: 'Annual',
          unitPrice: '$15.99',
          quantity: '1',
          amount: '$15.99',
        },
      ],
      dueToday: '$15.99',
      annualRenewal: {
        amount: '$15.99',
        date: '2028-01-10',
      },
    });

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Complete locally — $15.99',
      }),
    );
    expect(
      await canvas.findByRole('heading', { name: 'Managed domain acquired' }),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(task8RefreshedPriceQuote.id);
    expect(
      canvas.getByText(`Resource: ${task8ReviewDomainName}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Quote reference: ${task8RefreshedPriceQuote.id}`, {
        exact: true,
      }),
    ).toBeVisible();
    const subscriptionReference =
      canvas.getByText(/^Subscription reference: /).textContent?.trim() ?? '';
    expect(subscriptionReference).toMatch(/^Subscription reference: .+/);
    const domainSubscriptionId = subscriptionReference.slice(
      'Subscription reference: '.length,
    );

    await userEvent.click(
      canvas.getByRole('button', { name: 'Return to dashboard' }),
    );
    const subscriptionPanel = await openManagedEmailSubscriptionPanel({
      canvasElement,
      actionName: 'Manage subscriptions',
    });
    await userEvent.click(
      within(subscriptionPanel).getByRole('button', {
        name: `Manage subscription ${domainSubscriptionId}`,
      }),
    );
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription unit price for ${domainSubscriptionId}`,
      ),
    ).toHaveTextContent('$15.99');
  },
};

export const ReviewPaymentFailure: Story = {
  name: 'Review Payment Failure',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8DomainReviewDraft,
    initialReviewQuote: task8PaymentFailureQuote,
    initialAcquisitionSubmittingOutcome: 'failed',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Myah-managed sending domain',
          resource: task8ReviewDomainName,
          cadence: 'Annual',
          unitPrice: '$14.29',
          quantity: '1',
          amount: '$14.29',
        },
      ],
      dueToday: '$14.29',
      annualRenewal: {
        amount: '$14.29',
        date: '2028-01-10',
      },
    });
    const commercialStateBeforeSubmission = {
      managedMailboxResourceCount: readMailboxResourceCount(canvasElement),
      managedMailboxPoolSignature: readMailboxPoolSignature(canvasElement),
    };
    expect(
      canvas.getByText(`Domain: ${task8ReviewDomainName}`, { exact: true }),
    ).toBeVisible();
    expect(commercialStateBeforeSubmission).toEqual({
      managedMailboxResourceCount: mixedWorkspace.mailboxes.length,
      managedMailboxPoolSignature:
        'subscription-managed-mailbox:active:4:mailbox-mira,mailbox-jordan,mailbox-avery,mailbox-rowan',
    });
    const completeReview = canvas.getByRole('button', {
      name: 'Complete locally — $14.29',
    });
    expect(completeReview).toBeEnabled();
    expect(
      canvas.queryByRole('heading', { name: 'Submitting local payment' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('Acquisition operation ID'),
    ).not.toBeInTheDocument();

    await userEvent.click(completeReview);

    expect(
      await canvas.findByRole('heading', {
        name: 'Submitting local payment',
      }),
    ).toBeVisible();
    expect(
      canvas.getByLabelText('Payment submission status'),
    ).toHaveTextContent('Submitting');
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Acquisition operation status',
      }),
    ).toBe('Pending');
    const submittingIdentity =
      readTask8AcquisitionIdentityProjection(canvasElement);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(task8PaymentFailureQuote.id);
    expect(completeReview).toBeDisabled();
    expect(
      canvas.queryByRole('heading', { name: 'Payment is being processed' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('heading', { name: 'Managed domain acquired' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: `Create a mailbox on ${task8ReviewDomainName}`,
      }),
    ).not.toBeInTheDocument();
    expect({
      managedMailboxResourceCount: readMailboxResourceCount(canvasElement),
      managedMailboxPoolSignature: readMailboxPoolSignature(canvasElement),
    }).toEqual(commercialStateBeforeSubmission);
    expect(
      canvas.getByRole('button', {
        name: 'Resolve configured local payment result',
      }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Resolve configured local payment result',
      }),
    );

    expect(
      await canvas.findByRole('heading', {
        name: 'Payment could not be completed',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByLabelText('Payment submission status'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: 'Resolve configured local payment result',
      }),
    ).not.toBeInTheDocument();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Acquisition operation status',
      }),
    ).toBe('Failed');
    expect(
      canvas.getByText(
        'The local payment evidence was declined. Your selection is still available and the affected resource was not created.',
      ),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      submittingIdentity,
    );
    expect(
      canvas.getByText(
        `Purchase reference: ${submittingIdentity.acquisitionOperationId}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.queryByRole('button', {
        name: `Create a mailbox on ${task8ReviewDomainName}`,
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $14.29',
      }),
    ).toBeDisabled();
    const retrySameOperation = canvas.getByRole('button', {
      name: 'Retry same operation',
    });
    expect(retrySameOperation).toBeEnabled();
    await waitFor(() => expect(retrySameOperation).toHaveFocus());
    expect(canvasElement.ownerDocument.body).not.toHaveFocus();
    expect(canvas.getByRole('button', { name: 'Cancel review' })).toBeEnabled();

    await userEvent.click(retrySameOperation);
    expect(
      await canvas.findByRole('heading', { name: 'Managed domain acquired' }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        `Purchase reference: ${submittingIdentity.acquisitionOperationId}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8ReviewDomainName}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      submittingIdentity,
    );

    expect(
      canvas.getByRole('button', {
        name: `Create a mailbox on ${task8ReviewDomainName}`,
      }),
    ).toBeEnabled();
    expect(
      canvas.queryByRole('heading', {
        name: 'Payment could not be completed',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Retry same operation' }),
    ).not.toBeInTheDocument();
  },
};

export const ReviewPaymentFailureCancel: Story = {
  name: 'Review Payment Failure — Cancel',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8DomainReviewDraft,
    initialReviewQuote: task8PaymentFailureQuote,
    initialAcquisitionSubmittingOutcome: 'failed',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForManagedEmailDesignReady(canvasElement);

    const commercialStateBeforeCancel = {
      managedMailboxResourceCount: readMailboxResourceCount(canvasElement),
      managedMailboxPoolSignature: readMailboxPoolSignature(canvasElement),
    };
    const completeReview = canvas.getByRole('button', {
      name: 'Complete locally — $14.29',
    });
    expect(completeReview).toBeEnabled();
    await userEvent.click(completeReview);
    expect(
      await canvas.findByRole('heading', {
        name: 'Submitting local payment',
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Resolve configured local payment result',
      }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Payment could not be completed',
      }),
    ).toBeVisible();
    const failedTargetSubscriptionId = readStoryOutput({
      canvasElement,
      label: 'Target subscription IDs',
    });
    expect(
      canvas.getByText(`Domain: ${task8ReviewDomainName}`, { exact: true }),
    ).toBeVisible();
    expect(commercialStateBeforeCancel).toEqual({
      managedMailboxResourceCount: mixedWorkspace.mailboxes.length,
      managedMailboxPoolSignature:
        'subscription-managed-mailbox:active:4:mailbox-mira,mailbox-jordan,mailbox-avery,mailbox-rowan',
    });

    const cancelReview = canvas.getByRole('button', {
      name: 'Cancel review',
    });
    expect(cancelReview).toBeEnabled();
    await userEvent.click(cancelReview);
    expect(
      await canvas.findByRole('heading', { name: 'Managed email resources' }),
    ).toBeVisible();
    expect(
      canvas.queryByText(task8ReviewDomainName, { exact: true }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect({
        managedMailboxResourceCount: readMailboxResourceCount(canvasElement),
        managedMailboxPoolSignature: readMailboxPoolSignature(canvasElement),
      }).toEqual(commercialStateBeforeCancel),
    );

    const subscriptionPanel = await openManagedEmailSubscriptionPanel({
      canvasElement,
      actionName: 'Manage subscriptions',
    });
    expect(
      within(subscriptionPanel).queryByText(failedTargetSubscriptionId, {
        exact: true,
      }),
    ).not.toBeInTheDocument();
  },
};

export const ReviewPaymentAmbiguous: Story = {
  name: 'Review Payment Ambiguous',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialWorkspace: {
      ...emptyWorkspace,
      domains: [
        {
          id: 'domain-task8-payment-ambiguous-verified-001',
          name: task8ReviewDomainName,
          source: 'external',
          verification: 'verified',
          subscriptionId: null,
        },
      ],
    },
    initialReviewDraft: task8MailboxReviewDraft,
    initialReviewQuote: task8PaymentAmbiguousQuote,
    initialAcquisitionSubmittingOutcome: 'reconciliation-required',
    initialAcquisitionReconcileOutcomes: ['unknown', 'completed'],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Managed mailbox',
          resource: task8MailboxReviewAddress,
          cadence: 'Monthly',
          unitPrice: '$5.00',
          quantity: '1',
          amount: '$5.00',
        },
      ],
      dueToday: '$5.00',
      monthlyRenewal: {
        amount: '$5.00',
        date: '2027-02-10',
      },
    });
    const ambiguousOperationId = `acquisition-${task8PaymentAmbiguousQuote.id}`;
    const completeReview = canvas.getByRole('button', {
      name: 'Complete locally — $5.00',
    });
    expect(completeReview).toBeEnabled();
    await userEvent.click(completeReview);
    expect(
      await canvas.findByRole('heading', {
        name: 'Submitting local payment',
      }),
    ).toBeVisible();
    const resolveConfiguredPayment = canvas.getByRole('button', {
      name: 'Resolve configured local payment result',
    });
    expect(resolveConfiguredPayment).toBeEnabled();
    await userEvent.click(resolveConfiguredPayment);
    const reconcilePayment = await canvas.findByRole('button', {
      name: 'Reconcile payment result',
    });
    await waitFor(() => expect(reconcilePayment).toHaveFocus());
    expect(canvasElement.ownerDocument.body).not.toHaveFocus();
    expect(
      await canvas.findByRole('heading', {
        name: 'Payment status needs reconciliation',
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'The local payment result is unknown. Reconcile it before completing this review.',
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(`Purchase reference: ${ambiguousOperationId}`, {
        exact: true,
      }),
    ).toBeVisible();
    const mailboxSummary = canvas.getByText('Mailbox:', { exact: true });
    expect(mailboxSummary).toHaveTextContent(
      `Mailbox: ${task8MailboxReviewAddress}`,
    );
    const ambiguousIdentity =
      readTask8AcquisitionIdentityProjection(canvasElement);
    expect(ambiguousIdentity.acquisitionOperationId).toBe(ambiguousOperationId);
    expect(ambiguousIdentity.acceptedQuoteId).toBe(
      task8PaymentAmbiguousQuote.id,
    );

    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $5.00',
      }),
    ).toBeDisabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconcile payment result' }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole('heading', {
          name: 'Payment status needs reconciliation',
        }),
      ).toBeVisible(),
    );
    expect(
      canvas.getByText(
        'The local payment result is unknown. Reconcile it before completing this review.',
      ),
    ).toBeVisible();
    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Managed mailbox',
          resource: task8MailboxReviewAddress,
          cadence: 'Monthly',
          unitPrice: '$5.00',
          quantity: '1',
          amount: '$5.00',
        },
      ],
      dueToday: '$5.00',
      monthlyRenewal: {
        amount: '$5.00',
        date: '2027-02-10',
      },
    });
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $5.00',
      }),
    ).toBeDisabled();
    expect(
      canvas.getByText(`Purchase reference: ${ambiguousOperationId}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      ambiguousIdentity,
    );

    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconcile payment result' }),
    );
    expect(
      await canvas.findByRole('heading', { name: 'Managed mailbox acquired' }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Purchase reference: ${ambiguousOperationId}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8MailboxReviewAddress}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      ambiguousIdentity,
    );

    expect(
      canvas.queryByRole('heading', {
        name: 'Payment status needs reconciliation',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: 'Reconcile payment result',
      }),
    ).not.toBeInTheDocument();
  },
};
export const ReviewPaymentPending: Story = {
  name: 'Review Payment Pending',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8DomainReviewDraft,
    initialReviewQuote: task8PaymentFailureQuote,
    initialAcquisitionOperation: createTask8SingleLineAcquisition({
      id: 'acquisition-task8-domain-payment-pending-001',
      source: 'managed-domain',
      quote: task8PaymentFailureQuote,
      intent: {
        product: 'managed-domain',
        mode: 'create',
        targetSubscriptionId: 'subscription-task8-domain-payment-pending-001',
        quantityDelta: 1,
        resourceSnapshotIds: ['domain-task8-payment-pending-001'],
      },
      resourceSnapshot: {
        id: 'domain-task8-payment-pending-001',
        kind: 'domain',
        label: task8ReviewDomainName,
      },
      paymentOutcome: 'pending',
    }),
    initialAcquisitionPendingOutcome: 'completed',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pendingOperationId = 'acquisition-task8-domain-payment-pending-001';
    const pendingPurchaseReference = `Purchase reference: ${pendingOperationId}`;

    expect(
      await canvas.findByRole('heading', {
        name: 'Payment is being processed',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', { name: 'Submitting local payment' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('Payment submission status'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: 'Resolve configured local payment result',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getAllByText(pendingPurchaseReference, { exact: true }),
    ).toHaveLength(1);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(task8PaymentFailureQuote.id);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Payment evidence IDs',
      }),
    ).toBe(`payment-evidence-${pendingOperationId}`);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Resource snapshot IDs',
      }),
    ).toBe('domain-task8-payment-pending-001');
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Subscription operation IDs',
      }),
    ).toBe(`subscription-operation-${pendingOperationId}`);
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $14.29',
      }),
    ).toBeDisabled();
    expect(
      canvas.getByRole('button', { name: 'Resolve payment result' }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Resolve payment result' }),
    );
    expect(
      await canvas.findByRole('heading', { name: 'Managed domain acquired' }),
    ).toBeVisible();
    expect(
      canvas.getAllByText(pendingPurchaseReference, { exact: true }),
    ).toHaveLength(1);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(task8PaymentFailureQuote.id);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Payment evidence IDs',
      }),
    ).toBe(`payment-evidence-${pendingOperationId}`);
    expect(
      canvas.queryByRole('heading', {
        name: 'Payment is being processed',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Resolve payment result' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: 'Complete locally — $14.29',
      }),
    ).not.toBeInTheDocument();
  },
};
const task8NonPrewarmedSubscriptionWorkspace: ManagedEmailDesignWorkspace = {
  ...emptyWorkspace,
  domains: [
    {
      id: 'domain-task8-non-prewarmed-subscription-recovery-verified-001',
      name: task8ReviewDomainName,
      source: 'external',
      verification: 'verified',
      subscriptionId: null,
    },
  ],
};

const task8NonPrewarmedSubscriptionFailureQuote = createTask8Quote({
  id: 'quote-task8-mailbox-subscription-failure-001',
  accepted: true,
  lines: [
    createTask8MailboxQuoteLine({
      id: 'quote-line-task8-mailbox-subscription-failure-001',
      resourceLabel: task8MailboxReviewAddress,
    }),
  ],
});
const task8NonPrewarmedSubscriptionFailureOperation =
  createTask8SingleLineAcquisition({
    id: 'acquisition-task8-mailbox-subscription-failure-001',
    source: 'managed-mailbox',
    quote: task8NonPrewarmedSubscriptionFailureQuote,
    intent: {
      product: 'managed-mailbox',
      mode: 'create',
      targetSubscriptionId:
        'subscription-task8-mailbox-subscription-failure-001',
      quantityDelta: 1,
      resourceSnapshotIds: ['mailbox-task8-subscription-failure-001'],
    },
    resourceSnapshot: {
      id: 'mailbox-task8-subscription-failure-001',
      kind: 'mailbox',
      label: task8MailboxReviewAddress,
    },
    settledSubscriptionOutcome: 'failed',
  });

export const NonPrewarmedPartialSubscriptionRecovery: Story = {
  name: 'Non-Prewarmed Partial Subscription Recovery',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialWorkspace: task8NonPrewarmedSubscriptionWorkspace,
    initialReviewDraft: task8MailboxReviewDraft,
    initialReviewQuote: task8NonPrewarmedSubscriptionFailureQuote,
    initialAcquisitionOperation: task8NonPrewarmedSubscriptionFailureOperation,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const operation = task8NonPrewarmedSubscriptionFailureOperation;

    expect(
      await canvas.findByRole('heading', {
        name: 'Subscription could not be completed',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', {
        name: 'Payment could not be completed',
      }),
    ).not.toBeInTheDocument();
    const initialIdentity = expectTask8AcquisitionIdentityProjection({
      canvasElement,
      operation,
    });
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $5.00',
      }),
    ).toBeDisabled();
    expect(
      canvas.getByRole('button', { name: 'Retry same operation' }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Retry same operation' }),
    );

    expect(
      await canvas.findByRole('heading', { name: 'Managed mailbox acquired' }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Purchase reference: ${operation.id}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8MailboxReviewAddress}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      initialIdentity,
    );
    expect(
      canvas.queryByRole('heading', {
        name: 'Subscription could not be completed',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Retry same operation' }),
    ).not.toBeInTheDocument();
  },
};

const task8NonPrewarmedSubscriptionAmbiguityQuote = createTask8Quote({
  id: 'quote-task8-mailbox-subscription-ambiguity-001',
  accepted: true,
  lines: [
    createTask8MailboxQuoteLine({
      id: 'quote-line-task8-mailbox-subscription-ambiguity-001',
      resourceLabel: task8MailboxReviewAddress,
    }),
  ],
});
const task8NonPrewarmedSubscriptionAmbiguityOperation =
  createTask8SingleLineAcquisition({
    id: 'acquisition-task8-mailbox-subscription-ambiguity-001',
    source: 'managed-mailbox',
    quote: task8NonPrewarmedSubscriptionAmbiguityQuote,
    intent: {
      product: 'managed-mailbox',
      mode: 'create',
      targetSubscriptionId:
        'subscription-task8-mailbox-subscription-ambiguity-001',
      quantityDelta: 1,
      resourceSnapshotIds: ['mailbox-task8-subscription-ambiguity-001'],
    },
    resourceSnapshot: {
      id: 'mailbox-task8-subscription-ambiguity-001',
      kind: 'mailbox',
      label: task8MailboxReviewAddress,
    },
    settledSubscriptionOutcome: 'unknown',
  });

export const NonPrewarmedSubscriptionAmbiguityRecovery: Story = {
  name: 'Non-Prewarmed Subscription Ambiguity Recovery',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialWorkspace: task8NonPrewarmedSubscriptionWorkspace,
    initialReviewDraft: task8MailboxReviewDraft,
    initialReviewQuote: task8NonPrewarmedSubscriptionAmbiguityQuote,
    initialAcquisitionOperation:
      task8NonPrewarmedSubscriptionAmbiguityOperation,
    initialAcquisitionReconcileOutcomes: ['unknown', 'completed'],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const operation = task8NonPrewarmedSubscriptionAmbiguityOperation;

    expect(
      await canvas.findByRole('heading', {
        name: 'Subscription status needs reconciliation',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', {
        name: 'Payment status needs reconciliation',
      }),
    ).not.toBeInTheDocument();
    const initialIdentity = expectTask8AcquisitionIdentityProjection({
      canvasElement,
      operation,
    });
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $5.00',
      }),
    ).toBeDisabled();
    expect(
      canvas.getByRole('button', { name: 'Reconcile subscription result' }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconcile subscription result' }),
    );

    expect(
      await canvas.findByRole('heading', {
        name: 'Subscription status needs reconciliation',
      }),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      initialIdentity,
    );

    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconcile subscription result' }),
    );

    expect(
      await canvas.findByRole('heading', { name: 'Managed mailbox acquired' }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Purchase reference: ${operation.id}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      initialIdentity,
    );
    expect(
      canvas.queryByRole('heading', {
        name: 'Subscription status needs reconciliation',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: 'Reconcile subscription result',
      }),
    ).not.toBeInTheDocument();
  },
};

const task8NonPrewarmedSubscriptionPendingQuote = createTask8Quote({
  id: 'quote-task8-mailbox-subscription-pending-001',
  accepted: true,
  lines: [
    createTask8MailboxQuoteLine({
      id: 'quote-line-task8-mailbox-subscription-pending-001',
      resourceLabel: task8MailboxReviewAddress,
    }),
  ],
});
const task8NonPrewarmedSubscriptionPendingOperation =
  createTask8SingleLineAcquisition({
    id: 'acquisition-task8-mailbox-subscription-pending-001',
    source: 'managed-mailbox',
    quote: task8NonPrewarmedSubscriptionPendingQuote,
    intent: {
      product: 'managed-mailbox',
      mode: 'create',
      targetSubscriptionId:
        'subscription-task8-mailbox-subscription-pending-001',
      quantityDelta: 1,
      resourceSnapshotIds: ['mailbox-task8-subscription-pending-001'],
    },
    resourceSnapshot: {
      id: 'mailbox-task8-subscription-pending-001',
      kind: 'mailbox',
      label: task8MailboxReviewAddress,
    },
    settledSubscriptionOutcome: 'pending',
  });

export const NonPrewarmedSubscriptionPendingResolution: Story = {
  name: 'Non-Prewarmed Subscription Pending Resolution',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialWorkspace: task8NonPrewarmedSubscriptionWorkspace,
    initialReviewDraft: task8MailboxReviewDraft,
    initialReviewQuote: task8NonPrewarmedSubscriptionPendingQuote,
    initialAcquisitionOperation: task8NonPrewarmedSubscriptionPendingOperation,
    initialAcquisitionPendingOutcome: 'completed',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const operation = task8NonPrewarmedSubscriptionPendingOperation;

    expect(
      await canvas.findByRole('heading', {
        name: 'Subscription is being processed',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', {
        name: 'Payment is being processed',
      }),
    ).not.toBeInTheDocument();
    const initialIdentity = expectTask8AcquisitionIdentityProjection({
      canvasElement,
      operation,
    });
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $5.00',
      }),
    ).toBeDisabled();
    expect(
      canvas.getByRole('button', { name: 'Resolve subscription result' }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Resolve subscription result' }),
    );

    expect(
      await canvas.findByRole('heading', { name: 'Managed mailbox acquired' }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Purchase reference: ${operation.id}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      initialIdentity,
    );
    expect(
      canvas.queryByRole('heading', {
        name: 'Subscription is being processed',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: 'Resolve subscription result',
      }),
    ).not.toBeInTheDocument();
  },
};
export const ReviewPrewarmedMobileCards: Story = {
  name: 'Review Prewarmed Mobile Cards',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8PrewarmedReviewDraft,
    initialReviewQuote: task8PartialPrewarmedQuote,
    initialPrewarmedCapacityResolution: task8PrewarmedCapacityResolution,
  }),
  parameters: createManagedEmailViewport(390, 844),
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);
    const canvas = within(canvasElement);
    assertManagedEmailCurrentStep({
      canvasElement,
      label: 'Review',
      position: 2,
      setSize: 2,
    });

    const annualDates = getTask8QuoteCadenceDates({
      quote: task8PartialPrewarmedQuote,
      cadence: 'annual',
    });
    const monthlyDates = getTask8QuoteCadenceDates({
      quote: task8PartialPrewarmedQuote,
      cadence: 'monthly',
    });
    const expectedCharges = [
      {
        service: 'Prewarmed bundle domain',
        resource: task8PrewarmedBundle.domain,
        cadence: 'Annual',
        unitPrice: '$14.29',
        quantity: '1',
        amount: '$14.29',
      },
      ...task8PrewarmedBundle.mailboxIdentities.map(
        ({ identity, address }) => ({
          service: 'Prewarmed managed mailbox',
          resource: `${identity} <${address}>`,
          cadence: 'Monthly',
          unitPrice: '$5.00',
          quantity: '1',
          amount: '$5.00',
        }),
      ),
    ] satisfies Task8ReviewChargeRow[];
    const cards = await canvas.findAllByRole('region', {
      name: /^Review charge for /,
    });

    expect(cards).toHaveLength(expectedCharges.length);
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(
      expectedCharges.map(({ resource }) => `Review charge for ${resource}`),
    );

    for (const charge of expectedCharges) {
      const card = canvas.getByRole('region', {
        name: `Review charge for ${charge.resource}`,
      });

      for (const value of [
        charge.service,
        `Resource: ${charge.resource}`,
        `Cadence: ${charge.cadence}`,
        `Unit price: ${charge.unitPrice}`,
        `Quantity: ${charge.quantity}`,
        `Amount: ${charge.amount}`,
      ]) {
        expect(within(card).getByText(value, { exact: true })).toBeVisible();
      }
    }

    expect(
      canvas.getByText('Due today: $24.29', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        `Annual effective date: ${formatTask8ReviewDate(annualDates.startsAt)}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        `Renews annually: $14.29 on ${formatTask8ReviewDate(
          annualDates.renewsAt,
        )}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        `Monthly effective date: ${formatTask8ReviewDate(monthlyDates.startsAt)}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        `Renews monthly: $10.00 on ${formatTask8ReviewDate(
          monthlyDates.renewsAt,
        )}`,
        { exact: true },
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Complete locally — $24.29' }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Prewarmed mailboxes acquired',
      }),
    ).toBeVisible();
    const completionScreen = canvas.getByRole('region', {
      name: 'Completion screen',
    });
    await waitFor(() => expect(completionScreen).toHaveFocus());
    expect(
      canvas.getByRole('status', { name: 'Managed email outcome' }),
    ).toHaveTextContent(
      `${task8PrewarmedBundle.domain} was completed in local fixture state.`,
    );
  },
};

export const ReviewPrewarmedInitialStockConflict: Story = {
  name: 'Review Prewarmed Initial Stock Conflict',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialWorkspace: {
      ...mixedWorkspace,
      prewarmedBundles: mixedWorkspace.prewarmedBundles.filter(
        (bundle) => bundle.id !== task8PrewarmedBundle.id,
      ),
    },
    initialReviewDraft: task8PrewarmedReviewDraft,
    initialReviewQuote: task8StockConflictQuote,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByText(
        'The selected prewarmed offer is no longer available. Return to inventory to choose another available bundle.',
      ),
    ).toBeVisible();
    const complete = canvas.getByRole('button', {
      name: 'Complete locally — $24.29',
    });
    expect(complete).toBeDisabled();
    const returnToInventory = canvas.getByRole('button', {
      name: 'Return to inventory',
    });
    expect(returnToInventory).toBeEnabled();
    await waitFor(() => expect(returnToInventory).toHaveFocus());
    expect(
      Number(
        readStoryOutput({
          canvasElement,
          label: 'Prewarmed inventory count',
        }),
      ),
    ).toBe(mixedWorkspace.prewarmedBundles.length - 1);

    await userEvent.click(returnToInventory);
    expect(
      await canvas.findByRole('heading', {
        name: 'Choose a prewarmed mailbox bundle',
      }),
    ).toBeVisible();
  },
};

export const ReviewPrewarmedStockConflict: Story = {
  name: 'Review Prewarmed Stock Conflict',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8PrewarmedReviewDraft,
    initialReviewQuote: task8StockConflictQuote,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const annualDates = getTask8QuoteCadenceDates({
      quote: task8StockConflictQuote,
      cadence: 'annual',
    });
    const monthlyDates = getTask8QuoteCadenceDates({
      quote: task8StockConflictQuote,
      cadence: 'monthly',
    });

    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Prewarmed bundle domain',
          resource: task8PrewarmedBundle.domain,
          cadence: 'Annual',
          unitPrice: '$14.29',
          quantity: '1',
          amount: '$14.29',
        },
        ...task8PrewarmedBundle.mailboxIdentities.map(
          ({ identity, address }) => ({
            service: 'Prewarmed managed mailbox',
            resource: `${identity} <${address}>`,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '1',
            amount: '$5.00',
          }),
        ),
      ],
      dueToday: '$24.29',
      annualRenewal: {
        amount: '$14.29',
        date: annualDates.renewsAt.slice(0, 10),
        effectiveDate: annualDates.startsAt,
      },
      monthlyRenewal: {
        amount: '$10.00',
        date: monthlyDates.renewsAt.slice(0, 10),
        effectiveDate: monthlyDates.startsAt,
      },
    });
    const initialPrewarmedInventoryCount = Number(
      readStoryOutput({
        canvasElement,
        label: 'Prewarmed inventory count',
      }),
    );
    expect(initialPrewarmedInventoryCount).toBe(
      mixedWorkspace.prewarmedBundles.length,
    );
    expect(
      canvas.queryByText(
        'The selected prewarmed offer is no longer available. Return to inventory to choose another available bundle.',
      ),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $24.29',
      }),
    ).toBeEnabled();
    expect(
      canvas.getByRole('button', {
        name: 'Simulate selected offer becoming unavailable',
      }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Simulate selected offer becoming unavailable',
      }),
    );
    expect(
      await canvas.findByText(
        'The selected prewarmed offer is no longer available. Return to inventory to choose another available bundle.',
      ),
    ).toBeVisible();
    expect(
      Number(
        readStoryOutput({
          canvasElement,
          label: 'Prewarmed inventory count',
        }),
      ),
    ).toBe(initialPrewarmedInventoryCount - 1);
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $24.29',
      }),
    ).toBeDisabled();

    const returnToInventory = canvas.getByRole('button', {
      name: 'Return to inventory',
    });
    await waitFor(() => expect(returnToInventory).toHaveFocus());
    expect(canvasElement.ownerDocument.body).not.toHaveFocus();
    await userEvent.click(returnToInventory);
    expect(
      await canvas.findByRole('heading', {
        name: 'Choose a prewarmed mailbox bundle',
      }),
    ).toBeVisible();
    expect(
      Number(
        readStoryOutput({
          canvasElement,
          label: 'Prewarmed inventory count',
        }),
      ),
    ).toBe(initialPrewarmedInventoryCount - 1);
    expect(
      canvas.queryByRole('radio', {
        name: task8PrewarmedBundle.domain,
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText(task8PrewarmedBundle.domain, { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: 'Create a managed mailbox' }),
    ).toBeEnabled();
  },
};

export const PartialPrewarmedPendingDependency: Story = {
  name: 'Partial Prewarmed Pending Dependency',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8PrewarmedReviewDraft,
    initialReviewQuote: task8PartialPrewarmedQuote,
    initialAcquisitionOperation: task8PendingDomainPrewarmedOperation,
    initialAcquisitionPendingOutcome: 'completed',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const operation = task8PendingDomainPrewarmedOperation;
    const [firstMailbox, secondMailbox, extraMailbox] =
      task8PrewarmedBundle.mailboxIdentities;

    if (!firstMailbox || !secondMailbox || extraMailbox !== undefined) {
      throw new Error('Expected exactly two task fixture prewarmed mailboxes.');
    }

    const purchaseReference = `Purchase reference: ${operation.id}`;

    expect(
      await canvas.findByRole('heading', {
        name: 'Resource is being processed',
      }),
    ).toBeVisible();
    expect(
      canvas.getByRole('heading', {
        name: 'Prewarmed fulfillment needs attention',
      }),
    ).toBeVisible();
    expect(
      canvas.getAllByText(purchaseReference, { exact: true }),
    ).toHaveLength(1);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Acquisition operation status',
      }),
    ).toBe('Pending');
    const initialIdentity = expectTask8AcquisitionIdentityProjection({
      canvasElement,
      operation,
    });
    const fulfillment = canvas.getByRole('table', {
      name: 'Prewarmed fulfillment progress',
    });
    expect(within(fulfillment).getAllByRole('row')).toHaveLength(4);
    const domainRow = within(fulfillment).getByRole('row', {
      name: new RegExp(`^${task8PrewarmedBundle.domain}\\s`),
    });
    const firstMailboxRow = within(fulfillment).getByRole('row', {
      name: new RegExp(firstMailbox.address),
    });
    const secondMailboxRow = within(fulfillment).getByRole('row', {
      name: new RegExp(secondMailbox.address),
    });

    expect(domainRow).toHaveTextContent('No dependency');
    expect(domainRow).toHaveTextContent('Payment Completed');
    expect(domainRow).toHaveTextContent('Subscription Completed');
    expect(domainRow).toHaveTextContent('Resource Pending');
    for (const mailboxRow of [firstMailboxRow, secondMailboxRow]) {
      expect(mailboxRow).toHaveTextContent('Domain dependency Pending');
      expect(mailboxRow).toHaveTextContent('Payment Completed');
      expect(mailboxRow).toHaveTextContent('Pooled subscription Completed');
      expect(mailboxRow).toHaveTextContent('Resource Blocked');
    }
    expect(
      canvas.getByText(
        'The pooled mailbox subscription is complete. Mailbox resources remain blocked until the domain dependency is complete.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.queryByText(
        'The pooled mailbox subscription remains blocked until every mailbox payment is complete.',
        { exact: true },
      ),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByLabelText('Recorded local charge count'),
    ).toHaveTextContent('3');
    expect(
      canvas.getByRole('button', {
        name: 'Complete locally — $24.29',
      }),
    ).toBeDisabled();
    expect(
      canvas.getByRole('button', { name: 'Resolve resource result' }),
    ).toBeEnabled();
    expect(
      canvas.queryByRole('button', { name: 'Retry same operation' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Reconcile resource result' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Resolve resource result' }),
    );

    expect(
      await canvas.findByRole('heading', {
        name: 'Prewarmed mailboxes acquired',
      }),
    ).toBeVisible();
    expect(
      canvas.getByText('Source: Prewarmed mailbox bundle', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8PrewarmedBundle.domain}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getAllByText(purchaseReference, { exact: true }),
    ).toHaveLength(1);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Acquisition operation status',
      }),
    ).toBe('Succeeded');
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      initialIdentity,
    );
    expect(
      canvas.getByLabelText('Recorded local charge count'),
    ).toHaveTextContent('3');
    const completedResources = canvas.getByRole('list', {
      name: 'Completed local resources',
    });
    expect(within(completedResources).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(completedResources).getByText(task8PrewarmedBundle.domain, {
        exact: true,
      }),
    ).toBeVisible();
    for (const mailbox of [firstMailbox, secondMailbox]) {
      expect(
        within(completedResources).getByText(mailbox.address, {
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(
      canvas.queryByRole('heading', {
        name: 'Resource is being processed',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('heading', {
        name: 'Prewarmed fulfillment needs attention',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: 'Resolve resource result' }),
    ).not.toBeInTheDocument();
  },
};

export const PartialPrewarmedFulfillment: Story = {
  name: 'Partial Prewarmed Fulfillment',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: task8PrewarmedReviewDraft,
    initialReviewQuote: task8PartialPrewarmedQuote,
    initialAcquisitionOperation: task8PartialPrewarmedOperation,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const partialOperationId = 'acquisition-task8-prewarmed-partial-001';
    const [firstMailbox, secondMailbox, extraMailbox] =
      task8PrewarmedBundle.mailboxIdentities;

    if (!firstMailbox || !secondMailbox || extraMailbox !== undefined) {
      throw new Error('Expected exactly two task fixture prewarmed mailboxes.');
    }

    const domainSubscriptionId = `subscription-${partialOperationId}-domain`;
    const mailboxSubscriptionId = 'subscription-managed-mailbox';
    const partialPrewarmedAnnualDomainIdentity =
      task8PartialPrewarmedQuote.lines.find(
        (line) => line.cadence === 'annual',
      )?.resourceLabel;
    const partialPrewarmedMonthlyMailboxIdentities =
      task8PartialPrewarmedQuote.lines
        .filter((line) => line.cadence === 'monthly')
        .map((line) => line.resourceLabel);
    const annualDates = getTask8QuoteCadenceDates({
      quote: task8PartialPrewarmedQuote,
      cadence: 'annual',
    });
    const monthlyDates = getTask8QuoteCadenceDates({
      quote: task8PartialPrewarmedQuote,
      cadence: 'monthly',
    });

    if (
      partialPrewarmedAnnualDomainIdentity === undefined ||
      partialPrewarmedMonthlyMailboxIdentities.length === 0
    ) {
      throw new Error(
        'Expected Task 8 prewarmed quote identities for each renewal cadence.',
      );
    }

    await expectTask8ReviewCharges({
      canvasElement,
      rows: [
        {
          service: 'Prewarmed bundle domain',
          resource: task8PrewarmedBundle.domain,
          cadence: 'Annual',
          unitPrice: '$14.29',
          quantity: '1',
          amount: '$14.29',
        },
        ...task8PrewarmedBundle.mailboxIdentities.map(
          ({ identity, address }) => ({
            service: 'Prewarmed managed mailbox',
            resource: `${identity} <${address}>`,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '1',
            amount: '$5.00',
          }),
        ),
      ],
      dueToday: '$24.29',
      annualRenewal: {
        amount: '$14.29',
        date: annualDates.renewsAt.slice(0, 10),
        effectiveDate: annualDates.startsAt,
      },
      monthlyRenewal: {
        amount: '$10.00',
        date: monthlyDates.renewsAt.slice(0, 10),
        effectiveDate: monthlyDates.startsAt,
      },
    });
    expect(
      canvas.getByText(
        `Included annual domain: ${partialPrewarmedAnnualDomainIdentity}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        `Included monthly mailboxes: ${partialPrewarmedMonthlyMailboxIdentities.join(', ')}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Bundled readiness applies at delivery to the included prewarmed resources; it is not ongoing warmup capacity.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      await canvas.findByRole('heading', {
        name: 'Prewarmed fulfillment needs attention',
      }),
    ).toBeVisible();
    const partialIdentity = expectTask8AcquisitionIdentityProjection({
      canvasElement,
      operation: task8PartialPrewarmedOperation,
    });
    expect(
      canvas.getByText(
        'Purchase reference: acquisition-task8-prewarmed-partial-001',
      ),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Prewarmed inventory count',
      }),
    ).toBe(String(mixedWorkspace.prewarmedBundles.length));

    const fulfillment = canvas.getByRole('table', {
      name: 'Prewarmed fulfillment progress',
    });
    const domainRow = within(fulfillment).getByRole('row', {
      name: new RegExp(`^${task8PrewarmedBundle.domain}\\s`),
    });
    expect(domainRow).toHaveTextContent('Payment Completed');
    expect(domainRow).toHaveTextContent('Subscription Completed');
    expect(domainRow).toHaveTextContent('Resource Completed');
    expect(domainRow).toHaveTextContent('No dependency');

    const firstMailboxRow = within(fulfillment).getByRole('row', {
      name: new RegExp(firstMailbox.address),
    });
    expect(firstMailboxRow).toHaveTextContent('Domain dependency Completed');
    expect(firstMailboxRow).toHaveTextContent('Payment Completed');
    expect(firstMailboxRow).toHaveTextContent('Pooled subscription Blocked');
    expect(firstMailboxRow).toHaveTextContent('Resource Blocked');
    const secondMailboxRow = within(fulfillment).getByRole('row', {
      name: new RegExp(secondMailbox.address),
    });
    expect(secondMailboxRow).toHaveTextContent('Domain dependency Completed');
    expect(secondMailboxRow).toHaveTextContent('Payment Failed');
    expect(secondMailboxRow).toHaveTextContent('Pooled subscription Blocked');
    expect(secondMailboxRow).toHaveTextContent('Resource Blocked');
    expect(
      canvas.getByText(
        'The local payment evidence was declined. Your selection is still available and the affected resource was not created.',
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'The pooled mailbox subscription remains blocked until every mailbox payment is complete.',
      ),
    ).toBeVisible();
    expect(
      canvas.queryByText(
        'The pooled mailbox subscription is complete. Mailbox resources remain blocked until the domain dependency is complete.',
        { exact: true },
      ),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByLabelText('Recorded local charge count'),
    ).toHaveTextContent('2');
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Prewarmed inventory count',
      }),
    ).toBe(String(mixedWorkspace.prewarmedBundles.length));

    await userEvent.click(
      canvas.getByRole('button', { name: 'Retry same operation' }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Prewarmed mailboxes acquired',
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Purchase reference: acquisition-task8-prewarmed-partial-001',
      ),
    ).toBeVisible();
    const completedResources = canvas.getByRole('list', {
      name: 'Completed local resources',
    });
    expect(within(completedResources).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(completedResources).getByText(task8PrewarmedBundle.domain, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      within(completedResources).getByText(firstMailbox.address, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      within(completedResources).getByText(secondMailbox.address, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByLabelText('Recorded local charge count'),
    ).toHaveTextContent('3');
    expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
      partialIdentity,
    );
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Prewarmed inventory count',
      }),
    ).toBe(String(mixedWorkspace.prewarmedBundles.length - 1));

    expect(
      canvas.queryByRole('button', { name: 'Retry same operation' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Manage prewarmed mailboxes' }),
    );
    const subscriptionPanel = await openManagedEmailSubscriptionPanel({
      canvasElement,
      actionName: 'Manage subscriptions',
    });
    await pressFocusedButton(
      within(subscriptionPanel).getByRole('button', {
        name: 'View managed-email subscription inventory',
      }),
    );
    const inventory = within(subscriptionPanel).getByRole('list', {
      name: 'Managed-email subscription inventory',
    });
    const inventoryEntries = within(inventory).getAllByRole('listitem');
    expect(inventoryEntries).toHaveLength(
      mixedWorkspace.subscriptions.length + 1,
    );
    const domainInventoryEntry = inventoryEntries.find((entry) =>
      (entry.textContent ?? '').includes(domainSubscriptionId),
    );
    const mailboxInventoryEntry = inventoryEntries.find((entry) =>
      (entry.textContent ?? '').includes(mailboxSubscriptionId),
    );

    if (
      domainInventoryEntry === undefined ||
      mailboxInventoryEntry === undefined
    ) {
      throw new Error(
        'Expected the acquired domain and current pooled mailbox subscriptions.',
      );
    }

    expect(domainInventoryEntry).toHaveTextContent('Managed domain');
    expect(mailboxInventoryEntry).toHaveTextContent('Managed mailbox');
    expect(domainInventoryEntry).not.toBe(mailboxInventoryEntry);

    await userEvent.click(
      within(subscriptionPanel).getByRole('button', {
        name: `Manage subscription ${domainSubscriptionId}`,
      }),
    );
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription quantity for ${domainSubscriptionId}`,
      ),
    ).toHaveTextContent('1');
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription cadence for ${domainSubscriptionId}`,
      ),
    ).toHaveTextContent('Annual');
    const domainResourceSnapshots = within(subscriptionPanel).getByLabelText(
      `Subscription resource snapshots for ${domainSubscriptionId}`,
    );
    expect(domainResourceSnapshots).toBeVisible();
    expect(domainResourceSnapshots.textContent?.trim()).toBe(
      task8PrewarmedBundle.domain,
    );
    await userEvent.click(
      within(subscriptionPanel).getByRole('button', {
        name: `Manage subscription ${mailboxSubscriptionId}`,
      }),
    );
    const initialMailboxPool = mixedWorkspace.subscriptions.find(
      (subscription) => subscription.id === mailboxSubscriptionId,
    );
    if (initialMailboxPool === undefined) {
      throw new Error('Expected the current pooled mailbox subscription.');
    }
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription quantity for ${mailboxSubscriptionId}`,
      ),
    ).toHaveTextContent(String(initialMailboxPool.quantity + 2));
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription cadence for ${mailboxSubscriptionId}`,
      ),
    ).toHaveTextContent('Monthly');
    const pooledMailboxResources = within(subscriptionPanel).getByLabelText(
      `Subscription resource snapshots for ${mailboxSubscriptionId}`,
    );
    expect(pooledMailboxResources).toBeVisible();
    expect(pooledMailboxResources.textContent?.trim()).toBe(
      [
        ...initialMailboxPool.linkedResources.map(({ label }) => label),
        `${firstMailbox.identity} <${firstMailbox.address}>`,
        `${secondMailbox.identity} <${secondMailbox.address}>`,
      ].join(''),
    );
  },
};

export const AcquireMailboxPoolWithoutCurrentCapacity: Story = (() => {
  const targetSubscriptionId = 'subscription-task8-mailbox-first-pool-001';
  const reviewDraft = {
    ...createManagedMailboxReview({
      address: task8PoolSelectedMailbox.address,
      domain: task8PoolSelectedMailbox.domain,
    }),
    completion: {
      type: 'add-managed-mailbox' as const,
      mailbox: task8PoolSelectedMailbox,
    },
  } satisfies ManagedEmailDesignReviewDraft;
  const resolution = acceptTask8CapacityResolution(
    requireTask8CapacityResolution(
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [],
        mailboxes: [],
        selectedMailboxes: [task8PoolSelectedMailbox],
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
      }),
    ),
  );
  const expectedPoolSignature = `${targetSubscriptionId}:active:1:${task8PoolSelectedMailbox.id}`;

  return {
    name: 'Acquire Mailbox Pool Without Current Capacity',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: {
        domains: [
          {
            id: 'domain-task8-mailbox-first-pool-verified',
            name: task8PoolSelectedMailbox.domain,
            source: 'external',
            verification: 'verified',
            subscriptionId: null,
          },
        ],
        mailboxes: [],
        prewarmedBundles: [],
        subscriptions: [],
      },
      initialReviewDraft: reviewDraft,
      initialReviewQuote: resolution.quote,
      initialAcquisitionResolution: resolution,
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await expectTask8ReviewCharges({
        canvasElement,
        rows: [
          {
            service: 'Managed mailbox',
            resource: `${task8PoolSelectedMailbox.identity} <${task8PoolSelectedMailbox.address}>`,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '1',
            amount: '$5.00',
          },
        ],
        dueToday: '$5.00',
        monthlyRenewal: {
          amount: '$5.00',
          date: '2027-02-10',
        },
      });

      await userEvent.click(
        canvas.getByRole('button', { name: 'Complete locally — $5.00' }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Managed mailbox capacity applied',
        }),
      ).toBeVisible();
      expectTask8MailboxPoolIdentityProjection({
        canvasElement,
        quoteId: resolution.quote.id,
        quoteLineIds: resolution.quote.lines.map((line) => line.id),
        targetSubscriptionId,
        resourceSnapshotIds: resolution.intent.resourceSnapshotIds,
      });
      const poolResources = canvas.getByRole('list', {
        name: 'Managed mailbox pool resources',
      });
      expect(within(poolResources).getAllByRole('listitem')).toHaveLength(1);
      expect(
        within(poolResources).getByText(task8PoolSelectedMailbox.address, {
          exact: true,
        }),
      ).toBeVisible();
      expect(readMailboxResourceCount(canvasElement)).toBe(1);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedPoolSignature,
      );
      expect(
        canvas.queryByRole('button', { name: 'Complete locally — $5.00' }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const AttachMailboxToActivePoolWithSpareCapacity: Story = (() => {
  const reviewDraft = {
    ...createManagedMailboxReview({
      address: task8PoolSelectedMailbox.address,
      domain: task8PoolSelectedMailbox.domain,
    }),
    completion: {
      type: 'add-managed-mailbox' as const,
      mailbox: task8PoolSelectedMailbox,
    },
  } satisfies ManagedEmailDesignReviewDraft;
  const expectedPoolSignature = `${task8ActiveMailboxPool.id}:active:2:${task8PoolExistingMailbox.id},${task8PoolSelectedMailbox.id}`;

  return {
    name: 'Attach Mailbox To Active Pool With Spare Capacity',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: {
        ...task8MailboxPoolWorkspace,
        domains: [
          {
            id: 'domain-task8-mailbox-spare-pool-verified',
            name: task8PoolSelectedMailbox.domain,
            source: 'external',
            verification: 'verified',
            subscriptionId: null,
          },
        ],
      },
      initialReviewDraft: reviewDraft,
      initialReviewQuote: task8AcceptedCoveredMailboxResolution.quote,
      initialAcquisitionResolution: task8AcceptedCoveredMailboxResolution,
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await expectTask8ReviewCharges({
        canvasElement,
        rows: [
          {
            service: 'Managed mailbox',
            resource: `${task8PoolSelectedMailbox.identity} <${task8PoolSelectedMailbox.address}>`,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '0',
            amount: '$0.00',
          },
        ],
        dueToday: '$0.00',
        monthlyRenewal: {
          amount: '$0.00',
          date: '2027-02-10',
        },
      });
      const reviewTable = canvas.getByRole('table', {
        name: 'Charges included in this purchase review',
      });
      const rowgroup = within(reviewTable).getByRole('rowgroup');
      const dataRows = within(rowgroup).getAllByRole('row');
      expect(dataRows).toHaveLength(1);
      expect(
        within(dataRows[0]!)
          .getAllByRole('cell')
          .map((cell) => cell.textContent?.trim()),
      ).toEqual([
        'Managed mailbox',
        `${task8PoolSelectedMailbox.identity} <${task8PoolSelectedMailbox.address}>`,
        'Monthly',
        '$5.00',
        '0',
        '$0.00',
      ]);
      expect(
        canvas.getByText(
          'Covered by existing capacity. This mailbox uses one paid spare pool slot and adds no local charge.',
        ),
      ).toBeVisible();

      await userEvent.click(
        canvas.getByRole('button', {
          name: 'Complete locally — $0.00',
        }),
      );
      const poolResources = await canvas.findByRole('list', {
        name: 'Managed mailbox pool resources',
      });
      expect(within(poolResources).getAllByRole('listitem')).toHaveLength(2);
      for (const address of [
        task8PoolExistingMailbox.address,
        task8PoolSelectedMailbox.address,
      ]) {
        expect(
          within(poolResources).getByText(address, { exact: true }),
        ).toBeVisible();
      }
      expect(readMailboxResourceCount(canvasElement)).toBe(2);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedPoolSignature,
      );
      expectTask8MailboxPoolIdentityProjection({
        canvasElement,
        quoteId: task8AcceptedCoveredMailboxResolution.quote.id,
        quoteLineIds: task8AcceptedCoveredMailboxResolution.quote.lines.map(
          (line) => line.id,
        ),
        targetSubscriptionId: task8ActiveMailboxPool.id,
        resourceSnapshotIds:
          task8AcceptedCoveredMailboxResolution.intent.resourceSnapshotIds,
      });
      expect(
        canvas.queryByRole('button', {
          name: 'Complete locally — $0.00',
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const IncrementActiveMailboxPoolForUncoveredMailbox: Story = (() => {
  const targetSubscriptionId = 'subscription-task8-mailbox-pool-increment-001';
  const existingMailbox = {
    ...task8PoolExistingMailbox,
    subscriptionId: targetSubscriptionId,
  };
  const activePool = createManagedEmailDesignRecurringSubscription({
    ...task8ActiveMailboxPool,
    id: targetSubscriptionId,
    quantity: 1,
  });
  const reviewDraft = {
    ...createManagedMailboxReview({
      address: task8PoolSelectedMailbox.address,
      domain: task8PoolSelectedMailbox.domain,
    }),
    completion: {
      type: 'add-managed-mailbox' as const,
      mailbox: task8PoolSelectedMailbox,
    },
  } satisfies ManagedEmailDesignReviewDraft;
  const resolution = acceptTask8CapacityResolution(
    requireTask8CapacityResolution(
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [activePool],
        mailboxes: [existingMailbox],
        selectedMailboxes: [task8PoolSelectedMailbox],
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
      }),
    ),
  );
  const expectedPoolSignature = `${targetSubscriptionId}:active:2:${task8PoolExistingMailbox.id},${task8PoolSelectedMailbox.id}`;

  return {
    name: 'Increment Active Mailbox Pool For Uncovered Mailbox',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: {
        domains: [
          {
            id: 'domain-task8-mailbox-increment-pool-verified',
            name: task8PoolSelectedMailbox.domain,
            source: 'external',
            verification: 'verified',
            subscriptionId: null,
          },
        ],
        mailboxes: [existingMailbox],
        prewarmedBundles: [],
        subscriptions: [activePool],
      },
      initialReviewDraft: reviewDraft,
      initialReviewQuote: resolution.quote,
      initialAcquisitionResolution: resolution,
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await expectTask8ReviewCharges({
        canvasElement,
        rows: [
          {
            service: 'Managed mailbox',
            resource: `${task8PoolSelectedMailbox.identity} <${task8PoolSelectedMailbox.address}>`,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '1',
            amount: '$5.00',
          },
        ],
        dueToday: '$5.00',
        monthlyRenewal: {
          amount: '$5.00',
          date: '2027-02-10',
        },
      });

      await userEvent.click(
        canvas.getByRole('button', { name: 'Complete locally — $5.00' }),
      );
      const poolResources = await canvas.findByRole('list', {
        name: 'Managed mailbox pool resources',
      });
      expect(within(poolResources).getAllByRole('listitem')).toHaveLength(2);
      expect(readMailboxResourceCount(canvasElement)).toBe(2);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedPoolSignature,
      );
      expectTask8MailboxPoolIdentityProjection({
        canvasElement,
        quoteId: resolution.quote.id,
        quoteLineIds: resolution.quote.lines.map((line) => line.id),
        targetSubscriptionId,
        resourceSnapshotIds: resolution.intent.resourceSnapshotIds,
      });
      expect(
        canvas.queryByRole('button', { name: 'Complete locally — $5.00' }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const CanceledMailboxPoolRecoveryRequiresVerifiedDomain: Story = (() => {
  const canceledPool = createManagedEmailDesignRecurringSubscription({
    ...task8ActiveMailboxPool,
    status: 'canceled',
    renewsAt: null,
    canceledAt: task8MonthlyRenewalAt,
  });

  return {
    name: 'Canceled Mailbox Pool Recovery Requires Verified Domain',
    args: withTask8StoryArgs({
      initialWorkspace: {
        domains: [],
        mailboxes: [task8PoolExistingMailbox],
        prewarmedBundles: [],
        subscriptions: [canceledPool],
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const panel = await openManagedEmailSubscriptionPanel({
        canvasElement,
        actionName: 'Manage subscriptions',
      });
      await userEvent.click(
        within(panel).getByRole('button', {
          name: `Manage subscription ${canceledPool.id}`,
        }),
      );
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Add another managed mailbox',
        }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Create a managed mailbox',
        }),
      ).toBeVisible();
      expect(
        canvas.getByText(
          'No eligible verified domain is available in this local fixture state. Add a domain before creating a managed mailbox.',
          { exact: true },
        ),
      ).toBeVisible();
      expect(canvas.getByRole('button', { name: 'Add domain' })).toBeEnabled();
      expect(
        canvas.queryByText('new-mailbox@amaranth-mail.com', { exact: true }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const CanceledMailboxPoolRecoveryPreservesSourceResolution: Story =
  (() => {
    const sourceSubscriptionId = 'subscription-task8-canceled-recovery-001';
    const firstMailbox = createManagedEmailDesignMailbox({
      ...task8PoolExistingMailbox,
      subscriptionId: sourceSubscriptionId,
    });
    const secondMailbox = createManagedEmailDesignMailbox({
      id: 'mailbox-task8-canceled-recovery-second',
      identity: 'Second retained mailbox',
      address: 'second@amaranth-mail.com',
      domain: task8ReviewDomainName,
      source: 'managed',
      subscriptionId: sourceSubscriptionId,
      readiness: 'ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    });
    const selectedMailbox = createManagedEmailDesignMailbox({
      id: 'mailbox-task8-canceled-recovery-selected',
      identity: 'New mailbox',
      address: 'new@amaranth-mail.com',
      domain: task8ReviewDomainName,
      source: 'managed',
      subscriptionId: sourceSubscriptionId,
      readiness: 'not-ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    });
    const canceledPool = createManagedEmailDesignRecurringSubscription({
      ...task8ActiveMailboxPool,
      id: sourceSubscriptionId,
      quantity: 2,
      status: 'canceled',
      renewsAt: null,
      canceledAt: task8FixtureNow,
      linkedResources: [
        {
          id: firstMailbox.id,
          kind: 'mailbox',
          label: `${firstMailbox.identity} <${firstMailbox.address}>`,
        },
        {
          id: secondMailbox.id,
          kind: 'mailbox',
          label: `${secondMailbox.identity} <${secondMailbox.address}>`,
        },
      ],
    });
    const resolution = acceptTask8CapacityResolution(
      requireTask8CapacityResolution(
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId: 'workspace-managed-email-design',
          subscriptions: [canceledPool],
          mailboxes: [firstMailbox, secondMailbox],
          selectedMailboxes: [selectedMailbox],
          sourceCanceledSubscriptionId: sourceSubscriptionId,
          targetSubscriptionId: sourceSubscriptionId,
          fixtureNow: task8FixtureNow,
        }),
      ),
    );
    const reviewDraft = {
      ...createManagedMailboxReview({
        address: selectedMailbox.address,
        domain: selectedMailbox.domain,
      }),
      completion: {
        type: 'add-managed-mailbox' as const,
        mailbox: selectedMailbox,
      },
    } satisfies ManagedEmailDesignReviewDraft;

    return {
      name: 'Canceled Mailbox Pool Recovery Preserves Source Resolution',
      args: withTask8StoryArgs({
        initialFlow: 'review',
        initialWorkspace: {
          domains: [
            {
              id: 'domain-task8-canceled-recovery-verified-001',
              name: task8ReviewDomainName,
              source: 'external',
              verification: 'verified',
              subscriptionId: null,
            },
          ],
          mailboxes: [firstMailbox, secondMailbox],
          prewarmedBundles: [],
          subscriptions: [canceledPool],
        },
        initialReviewDraft: reviewDraft,
        initialReviewQuote: resolution.quote,
        initialAcquisitionResolution: resolution,
        initialRecoveredMailboxSourceSubscriptionId: sourceSubscriptionId,
      }),
      play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForManagedEmailDesignReady(canvasElement);

        await userEvent.click(
          canvas.getByRole('button', { name: 'Complete locally — $15.00' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Managed mailbox capacity applied',
          }),
        ).toBeVisible();
        expect(readMailboxResourceCount(canvasElement)).toBe(3);
        expect(readMailboxPoolSignature(canvasElement)).toBe(
          `${sourceSubscriptionId}:active:3:${firstMailbox.id},${secondMailbox.id},${selectedMailbox.id}`,
        );
        const resources = canvas.getByRole('list', {
          name: 'Managed mailbox pool resources',
        });
        expect(within(resources).getAllByRole('listitem')).toHaveLength(3);
        for (const mailbox of [firstMailbox, secondMailbox, selectedMailbox]) {
          expect(
            within(resources).getByText(mailbox.address, { exact: true }),
          ).toBeVisible();
        }
        expect(
          readStoryOutput({
            canvasElement,
            label: 'Target subscription IDs',
          }),
        ).toBe(sourceSubscriptionId);
      },
    };
  })();

export const RecoverExplicitlySelectedCanceledMailboxPool: Story = (() => {
  const canceledSubscriptionAId =
    'subscription-task8-mailbox-canceled-source-a';
  const canceledSubscriptionBId =
    'subscription-task8-mailbox-canceled-source-b';
  const activeSubscriptionCId = 'subscription-task8-mailbox-active-source-c';
  const mailboxA = createManagedEmailDesignMailbox({
    id: 'mailbox-task8-canceled-source-a',
    identity: 'Canceled Source A',
    address: 'source-a@shared-mail.com',
    domain: 'shared-mail.com',
    source: 'managed',
    subscriptionId: canceledSubscriptionAId,
    readiness: 'ready',
    warmupState: {
      assignment: 'unassigned',
      lastConfirmedProviderState: 'inactive',
      operation: { status: 'idle' },
    },
  });
  const mailboxB = createManagedEmailDesignMailbox({
    id: 'mailbox-task8-canceled-source-b',
    identity: 'Canceled Source B',
    address: 'source-b@shared-mail.com',
    domain: 'shared-mail.com',
    source: 'managed',
    subscriptionId: canceledSubscriptionBId,
    readiness: 'ready',
    warmupState: {
      assignment: 'unassigned',
      lastConfirmedProviderState: 'inactive',
      operation: { status: 'idle' },
    },
  });
  const mailboxC = createManagedEmailDesignMailbox({
    id: 'mailbox-recovered-shared-mail.com',
    identity: 'New mailbox',
    address: 'new-mailbox@shared-mail.com',
    domain: 'shared-mail.com',
    source: 'managed',
    subscriptionId: activeSubscriptionCId,
    readiness: 'ready',
    warmupState: {
      assignment: 'unassigned',
      lastConfirmedProviderState: 'inactive',
      operation: { status: 'idle' },
    },
  });
  const canceledSubscriptionA = createManagedEmailDesignRecurringSubscription({
    id: canceledSubscriptionAId,
    workspaceId: 'workspace-managed-email-design',
    product: 'managed-mailbox',
    cadence: 'monthly',
    quantity: 1,
    linkedResources: [
      {
        id: mailboxA.id,
        kind: 'mailbox',
        label: `${mailboxA.identity} <${mailboxA.address}>`,
      },
    ],
    unitPriceCents: 500,
    status: 'canceled',
    renewsAt: null,
    canceledAt: task8MonthlyRenewalAt,
  });
  const canceledSubscriptionB = createManagedEmailDesignRecurringSubscription({
    id: canceledSubscriptionBId,
    workspaceId: 'workspace-managed-email-design',
    product: 'managed-mailbox',
    cadence: 'monthly',
    quantity: 1,
    linkedResources: [
      {
        id: mailboxB.id,
        kind: 'mailbox',
        label: `${mailboxB.identity} <${mailboxB.address}>`,
      },
    ],
    unitPriceCents: 500,
    status: 'canceled',
    renewsAt: null,
    canceledAt: task8MonthlyRenewalAt,
  });
  const activeSubscriptionC = createManagedEmailDesignRecurringSubscription({
    id: activeSubscriptionCId,
    workspaceId: 'workspace-managed-email-design',
    product: 'managed-mailbox',
    cadence: 'monthly',
    quantity: 1,
    linkedResources: [
      {
        id: mailboxC.id,
        kind: 'mailbox',
        label: `${mailboxC.identity} <${mailboxC.address}>`,
      },
    ],
    unitPriceCents: 500,
    status: 'active',
    renewsAt: task8MonthlyRenewalAt,
  });

  return {
    name: 'Recover Explicitly Selected Canceled Mailbox Pool',
    args: withTask8StoryArgs({
      initialFlow: 'dashboard',
      initialWorkspace: {
        domains: [
          {
            id: 'domain-task8-explicit-recovery-verified-001',
            name: mailboxB.domain,
            source: 'external',
            verification: 'verified',
            subscriptionId: null,
          },
        ],
        mailboxes: [mailboxA, mailboxB, mailboxC],
        prewarmedBundles: [],
        subscriptions: [
          canceledSubscriptionA,
          canceledSubscriptionB,
          activeSubscriptionC,
        ],
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await waitForManagedEmailDesignReady(canvasElement);

      await openMailboxActions({
        canvasElement,
        address: mailboxB.address,
      });
      await pressFocusedButton(
        await within(canvasElement.ownerDocument.body).findByRole('button', {
          name: 'Manage mailbox capacity',
        }),
      );
      const sourcePanel = await within(
        canvasElement.ownerDocument.body,
      ).findByRole('region', {
        name: 'Managed-email subscriptions',
      });
      await pressFocusedButton(
        within(sourcePanel).getByRole('button', {
          name: 'View managed-email subscription inventory',
        }),
      );
      await pressFocusedButton(
        within(sourcePanel).getByRole('button', {
          name: `Manage subscription ${canceledSubscriptionBId}`,
        }),
      );
      expect(
        within(sourcePanel).getByLabelText(
          'Selected managed-email subscription',
        ),
      ).toHaveTextContent(canceledSubscriptionBId);
      await pressFocusedButton(
        within(sourcePanel).getByRole('button', {
          name: 'Add another managed mailbox',
        }),
      );
      const localPart = await canvas.findByRole('textbox', {
        name: 'Mailbox local part',
      });
      await userEvent.clear(localPart);
      await userEvent.type(localPart, 'new-mailbox-2');
      await userEvent.click(
        canvas.getByRole('button', { name: 'Review mailbox' }),
      );
      await userEvent.click(
        canvas.getByRole('button', {
          name: 'Review recovered mailbox capacity',
        }),
      );
      await expectTask8ReviewCharges({
        canvasElement,
        rows: [
          {
            service: 'Managed mailbox',
            resource: `${mailboxB.identity} <${mailboxB.address}>, new-mailbox-2 <new-mailbox-2@${mailboxB.domain}>`,
            cadence: 'Monthly',
            unitPrice: '$5.00',
            quantity: '2',
            amount: '$10.00',
          },
        ],
        dueToday: '$10.00',
        monthlyRenewal: {
          amount: '$10.00',
          date: '2027-02-10',
        },
      });
      expect(
        canvas.queryByText(mailboxA.address, { exact: false }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        canvas.getByRole('button', {
          name: 'Accept recovered quote — $10.00',
        }),
      );
      const complete = canvas.getByRole('button', {
        name: 'Complete locally — $10.00',
      });
      await waitFor(() => expect(complete).toHaveFocus());
      expect(canvasElement.ownerDocument.body).not.toHaveFocus();
      await userEvent.click(complete);
      expect(
        await canvas.findByRole('heading', {
          name: 'Managed mailbox capacity applied',
        }),
      ).toBeVisible();
      await clickStoryButton({
        canvasElement,
        name: 'Return to dashboard',
      });
      await waitForManagedEmailDesignReady(canvasElement);

      expect(
        readStoryOutput({
          canvasElement,
          label: 'Managed mailbox ownership signature',
        }),
      ).toContain(`${mailboxB.id}:${activeSubscriptionCId}`);
      expect(readMailboxPoolSignature(canvasElement)).toContain(
        `${activeSubscriptionCId}:active:3:${mailboxC.id},${mailboxB.id}`,
      );
    },
  };
})();

export const BlockMailboxPoolAcquisitionOnPendingChange: Story = (() => {
  if (
    task8ActiveMailboxPool.product !== 'managed-mailbox' ||
    task8ActiveMailboxPool.status !== 'active'
  ) {
    throw new Error('Expected an active managed-mailbox pool fixture.');
  }

  const pendingPool = createManagedEmailDesignRecurringSubscription({
    ...task8ActiveMailboxPool,
    status: 'pending-change',
    pendingQuantity: 1,
    changeEffectiveAt: task8MonthlyRenewalAt,
  });
  const reviewDraft = {
    ...createManagedMailboxReview({
      address: task8PoolSelectedMailbox.address,
      domain: task8PoolSelectedMailbox.domain,
    }),
    completion: {
      type: 'add-managed-mailbox' as const,
      mailbox: task8PoolSelectedMailbox,
    },
  } satisfies ManagedEmailDesignReviewDraft;
  const quote = createTask8Quote({
    id: 'quote-task8-mailbox-pending-change-001',
    accepted: true,
    lines: [
      createTask8MailboxQuoteLine({
        id: 'quote-line-task8-mailbox-pending-change-001',
        resourceLabel: `${task8PoolSelectedMailbox.identity} <${task8PoolSelectedMailbox.address}>`,
      }),
    ],
  });
  const expectedPoolSignature = `${pendingPool.id}:pending-change:2:${task8PoolExistingMailbox.id}`;
  const expectedResolvedPoolSignature = `${pendingPool.id}:active:1:${task8PoolExistingMailbox.id}`;

  return {
    name: 'Block Mailbox Pool Acquisition On Pending Change',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: {
        domains: [],
        mailboxes: [task8PoolExistingMailbox],
        prewarmedBundles: [],
        subscriptions: [pendingPool],
      },
      initialReviewDraft: reviewDraft,
      initialReviewQuote: quote,
      initialAcquisitionResolution: {
        status: 'blocked',
        reason: 'subscription-change-pending',
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      expect(
        await canvas.findByRole('button', {
          name: 'Complete locally — $5.00',
        }),
      ).toBeDisabled();
      expect(readMailboxResourceCount(canvasElement)).toBe(1);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedPoolSignature,
      );

      await userEvent.click(
        canvas.getByRole('button', { name: 'Cancel review' }),
      );
      await canvas.findByRole('heading', {
        name: 'Managed email resources',
      });
      await openMailboxActions({
        canvasElement,
        address: task8PoolExistingMailbox.address,
      });
      await userEvent.click(
        within(canvasElement.ownerDocument.body).getByRole('button', {
          name: 'Manage mailbox capacity',
        }),
      );
      const panel = await within(canvasElement.ownerDocument.body).findByRole(
        'region',
        {
          name: 'Managed-email subscriptions',
        },
      );
      expect(
        within(panel).getByLabelText(
          `Subscription status for ${pendingPool.id}`,
        ),
      ).toHaveTextContent('Pending quantity reduction');
      expect(
        within(panel).getByLabelText(
          `Effective subscription quantity for ${pendingPool.id}`,
        ),
      ).toHaveTextContent('1');
      expect(
        within(panel).getByRole('button', {
          name: 'Apply managed mailbox quantity change effective Feb 10, 2027',
        }),
      ).toBeEnabled();
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Apply managed mailbox quantity change effective Feb 10, 2027',
        }),
      );
      expect(
        within(panel).getByLabelText(
          `Subscription status for ${pendingPool.id}`,
        ),
      ).toHaveTextContent('Active');
      expect(
        readStoryOutput({
          canvasElement,
          label: `Subscription quantity for ${pendingPool.id}`,
        }),
      ).toBe('1');
      expect(
        within(panel).queryByRole('button', {
          name: 'Apply managed mailbox quantity change effective Feb 10, 2027',
        }),
      ).not.toBeInTheDocument();
      expect(readMailboxResourceCount(canvasElement)).toBe(1);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedResolvedPoolSignature,
      );
      expect(
        within(panel).queryByRole('button', {
          name: 'Add another managed mailbox',
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const BlockMailboxPoolAcquisitionOnPendingCancellation: Story = (() => {
  if (
    task8ActiveMailboxPool.product !== 'managed-mailbox' ||
    task8ActiveMailboxPool.status !== 'active'
  ) {
    throw new Error('Expected an active managed-mailbox pool fixture.');
  }

  const pendingPool = createManagedEmailDesignRecurringSubscription({
    ...task8ActiveMailboxPool,
    status: 'pending-cancel',
    cancelAt: task8MonthlyRenewalAt,
  });
  const reviewDraft = {
    ...createManagedMailboxReview({
      address: task8PoolSelectedMailbox.address,
      domain: task8PoolSelectedMailbox.domain,
    }),
    completion: {
      type: 'add-managed-mailbox' as const,
      mailbox: task8PoolSelectedMailbox,
    },
  } satisfies ManagedEmailDesignReviewDraft;
  const quote = createTask8Quote({
    id: 'quote-task8-mailbox-pending-cancel-001',
    accepted: true,
    lines: [
      createTask8MailboxQuoteLine({
        id: 'quote-line-task8-mailbox-pending-cancel-001',
        resourceLabel: `${task8PoolSelectedMailbox.identity} <${task8PoolSelectedMailbox.address}>`,
      }),
    ],
  });
  const expectedPoolSignature = `${pendingPool.id}:pending-cancel:2:${task8PoolExistingMailbox.id}`;
  const expectedResolvedPoolSignature = `${pendingPool.id}:active:2:${task8PoolExistingMailbox.id}`;

  return {
    name: 'Block Mailbox Pool Acquisition On Pending Cancellation',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: {
        domains: [],
        mailboxes: [task8PoolExistingMailbox],
        prewarmedBundles: [],
        subscriptions: [pendingPool],
      },
      initialReviewDraft: reviewDraft,
      initialReviewQuote: quote,
      initialAcquisitionResolution: {
        status: 'blocked',
        reason: 'subscription-cancel-pending',
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      expect(
        await canvas.findByRole('button', {
          name: 'Complete locally — $5.00',
        }),
      ).toBeDisabled();
      expect(readMailboxResourceCount(canvasElement)).toBe(1);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedPoolSignature,
      );

      await userEvent.click(
        canvas.getByRole('button', { name: 'Cancel review' }),
      );
      await canvas.findByRole('heading', {
        name: 'Managed email resources',
      });
      await openMailboxActions({
        canvasElement,
        address: task8PoolExistingMailbox.address,
      });
      await userEvent.click(
        within(canvasElement.ownerDocument.body).getByRole('button', {
          name: 'Manage mailbox capacity',
        }),
      );
      const panel = await within(canvasElement.ownerDocument.body).findByRole(
        'region',
        {
          name: 'Managed-email subscriptions',
        },
      );
      expect(
        within(panel).getByLabelText(
          `Subscription status for ${pendingPool.id}`,
        ),
      ).toHaveTextContent('Pending cancellation');
      expect(
        within(panel).getByLabelText(
          `Subscription cancellation effective at for ${pendingPool.id}`,
        ),
      ).toHaveTextContent('Feb 10, 2027');
      expect(
        within(panel).getByRole('button', {
          name: 'Undo managed mailbox cancellation',
        }),
      ).toBeEnabled();
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Undo managed mailbox cancellation',
        }),
      );
      expect(
        within(panel).getByLabelText(
          `Subscription status for ${pendingPool.id}`,
        ),
      ).toHaveTextContent('Active');
      expect(
        readStoryOutput({
          canvasElement,
          label: `Subscription quantity for ${pendingPool.id}`,
        }),
      ).toBe('2');
      expect(
        within(panel).queryByRole('button', {
          name: 'Undo managed mailbox cancellation',
        }),
      ).not.toBeInTheDocument();
      expect(readMailboxResourceCount(canvasElement)).toBe(1);
      expect(readMailboxPoolSignature(canvasElement)).toBe(
        expectedResolvedPoolSignature,
      );
      expect(
        within(panel).queryByRole('button', {
          name: 'Add another managed mailbox',
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const AcquireFirstAdditionalRecoveredWarmupCapacity: Story = (() => {
  const firstCapacity = createTask8SucceededWarmupCapacityFixture({
    mailboxes: task8WarmupWorkspace.mailboxes,
    subscriptions: task8WarmupWorkspace.subscriptions,
    requestedQuantity: 1,
    targetSubscriptionId: 'subscription-managed-warmup',
  });

  return {
    name: 'Acquire First / Additional / Recovered Warmup Capacity',
    args: withTask8StoryArgs({
      initialWorkspace: task8WarmupWorkspace,
    }),
    play: async ({ canvasElement }) => {
      await waitForManagedEmailDesignReady(canvasElement);

      const address = task8WarmupTargetMailbox.address;
      const stateBefore = {
        assignment: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'assignment',
        }),
        providerState: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'provider-state',
        }),
        operation: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'operation',
        }),
        readiness: readWarmupRowOutput({
          canvasElement,
          address,
          label: `Warmup readiness for ${address}`,
        }),
      };
      const panel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      );
      const review = await within(canvasElement.ownerDocument.body).findByRole(
        'dialog',
        {
          name: 'Review warmup capacity purchase',
        },
      );
      expect(
        within(review).getByLabelText('Warmup subscription intent'),
      ).toHaveTextContent('Create · 1 slot');
      expectWarmupCapacityQuote({
        review,
        lineAmount: '$2.99',
      });

      await userEvent.click(
        within(review).getByRole('button', {
          name: 'Accept warmup capacity quote',
        }),
      );
      await expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard({
        canvasElement,
        operation: firstCapacity.operation,
      });
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Warmup capacity subscription ID',
        }),
      ).toBe(firstCapacity.resolution.intent.targetSubscriptionId);
      await expectWarmupCapacity({
        canvasElement,
        expected: '0 of 1 assigned · 1 slot available',
      });
      await expectWarmupState({
        canvasElement,
        address,
        assignment: stateBefore.assignment,
        providerState: stateBefore.providerState,
        operation: stateBefore.operation,
      });
      expect(
        readWarmupRowOutput({
          canvasElement,
          address,
          label: `Warmup readiness for ${address}`,
        }),
      ).toBe(stateBefore.readiness);
      expect(
        within(getMailboxRow({ canvasElement, address })).getByRole('button', {
          name: `Start warmup for ${address}`,
        }),
      ).toBeEnabled();
      const resultPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expectTask8WarmupSubscriptionResourceLinks({
        panel: resultPanel,
        resolution: firstCapacity.resolution,
      });
    },
  };
})();

export const IncrementExhaustedWarmupCapacityOnce: Story = (() => {
  const address = task8WarmupTargetMailbox.address;
  const subscriptionId = 'subscription-task8-warmup-active-001';
  const targetMailbox = {
    ...task8WarmupTargetMailbox,
    warmupState: {
      assignment: 'assigned' as const,
      lastConfirmedProviderState: 'warming' as const,
      operation: { status: 'idle' as const },
    },
  };
  const activeSubscription = createManagedEmailDesignRecurringSubscription({
    id: subscriptionId,
    workspaceId: 'workspace-managed-email-design',
    linkedResources: [
      {
        id: 'warmup-capacity-task8-active-001',
        kind: 'warmup-capacity',
        label: 'Existing warmup slot',
      },
    ],
    unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
    product: 'managed-warmup',
    cadence: 'monthly',
    quantity: 1,
    status: 'active',
    renewsAt: task8MonthlyRenewalAt,
  });
  const workspace = createTask7Workspace({
    mailboxes: [targetMailbox],
    subscriptions: [activeSubscription],
  });
  const increment = createTask8SucceededWarmupCapacityFixture({
    mailboxes: [targetMailbox],
    subscriptions: workspace.subscriptions,
    requestedQuantity: 1,
    targetSubscriptionId: subscriptionId,
  });

  return {
    name: 'Increment Exhausted Warmup Capacity Once',
    args: withTask8StoryArgs({
      initialWorkspace: workspace,
    }),
    play: async ({ canvasElement }) => {
      await waitForManagedEmailDesignReady(canvasElement);

      const stateBefore = {
        assignment: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'assignment',
        }),
        providerState: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'provider-state',
        }),
        operation: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'operation',
        }),
        readiness: readWarmupRowOutput({
          canvasElement,
          address,
          label: `Warmup readiness for ${address}`,
        }),
      };
      await expectWarmupCapacity({
        canvasElement,
        expected: '1 of 1 assigned · 0 slots available',
      });
      const panel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expect(
        within(panel).getByText(
          'All 1 managed warmup subscription slot is assigned.',
        ),
      ).toBeVisible();
      const quantity = within(panel).getByRole('spinbutton', {
        name: 'Additional warmup slots',
      });
      await userEvent.clear(quantity);
      await userEvent.type(quantity, '1');
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      );
      const review = await within(canvasElement.ownerDocument.body).findByRole(
        'dialog',
        {
          name: 'Review warmup capacity purchase',
        },
      );
      expect(
        within(review).getByLabelText('Warmup subscription intent'),
      ).toHaveTextContent('Add to existing · 1 slot');
      expectWarmupCapacityQuote({
        review,
        lineAmount: '$2.99',
      });
      await userEvent.click(
        within(review).getByRole('button', {
          name: 'Accept warmup capacity quote',
        }),
      );
      await expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard({
        canvasElement,
        operation: increment.operation,
      });

      await expectWarmupCapacity({
        canvasElement,
        expected: '1 of 2 assigned · 1 slot available',
      });
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Warmup capacity subscription ID',
        }),
      ).toBe(subscriptionId);
      await expectWarmupState({
        canvasElement,
        address,
        assignment: stateBefore.assignment,
        providerState: stateBefore.providerState,
        operation: stateBefore.operation,
      });
      expect(
        readWarmupRowOutput({
          canvasElement,
          address,
          label: `Warmup readiness for ${address}`,
        }),
      ).toBe(stateBefore.readiness);

      const resultPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expect(
        within(resultPanel).getByLabelText(
          `Subscription quantity for ${subscriptionId}`,
        ),
      ).toHaveTextContent('2');
      expectTask8WarmupSubscriptionResourceLinks({
        panel: resultPanel,
        resolution: increment.resolution,
      });
      expect(
        within(resultPanel).queryByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const RecoverCanceledWarmupCapacityWithRepricedQuote: Story = (() => {
  const recoveredSubscriptionId = 'subscription-managed-warmup';
  const historySubscriptionId = 'subscription-task8-warmup-history-001';
  const assignedMailboxes = [
    createTask7Mailbox({
      id: 'mailbox-task8-warmup-history-avery-001',
      identity: 'Avery Miles',
      address: 'avery@amaranth-mail.com',
      domain: task8ReviewDomainName,
      source: 'connected',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    }),
    createTask7Mailbox({
      id: 'mailbox-task8-warmup-history-jordan-001',
      identity: 'Jordan Lee',
      address: 'jordan@amaranth-mail.com',
      domain: task8ReviewDomainName,
      source: 'connected',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    }),
  ];
  const canceledSubscription = createManagedEmailDesignRecurringSubscription({
    id: historySubscriptionId,
    workspaceId: 'workspace-managed-email-design',
    linkedResources: [
      {
        id: 'warmup-capacity-task8-history-001',
        kind: 'warmup-capacity',
        label: 'Historical warmup slot 1',
      },
      {
        id: 'warmup-capacity-task8-history-002',
        kind: 'warmup-capacity',
        label: 'Historical warmup slot 2',
      },
    ],
    unitPriceCents: 499,
    product: 'managed-warmup',
    cadence: 'monthly',
    quantity: 2,
    status: 'canceled',
    renewsAt: null,
    canceledAt: task8FixtureNow,
  });
  const workspace = createTask7Workspace({
    mailboxes: assignedMailboxes,
    subscriptions: [canceledSubscription],
  });
  const recovery = createTask8SucceededWarmupCapacityFixture({
    mailboxes: assignedMailboxes,
    subscriptions: workspace.subscriptions,
    requestedQuantity: 1,
    targetSubscriptionId: recoveredSubscriptionId,
  });

  return {
    name: 'Recover Canceled Warmup Capacity With Repriced Quote',
    args: withTask8StoryArgs({
      initialWorkspace: workspace,
    }),
    play: async ({ canvasElement }) => {
      await waitForManagedEmailDesignReady(canvasElement);

      const stateBefore = assignedMailboxes.map((mailbox) => ({
        address: mailbox.address,
        assignment: readWarmupStateOutput({
          canvasElement,
          address: mailbox.address,
          output: 'assignment',
        }),
        providerState: readWarmupStateOutput({
          canvasElement,
          address: mailbox.address,
          output: 'provider-state',
        }),
        operation: readWarmupStateOutput({
          canvasElement,
          address: mailbox.address,
          output: 'operation',
        }),
        readiness: readWarmupRowOutput({
          canvasElement,
          address: mailbox.address,
          label: `Warmup readiness for ${mailbox.address}`,
        }),
      }));
      const panel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expect(
        within(panel).getByLabelText(
          `Subscription status for ${historySubscriptionId}`,
        ),
      ).toHaveTextContent('Canceled');
      expect(
        within(panel).getByLabelText(
          `Subscription unit price for ${historySubscriptionId}`,
        ),
      ).toHaveTextContent('$4.99');
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Recover warmup capacity',
        }),
      );
      const review = await within(canvasElement.ownerDocument.body).findByRole(
        'dialog',
        {
          name: 'Review warmup capacity purchase',
        },
      );
      expect(
        within(review).getByLabelText('Warmup subscription intent'),
      ).toHaveTextContent('Create · 3 slots');
      expectWarmupCapacityQuote({
        review,
        lineAmount: '$8.97',
      });
      for (const mailbox of assignedMailboxes) {
        expect(
          within(review).getByText(`${mailbox.identity} <${mailbox.address}>`),
        ).toBeVisible();
      }
      await userEvent.click(
        within(review).getByRole('button', {
          name: 'Accept warmup capacity quote',
        }),
      );
      await expectTask8SucceededWarmupCapacityPurchaseAndReturnToDashboard({
        canvasElement,
        operation: recovery.operation,
      });

      await expectWarmupCapacity({
        canvasElement,
        expected: '2 of 3 assigned · 1 slot available',
      });
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Warmup capacity subscription ID',
        }),
      ).toBe(recoveredSubscriptionId);
      for (const state of stateBefore) {
        await expectWarmupState({
          canvasElement,
          address: state.address,
          assignment: state.assignment,
          providerState: state.providerState,
          operation: state.operation,
        });
        expect(
          readWarmupRowOutput({
            canvasElement,
            address: state.address,
            label: `Warmup readiness for ${state.address}`,
          }),
        ).toBe(state.readiness);
      }

      const resultPanel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expect(
        within(resultPanel).getByLabelText(
          `Subscription quantity for ${recoveredSubscriptionId}`,
        ),
      ).toHaveTextContent('3');
      expect(
        within(resultPanel).getByLabelText(
          `Subscription unit price for ${recoveredSubscriptionId}`,
        ),
      ).toHaveTextContent('$2.99');
      expectTask8WarmupSubscriptionResourceLinks({
        panel: resultPanel,
        resolution: recovery.resolution,
      });
      await userEvent.click(
        within(resultPanel).getByRole('button', {
          name: 'View managed-email subscription inventory',
        }),
      );
      const inventory = within(resultPanel).getByRole('list', {
        name: 'Managed-email subscription inventory',
      });
      expect(
        within(inventory).getByText(historySubscriptionId, { exact: true }),
      ).toBeVisible();
      expect(
        within(inventory).getByText(recoveredSubscriptionId, {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        within(resultPanel).queryByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const BlockWarmupCapacityAcquisitionOnPendingChange: Story = (() => {
  const address = task8WarmupTargetMailbox.address;
  const subscriptionId = 'subscription-task8-warmup-pending-change-001';
  const mailbox = {
    ...task8WarmupTargetMailbox,
    warmupState: {
      assignment: 'assigned' as const,
      lastConfirmedProviderState: 'warming' as const,
      operation: { status: 'idle' as const },
    },
  };
  const pendingSubscription = createManagedEmailDesignRecurringSubscription({
    id: subscriptionId,
    workspaceId: 'workspace-managed-email-design',
    linkedResources: [
      {
        id: 'warmup-capacity-task8-pending-change-001',
        kind: 'warmup-capacity',
        label: 'Pending-change warmup slot 1',
      },
      {
        id: 'warmup-capacity-task8-pending-change-002',
        kind: 'warmup-capacity',
        label: 'Pending-change warmup slot 2',
      },
    ],
    unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
    product: 'managed-warmup',
    cadence: 'monthly',
    quantity: 2,
    status: 'pending-change',
    pendingQuantity: 1,
    changeEffectiveAt: task8MonthlyRenewalAt,
    renewsAt: task8MonthlyRenewalAt,
  });

  return {
    name: 'Block Warmup Capacity Acquisition On Pending Change',
    args: withTask8StoryArgs({
      initialWorkspace: createTask7Workspace({
        mailboxes: [mailbox],
        subscriptions: [pendingSubscription],
      }),
    }),
    play: async ({ canvasElement }) => {
      await waitForManagedEmailDesignReady(canvasElement);

      const capacityBefore = readWarmupCapacityText(canvasElement);
      expect(capacityBefore).toBe(
        'Warmup capacity: 1 of 1 assigned · 0 slots available.',
      );
      const stateBefore = {
        assignment: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'assignment',
        }),
        providerState: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'provider-state',
        }),
        operation: readWarmupStateOutput({
          canvasElement,
          address,
          output: 'operation',
        }),
      };
      const panel = await openManagedEmailSubscriptionPanel({
        canvasElement,
      });
      expect(
        within(panel).getByLabelText(
          `Subscription status for ${subscriptionId}`,
        ),
      ).toHaveTextContent('Pending quantity reduction');
      expect(
        within(panel).getByRole('button', {
          name: 'Apply managed warmup quantity change effective Feb 10, 2027',
        }),
      ).toBeEnabled();
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Increase warmup capacity',
        }),
      );
      await userEvent.click(
        within(panel).getByRole('button', {
          name: 'Review warmup capacity purchase',
        }),
      );
      expect(within(panel).getByRole('alert')).toHaveTextContent(
        'Apply the pending subscription quantity change before adding capacity.',
      );
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog', {
          name: 'Review warmup capacity purchase',
        }),
      ).not.toBeInTheDocument();
      expect(readWarmupCapacityText(canvasElement)).toBe(capacityBefore);
      await expectWarmupState({
        canvasElement,
        address,
        assignment: stateBefore.assignment,
        providerState: stateBefore.providerState,
        operation: stateBefore.operation,
      });
    },
  };
})();

export const BlockWarmupCapacityAcquisitionOnPendingCancellation: Story =
  (() => {
    const address = task8WarmupTargetMailbox.address;
    const subscriptionId = 'subscription-task8-warmup-pending-cancel-001';
    const mailbox = {
      ...task8WarmupTargetMailbox,
      warmupState: {
        assignment: 'assigned' as const,
        lastConfirmedProviderState: 'warming' as const,
        operation: { status: 'idle' as const },
      },
    };
    const pendingSubscription = createManagedEmailDesignRecurringSubscription({
      id: subscriptionId,
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [
        {
          id: 'warmup-capacity-task8-pending-cancel-001',
          kind: 'warmup-capacity',
          label: 'Pending-cancel warmup slot',
        },
      ],
      unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
      product: 'managed-warmup',
      cadence: 'monthly',
      quantity: 1,
      status: 'pending-cancel',
      cancelAt: task8MonthlyRenewalAt,
      renewsAt: task8MonthlyRenewalAt,
    });

    return {
      name: 'Block Warmup Capacity Acquisition On Pending Cancellation',
      args: withTask8StoryArgs({
        initialWorkspace: createTask7Workspace({
          mailboxes: [mailbox],
          subscriptions: [pendingSubscription],
        }),
      }),
      play: async ({ canvasElement }) => {
        await waitForManagedEmailDesignReady(canvasElement);

        const capacityBefore = readWarmupCapacityText(canvasElement);
        const stateBefore = {
          assignment: readWarmupStateOutput({
            canvasElement,
            address,
            output: 'assignment',
          }),
          providerState: readWarmupStateOutput({
            canvasElement,
            address,
            output: 'provider-state',
          }),
          operation: readWarmupStateOutput({
            canvasElement,
            address,
            output: 'operation',
          }),
        };
        const panel = await openManagedEmailSubscriptionPanel({
          canvasElement,
        });
        expect(
          within(panel).getByLabelText(
            `Subscription status for ${subscriptionId}`,
          ),
        ).toHaveTextContent('Pending cancellation');
        expect(
          within(panel).getByRole('button', {
            name: 'Undo managed warmup cancellation',
          }),
        ).toBeEnabled();
        await userEvent.click(
          within(panel).getByRole('button', {
            name: 'Increase warmup capacity',
          }),
        );
        await userEvent.click(
          within(panel).getByRole('button', {
            name: 'Review warmup capacity purchase',
          }),
        );
        expect(within(panel).getByRole('alert')).toHaveTextContent(
          'Undo or apply the pending cancellation before adding capacity.',
        );
        expect(
          within(canvasElement.ownerDocument.body).queryByRole('dialog', {
            name: 'Review warmup capacity purchase',
          }),
        ).not.toBeInTheDocument();
        expect(readWarmupCapacityText(canvasElement)).toBe(capacityBefore);
        await expectWarmupState({
          canvasElement,
          address,
          assignment: stateBefore.assignment,
          providerState: stateBefore.providerState,
          operation: stateBefore.operation,
        });
      },
    };
  })();

export const AcquireWarmupCapacityPendingPayment: Story = (() => {
  const quote = task8AcceptedFirstWarmupResolution.quote;
  const intent = task8AcceptedFirstWarmupResolution.intent;
  const operation = createTask8SingleLineAcquisition({
    id: 'acquisition-task8-warmup-pending-001',
    source: 'managed-warmup',
    quote,
    intent,
    resourceSnapshot: {
      id: intent.resourceSnapshotIds[0],
      kind: 'warmup-capacity',
      label: '1 new warmup slot',
    },
    paymentOutcome: 'pending',
  });
  const expectStableIdentity = (canvasElement: HTMLElement) => {
    const canvas = within(canvasElement);

    expect(
      canvas.getByText(`Purchase reference: ${operation.id}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(quote.id);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Payment evidence IDs',
      }),
    ).toBe(
      operation.lines
        .map(({ paymentEvidenceId }) => paymentEvidenceId)
        .join(', '),
    );
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Subscription operation IDs',
      }),
    ).toBe(operation.subscriptionOperations.map(({ id }) => id).join(', '));
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Resource snapshot IDs',
      }),
    ).toBe(intent.resourceSnapshotIds.join(', '));
  };

  return {
    name: 'Acquire Warmup Capacity Pending Payment',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: task8WarmupWorkspace,
      initialReviewDraft: createManagedMailboxReview({
        address: task8WarmupTargetMailbox.address,
        domain: task8WarmupTargetMailbox.domain,
      }),
      initialReviewQuote: quote,
      initialAcquisitionResolution: task8AcceptedFirstWarmupResolution,
      initialAcquisitionOperation: operation,
      initialAcquisitionPendingOutcome: 'unknown' as const,
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const address = task8WarmupTargetMailbox.address;

      expect(
        await canvas.findByRole('heading', {
          name: 'Payment is being processed',
        }),
      ).toBeVisible();
      expectStableIdentity(canvasElement);
      expect(
        canvas.getByRole('button', {
          name: 'Complete locally — $2.99',
        }),
      ).toBeDisabled();

      await userEvent.click(
        canvas.getByRole('button', { name: 'Resolve payment result' }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Payment status needs reconciliation',
        }),
      ).toBeVisible();
      expectStableIdentity(canvasElement);
      expect(
        canvas.getByRole('button', {
          name: 'Complete locally — $2.99',
        }),
      ).toBeDisabled();
      expect(
        canvas.queryByRole('button', { name: 'Resolve payment result' }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        canvas.getByRole('button', { name: 'Cancel review' }),
      );
      await canvas.findByRole('heading', {
        name: 'Managed email resources',
      });
      await expectWarmupCapacity({
        canvasElement,
        expected: '0 of 0 assigned · 0 slots available',
      });
      await expectWarmupState({
        canvasElement,
        address,
        assignment: 'Unassigned',
        providerState: 'Inactive',
        operation: 'Idle',
      });
      expect(
        readWarmupRowOutput({
          canvasElement,
          address,
          label: `Warmup readiness for ${address}`,
        }),
      ).toBe('Ready');
    },
  };
})();

export const RetryFailedWarmupCapacityWithStableIdentities: Story = (() => {
  const quote = task8AcceptedFirstWarmupResolution.quote;
  const intent = task8AcceptedFirstWarmupResolution.intent;
  const operation = createTask8SingleLineAcquisition({
    id: 'acquisition-task8-warmup-failed-001',
    source: 'managed-warmup',
    quote,
    intent,
    resourceSnapshot: {
      id: intent.resourceSnapshotIds[0],
      kind: 'warmup-capacity',
      label: '1 new warmup slot',
    },
    paymentOutcome: 'failed',
  });
  const expectStableIdentity = (canvasElement: HTMLElement) => {
    const canvas = within(canvasElement);

    expect(
      canvas.getByText(`Purchase reference: ${operation.id}`, {
        exact: true,
      }),
    ).toBeVisible();
    expectTask8AcquisitionIdentityProjection({ canvasElement, operation });
  };

  return {
    name: 'Retry Failed Warmup Capacity With Stable Identities',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: task8WarmupWorkspace,
      initialReviewDraft: createManagedMailboxReview({
        address: task8WarmupTargetMailbox.address,
        domain: task8WarmupTargetMailbox.domain,
      }),
      initialReviewQuote: quote,
      initialAcquisitionResolution: task8AcceptedFirstWarmupResolution,
      initialAcquisitionOperation: operation,
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const address = task8WarmupTargetMailbox.address;

      expect(
        await canvas.findByRole('heading', {
          name: 'Payment could not be completed',
        }),
      ).toBeVisible();
      expectStableIdentity(canvasElement);
      expect(
        canvas.getByRole('button', {
          name: 'Complete locally — $2.99',
        }),
      ).toBeDisabled();

      await userEvent.click(
        canvas.getByRole('button', { name: 'Retry same operation' }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Warmup capacity added',
        }),
      ).toBeVisible();
      expectStableIdentity(canvasElement);
      await userEvent.click(
        canvas.getByRole('button', { name: 'Return to dashboard' }),
      );
      await expectWarmupCapacity({
        canvasElement,
        expected: '0 of 1 assigned · 1 slot available',
      });
      await expectWarmupState({
        canvasElement,
        address,
        assignment: 'Unassigned',
        providerState: 'Inactive',
        operation: 'Idle',
      });
      expect(
        readWarmupRowOutput({
          canvasElement,
          address,
          label: `Warmup readiness for ${address}`,
        }),
      ).toBe('Ready');
      expect(
        within(getMailboxRow({ canvasElement, address })).getByRole('button', {
          name: `Start warmup for ${address}`,
        }),
      ).toBeEnabled();
    },
  };
})();

export const ReconcileAmbiguousWarmupCapacityWithStableIdentities: Story =
  (() => {
    const quote = task8AcceptedFirstWarmupResolution.quote;
    const intent = task8AcceptedFirstWarmupResolution.intent;
    const operation = createTask8SingleLineAcquisition({
      id: 'acquisition-task8-warmup-ambiguous-001',
      source: 'managed-warmup',
      quote,
      intent,
      resourceSnapshot: {
        id: intent.resourceSnapshotIds[0],
        kind: 'warmup-capacity',
        label: '1 new warmup slot',
      },
      paymentOutcome: 'unknown',
    });
    const expectStableIdentity = (canvasElement: HTMLElement) => {
      const canvas = within(canvasElement);

      expect(
        canvas.getByText(`Purchase reference: ${operation.id}`, {
          exact: true,
        }),
      ).toBeVisible();
      expectTask8AcquisitionIdentityProjection({ canvasElement, operation });
    };

    return {
      name: 'Reconcile Ambiguous Warmup Capacity With Stable Identities',
      args: withTask8StoryArgs({
        initialFlow: 'review',
        initialWorkspace: task8WarmupWorkspace,
        initialReviewDraft: createManagedMailboxReview({
          address: task8WarmupTargetMailbox.address,
          domain: task8WarmupTargetMailbox.domain,
        }),
        initialReviewQuote: quote,
        initialAcquisitionResolution: task8AcceptedFirstWarmupResolution,
        initialAcquisitionOperation: operation,
        initialAcquisitionReconcileOutcomes: ['unknown', 'completed'] as Array<
          'unknown' | 'failed' | 'completed'
        >,
      }),
      play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const address = task8WarmupTargetMailbox.address;

        expect(
          await canvas.findByRole('heading', {
            name: 'Payment status needs reconciliation',
          }),
        ).toBeVisible();
        expectStableIdentity(canvasElement);
        expect(
          canvas.getByRole('button', {
            name: 'Complete locally — $2.99',
          }),
        ).toBeDisabled();

        await userEvent.click(
          canvas.getByRole('button', {
            name: 'Reconcile payment result',
          }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Payment status needs reconciliation',
          }),
        ).toBeVisible();
        expectStableIdentity(canvasElement);

        await userEvent.click(
          canvas.getByRole('button', {
            name: 'Reconcile payment result',
          }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Warmup capacity added',
          }),
        ).toBeVisible();
        expectStableIdentity(canvasElement);
        await userEvent.click(
          canvas.getByRole('button', { name: 'Return to dashboard' }),
        );
        await expectWarmupCapacity({
          canvasElement,
          expected: '0 of 1 assigned · 1 slot available',
        });
        await expectWarmupState({
          canvasElement,
          address,
          assignment: 'Unassigned',
          providerState: 'Inactive',
          operation: 'Idle',
        });
        expect(
          readWarmupRowOutput({
            canvasElement,
            address,
            label: `Warmup readiness for ${address}`,
          }),
        ).toBe('Ready');
        expect(
          within(
            getMailboxRow({
              canvasElement,
              address,
            }),
          ).getByRole('button', {
            name: `Start warmup for ${address}`,
          }),
        ).toBeEnabled();
      },
    };
  })();

export const ReviewUnavailable: Story = {
  name: 'Review Unavailable',
  args: withTask8StoryArgs({
    initialFlow: 'review',
    initialReviewDraft: null,
    initialReviewQuote: null,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('heading', { name: 'Review unavailable' }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'No local review draft is available. Return to the dashboard and start a revised acquisition path.',
      ),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Return to dashboard' }),
    );
    expect(
      await canvas.findByRole('heading', { name: 'Managed email resources' }),
    ).toBeVisible();
  },
};

export const CompletionDomain: Story = {
  name: 'Completion — Domain',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialReviewDraft: createManagedDomainReview(task8CompletionDomainName),
    initialReviewQuote: task8CompletionDomainQuote,
    initialAcquisitionOperation: task8CompletionDomainOperation,
    initialCompletionEvidence: {
      kind: 'commercial',
      source: 'managed-domain',
      resource: task8CompletionDomainName,
      acquisitionOperation: task8CompletionDomainOperation,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const completionIdentity = {
      acceptedQuoteId: task8CompletionDomainOperation.acceptedQuoteId,
      paymentEvidenceIds: task8CompletionDomainOperation.lines
        .map((line) => line.paymentEvidenceId)
        .join(', '),
      resourceSnapshotIds: task8CompletionDomainOperation.subscriptionOperations
        .flatMap((operation) => operation.intent.resourceSnapshotIds)
        .join(', '),
      subscriptionOperationIds:
        task8CompletionDomainOperation.subscriptionOperations
          .map((operation) => operation.id)
          .join(', '),
    };

    expect(
      await canvas.findByRole('heading', { name: 'Managed domain acquired' }),
    ).toBeVisible();
    expect(
      canvas.getByText('Source: Managed domain', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8CompletionDomainName}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Purchase reference: acquisition-task8-completion-domain-001',
      ),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(completionIdentity.acceptedQuoteId);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Payment evidence IDs',
      }),
    ).toBe(completionIdentity.paymentEvidenceIds);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Resource snapshot IDs',
      }),
    ).toBe(completionIdentity.resourceSnapshotIds);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Subscription operation IDs',
      }),
    ).toBe(completionIdentity.subscriptionOperationIds);

    expect(
      canvas.getByRole('button', {
        name: `Create a mailbox on ${task8CompletionDomainName}`,
      }),
    ).toBeEnabled();
  },
};

export const CompletionMailbox: Story = {
  name: 'Completion — Mailbox',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWorkspace: {
      ...emptyWorkspace,
      domains: [
        {
          id: 'domain-task8-completion-mailbox-verified-001',
          name: task8CompletionDomainName,
          source: 'external',
          verification: 'verified',
          subscriptionId: null,
        },
      ],
    },
    initialReviewDraft: createManagedMailboxReview({
      address: task8CompletionMailboxAddress,
      domain: task8CompletionDomainName,
    }),
    initialReviewQuote: task8CompletionMailboxQuote,
    initialAcquisitionOperation: task8CompletionMailboxOperation,
    initialCompletionEvidence: {
      kind: 'commercial',
      source: 'managed-mailbox',
      resource: task8CompletionMailboxAddress,
      acquisitionOperation: task8CompletionMailboxOperation,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const completionIdentity = {
      acceptedQuoteId: task8CompletionMailboxOperation.acceptedQuoteId,
      paymentEvidenceIds: task8CompletionMailboxOperation.lines
        .map((line) => line.paymentEvidenceId)
        .join(', '),
      resourceSnapshotIds:
        task8CompletionMailboxOperation.subscriptionOperations
          .flatMap((operation) => operation.intent.resourceSnapshotIds)
          .join(', '),
      subscriptionOperationIds:
        task8CompletionMailboxOperation.subscriptionOperations
          .map((operation) => operation.id)
          .join(', '),
    };

    expect(
      await canvas.findByRole('heading', { name: 'Managed mailbox acquired' }),
    ).toBeVisible();
    expect(
      canvas.getByText('Source: Managed mailbox', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8CompletionMailboxAddress}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Purchase reference: acquisition-task8-completion-mailbox-001',
      ),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(completionIdentity.acceptedQuoteId);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Payment evidence IDs',
      }),
    ).toBe(completionIdentity.paymentEvidenceIds);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Resource snapshot IDs',
      }),
    ).toBe(completionIdentity.resourceSnapshotIds);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Subscription operation IDs',
      }),
    ).toBe(completionIdentity.subscriptionOperationIds);

    expect(
      canvas.getByRole('button', {
        name: `Manage mailbox ${task8CompletionMailboxAddress}`,
      }),
    ).toBeEnabled();
  },
};

export const RejectMailboxCompletionWithoutVerifiedDomain: Story = {
  name: 'Reject Mailbox Completion Without Verified Domain',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWorkspace: emptyWorkspace,
    initialReviewDraft: createManagedMailboxReview({
      address: task8CompletionMailboxAddress,
      domain: task8CompletionDomainName,
    }),
    initialReviewQuote: task8CompletionMailboxQuote,
    initialAcquisitionOperation: task8CompletionMailboxOperation,
    initialCompletionEvidence: {
      kind: 'commercial',
      source: 'managed-mailbox',
      resource: task8CompletionMailboxAddress,
      acquisitionOperation: task8CompletionMailboxOperation,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('heading', {
        name: 'Completion unavailable',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', {
        name: 'Managed mailbox acquired',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText(`Resource: ${task8CompletionMailboxAddress}`, {
        exact: true,
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Return to dashboard' }),
    );
    expect(
      canvas.queryByRole('row', {
        name: new RegExp(task8CompletionMailboxAddress),
      }),
    ).not.toBeInTheDocument();
  },
};

export const RejectMalformedSucceededCompletionGraph: Story = {
  name: 'Reject Malformed Succeeded Completion Graph',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWorkspace: {
      ...emptyWorkspace,
      domains: [
        {
          id: 'domain-task8-malformed-completion-verified-001',
          name: task8CompletionDomainName,
          source: 'external',
          verification: 'verified',
          subscriptionId: null,
        },
      ],
    },
    initialReviewDraft: createManagedMailboxReview({
      address: task8CompletionMailboxAddress,
      domain: task8CompletionDomainName,
    }),
    initialReviewQuote: task8CompletionMailboxQuote,
    initialAcquisitionOperation: task8MalformedCompletionMailboxOperation,
    initialCompletionEvidence: {
      kind: 'commercial',
      source: 'managed-mailbox',
      resource: task8CompletionMailboxAddress,
      acquisitionOperation: task8MalformedCompletionMailboxOperation,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('heading', {
        name: 'Completion unavailable',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', {
        name: 'Managed mailbox acquired',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText(`Resource: ${task8CompletionMailboxAddress}`, {
        exact: true,
      }),
    ).not.toBeInTheDocument();
  },
};

export const CompletionWarmupCapacity: Story = {
  name: 'Completion — Warmup Capacity',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWarmupTargetMailboxAddress: task8WarmupTargetMailbox.address,
    initialWorkspace: task8CompletionWarmupCapacityWorkspace,
    initialReviewQuote: task8CompletionWarmupCapacityResolution.quote,
    initialReviewDraft: createManagedMailboxReview({
      address: task8WarmupTargetMailbox.address,
      domain: task8WarmupTargetMailbox.domain,
    }),
    initialAcquisitionResolution: task8CompletionWarmupCapacityResolution,
    initialAcquisitionOperation: task8CompletionWarmupCapacityOperation,
    initialCompletionEvidence: {
      kind: 'commercial',
      source: 'managed-warmup',
      resource: task8WarmupTargetMailbox.address,
      acquisitionOperation: task8CompletionWarmupCapacityOperation,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const readinessBeforeCapacityCompletion =
      task8WarmupTargetMailbox.readiness === 'ready' ? 'Ready' : 'Not ready';

    expect(
      await canvas.findByRole('heading', {
        name: 'Warmup capacity added',
      }),
    ).toBeVisible();
    expect(
      within(
        canvas.getByRole('table', { name: 'Warmup-capacity mailbox' }),
      ).getByRole('columnheader', { name: 'Readiness' }),
    ).toBeVisible();
    expect(
      canvas.getByText('Source: Managed warmup capacity', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8WarmupTargetMailbox.address}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expectTask8SucceededWarmupCapacityModalCompletion({
      canvasElement,
      operation: task8CompletionWarmupCapacityOperation,
    });

    const targetRow = getMailboxRow({
      canvasElement,
      address: task8WarmupTargetMailbox.address,
    });
    const startWarmupButton = within(targetRow).getByRole('button', {
      name: `Start warmup for ${task8WarmupTargetMailbox.address}`,
    });
    expect(startWarmupButton).toBeEnabled();
    await expectWarmupState({
      canvasElement,
      address: task8WarmupTargetMailbox.address,
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    expect(
      readWarmupRowOutput({
        canvasElement,
        address: task8WarmupTargetMailbox.address,
        label: `Warmup readiness for ${task8WarmupTargetMailbox.address}`,
      }),
    ).toBe(readinessBeforeCapacityCompletion);
    expect(
      canvas.queryByRole('button', {
        name: 'Recover canceled warmup capacity',
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(startWarmupButton);
    expect(
      await within(targetRow).findByRole('button', {
        name: 'Resolve warmup operation',
      }),
    ).toBeEnabled();
    expect(
      within(targetRow).queryByRole('button', {
        name: `Start warmup for ${task8WarmupTargetMailbox.address}`,
      }),
    ).not.toBeInTheDocument();
    await expectWarmupState({
      canvasElement,
      address: task8WarmupTargetMailbox.address,
      assignment: 'Assigned',
      providerState: 'Inactive',
      operation: 'Pending',
    });
    await resolveWarmupOperation(canvasElement);
    const pauseWarmupButton = await within(
      getMailboxRow({
        canvasElement,
        address: task8WarmupTargetMailbox.address,
      }),
    ).findByRole('button', {
      name: `Pause warmup for ${task8WarmupTargetMailbox.address}`,
    });
    await expectWarmupState({
      canvasElement,
      address: task8WarmupTargetMailbox.address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await pressFocusedButton(pauseWarmupButton);
    await expectWarmupState({
      canvasElement,
      address: task8WarmupTargetMailbox.address,
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Pending pause',
    });
    await resolveWarmupOperation(canvasElement);
    await expectWarmupState({
      canvasElement,
      address: task8WarmupTargetMailbox.address,
      assignment: 'Assigned',
      providerState: 'Paused',
      operation: 'Idle',
    });
  },
};

export const CompletionPrewarmed: Story = {
  name: 'Completion — Prewarmed',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWorkspace: {
      ...mixedWorkspace,
      subscriptions: mixedWorkspace.subscriptions.map((subscription) =>
        subscription.product === 'managed-mailbox'
          ? createManagedEmailDesignRecurringSubscription({
              ...subscription,
              status: 'canceled',
              renewsAt: null,
              canceledAt: task8MonthlyRenewalAt,
              pendingQuantity: undefined,
              changeEffectiveAt: undefined,
              cancelAt: undefined,
            })
          : subscription,
      ),
    },
    initialPrewarmedCapacityResolution: task8PrewarmedCapacityResolution,
    initialReviewDraft: task8PrewarmedReviewDraft,
    initialReviewQuote: task8CompletedPrewarmedQuote,
    initialAcquisitionOperation: task8CompletedPrewarmedOperation,
    initialCompletionEvidence: {
      kind: 'commercial',
      source: 'prewarmed',
      resource: task8PrewarmedBundle.domain,
      acquisitionOperation: task8CompletedPrewarmedOperation,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const completedOperationId = 'acquisition-task8-prewarmed-completed-001';
    const [firstMailbox, secondMailbox, extraMailbox] =
      task8PrewarmedBundle.mailboxIdentities;

    if (!firstMailbox || !secondMailbox || extraMailbox !== undefined) {
      throw new Error('Expected exactly two task fixture prewarmed mailboxes.');
    }

    const paymentEvidenceIds = [
      `payment-evidence-${completedOperationId}-domain`,
      `payment-evidence-${completedOperationId}-mailbox-1`,
      `payment-evidence-${completedOperationId}-mailbox-2`,
    ].join(', ');
    const subscriptionOperationIds = [
      `subscription-operation-${completedOperationId}-domain`,
      `subscription-operation-${completedOperationId}-mailbox`,
    ].join(', ');
    const resourceSnapshotIds = [
      `${task8PrewarmedBundle.id}-domain`,
      `${task8PrewarmedBundle.id}-mailbox-${firstMailbox.address.toLowerCase()}`,
      `${task8PrewarmedBundle.id}-mailbox-${secondMailbox.address.toLowerCase()}`,
    ].join(', ');
    const domainSubscriptionId = `subscription-${completedOperationId}-domain`;
    const mailboxSubscriptionId =
      task8CompletedPrewarmedOperation.subscriptionOperations.find(
        (subscriptionOperation) =>
          subscriptionOperation.intent.product === 'managed-mailbox',
      )?.intent.targetSubscriptionId;

    expect(
      await canvas.findByRole('heading', {
        name: 'Prewarmed mailboxes acquired',
      }),
    ).toBeVisible();
    expect(
      canvas.getByText('Source: Prewarmed mailbox bundle', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(`Resource: ${task8PrewarmedBundle.domain}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'Purchase reference: acquisition-task8-prewarmed-completed-001',
      ),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Accepted quote ID',
      }),
    ).toBe(task8CompletedPrewarmedOperation.acceptedQuoteId);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Payment evidence IDs',
      }),
    ).toBe(paymentEvidenceIds);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Resource snapshot IDs',
      }),
    ).toBe(resourceSnapshotIds);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Subscription operation IDs',
      }),
    ).toBe(subscriptionOperationIds);
    expect(
      readStoryOutput({
        canvasElement,
        label: 'Prewarmed inventory count',
      }),
    ).toBe(String(mixedWorkspace.prewarmedBundles.length - 1));
    const completedResources = canvas.getByRole('list', {
      name: 'Completed local resources',
    });
    expect(within(completedResources).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(completedResources).getByText(task8PrewarmedBundle.domain, {
        exact: true,
      }),
    ).toBeVisible();
    for (const mailbox of task8PrewarmedBundle.mailboxIdentities) {
      expect(
        within(completedResources).getByText(mailbox.address, {
          exact: true,
        }),
      ).toBeVisible();
    }

    expect(
      canvas.getByRole('button', {
        name: 'Manage prewarmed mailboxes',
      }),
    ).toBeEnabled();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Manage prewarmed mailboxes' }),
    );
    const subscriptionPanel = await openManagedEmailSubscriptionPanel({
      canvasElement,
      actionName: 'Manage subscriptions',
    });
    await pressFocusedButton(
      within(subscriptionPanel).getByRole('button', {
        name: 'View managed-email subscription inventory',
      }),
    );
    const inventory = within(subscriptionPanel).getByRole('list', {
      name: 'Managed-email subscription inventory',
    });
    const inventoryEntries = within(inventory).getAllByRole('listitem');
    expect(inventoryEntries).toHaveLength(
      mixedWorkspace.subscriptions.length + 1,
    );
    const domainInventoryEntry = inventoryEntries.find((entry) =>
      (entry.textContent ?? '').includes(domainSubscriptionId),
    );
    if (mailboxSubscriptionId === undefined) {
      throw new Error('Expected completed prewarmed mailbox subscription.');
    }
    const initialMailboxPool = mixedWorkspace.subscriptions.find(
      (subscription) => subscription.id === mailboxSubscriptionId,
    );
    if (initialMailboxPool === undefined) {
      throw new Error('Expected the current pooled mailbox subscription.');
    }
    const mailboxInventoryEntry = inventoryEntries.find((entry) =>
      (entry.textContent ?? '').includes(mailboxSubscriptionId),
    );

    if (
      domainInventoryEntry === undefined ||
      mailboxInventoryEntry === undefined
    ) {
      throw new Error('Expected completed prewarmed subscription inventory.');
    }

    expect(domainInventoryEntry).toHaveTextContent('Managed domain');
    expect(mailboxInventoryEntry).toHaveTextContent('Managed mailbox');
    expect(domainInventoryEntry).not.toBe(mailboxInventoryEntry);
    expect(
      [domainInventoryEntry, mailboxInventoryEntry].filter((entry) =>
        (entry.textContent ?? '').includes('Managed warmup'),
      ),
    ).toHaveLength(0);

    await userEvent.click(
      within(subscriptionPanel).getByRole('button', {
        name: `Manage subscription ${domainSubscriptionId}`,
      }),
    );
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription quantity for ${domainSubscriptionId}`,
      ),
    ).toHaveTextContent('1');
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription cadence for ${domainSubscriptionId}`,
      ),
    ).toHaveTextContent('Annual');
    const domainResourceSnapshots = within(subscriptionPanel).getByLabelText(
      `Subscription resource snapshots for ${domainSubscriptionId}`,
    );
    expect(domainResourceSnapshots).toBeVisible();
    expect(domainResourceSnapshots.textContent?.trim()).toBe(
      task8PrewarmedBundle.domain,
    );
    await userEvent.click(
      within(subscriptionPanel).getByRole('button', {
        name: `Manage subscription ${mailboxSubscriptionId}`,
      }),
    );
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription quantity for ${mailboxSubscriptionId}`,
      ),
    ).toHaveTextContent(String(initialMailboxPool.quantity + 2));
    expect(
      within(subscriptionPanel).getByLabelText(
        `Subscription cadence for ${mailboxSubscriptionId}`,
      ),
    ).toHaveTextContent('Monthly');
    const pooledMailboxResources = within(subscriptionPanel).getByLabelText(
      `Subscription resource snapshots for ${mailboxSubscriptionId}`,
    );
    expect(pooledMailboxResources).toBeVisible();
    expect(pooledMailboxResources.textContent?.trim()).toBe(
      [
        ...initialMailboxPool.linkedResources.map(({ label }) => label),
        `${firstMailbox.identity} <${firstMailbox.address}>`,
        `${secondMailbox.identity} <${secondMailbox.address}>`,
      ].join(''),
    );

    await userEvent.click(
      within(subscriptionPanel).getByRole('button', {
        name: 'Back to email infrastructure',
      }),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Browse prewarmed mailboxes' }),
    );
    expect(
      await canvas.findByRole('heading', {
        name: 'Choose a prewarmed mailbox bundle',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('radio', {
        name: task8PrewarmedBundle.domain,
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText(task8PrewarmedBundle.domain, { exact: true }),
    ).not.toBeInTheDocument();
    const remainingBundle = mixedWorkspace.prewarmedBundles.find(
      (bundle) => bundle.id !== task8PrewarmedBundle.id,
    );

    if (remainingBundle === undefined) {
      throw new Error('Expected a remaining prewarmed inventory bundle.');
    }

    expect(
      canvas.getByText(remainingBundle.domain, { exact: true }),
    ).toBeVisible();
  },
};

export const CompletionExternalDomain: Story = {
  name: 'Completion — External Domain',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWorkspace: emptyWorkspace,
    initialDnsLifecycle: task8CompletedExternalDnsLifecycle,
    initialCompletionEvidence: {
      kind: 'external-domain',
      domain: task8CompletedExternalDnsLifecycle.domain,
      dnsLifecycle: task8CompletedExternalDnsLifecycle,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('heading', {
        name: 'External domain verified',
      }),
    ).toBeVisible();
    expect(
      canvas.getByText('Source: External domain', { exact: true }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        `Resource: ${task8CompletedExternalDnsLifecycle.domain.name}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      canvas.getByText(
        'DNS verification reference: dns-check-task8-external-completion-001',
      ),
    ).toBeVisible();
    expect(
      readStoryOutput({
        canvasElement,
        label: 'DNS verification state',
      }),
    ).toBe('Completed');
    expect(
      canvas.queryByLabelText('Accepted quote ID'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('Payment evidence IDs'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('Resource snapshot IDs'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('Subscription operation IDs'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('Recorded local charge count'),
    ).not.toBeInTheDocument();
    expect(canvas.queryByText(/Purchase reference:/)).not.toBeInTheDocument();
    expect(canvas.queryByText(/Quote reference:/)).not.toBeInTheDocument();
    expect(
      canvas.queryByText(/Subscription reference:/),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', {
        name: `Create a mailbox on ${task8CompletedExternalDnsLifecycle.domain.name}`,
      }),
    ).toBeEnabled();
  },
};

export const CompletionExternalDomainRequiresCompletedDns: Story = {
  name: 'Completion — External Domain Requires Completed DNS',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWorkspace: emptyWorkspace,
    initialDnsStatus: 'verified',
    initialDnsLifecycle: task8IncompleteExternalDnsLifecycle,
    initialCompletionEvidence: {
      kind: 'external-domain',
      domain: task8IncompleteExternalDnsLifecycle.domain,
      dnsLifecycle: task8IncompleteExternalDnsLifecycle,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('heading', {
        name: 'Completion unavailable',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', {
        name: 'External domain verified',
      }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText('Source: External domain', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByText(
        `Resource: ${task8IncompleteExternalDnsLifecycle.domain.name}`,
        { exact: true },
      ),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByLabelText('DNS verification state'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', {
        name: `Create a mailbox on ${task8IncompleteExternalDnsLifecycle.domain.name}`,
      }),
    ).not.toBeInTheDocument();
  },
};
export const CompletionExternalDomainRequiresVerifiedDnsRows: Story = (() => {
  const actionRequiredLifecycle = {
    ...task8CompletedExternalDnsLifecycle,
    records: task8CompletedExternalDnsLifecycle.records.map((record, index) =>
      index === 0 ? { ...record, status: 'action-required' as const } : record,
    ),
  } satisfies ManagedEmailDesignDnsLifecycle;

  return {
    name: 'Completion — External Domain Requires Verified DNS Rows',
    args: withTask8StoryArgs({
      initialFlow: 'completion',
      initialWorkspace: emptyWorkspace,
      initialDnsLifecycle: actionRequiredLifecycle,
      initialCompletionEvidence: {
        kind: 'external-domain',
        domain: actionRequiredLifecycle.domain,
        dnsLifecycle: actionRequiredLifecycle,
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      expect(
        await canvas.findByRole('heading', {
          name: 'Completion unavailable',
        }),
      ).toBeVisible();
      expect(
        canvas.queryByRole('heading', {
          name: 'External domain verified',
        }),
      ).not.toBeInTheDocument();
      expect(
        canvas.queryByText(`Resource: ${actionRequiredLifecycle.domain.name}`, {
          exact: true,
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const CompletionExternalDomainRequiresCompleteDnsRecordSet: Story =
  (() => {
    const incompleteVerifiedLifecycle = {
      ...task8CompletedExternalDnsLifecycle,
      records: task8CompletedExternalDnsLifecycle.records.slice(0, 1),
    } satisfies ManagedEmailDesignDnsLifecycle;

    return {
      name: 'Completion — External Domain Requires Complete DNS Record Set',
      args: withTask8StoryArgs({
        initialFlow: 'completion',
        initialWorkspace: emptyWorkspace,
        initialDnsLifecycle: incompleteVerifiedLifecycle,
        initialCompletionEvidence: {
          kind: 'external-domain' as const,
          domain: incompleteVerifiedLifecycle.domain,
          dnsLifecycle: incompleteVerifiedLifecycle,
        },
      }),
      play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);

        expect(
          await canvas.findByRole('heading', {
            name: 'Completion unavailable',
          }),
        ).toBeVisible();
        expect(
          canvas.queryByRole('heading', {
            name: 'External domain verified',
          }),
        ).not.toBeInTheDocument();
        expect(
          canvas.queryByText(
            `Resource: ${incompleteVerifiedLifecycle.domain.name}`,
            { exact: true },
          ),
        ).not.toBeInTheDocument();
      },
    };
  })();

export const CompletionExternalDomainRequiresMatchingEvidenceDomain: Story = {
  name: 'Completion — External Domain Requires Matching Evidence Domain',
  args: withTask8StoryArgs({
    initialFlow: 'completion',
    initialWorkspace: emptyWorkspace,
    initialDnsLifecycle: task8CompletedExternalDnsLifecycle,
    initialCompletionEvidence: {
      kind: 'external-domain',
      domain: {
        id: 'domain-task8-external-completion-mismatch-001',
        name: 'mismatch.example',
      },
      dnsLifecycle: task8CompletedExternalDnsLifecycle,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      await canvas.findByRole('heading', {
        name: 'Completion unavailable',
      }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('heading', {
        name: 'External domain verified',
      }),
    ).not.toBeInTheDocument();
  },
};

export const CompletionRejectsFailedCommercialEvidence: Story = (() => {
  const { operation, quote, resource } = createTask8CommercialCompletionFixture(
    {
      id: 'task8-completion-failed-evidence-001',
      paymentOutcome: 'failed',
    },
  );

  return {
    name: 'Completion Rejects Failed Commercial Evidence',
    args: withTask8StoryArgs({
      initialFlow: 'completion',
      initialReviewDraft: createManagedDomainReview(resource),
      initialReviewQuote: quote,
      initialAcquisitionOperation: operation,
      initialCompletionEvidence: {
        kind: 'commercial',
        source: 'managed-domain',
        resource,
        acquisitionOperation: operation,
      },
    }),
    play: async ({ canvasElement }) => {
      expect(operation.status).toBe('failed');
      await expectTask8CommercialCompletionToFailClosed({
        canvasElement,
        heading: 'Managed domain acquired',
        source: 'Source: Managed domain',
        resource,
      });
    },
  };
})();

export const CompletionRejectsForgedCommercialResource: Story = (() => {
  const { operation, quote, resource } = createTask8CommercialCompletionFixture(
    {
      id: 'task8-completion-forged-resource-001',
    },
  );
  const forgedResource = 'forged-resource.storybook.local';

  return {
    name: 'Completion Rejects Forged Commercial Resource',
    args: withTask8StoryArgs({
      initialFlow: 'completion',
      initialReviewDraft: createManagedDomainReview(resource),
      initialReviewQuote: quote,
      initialAcquisitionOperation: operation,
      initialCompletionEvidence: {
        kind: 'commercial',
        source: 'managed-domain',
        resource: forgedResource,
        acquisitionOperation: operation,
      },
    }),
    play: async ({ canvasElement }) => {
      await expectTask8CommercialCompletionToFailClosed({
        canvasElement,
        heading: 'Managed domain acquired',
        source: 'Source: Managed domain',
        resource: forgedResource,
      });
    },
  };
})();

export const CompletionRejectsConflictingDomainOwnership: Story = (() => {
  const { operation, quote, resource } = createTask8CommercialCompletionFixture(
    {
      id: 'task8-completion-conflicting-domain-001',
    },
  );

  return {
    name: 'Completion Rejects Conflicting Domain Ownership',
    args: withTask8StoryArgs({
      initialFlow: 'completion',
      initialWorkspace: {
        ...emptyWorkspace,
        domains: [
          {
            id: 'domain-conflicting-existing-001',
            name: resource,
            source: 'external',
            verification: 'verified',
            subscriptionId: null,
          },
        ],
      },
      initialReviewDraft: createManagedDomainReview(resource),
      initialReviewQuote: quote,
      initialAcquisitionOperation: operation,
      initialCompletionEvidence: {
        kind: 'commercial',
        source: 'managed-domain',
        resource,
        acquisitionOperation: operation,
      },
    }),
    play: async ({ canvasElement }) => {
      await expectTask8CommercialCompletionToFailClosed({
        canvasElement,
        heading: 'Managed domain acquired',
        source: 'Source: Managed domain',
        resource,
      });
    },
  };
})();
export const CompletionRejectsPartialCommercialEvidence: Story = (() => {
  const { operation, quote, resource } = createTask8CommercialCompletionFixture(
    {
      id: 'task8-completion-partial-evidence-001',
      settledResourceOutcome: 'failed',
    },
  );

  return {
    name: 'Completion Rejects Partial Commercial Evidence',
    args: withTask8StoryArgs({
      initialFlow: 'completion',
      initialReviewDraft: createManagedDomainReview(resource),
      initialReviewQuote: quote,
      initialAcquisitionOperation: operation,
      initialCompletionEvidence: {
        kind: 'commercial',
        source: 'managed-domain',
        resource,
        acquisitionOperation: operation,
      },
    }),
    play: async ({ canvasElement }) => {
      expect(operation.status).toBe('partial');
      await expectTask8CommercialCompletionToFailClosed({
        canvasElement,
        heading: 'Managed domain acquired',
        source: 'Source: Managed domain',
        resource,
      });
    },
  };
})();

export const CompletionRejectsPendingCommercialEvidence: Story = (() => {
  const { operation, quote, resource } = createTask8CommercialCompletionFixture(
    {
      id: 'task8-completion-pending-evidence-001',
      paymentOutcome: 'pending',
    },
  );

  return {
    name: 'Completion Rejects Pending Commercial Evidence',
    args: withTask8StoryArgs({
      initialFlow: 'completion',
      initialReviewDraft: createManagedDomainReview(resource),
      initialReviewQuote: quote,
      initialAcquisitionOperation: operation,
      initialCompletionEvidence: {
        kind: 'commercial',
        source: 'managed-domain',
        resource,
        acquisitionOperation: operation,
      },
    }),
    play: async ({ canvasElement }) => {
      expect(operation.status).toBe('pending');
      await expectTask8CommercialCompletionToFailClosed({
        canvasElement,
        heading: 'Managed domain acquired',
        source: 'Source: Managed domain',
        resource,
      });
    },
  };
})();

export const CompletionRejectsReconciliationRequiredCommercialEvidence: Story =
  (() => {
    const { operation, quote, resource } =
      createTask8CommercialCompletionFixture({
        id: 'task8-completion-reconciliation-evidence-001',
        paymentOutcome: 'unknown',
      });

    return {
      name: 'Completion Rejects Reconciliation-Required Commercial Evidence',
      args: withTask8StoryArgs({
        initialFlow: 'completion',
        initialReviewDraft: createManagedDomainReview(resource),
        initialReviewQuote: quote,
        initialAcquisitionOperation: operation,
        initialCompletionEvidence: {
          kind: 'commercial',
          source: 'managed-domain',
          resource,
          acquisitionOperation: operation,
        },
      }),
      play: async ({ canvasElement }) => {
        expect(operation.status).toBe('reconciliation-required');
        await expectTask8CommercialCompletionToFailClosed({
          canvasElement,
          heading: 'Managed domain acquired',
          source: 'Source: Managed domain',
          resource,
        });
      },
    };
  })();

export const CompletionRejectsSucceededCommercialOperationWithoutEvidence: Story =
  (() => {
    const { operation, quote, resource } =
      createTask8CommercialCompletionFixture({
        id: 'task8-completion-succeeded-without-evidence-001',
      });

    return {
      name: 'Completion Requires Explicit Succeeded Commercial Evidence',
      args: withTask8StoryArgs({
        initialFlow: 'completion',
        initialReviewDraft: createManagedDomainReview(resource),
        initialReviewQuote: quote,
        initialAcquisitionOperation: operation,
      }),
      play: async ({ canvasElement }) => {
        expect(operation.status).toBe('succeeded');
        await expectTask8CommercialCompletionToFailClosed({
          canvasElement,
          heading: 'Managed domain acquired',
          source: 'Source: Managed domain',
          resource,
        });
      },
    };
  })();

export const CompletionRejectsPrewarmedWarmupProductEvidence: Story = (() => {
  const warmupSnapshotId = 'snapshot-task8-forbidden-prewarmed-warmup-capacity';
  const warmupQuoteLine: ManagedEmailDesignQuoteLine = {
    id: 'quote-line-task8-forbidden-prewarmed-warmup',
    resourceLabel: 'Forbidden prewarmed warmup capacity',
    unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
    amountCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
    startsAt: task8FixtureNow,
    renewsAt: task8MonthlyRenewalAt,
    product: 'managed-warmup',
    cadence: 'monthly',
    quantity: 1,
  };
  const quote = createTask8Quote({
    id: 'quote-task8-forbidden-prewarmed-warmup-001',
    accepted: true,
    lines: [...task8CompletedPrewarmedQuote.lines, warmupQuoteLine],
  });
  const operation = {
    ...task8CompletedPrewarmedOperation,
    id: 'acquisition-task8-forbidden-prewarmed-warmup-001',
    acceptedQuoteId: quote.id,
    lines: [
      ...task8CompletedPrewarmedOperation.lines,
      {
        id: 'acquisition-line-task8-forbidden-prewarmed-warmup',
        quoteLineId: warmupQuoteLine.id,
        resourceSnapshotId: warmupSnapshotId,
        dependsOnLineIds: [],
        resourceOperationId:
          'resource-operation-task8-forbidden-prewarmed-warmup',
        subscriptionOperationId:
          'subscription-operation-task8-forbidden-prewarmed-warmup',
        paymentEvidenceId: 'payment-evidence-task8-forbidden-prewarmed-warmup',
        paymentOutcome: 'completed' as const,
        resourceOutcome: 'completed' as const,
      },
    ],
    subscriptionOperations: [
      ...task8CompletedPrewarmedOperation.subscriptionOperations,
      {
        id: 'subscription-operation-task8-forbidden-prewarmed-warmup',
        intent: {
          product: 'managed-warmup' as const,
          mode: 'create' as const,
          targetSubscriptionId: 'subscription-task8-forbidden-prewarmed-warmup',
          quantityDelta: 1,
          resourceSnapshotIds: [warmupSnapshotId],
        },
        outcome: 'completed' as const,
      },
    ],
  } satisfies Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;
  const firstMailbox = task8PrewarmedBundle.mailboxIdentities[0];

  if (firstMailbox === undefined) {
    throw new Error('Expected a Task 8 prewarmed mailbox.');
  }

  return {
    name: 'Completion Rejects Prewarmed Warmup Product Evidence',
    args: withTask8StoryArgs({
      initialWorkspace: {
        domains: [],
        mailboxes: [],
        prewarmedBundles: [task8PrewarmedBundle],
        subscriptions: [],
      },
      initialFlow: 'completion',
      initialReviewDraft: task8PrewarmedReviewDraft,
      initialReviewQuote: quote,
      initialAcquisitionOperation: operation,
      initialCompletionEvidence: {
        kind: 'commercial',
        source: 'prewarmed',
        resource: task8PrewarmedBundle.domain,
        acquisitionOperation: operation,
      },
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await expectTask8CommercialCompletionToFailClosed({
        canvasElement,
        heading: 'Prewarmed mailboxes acquired',
        source: 'Source: Prewarmed mailbox bundle',
        resource: task8PrewarmedBundle.domain,
      });
      await userEvent.click(
        canvas.getByRole('button', { name: 'Return to dashboard' }),
      );
      await waitFor(() =>
        expect(
          canvas.queryByRole('heading', {
            name: 'Local completion recorded',
          }),
        ).not.toBeInTheDocument(),
      );
      expect(
        canvas.queryByLabelText(
          `Warmup assignment for ${firstMailbox.address}`,
        ),
      ).not.toBeInTheDocument();
    },
  };
})();

export const CompletionRejectsSplitPrewarmedMailboxOperations: Story = (() => {
  const mailboxOperation =
    task8CompletedPrewarmedOperation.subscriptionOperations.find(
      ({ intent }) => intent.product === 'managed-mailbox',
    );
  const mailboxLines = task8CompletedPrewarmedOperation.lines.filter(
    (line) => line.subscriptionOperationId === mailboxOperation?.id,
  );
  const [firstSnapshotId, secondSnapshotId, extraSnapshotId] =
    mailboxOperation?.intent.resourceSnapshotIds ?? [];
  const [firstMailboxLine, secondMailboxLine, extraMailboxLine] = mailboxLines;

  if (
    mailboxOperation === undefined ||
    firstSnapshotId === undefined ||
    secondSnapshotId === undefined ||
    extraSnapshotId !== undefined ||
    firstMailboxLine === undefined ||
    secondMailboxLine === undefined ||
    extraMailboxLine !== undefined
  ) {
    throw new Error('Expected one pooled Task 8 mailbox operation.');
  }

  const secondMailboxOperationId =
    'subscription-operation-task8-split-prewarmed-mailbox-2';
  const operation = {
    ...task8CompletedPrewarmedOperation,
    id: 'acquisition-task8-split-prewarmed-mailbox-001',
    lines: task8CompletedPrewarmedOperation.lines.map((line) =>
      line.id === secondMailboxLine.id
        ? {
            ...line,
            subscriptionOperationId: secondMailboxOperationId,
          }
        : line,
    ),
    subscriptionOperations: [
      ...task8CompletedPrewarmedOperation.subscriptionOperations.filter(
        ({ id }) => id !== mailboxOperation.id,
      ),
      {
        ...mailboxOperation,
        intent: {
          ...mailboxOperation.intent,
          quantityDelta: 1,
          resourceSnapshotIds: [firstSnapshotId],
        },
      },
      {
        ...mailboxOperation,
        id: secondMailboxOperationId,
        intent: {
          ...mailboxOperation.intent,
          targetSubscriptionId: 'subscription-task8-split-prewarmed-mailbox-2',
          quantityDelta: 1,
          resourceSnapshotIds: [secondSnapshotId],
        },
      },
    ],
  } satisfies Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;

  return {
    name: 'Completion Rejects Split Prewarmed Mailbox Operations',
    args: withTask8StoryArgs({
      initialFlow: 'completion',
      initialReviewDraft: task8PrewarmedReviewDraft,
      initialReviewQuote: task8CompletedPrewarmedQuote,
      initialAcquisitionOperation: operation,
      initialCompletionEvidence: {
        kind: 'commercial',
        source: 'prewarmed',
        resource: task8PrewarmedBundle.domain,
        acquisitionOperation: operation,
      },
    }),
    play: async ({ canvasElement }) => {
      await expectTask8CommercialCompletionToFailClosed({
        canvasElement,
        heading: 'Prewarmed mailboxes acquired',
        source: 'Source: Prewarmed mailbox bundle',
        resource: task8PrewarmedBundle.domain,
      });
    },
  };
})();

export const CompletionRejectsWarmupCapacityIntentWithoutOperationEvidence: Story =
  (() => {
    const targetSubscriptionId = 'subscription-managed-warmup';
    const proposal = requireTask8CapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [],
        mailboxes: [task8WarmupTargetMailbox],
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
      }),
    );
    const resolution = requireTask8AcceptedCapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [],
        mailboxes: [task8WarmupTargetMailbox],
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
        quote: acceptTask8Quote(proposal.quote),
      }),
    );

    return {
      name: 'Completion Rejects Warmup Capacity Intent Without Operation Evidence',
      args: withTask8StoryArgs({
        initialFlow: 'completion',
        initialWorkspace: task8WarmupWorkspace,
        initialReviewQuote: resolution.quote,
        initialAcquisitionResolution: resolution,
      }),
      play: async ({ canvasElement }) => {
        expect(resolution.status).toBe('ready');
        await expectTask8CommercialCompletionToFailClosed({
          canvasElement,
          heading: 'Warmup capacity added',
          source: 'Source: Managed warmup capacity',
        });
      },
    };
  })();

export const FirstWarmupCapacityModalCompletionRetainsSucceededGraph: Story =
  (() => {
    const targetSubscriptionId = 'subscription-managed-warmup';
    const proposal = requireTask8CapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [],
        mailboxes: [task8WarmupTargetMailbox],
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
      }),
    );
    const resolution = requireTask8AcceptedCapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [],
        mailboxes: [task8WarmupTargetMailbox],
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
        quote: acceptTask8Quote(proposal.quote),
      }),
    );
    const operation = createTask8SucceededWarmupCapacityAcquisition(resolution);

    return {
      name: 'First Warmup Capacity Modal Completion Retains Succeeded Graph',
      args: withTask8StoryArgs({
        initialWorkspace: task8WarmupWorkspace,
      }),
      play: async ({ canvasElement }) => {
        await waitForManagedEmailDesignReady(canvasElement);
        const canvas = within(canvasElement);
        const panel = await openManagedEmailSubscriptionPanel({
          canvasElement,
        });

        expectTask8NoCommercialCompletionEvidence(canvasElement);
        expect(
          canvas.queryByRole('heading', { name: 'Warmup capacity added' }),
        ).not.toBeInTheDocument();
        await userEvent.click(
          within(panel).getByRole('button', {
            name: 'Review warmup capacity purchase',
          }),
        );
        const review = await within(
          canvasElement.ownerDocument.body,
        ).findByRole('dialog', { name: 'Review warmup capacity purchase' });
        expect(
          within(review).getByLabelText('Warmup subscription intent'),
        ).toHaveTextContent('Create · 1 slot');
        expectWarmupCapacityQuote({ review, lineAmount: '$2.99' });
        await userEvent.click(
          within(review).getByRole('button', {
            name: 'Accept warmup capacity quote',
          }),
        );

        await expectTask8SucceededWarmupCapacityModalCompletion({
          canvasElement,
          operation,
        });

        expect(
          canvas.queryByRole('table', { name: 'Warmup-capacity mailbox' }),
        ).not.toBeInTheDocument();
        expect(
          canvas.queryByRole('button', {
            name: `Start warmup for ${task8WarmupTargetMailbox.address}`,
          }),
        ).not.toBeInTheDocument();
      },
    };
  })();

export const AdditionalWarmupCapacityModalCompletionRetainsSucceededGraph: Story =
  (() => {
    const targetSubscriptionId = 'subscription-managed-warmup';
    const mailbox = {
      ...task8WarmupTargetMailbox,
      warmupState: {
        assignment: 'assigned' as const,
        lastConfirmedProviderState: 'warming' as const,
        operation: { status: 'idle' as const },
      },
    };
    const subscription = createManagedEmailDesignRecurringSubscription({
      id: targetSubscriptionId,
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [
        {
          id: 'warmup-capacity-task8-completion-additional-001',
          kind: 'warmup-capacity',
          label: 'Existing warmup slot',
        },
      ],
      unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
      product: 'managed-warmup',
      cadence: 'monthly',
      quantity: 1,
      status: 'active',
      renewsAt: task8MonthlyRenewalAt,
    });
    const workspace = createTask7Workspace({
      mailboxes: [mailbox],
      subscriptions: [subscription],
    });
    const proposal = requireTask8CapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [subscription],
        mailboxes: [mailbox],
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
      }),
    );
    const resolution = requireTask8AcceptedCapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [subscription],
        mailboxes: [mailbox],
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
        quote: acceptTask8Quote(proposal.quote),
      }),
    );
    const operation = createTask8SucceededWarmupCapacityAcquisition(resolution);

    return {
      name: 'Additional Warmup Capacity Modal Completion Retains Succeeded Graph',
      args: withTask8StoryArgs({
        initialWorkspace: workspace,
      }),
      play: async ({ canvasElement }) => {
        await waitForManagedEmailDesignReady(canvasElement);
        const canvas = within(canvasElement);
        const panel = await openManagedEmailSubscriptionPanel({
          canvasElement,
        });

        expectTask8NoCommercialCompletionEvidence(canvasElement);
        const quantity = within(panel).getByRole('spinbutton', {
          name: 'Additional warmup slots',
        });
        await userEvent.clear(quantity);
        await userEvent.type(quantity, '1');
        await userEvent.click(
          within(panel).getByRole('button', {
            name: 'Review warmup capacity purchase',
          }),
        );
        const review = await within(
          canvasElement.ownerDocument.body,
        ).findByRole('dialog', { name: 'Review warmup capacity purchase' });
        expect(
          within(review).getByLabelText('Warmup subscription intent'),
        ).toHaveTextContent('Add to existing · 1 slot');
        expectWarmupCapacityQuote({ review, lineAmount: '$2.99' });
        await userEvent.click(
          within(review).getByRole('button', {
            name: 'Accept warmup capacity quote',
          }),
        );

        await expectTask8SucceededWarmupCapacityModalCompletion({
          canvasElement,
          operation,
        });

        expect(
          canvas.queryByRole('table', { name: 'Warmup-capacity mailbox' }),
        ).not.toBeInTheDocument();
        expect(
          canvas.queryByRole('button', {
            name: `Pause warmup for ${mailbox.address}`,
          }),
        ).not.toBeInTheDocument();
      },
    };
  })();

export const RecoveredWarmupCapacityModalCompletionRetainsSucceededGraph: Story =
  (() => {
    const targetSubscriptionId = 'subscription-managed-warmup';
    const mailboxes = [
      createTask7Mailbox({
        id: 'mailbox-task8-completion-recovered-avery-001',
        identity: 'Avery Miles',
        address: 'avery@completion-recovery.test',
        domain: 'completion-recovery.test',
        source: 'connected',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      createTask7Mailbox({
        id: 'mailbox-task8-completion-recovered-jordan-001',
        identity: 'Jordan Lee',
        address: 'jordan@completion-recovery.test',
        domain: 'completion-recovery.test',
        source: 'connected',
        warmupState: {
          assignment: 'unassigned',
          lastConfirmedProviderState: 'inactive',
          operation: { status: 'idle' },
        },
      }),
    ];
    const canceledSubscription = createManagedEmailDesignRecurringSubscription({
      id: 'subscription-task8-completion-recovered-history-001',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [
        {
          id: 'warmup-capacity-task8-completion-recovered-history-001',
          kind: 'warmup-capacity',
          label: 'Historical warmup slot 1',
        },
        {
          id: 'warmup-capacity-task8-completion-recovered-history-002',
          kind: 'warmup-capacity',
          label: 'Historical warmup slot 2',
        },
      ],
      unitPriceCents: 499,
      product: 'managed-warmup',
      cadence: 'monthly',
      quantity: 2,
      status: 'canceled',
      renewsAt: null,
      canceledAt: task8FixtureNow,
    });
    const workspace = createTask7Workspace({
      mailboxes,
      subscriptions: [canceledSubscription],
    });
    const proposal = requireTask8CapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [canceledSubscription],
        mailboxes,
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
      }),
    );
    const resolution = requireTask8AcceptedCapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: [canceledSubscription],
        mailboxes,
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
        quote: acceptTask8Quote(proposal.quote),
      }),
    );
    const operation = createTask8SucceededWarmupCapacityAcquisition(resolution);

    return {
      name: 'Recovered Warmup Capacity Modal Completion Retains Succeeded Graph',
      args: withTask8StoryArgs({
        initialWorkspace: workspace,
      }),
      play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const completionTargetMailbox = mailboxes[1]!;
        const readinessBeforeCapacityCompletion =
          completionTargetMailbox.readiness === 'ready' ? 'Ready' : 'Not ready';
        await waitForManagedEmailDesignReady(canvasElement);
        const initiatingRow = getMailboxRow({
          canvasElement,
          address: completionTargetMailbox.address,
        });
        await userEvent.click(
          within(initiatingRow).getByRole('button', {
            name: 'Review warmup capacity',
          }),
        );
        const panel = await within(canvasElement.ownerDocument.body).findByRole(
          'region',
          {
            name: 'Managed-email subscriptions',
          },
        );
        expect(panel).toBeVisible();

        expectTask8NoCommercialCompletionEvidence(canvasElement);
        await userEvent.click(
          within(panel).getByRole('button', {
            name: 'Recover warmup capacity',
          }),
        );
        const review = await within(
          canvasElement.ownerDocument.body,
        ).findByRole('dialog', { name: 'Review warmup capacity purchase' });
        expect(
          within(review).getByLabelText('Warmup subscription intent'),
        ).toHaveTextContent('Create · 2 slots');
        expectWarmupCapacityQuote({ review, lineAmount: '$5.98' });
        await userEvent.click(
          within(review).getByRole('button', {
            name: 'Accept warmup capacity quote',
          }),
        );

        await expectTask8SucceededWarmupCapacityModalCompletion({
          canvasElement,
          operation,
        });

        expect(
          within(
            canvas.getByRole('table', { name: 'Warmup-capacity mailbox' }),
          ).getByRole('columnheader', { name: 'Readiness' }),
        ).toBeVisible();
        const targetRow = getMailboxRow({
          canvasElement,
          address: completionTargetMailbox.address,
        });
        expect(
          within(targetRow).getByRole('button', {
            name: `Start warmup for ${completionTargetMailbox.address}`,
          }),
        ).toBeEnabled();
        await expectWarmupState({
          canvasElement,
          address: completionTargetMailbox.address,
          assignment: 'Unassigned',
          providerState: 'Inactive',
          operation: 'Idle',
        });
        expect(
          readWarmupRowOutput({
            canvasElement,
            address: completionTargetMailbox.address,
            label: `Warmup readiness for ${completionTargetMailbox.address}`,
          }),
        ).toBe(readinessBeforeCapacityCompletion);
      },
    };
  })();

export const DomainCancellationPending: Story = {
  name: 'Domain Cancellation Pending',
  args: {
    initialWorkspace: { ...mixedWorkspace },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const domain = 'northstar-outreach.com';
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Cancel renewal' });
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      {
        name: 'Cancel managed-domain renewal?',
      },
    );
    expect(dialog).toHaveTextContent(
      'This schedules cancellation effective Oct 12, 2027.',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel renewal' }),
    );

    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Cancels Oct 12, 2027',
        { exact: true },
      ),
    ).toBeVisible();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
  },
};

export const DomainCancellationUndo: Story = {
  name: 'Domain Cancellation Undo',
  args: {
    initialWorkspace: withPendingSubscriptionCancellation({
      workspace: mixedWorkspace,
      subscriptionId: 'subscription-managed-domain-northstar',
      cancelAt: '2027-10-12T00:00:00.000Z',
    }),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const domain = 'northstar-outreach.com';
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Undo cancellation' });

    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Renews Oct 12, 2027',
        { exact: true },
      ),
    ).toBeVisible();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
  },
};

export const PrewarmedDomainCancellationPending: Story = {
  name: 'Prewarmed Domain Cancellation Pending',
  args: {
    initialWorkspace: { ...mixedWorkspace },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const domain = 'fleetwave-mail.com';
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Cancel renewal' });
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      {
        name: 'Cancel managed-domain renewal?',
      },
    );
    expect(dialog).toHaveTextContent(
      'This schedules cancellation effective Jan 18, 2028.',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel renewal' }),
    );

    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Cancels Jan 18, 2028',
        { exact: true },
      ),
    ).toBeVisible();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
  },
};

export const PooledMailboxCancellationPending: Story = {
  name: 'Pooled Mailbox Cancellation Pending',
  args: {
    initialWorkspace: task8PooledCancellationWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const subscriptionId = task8PooledCancellationSubscriptionId;
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    const panel = await openManagedEmailSubscription({
      canvasElement,
      subscriptionId,
    });
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Cancel managed mailbox renewal',
      }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      {
        name: 'Cancel managed mailbox renewal?',
      },
    );
    for (const mailbox of task8PooledCancellationMailboxes) {
      expect(dialog).toHaveTextContent(
        `${mailbox.identity} <${mailbox.address}>`,
      );
    }
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel renewal' }),
    );

    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Pending cancellation');
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
  },
};

export const PooledMailboxCancellationUndo: Story = {
  name: 'Pooled Mailbox Cancellation Undo',
  args: {
    initialWorkspace: withPendingSubscriptionCancellation({
      workspace: task8PooledCancellationWorkspace,
      subscriptionId: task8PooledCancellationSubscriptionId,
      cancelAt: '2027-02-10T00:00:00.000Z',
    }),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const subscriptionId = task8PooledCancellationSubscriptionId;
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    const panel = await openManagedEmailSubscription({
      canvasElement,
      subscriptionId,
    });
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Undo managed mailbox cancellation',
      }),
    );

    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(
      within(panel).getByLabelText(
        `Subscription resource snapshots for ${subscriptionId}`,
      ),
    ).toHaveTextContent('Mira Chen <mira@northstar-outreach.com>');
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
  },
};

export const PooledWarmupCancellationPending: Story = {
  name: 'Pooled Warmup Cancellation Pending',
  args: {
    initialWorkspace: task8PooledCancellationWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const subscriptionId = 'subscription-managed-warmup';
    const panel = await openManagedEmailSubscription({
      canvasElement,
      subscriptionId,
    });
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Cancel managed warmup renewal',
      }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      {
        name: 'Cancel managed warmup renewal?',
      },
    );
    expect(dialog).toHaveTextContent('Mira Chen <mira@northstar-outreach.com>');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel renewal' }),
    );

    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Pending cancellation');
    expect(readWarmupCapacityText(canvasElement)).toBe(
      'Warmup capacity: 1 of 0 assigned · 0 slots available.',
    );
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
  },
};

export const PooledWarmupCancellationUndo: Story = {
  name: 'Pooled Warmup Cancellation Undo',
  args: {
    initialWorkspace: withPendingSubscriptionCancellation({
      workspace: task8PooledCancellationWorkspace,
      subscriptionId: 'subscription-managed-warmup',
      cancelAt: '2027-02-10T00:00:00.000Z',
    }),
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const subscriptionId = 'subscription-managed-warmup';
    const panel = await openManagedEmailSubscription({
      canvasElement,
      subscriptionId,
    });
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Undo managed warmup cancellation',
      }),
    );

    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(readWarmupCapacityText(canvasElement)).toBe(
      'Warmup capacity: 1 of 1 assigned · 0 slots available.',
    );
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
  },
};

export const DomainCancellationEffective: Story = {
  name: 'Domain Cancellation Effective',
  args: {
    initialWorkspace: { ...mixedWorkspace },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const domain = 'northstar-outreach.com';
    const subscriptionId = 'subscription-managed-domain-northstar';
    const domainTable = within(canvasElement).getByRole('table', {
      name: 'Managed email domains',
    });

    expect(
      within(domainTable).getByText(domain, { exact: true }),
    ).toBeVisible();
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Cancel renewal' });
    const cancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed-domain renewal?',
    });
    expect(cancellationDialog).toHaveTextContent(
      'This schedules cancellation effective Oct 12, 2027.',
    );
    await userEvent.click(
      within(cancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );
    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Cancels Oct 12, 2027',
        { exact: true },
      ),
    ).toBeVisible();
    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    const subscriptions = within(panel).getByRole('list', {
      name: 'Managed-email subscriptions',
    });

    expect(
      within(subscriptions).getByText(subscriptionId, { exact: true }),
    ).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', {
        name: `Manage subscription ${subscriptionId}`,
      }),
    );
    expect(
      within(panel).getByLabelText('Selected managed-email subscription'),
    ).toHaveTextContent(subscriptionId);
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Pending cancellation');
    expect(
      within(panel).getByLabelText(
        `Subscription cadence for ${subscriptionId}`,
      ),
    ).toHaveTextContent('Annual');
    expect(
      within(panel).getByLabelText(
        `Subscription resource snapshots for ${subscriptionId}`,
      ),
    ).toHaveTextContent(domain);
    expect(
      within(panel).getByRole('button', {
        name: 'Undo managed domain cancellation',
      }),
    ).toBeEnabled();
    expect(
      within(panel).getByRole('button', {
        name: 'Apply managed domain cancellation effective Oct 12, 2027',
      }),
    ).toBeEnabled();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });

    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Undo cancellation' });
    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Renews Oct 12, 2027',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(
      within(panel).getByRole('button', {
        name: `Cancel renewal for ${subscriptionId}`,
      }),
    ).toBeEnabled();

    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Cancel renewal' });
    await userEvent.click(
      within(
        await within(canvasElement.ownerDocument.body).findByRole('dialog', {
          name: 'Cancel managed-domain renewal?',
        }),
      ).getByRole('button', { name: 'Cancel renewal' }),
    );
    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({
      canvasElement,
      name: 'Apply cancellation effective Oct 12, 2027',
    });
    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Canceled on Oct 12, 2027',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Canceled');
    expect(
      within(panel).getByLabelText(
        `Subscription renewal for ${subscriptionId}`,
      ),
    ).toHaveTextContent('No renewal');
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
  },
};

export const PrewarmedDomainCancellationEffective: Story = {
  name: 'Prewarmed Domain Cancellation Effective',
  args: {
    initialWorkspace: { ...mixedWorkspace },
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const domain = 'fleetwave-mail.com';
    const subscriptionId = 'subscription-prewarmed-domain-fleetwave';
    const domainTable = within(canvasElement).getByRole('table', {
      name: 'Managed email domains',
    });

    expect(
      within(domainTable).getByText(domain, { exact: true }),
    ).toBeVisible();
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    await expectWarmupState({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Cancel renewal' });
    const cancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed-domain renewal?',
    });
    expect(cancellationDialog).toHaveTextContent(
      'This schedules cancellation effective Jan 18, 2028.',
    );
    await userEvent.click(
      within(cancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );
    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Cancels Jan 18, 2028',
        { exact: true },
      ),
    ).toBeVisible();
    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    const subscriptions = within(panel).getByRole('list', {
      name: 'Managed-email subscriptions',
    });

    expect(
      within(subscriptions).getByText(subscriptionId, { exact: true }),
    ).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', {
        name: `Manage subscription ${subscriptionId}`,
      }),
    );
    expect(
      within(panel).getByLabelText('Selected managed-email subscription'),
    ).toHaveTextContent(subscriptionId);
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Pending cancellation');
    expect(
      within(panel).getByLabelText(
        `Subscription cadence for ${subscriptionId}`,
      ),
    ).toHaveTextContent('Annual');
    expect(
      within(panel).getByLabelText(
        `Subscription resource snapshots for ${subscriptionId}`,
      ),
    ).toHaveTextContent(domain);
    expect(
      within(panel).getByRole('button', {
        name: 'Undo managed domain cancellation',
      }),
    ).toBeEnabled();
    expect(
      within(panel).getByRole('button', {
        name: 'Apply managed domain cancellation effective Jan 18, 2028',
      }),
    ).toBeEnabled();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    await expectWarmupState({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });

    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Undo cancellation' });
    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Renews Jan 18, 2028',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(
      within(panel).getByRole('button', {
        name: `Cancel renewal for ${subscriptionId}`,
      }),
    ).toBeEnabled();

    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({ canvasElement, name: 'Cancel renewal' });
    await userEvent.click(
      within(
        await within(canvasElement.ownerDocument.body).findByRole('dialog', {
          name: 'Cancel managed-domain renewal?',
        }),
      ).getByRole('button', { name: 'Cancel renewal' }),
    );
    await openDomainActions({ canvasElement, domain });
    await clickStoryButton({
      canvasElement,
      name: 'Apply cancellation effective Jan 18, 2028',
    });
    expect(
      within(getDomainRow({ canvasElement, domain })).getByText(
        'Canceled on Jan 18, 2028',
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Canceled');
    expect(
      within(panel).getByLabelText(
        `Subscription renewal for ${subscriptionId}`,
      ),
    ).toHaveTextContent('No renewal');
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    await expectWarmupState({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
  },
};

export const PooledMailboxCancellationEffective: Story = {
  name: 'Pooled Mailbox Cancellation Effective',
  args: {
    initialWorkspace: task8PooledCancellationWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const subscriptionId = 'subscription-task8-pooled-cancellation-001';
    const mailboxTable = within(canvasElement).getByRole('table', {
      name: 'Managed email mailboxes',
    });

    for (const address of [
      'mira@northstar-outreach.com',
      'avery@fleetwave-mail.com',
    ]) {
      expect(
        within(mailboxTable).getByText(address, { exact: true }),
      ).toBeVisible();
    }
    const resourceCountBefore = readMailboxResourceCount(canvasElement);
    const poolSignatureBefore = readMailboxPoolSignature(canvasElement);
    const documentCanvas = within(canvasElement.ownerDocument.body);
    const managedMailboxActionTrigger = within(
      getMailboxRow({
        canvasElement,
        address: 'mira@northstar-outreach.com',
      }),
    ).getByRole('button', {
      name: 'More actions for mira@northstar-outreach.com',
    });
    const prewarmedMailboxActionTrigger = within(
      getMailboxRow({
        canvasElement,
        address: 'avery@fleetwave-mail.com',
      }),
    ).getByRole('button', {
      name: 'More actions for avery@fleetwave-mail.com',
    });

    await openMailboxActions({
      canvasElement,
      address: 'mira@northstar-outreach.com',
    });
    expect(managedMailboxActionTrigger).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      documentCanvas.queryByRole('button', { name: /cancel/i }),
    ).not.toBeInTheDocument();
    expect(
      documentCanvas.getByRole('button', {
        name: 'Manage mailbox capacity',
      }),
    ).toBeEnabled();

    await openMailboxActions({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
    });
    expect(managedMailboxActionTrigger).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(prewarmedMailboxActionTrigger).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      documentCanvas.queryByRole('button', { name: /cancel/i }),
    ).not.toBeInTheDocument();
    expect(
      documentCanvas.getByRole('button', {
        name: 'Manage mailbox capacity',
      }),
    ).toBeEnabled();
    prewarmedMailboxActionTrigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(prewarmedMailboxActionTrigger).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    const subscriptions = within(panel).getByRole('list', {
      name: 'Managed-email subscriptions',
    });

    expect(
      within(subscriptions).getByText(subscriptionId, { exact: true }),
    ).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', {
        name: `Manage subscription ${subscriptionId}`,
      }),
    );
    expect(
      within(panel).getByLabelText('Selected managed-email subscription'),
    ).toHaveTextContent(subscriptionId);
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(
      within(panel).getByLabelText(
        `Subscription cadence for ${subscriptionId}`,
      ),
    ).toHaveTextContent('Monthly');
    expect(
      within(panel).getByLabelText(
        `Subscription quantity for ${subscriptionId}`,
      ),
    ).toHaveTextContent('2');
    const resourceSnapshots = within(panel).getByLabelText(
      `Subscription resource snapshots for ${subscriptionId}`,
    );

    expect(resourceSnapshots).toHaveTextContent(
      'Mira Chen <mira@northstar-outreach.com>',
    );
    expect(resourceSnapshots).toHaveTextContent(
      'Avery Miles <avery@fleetwave-mail.com>',
    );
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Cancel managed mailbox renewal',
      }),
    );
    const cancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed mailbox renewal?',
    });
    expect(cancellationDialog).toHaveTextContent(
      'Mira Chen <mira@northstar-outreach.com>',
    );
    expect(cancellationDialog).toHaveTextContent(
      'Avery Miles <avery@fleetwave-mail.com>',
    );
    await userEvent.click(
      within(cancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Pending cancellation');
    expect(
      within(panel).getByRole('button', {
        name: 'Undo managed mailbox cancellation',
      }),
    ).toBeEnabled();
    expect(
      within(panel).getByRole('button', {
        name: 'Apply managed mailbox cancellation effective Feb 10, 2027',
      }),
    ).toBeEnabled();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(
      poolSignatureBefore.replace(':active:', ':pending-cancel:'),
    );

    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Undo managed mailbox cancellation',
      }),
    );
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(readMailboxPoolSignature(canvasElement)).toBe(poolSignatureBefore);
    expect(
      within(panel).getByRole('button', {
        name: 'Cancel managed mailbox renewal',
      }),
    ).toBeEnabled();

    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Cancel managed mailbox renewal',
      }),
    );
    await userEvent.click(
      within(
        await within(canvasElement.ownerDocument.body).findByRole('dialog', {
          name: 'Cancel managed mailbox renewal?',
        }),
      ).getByRole('button', { name: 'Cancel renewal' }),
    );
    await userEvent.click(
      within(panel).getByRole('button', {
        name: `Apply managed mailbox cancellation effective Feb 10, 2027`,
      }),
    );
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Canceled');
    expect(
      within(panel).getByRole('button', {
        name: 'Add another managed mailbox',
      }),
    ).toBeEnabled();
    expect(readMailboxResourceCount(canvasElement)).toBe(resourceCountBefore);
    expect(readMailboxPoolSignature(canvasElement)).toBe(
      poolSignatureBefore.replace(':active:', ':canceled:'),
    );
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await expectWarmupState({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
  },
};

export const PooledWarmupCancellationEffective: Story = {
  name: 'Pooled Warmup Cancellation Effective',
  args: {
    initialWorkspace: task8PooledCancellationWorkspace,
  },
  play: async ({ canvasElement }) => {
    await waitForManagedEmailDesignReady(canvasElement);

    const subscriptionId = 'subscription-managed-warmup';
    const mailboxTable = within(canvasElement).getByRole('table', {
      name: 'Managed email mailboxes',
    });

    expect(
      within(mailboxTable).getByText('mira@northstar-outreach.com', {
        exact: true,
      }),
    ).toBeVisible();
    const capacityBefore = readWarmupCapacityText(canvasElement);
    const panel = await openManagedEmailSubscriptionPanel({
      canvasElement,
    });
    const subscriptions = within(panel).getByRole('list', {
      name: 'Managed-email subscriptions',
    });

    expect(
      within(subscriptions).getByText(subscriptionId, { exact: true }),
    ).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', {
        name: `Manage subscription ${subscriptionId}`,
      }),
    );
    expect(
      within(panel).getByLabelText('Selected managed-email subscription'),
    ).toHaveTextContent(subscriptionId);
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(
      within(panel).getByLabelText(
        `Subscription cadence for ${subscriptionId}`,
      ),
    ).toHaveTextContent('Monthly');
    expect(
      within(panel).getByLabelText(
        `Subscription quantity for ${subscriptionId}`,
      ),
    ).toHaveTextContent('1');
    expect(
      within(panel).getByLabelText(
        `Subscription resource snapshots for ${subscriptionId}`,
      ),
    ).toHaveTextContent('Warmup slot 1');
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Cancel managed warmup renewal',
      }),
    );
    const cancellationDialog = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', {
      name: 'Cancel managed warmup renewal?',
    });
    expect(cancellationDialog).toHaveTextContent(
      'Mira Chen <mira@northstar-outreach.com>',
    );
    await userEvent.click(
      within(cancellationDialog).getByRole('button', {
        name: 'Cancel renewal',
      }),
    );
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Pending cancellation');
    expect(
      within(panel).getByRole('button', {
        name: 'Undo managed warmup cancellation',
      }),
    ).toBeEnabled();
    expect(
      within(panel).getByRole('button', {
        name: 'Apply managed warmup cancellation effective Feb 10, 2027',
      }),
    ).toBeEnabled();
    expect(readWarmupCapacityText(canvasElement)).toBe(
      'Warmup capacity: 1 of 0 assigned · 0 slots available.',
    );
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });

    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Undo managed warmup cancellation',
      }),
    );
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Active');
    expect(readWarmupCapacityText(canvasElement)).toBe(capacityBefore);
    expect(
      within(panel).getByRole('button', {
        name: 'Cancel managed warmup renewal',
      }),
    ).toBeEnabled();

    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Cancel managed warmup renewal',
      }),
    );
    await userEvent.click(
      within(
        await within(canvasElement.ownerDocument.body).findByRole('dialog', {
          name: 'Cancel managed warmup renewal?',
        }),
      ).getByRole('button', { name: 'Cancel renewal' }),
    );
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Apply managed warmup cancellation effective Feb 10, 2027',
      }),
    );
    expect(
      within(panel).getByLabelText(`Subscription status for ${subscriptionId}`),
    ).toHaveTextContent('Canceled');
    expect(
      within(panel).getByRole('button', {
        name: 'Recover warmup capacity',
      }),
    ).toBeEnabled();
    expect(readWarmupCapacityText(canvasElement)).toBe(
      'Warmup capacity: 1 of 0 assigned · 0 slots available.',
    );
    await expectWarmupState({
      canvasElement,
      address: 'mira@northstar-outreach.com',
      assignment: 'Assigned',
      providerState: 'Warming',
      operation: 'Idle',
    });
    await expectWarmupState({
      canvasElement,
      address: 'avery@fleetwave-mail.com',
      assignment: 'Unassigned',
      providerState: 'Inactive',
      operation: 'Idle',
    });
  },
};

export const PrewarmedUnknownFulfillmentMaterializesIndependentDomain: Story =
  (() => {
    const [unknownMailbox, completedMailbox, extraMailbox] =
      task8PrewarmedBundle.mailboxIdentities;

    if (
      unknownMailbox === undefined ||
      completedMailbox === undefined ||
      extraMailbox !== undefined
    ) {
      throw new Error(
        'Expected exactly two Task 8 prewarmed mailboxes for unknown fulfillment.',
      );
    }

    const quote = createTask8PrewarmedQuote({
      id: 'quote-task8-prewarmed-unknown-fulfillment-001',
      bundle: task8PrewarmedBundle,
      accepted: true,
    });
    const operation = createTask8PrewarmedAcquisition({
      id: 'acquisition-task8-prewarmed-unknown-fulfillment-001',
      quote,
      bundle: task8PrewarmedBundle,
      mailboxPoolMode: 'create',
      mailboxPaymentOutcomes: ['unknown', 'completed'],
    });

    if (operation.status !== 'reconciliation-required') {
      throw new Error(
        'Expected unknown Task 8 prewarmed fulfillment to require reconciliation.',
      );
    }

    const domainSubscriptionId = `subscription-${operation.id}-domain`;
    const mailboxSubscriptionId = `subscription-${operation.id}-mailbox`;
    const initialWorkspace = {
      domains: [],
      mailboxes: [],
      prewarmedBundles: [task8PrewarmedBundle],
      subscriptions: [],
    } satisfies ManagedEmailDesignWorkspace;

    return {
      name: 'Prewarmed Unknown Fulfillment Materializes Independent Domain',
      args: withTask8StoryArgs({
        initialFlow: 'review',
        initialWorkspace,
        initialReviewDraft: task8PrewarmedReviewDraft,
        initialReviewQuote: quote,
        initialAcquisitionOperation: operation,
        initialAcquisitionReconcileOutcomes: ['unknown', 'completed'] as Array<
          'unknown' | 'failed' | 'completed'
        >,
      }),
      play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        expect(
          await canvas.findByRole('heading', {
            name: 'Payment status needs reconciliation',
          }),
        ).toBeVisible();
        expect(
          canvas.getAllByText(`Purchase reference: ${operation.id}`, {
            exact: true,
          }),
        ).toHaveLength(1);
        const initialIdentity = expectTask8AcquisitionIdentityProjection({
          canvasElement,
          operation,
        });
        const fulfillment = canvas.getByRole('table', {
          name: 'Prewarmed fulfillment progress',
        });
        const domainRow = within(fulfillment).getByRole('row', {
          name: new RegExp(`^${task8PrewarmedBundle.domain}\\s`),
        });
        const unknownMailboxRow = within(fulfillment).getByRole('row', {
          name: new RegExp(unknownMailbox.address),
        });
        const completedMailboxRow = within(fulfillment).getByRole('row', {
          name: new RegExp(completedMailbox.address),
        });

        expect(within(fulfillment).getAllByRole('row')).toHaveLength(4);
        expect(domainRow).toHaveTextContent('No dependency');
        expect(domainRow).toHaveTextContent('Payment Completed');
        expect(domainRow).toHaveTextContent('Subscription Completed');
        expect(domainRow).toHaveTextContent('Resource Completed');
        expect(unknownMailboxRow).toHaveTextContent(
          'Domain dependency Completed',
        );
        expect(unknownMailboxRow).toHaveTextContent('Payment Unknown');
        expect(unknownMailboxRow).toHaveTextContent(
          'Pooled subscription Blocked',
        );
        expect(unknownMailboxRow).toHaveTextContent('Resource Blocked');
        expect(completedMailboxRow).toHaveTextContent(
          'Domain dependency Completed',
        );
        expect(completedMailboxRow).toHaveTextContent('Payment Completed');
        expect(completedMailboxRow).toHaveTextContent(
          'Pooled subscription Blocked',
        );
        expect(completedMailboxRow).toHaveTextContent('Resource Blocked');
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('2');
        expect(
          canvas.getByRole('button', { name: 'Reconcile payment result' }),
        ).toBeEnabled();
        expect(
          canvas.getByRole('button', { name: 'Complete locally — $24.29' }),
        ).toBeDisabled();

        await userEvent.click(
          canvas.getByRole('button', { name: 'Cancel review' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Managed email resources',
          }),
        ).toBeVisible();

        const materializedDomainRow = await waitFor(() => {
          const row = getDomainRow({
            canvasElement,
            domain: task8PrewarmedBundle.domain,
          });

          expect(
            within(row).getByText(task8PrewarmedBundle.domain, {
              exact: true,
            }),
          ).toBeVisible();

          return row;
        });
        expect(materializedDomainRow).toHaveTextContent('Prewarmed bundle');
        expect(materializedDomainRow).toHaveTextContent('Verified');
        expect(materializedDomainRow).toHaveTextContent('Active');
        expect(readMailboxResourceCount(canvasElement)).toBe(0);
        for (const mailbox of [unknownMailbox, completedMailbox]) {
          expect(
            canvas.queryByText(mailbox.address, { exact: true }),
          ).not.toBeInTheDocument();
        }

        const subscriptionPanel = await openManagedEmailSubscriptionPanel({
          canvasElement,
          actionName: 'Manage subscriptions',
        });
        expect(
          within(subscriptionPanel).getByText(domainSubscriptionId, {
            exact: true,
          }),
        ).toBeVisible();
        expect(
          within(subscriptionPanel).queryByText(mailboxSubscriptionId, {
            exact: true,
          }),
        ).not.toBeInTheDocument();
        await userEvent.click(
          within(subscriptionPanel).getByRole('button', {
            name: `Manage subscription ${domainSubscriptionId}`,
          }),
        );
        expect(
          within(subscriptionPanel).getByLabelText(
            `Subscription resource snapshots for ${domainSubscriptionId}`,
          ),
        ).toHaveTextContent(task8PrewarmedBundle.domain);
        await userEvent.click(
          within(subscriptionPanel).getByRole('button', {
            name: 'Back to email infrastructure',
          }),
        );
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );

        await userEvent.click(
          canvas.getByRole('button', { name: 'Reset local prototype' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Payment status needs reconciliation',
          }),
        ).toBeVisible();
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );

        await userEvent.click(
          canvas.getByRole('button', { name: 'Reconcile payment result' }),
        );
        await waitFor(() => {
          expect(
            canvas.getByRole('heading', {
              name: 'Payment status needs reconciliation',
            }),
          ).toBeVisible();
          expect(
            within(
              canvas.getByRole('table', {
                name: 'Prewarmed fulfillment progress',
              }),
            ).getByRole('row', {
              name: new RegExp(unknownMailbox.address),
            }),
          ).toHaveTextContent('Payment Unknown');
          expect(
            within(
              canvas.getByRole('table', {
                name: 'Prewarmed fulfillment progress',
              }),
            ).getByRole('row', {
              name: new RegExp(`^${task8PrewarmedBundle.domain}\\s`),
            }),
          ).toHaveTextContent('Resource Completed');
          expect(
            within(
              canvas.getByRole('table', {
                name: 'Prewarmed fulfillment progress',
              }),
            ).getByRole('row', {
              name: new RegExp(completedMailbox.address),
            }),
          ).toHaveTextContent('Payment Completed');
          expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
            initialIdentity,
          );
        });

        await userEvent.click(
          canvas.getByRole('button', { name: 'Reconcile payment result' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Prewarmed mailboxes acquired',
          }),
        ).toBeVisible();
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );
        const completedResources = canvas.getByRole('list', {
          name: 'Completed local resources',
        });
        expect(
          within(completedResources).getAllByRole('listitem'),
        ).toHaveLength(3);
        expect(
          within(completedResources).getByText(task8PrewarmedBundle.domain, {
            exact: true,
          }),
        ).toBeVisible();
        for (const mailbox of [unknownMailbox, completedMailbox]) {
          expect(
            within(completedResources).getByText(mailbox.address, {
              exact: true,
            }),
          ).toBeVisible();
        }
        expect(readMailboxResourceCount(canvasElement)).toBe(2);
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('3');
      },
    };
  })();

export const PrewarmedMixedFailedUnknownRecovery: Story = (() => {
  const [failedMailbox, unknownMailbox, extraMailbox] =
    task8PrewarmedBundle.mailboxIdentities;

  if (
    failedMailbox === undefined ||
    unknownMailbox === undefined ||
    extraMailbox !== undefined
  ) {
    throw new Error(
      'Expected exactly two Task 8 prewarmed mailboxes for mixed recovery.',
    );
  }

  const quote = createTask8PrewarmedQuote({
    id: 'quote-task8-prewarmed-mixed-recovery-001',
    bundle: task8PrewarmedBundle,
    accepted: true,
  });
  const operation = createTask8PrewarmedAcquisition({
    id: 'acquisition-task8-prewarmed-mixed-recovery-001',
    quote,
    bundle: task8PrewarmedBundle,
    mailboxPoolMode: 'create',
    mailboxPaymentOutcomes: ['failed', 'unknown'],
  });

  if (operation.status !== 'reconciliation-required') {
    throw new Error(
      'Expected mixed failed and unknown acquisition evidence to require reconciliation.',
    );
  }

  return {
    name: 'Prewarmed Mixed Failed Unknown Recovery',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: {
        domains: [],
        mailboxes: [],
        prewarmedBundles: [task8PrewarmedBundle],
        subscriptions: [],
      },
      initialReviewDraft: task8PrewarmedReviewDraft,
      initialReviewQuote: quote,
      initialAcquisitionOperation: operation,
      initialAcquisitionReconcileOutcome: 'completed',
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const fulfillment = await canvas.findByRole('table', {
        name: 'Prewarmed fulfillment progress',
      });
      const failedMailboxRow = within(fulfillment).getByRole('row', {
        name: new RegExp(failedMailbox.address),
      });
      const unknownMailboxRow = within(fulfillment).getByRole('row', {
        name: new RegExp(unknownMailbox.address),
      });

      expect(
        canvas.getByRole('heading', {
          name: 'Payment status needs reconciliation',
        }),
      ).toBeVisible();
      expect(failedMailboxRow).toHaveTextContent('Payment Failed');
      expect(unknownMailboxRow).toHaveTextContent('Payment Unknown');
      expect(
        canvas.getByLabelText('Recorded local charge count'),
      ).toHaveTextContent('1');

      await userEvent.click(
        canvas.getByRole('button', { name: 'Reconcile payment result' }),
      );
      await waitFor(() => {
        expect(failedMailboxRow).toHaveTextContent('Payment Failed');
        expect(unknownMailboxRow).toHaveTextContent('Payment Completed');
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('2');
      });

      await userEvent.click(
        canvas.getByRole('button', { name: 'Retry same operation' }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Prewarmed mailboxes acquired',
        }),
      ).toBeVisible();
      expect(
        canvas.getByLabelText('Recorded local charge count'),
      ).toHaveTextContent('3');
    },
  };
})();

export const CompleteWarmupCapacityForSelectedReviewMailbox: Story = (() => {
  const firstMailbox = createTask7Mailbox({
    id: 'mailbox-task8-warmup-completion-first-001',
    identity: 'First Mailbox',
    address: 'first@warmup-selection.test',
    domain: 'warmup-selection.test',
    source: 'connected',
  });
  const selectedMailbox = createTask7Mailbox({
    id: 'mailbox-task8-warmup-completion-selected-002',
    identity: 'Selected Mailbox',
    address: 'selected@warmup-selection.test',
    domain: 'warmup-selection.test',
    source: 'connected',
  });
  const workspace = createTask7Workspace({
    mailboxes: [firstMailbox, selectedMailbox],
    subscriptions: [],
  });
  const targetSubscriptionId =
    'subscription-task8-warmup-completion-selected-002';
  const resolution = acceptTask8CapacityResolution(
    requireTask8CapacityResolution(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: 'workspace-managed-email-design',
        subscriptions: workspace.subscriptions,
        mailboxes: workspace.mailboxes,
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: task8FixtureNow,
      }),
    ),
  );
  const reviewDraft = {
    ...createManagedMailboxReview({
      address: selectedMailbox.address,
      domain: selectedMailbox.domain,
    }),
    selectedMailbox: selectedMailbox.address.toUpperCase(),
  } satisfies ManagedEmailDesignReviewDraft;

  return {
    name: 'Complete Warmup Capacity For Selected Review Mailbox',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: workspace,
      initialReviewDraft: reviewDraft,
      initialReviewQuote: resolution.quote,
      initialAcquisitionResolution: resolution,
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await waitForManagedEmailDesignReady(canvasElement);

      await userEvent.click(
        canvas.getByRole('button', { name: 'Complete locally — $2.99' }),
      );
      expect(
        await canvas.findByRole('heading', {
          name: 'Warmup capacity added',
        }),
      ).toBeVisible();

      const completionTable = canvas.getByRole('table', {
        name: 'Warmup-capacity mailbox',
      });
      const [completionRow] = within(
        within(completionTable).getByRole('rowgroup'),
      ).getAllByRole('row');
      expect(completionRow).toBeDefined();
      expect(within(completionTable).getAllByRole('row')).toHaveLength(2);
      expect(
        within(completionRow!).getByText(selectedMailbox.address, {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        within(completionTable).queryByText(firstMailbox.address, {
          exact: true,
        }),
      ).not.toBeInTheDocument();
      expect(
        within(completionRow!).getByRole('button', {
          name: `Start warmup for ${selectedMailbox.address}`,
        }),
      ).toBeEnabled();
      expect(
        within(completionTable).queryByRole('button', {
          name: `Start warmup for ${firstMailbox.address}`,
        }),
      ).not.toBeInTheDocument();
    },
  };
})();

export const RetryFailedWarmupSubscriptionWithStableIdentities: Story = (() => {
  const quote = task8AcceptedFirstWarmupResolution.quote;
  const intent = task8AcceptedFirstWarmupResolution.intent;
  const operation = createTask8SingleLineAcquisition({
    id: 'acquisition-task8-warmup-subscription-failed-001',
    source: 'managed-warmup',
    quote,
    intent,
    resourceSnapshot: {
      id: intent.resourceSnapshotIds[0],
      kind: 'warmup-capacity',
      label: '1 new warmup slot',
    },
    settledSubscriptionOutcome: 'failed',
  });

  if (operation.status !== 'partial') {
    throw new Error(
      'Expected a failed warmup subscription after completed payment to be partial.',
    );
  }

  return {
    name: 'Retry Failed Warmup Subscription With Stable Identities',
    args: withTask8StoryArgs({
      initialFlow: 'review',
      initialWorkspace: task8WarmupWorkspace,
      initialReviewDraft: createManagedMailboxReview({
        address: task8WarmupTargetMailbox.address,
        domain: task8WarmupTargetMailbox.domain,
      }),
      initialReviewQuote: quote,
      initialAcquisitionResolution: task8AcceptedFirstWarmupResolution,
      initialAcquisitionOperation: operation,
    }),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const address = task8WarmupTargetMailbox.address;

      expect(operation.lines).toEqual([
        expect.objectContaining({
          paymentOutcome: 'completed',
          resourceOutcome: 'blocked',
        }),
      ]);
      expect(operation.subscriptionOperations).toEqual([
        expect.objectContaining({ outcome: 'failed' }),
      ]);
      expect(
        await canvas.findByRole('heading', {
          name: 'Subscription could not be completed',
        }),
      ).toBeVisible();
      expect(
        canvas.queryByRole('heading', {
          name: 'Payment could not be completed',
        }),
      ).not.toBeInTheDocument();
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Acquisition operation status',
        }),
      ).toBe('Partially completed');
      const initialIdentity = expectTask8AcquisitionIdentityProjection({
        canvasElement,
        operation,
      });
      expect(
        canvas.getByRole('button', {
          name: 'Complete locally — $2.99',
        }),
      ).toBeDisabled();
      expect(
        canvas.getByRole('button', { name: 'Retry same operation' }),
      ).toBeEnabled();

      await userEvent.click(
        canvas.getByRole('button', { name: 'Retry same operation' }),
      );

      expect(
        await canvas.findByRole('heading', {
          name: 'Warmup capacity added',
        }),
      ).toBeVisible();
      expect(
        readStoryOutput({
          canvasElement,
          label: 'Acquisition operation status',
        }),
      ).toBe('Succeeded');
      expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
        initialIdentity,
      );
      expect(
        canvas.getByLabelText('Recorded local charge count'),
      ).toHaveTextContent('1');

      await pressFocusedButton(
        canvas.getByRole('button', { name: 'Return to dashboard' }),
      );
      await expectWarmupCapacity({
        canvasElement,
        expected: '0 of 1 assigned · 1 slot available',
      });
      await expectWarmupState({
        canvasElement,
        address,
        assignment: 'Unassigned',
        providerState: 'Inactive',
        operation: 'Idle',
      });
    },
  };
})();

export const ReconcileUnknownWarmupSubscriptionWithStableIdentities: Story =
  (() => {
    const quote = task8AcceptedFirstWarmupResolution.quote;
    const intent = task8AcceptedFirstWarmupResolution.intent;
    const operation = createTask8SingleLineAcquisition({
      id: 'acquisition-task8-warmup-subscription-unknown-001',
      source: 'managed-warmup',
      quote,
      intent,
      resourceSnapshot: {
        id: intent.resourceSnapshotIds[0],
        kind: 'warmup-capacity',
        label: '1 new warmup slot',
      },
      settledSubscriptionOutcome: 'unknown',
    });

    if (operation.status !== 'reconciliation-required') {
      throw new Error(
        'Expected an unknown warmup subscription after completed payment to require reconciliation.',
      );
    }

    return {
      name: 'Reconcile Unknown Warmup Subscription With Stable Identities',
      args: withTask8StoryArgs({
        initialFlow: 'review',
        initialWorkspace: task8WarmupWorkspace,
        initialReviewDraft: createManagedMailboxReview({
          address: task8WarmupTargetMailbox.address,
          domain: task8WarmupTargetMailbox.domain,
        }),
        initialReviewQuote: quote,
        initialAcquisitionResolution: task8AcceptedFirstWarmupResolution,
        initialAcquisitionOperation: operation,
        initialAcquisitionReconcileOutcomes: ['completed'] as Array<
          'unknown' | 'failed' | 'completed'
        >,
      }),
      play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const address = task8WarmupTargetMailbox.address;

        expect(operation.lines).toEqual([
          expect.objectContaining({
            paymentOutcome: 'completed',
            resourceOutcome: 'blocked',
          }),
        ]);
        expect(operation.subscriptionOperations).toEqual([
          expect.objectContaining({ outcome: 'unknown' }),
        ]);
        expect(
          await canvas.findByRole('heading', {
            name: 'Subscription status needs reconciliation',
          }),
        ).toBeVisible();
        expect(
          canvas.queryByRole('heading', {
            name: 'Payment status needs reconciliation',
          }),
        ).not.toBeInTheDocument();
        expect(
          readStoryOutput({
            canvasElement,
            label: 'Acquisition operation status',
          }),
        ).toBe('Reconciliation required');
        const initialIdentity = expectTask8AcquisitionIdentityProjection({
          canvasElement,
          operation,
        });
        expect(
          canvas.getByRole('button', {
            name: 'Complete locally — $2.99',
          }),
        ).toBeDisabled();
        expect(
          canvas.getByRole('button', {
            name: 'Reconcile subscription result',
          }),
        ).toBeEnabled();

        await userEvent.click(
          canvas.getByRole('button', {
            name: 'Reconcile subscription result',
          }),
        );

        expect(
          await canvas.findByRole('heading', {
            name: 'Warmup capacity added',
          }),
        ).toBeVisible();
        expect(
          readStoryOutput({
            canvasElement,
            label: 'Acquisition operation status',
          }),
        ).toBe('Succeeded');
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('1');

        await pressFocusedButton(
          canvas.getByRole('button', { name: 'Return to dashboard' }),
        );
        await expectWarmupCapacity({
          canvasElement,
          expected: '0 of 1 assigned · 1 slot available',
        });
        await expectWarmupState({
          canvasElement,
          address,
          assignment: 'Unassigned',
          providerState: 'Inactive',
          operation: 'Idle',
        });
      },
    };
  })();

export const RetryFailedPrewarmedPooledSubscriptionWithStableIdentities: Story =
  (() => {
    const [firstMailbox, secondMailbox, extraMailbox] =
      task8PrewarmedBundle.mailboxIdentities;

    if (
      firstMailbox === undefined ||
      secondMailbox === undefined ||
      extraMailbox !== undefined
    ) {
      throw new Error(
        'Expected exactly two Task 8 prewarmed mailboxes for failed pooled subscription recovery.',
      );
    }

    const quote = createTask8PrewarmedQuote({
      id: 'quote-task8-prewarmed-subscription-failed-001',
      bundle: task8PrewarmedBundle,
      accepted: true,
    });
    const operation = createTask8PrewarmedAcquisition({
      id: 'acquisition-task8-prewarmed-subscription-failed-001',
      quote,
      bundle: task8PrewarmedBundle,
      mailboxPoolMode: 'create',
      mailboxSettledSubscriptionOutcome: 'failed',
    });
    const domainSubscriptionId = `subscription-${operation.id}-domain`;
    const mailboxSubscriptionId = `subscription-${operation.id}-mailbox`;

    if (operation.status !== 'partial') {
      throw new Error(
        'Expected a failed pooled subscription after completed prewarmed payments to be partial.',
      );
    }

    return {
      name: 'Retry Failed Prewarmed Pooled Subscription With Stable Identities',
      args: withTask8StoryArgs({
        initialFlow: 'review',
        initialWorkspace: {
          domains: [],
          mailboxes: [],
          prewarmedBundles: [task8PrewarmedBundle],
          subscriptions: [],
        },
        initialReviewDraft: task8PrewarmedReviewDraft,
        initialReviewQuote: quote,
        initialAcquisitionOperation: operation,
      }),
      play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        expect(
          await canvas.findByRole('heading', {
            name: 'Subscription could not be completed',
          }),
        ).toBeVisible();
        expect(
          canvas.getByText(
            'The local subscription result could not be completed. Your selection is still available, and resources for the affected subscription were not created.',
            { exact: true },
          ),
        ).toBeVisible();
        expect(
          canvas.queryByRole('heading', {
            name: 'Payment could not be completed',
          }),
        ).not.toBeInTheDocument();
        expect(
          readStoryOutput({
            canvasElement,
            label: 'Acquisition operation status',
          }),
        ).toBe('Partially completed');
        const initialIdentity = expectTask8AcquisitionIdentityProjection({
          canvasElement,
          operation,
        });
        const fulfillment = canvas.getByRole('table', {
          name: 'Prewarmed fulfillment progress',
        });
        const domainRow = within(fulfillment).getByRole('row', {
          name: new RegExp(`^${task8PrewarmedBundle.domain}\\s`),
        });

        expect(within(fulfillment).getAllByRole('row')).toHaveLength(4);
        expect(domainRow).toHaveTextContent('No dependency');
        expect(domainRow).toHaveTextContent('Payment Completed');
        expect(domainRow).toHaveTextContent('Subscription Completed');
        expect(domainRow).toHaveTextContent('Resource Completed');
        for (const mailbox of [firstMailbox, secondMailbox]) {
          const mailboxRow = within(fulfillment).getByRole('row', {
            name: new RegExp(mailbox.address),
          });

          expect(mailboxRow).toHaveTextContent('Domain dependency Completed');
          expect(mailboxRow).toHaveTextContent('Payment Completed');
          expect(mailboxRow).toHaveTextContent('Pooled subscription Failed');
          expect(mailboxRow).toHaveTextContent('Resource Blocked');
        }
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('3');
        expect(
          canvas.getByRole('button', {
            name: 'Complete locally — $24.29',
          }),
        ).toBeDisabled();
        expect(
          canvas.getByRole('button', { name: 'Retry same operation' }),
        ).toBeEnabled();

        await userEvent.click(
          canvas.getByRole('button', { name: 'Cancel review' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Managed email resources',
          }),
        ).toBeVisible();
        const materializedDomainRow = await waitFor(() => {
          const row = getDomainRow({
            canvasElement,
            domain: task8PrewarmedBundle.domain,
          });

          expect(
            within(row).getByText(task8PrewarmedBundle.domain, {
              exact: true,
            }),
          ).toBeVisible();

          return row;
        });
        expect(materializedDomainRow).toHaveTextContent('Prewarmed bundle');
        expect(materializedDomainRow).toHaveTextContent('Verified');
        expect(materializedDomainRow).toHaveTextContent('Active');
        expect(readMailboxResourceCount(canvasElement)).toBe(0);
        for (const mailbox of [firstMailbox, secondMailbox]) {
          expect(
            canvas.queryByText(mailbox.address, { exact: true }),
          ).not.toBeInTheDocument();
        }
        const subscriptionPanel = await openManagedEmailSubscriptionPanel({
          canvasElement,
          actionName: 'Manage subscriptions',
        });
        expect(
          within(subscriptionPanel).getByText(domainSubscriptionId, {
            exact: true,
          }),
        ).toBeVisible();
        expect(
          within(subscriptionPanel).queryByText(mailboxSubscriptionId, {
            exact: true,
          }),
        ).not.toBeInTheDocument();
        await userEvent.click(
          within(subscriptionPanel).getByRole('button', {
            name: 'Back to email infrastructure',
          }),
        );
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );

        await userEvent.click(
          canvas.getByRole('button', { name: 'Reset local prototype' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Subscription could not be completed',
          }),
        ).toBeVisible();
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );

        await userEvent.click(
          canvas.getByRole('button', { name: 'Retry same operation' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Prewarmed mailboxes acquired',
          }),
        ).toBeVisible();
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );
        const completedResources = canvas.getByRole('list', {
          name: 'Completed local resources',
        });
        expect(
          within(completedResources).getAllByRole('listitem'),
        ).toHaveLength(3);
        expect(
          within(completedResources).getByText(task8PrewarmedBundle.domain, {
            exact: true,
          }),
        ).toBeVisible();
        for (const mailbox of [firstMailbox, secondMailbox]) {
          expect(
            within(completedResources).getByText(mailbox.address, {
              exact: true,
            }),
          ).toBeVisible();
        }
        expect(readMailboxResourceCount(canvasElement)).toBe(2);
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('3');
      },
    };
  })();

export const ReconcileUnknownPrewarmedPooledSubscriptionWithStableIdentities: Story =
  (() => {
    const [firstMailbox, secondMailbox, extraMailbox] =
      task8PrewarmedBundle.mailboxIdentities;

    if (
      firstMailbox === undefined ||
      secondMailbox === undefined ||
      extraMailbox !== undefined
    ) {
      throw new Error(
        'Expected exactly two Task 8 prewarmed mailboxes for unknown pooled subscription recovery.',
      );
    }

    const quote = createTask8PrewarmedQuote({
      id: 'quote-task8-prewarmed-subscription-unknown-001',
      bundle: task8PrewarmedBundle,
      accepted: true,
    });
    const operation = createTask8PrewarmedAcquisition({
      id: 'acquisition-task8-prewarmed-subscription-unknown-001',
      quote,
      bundle: task8PrewarmedBundle,
      mailboxPoolMode: 'create',
      mailboxSettledSubscriptionOutcome: 'unknown',
    });
    const domainSubscriptionId = `subscription-${operation.id}-domain`;
    const mailboxSubscriptionId = `subscription-${operation.id}-mailbox`;

    if (operation.status !== 'reconciliation-required') {
      throw new Error(
        'Expected an unknown pooled subscription after completed prewarmed payments to require reconciliation.',
      );
    }

    return {
      name: 'Reconcile Unknown Prewarmed Pooled Subscription With Stable Identities',
      args: withTask8StoryArgs({
        initialFlow: 'review',
        initialWorkspace: {
          domains: [],
          mailboxes: [],
          prewarmedBundles: [task8PrewarmedBundle],
          subscriptions: [],
        },
        initialReviewDraft: task8PrewarmedReviewDraft,
        initialReviewQuote: quote,
        initialAcquisitionOperation: operation,
        initialAcquisitionReconcileOutcomes: ['completed'] as Array<
          'unknown' | 'failed' | 'completed'
        >,
      }),
      play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        expect(
          await canvas.findByRole('heading', {
            name: 'Subscription status needs reconciliation',
          }),
        ).toBeVisible();
        expect(
          canvas.getByText(
            'The local subscription result is unknown. Reconcile it before completing this review.',
            { exact: true },
          ),
        ).toBeVisible();
        expect(
          canvas.queryByRole('heading', {
            name: 'Payment status needs reconciliation',
          }),
        ).not.toBeInTheDocument();
        expect(
          readStoryOutput({
            canvasElement,
            label: 'Acquisition operation status',
          }),
        ).toBe('Reconciliation required');
        const initialIdentity = expectTask8AcquisitionIdentityProjection({
          canvasElement,
          operation,
        });
        const fulfillment = canvas.getByRole('table', {
          name: 'Prewarmed fulfillment progress',
        });
        const domainRow = within(fulfillment).getByRole('row', {
          name: new RegExp(`^${task8PrewarmedBundle.domain}\\s`),
        });

        expect(within(fulfillment).getAllByRole('row')).toHaveLength(4);
        expect(domainRow).toHaveTextContent('No dependency');
        expect(domainRow).toHaveTextContent('Payment Completed');
        expect(domainRow).toHaveTextContent('Subscription Completed');
        expect(domainRow).toHaveTextContent('Resource Completed');
        for (const mailbox of [firstMailbox, secondMailbox]) {
          const mailboxRow = within(fulfillment).getByRole('row', {
            name: new RegExp(mailbox.address),
          });

          expect(mailboxRow).toHaveTextContent('Domain dependency Completed');
          expect(mailboxRow).toHaveTextContent('Payment Completed');
          expect(mailboxRow).toHaveTextContent('Pooled subscription Unknown');
          expect(mailboxRow).toHaveTextContent('Resource Blocked');
        }
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('3');
        expect(
          canvas.getByRole('button', {
            name: 'Complete locally — $24.29',
          }),
        ).toBeDisabled();
        expect(
          canvas.getByRole('button', {
            name: 'Reconcile subscription result',
          }),
        ).toBeEnabled();

        await userEvent.click(
          canvas.getByRole('button', { name: 'Cancel review' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Managed email resources',
          }),
        ).toBeVisible();
        const materializedDomainRow = await waitFor(() => {
          const row = getDomainRow({
            canvasElement,
            domain: task8PrewarmedBundle.domain,
          });

          expect(
            within(row).getByText(task8PrewarmedBundle.domain, {
              exact: true,
            }),
          ).toBeVisible();

          return row;
        });
        expect(materializedDomainRow).toHaveTextContent('Prewarmed bundle');
        expect(materializedDomainRow).toHaveTextContent('Verified');
        expect(materializedDomainRow).toHaveTextContent('Active');
        expect(readMailboxResourceCount(canvasElement)).toBe(0);
        for (const mailbox of [firstMailbox, secondMailbox]) {
          expect(
            canvas.queryByText(mailbox.address, { exact: true }),
          ).not.toBeInTheDocument();
        }
        const subscriptionPanel = await openManagedEmailSubscriptionPanel({
          canvasElement,
          actionName: 'Manage subscriptions',
        });
        expect(
          within(subscriptionPanel).getByText(domainSubscriptionId, {
            exact: true,
          }),
        ).toBeVisible();
        expect(
          within(subscriptionPanel).queryByText(mailboxSubscriptionId, {
            exact: true,
          }),
        ).not.toBeInTheDocument();
        await userEvent.click(
          within(subscriptionPanel).getByRole('button', {
            name: 'Back to email infrastructure',
          }),
        );
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );

        await userEvent.click(
          canvas.getByRole('button', { name: 'Reset local prototype' }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Subscription status needs reconciliation',
          }),
        ).toBeVisible();
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );

        await userEvent.click(
          canvas.getByRole('button', {
            name: 'Reconcile subscription result',
          }),
        );
        expect(
          await canvas.findByRole('heading', {
            name: 'Prewarmed mailboxes acquired',
          }),
        ).toBeVisible();
        expect(readTask8AcquisitionIdentityProjection(canvasElement)).toEqual(
          initialIdentity,
        );
        const completedResources = canvas.getByRole('list', {
          name: 'Completed local resources',
        });
        expect(
          within(completedResources).getAllByRole('listitem'),
        ).toHaveLength(3);
        expect(
          within(completedResources).getByText(task8PrewarmedBundle.domain, {
            exact: true,
          }),
        ).toBeVisible();
        for (const mailbox of [firstMailbox, secondMailbox]) {
          expect(
            within(completedResources).getByText(mailbox.address, {
              exact: true,
            }),
          ).toBeVisible();
        }
        expect(readMailboxResourceCount(canvasElement)).toBe(2);
        expect(
          canvas.getByLabelText('Recorded local charge count'),
        ).toHaveTextContent('3');
      },
    };
  })();

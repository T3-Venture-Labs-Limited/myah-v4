import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { type ComponentProps } from 'react';

import {
  SettingsDnsRecordsTable,
  type SettingsDnsRecord,
} from '@/settings/components/SettingsDnsRecordsTable';
import { SnackBarProvider } from '@/ui/feedback/snack-bar-manager/components/SnackBarProvider';
import { managedEmailDesignDnsRecords } from '~/pages/settings/email/__stories__/ManagedEmailDesign.fixtures';
import {
  type DomainRecord,
  type VerificationRecord,
} from '~/generated-metadata/graphql';
import {
  PageDecorator,
  type PageDecoratorArgs,
} from '~/testing/decorators/PageDecorator';
import { SnackBarDecorator } from '~/testing/decorators/SnackBarDecorator';
import { graphqlMocks } from '~/testing/graphqlMocks';
import { type ThemeColor } from 'twenty-ui/theme';

type DnsRecordsStoryArgs = PageDecoratorArgs &
  ComponentProps<typeof SettingsDnsRecordsTable>;

const SettingsDnsRecordsTableStory = ({
  records,
  domain,
  ariaLabel,
}: DnsRecordsStoryArgs) => (
  <SnackBarProvider>
    <SettingsDnsRecordsTable
      records={records}
      domain={domain}
      ariaLabel={ariaLabel}
    />
  </SnackBarProvider>
);

const verificationRecords = [
  {
    type: 'MX',
    key: 'mx1.verification.storybook.local',
    value: 'inbound.verification.storybook.local',
    priority: 10,
  },
  {
    type: 'TXT',
    key: '@',
    value: 'v=spf1 include:verification.storybook.local ~all',
  },
] satisfies VerificationRecord[];

const transformedDomainRecords = [
  {
    type: 'CNAME',
    key: 'domains.verification.storybook.local',
    value: 'connect.verification.storybook.local',
    status: 'pending',
    validationType: 'redirection',
    statusColor: 'yellow',
  },
  {
    type: 'CNAME',
    key: 'ssl.verification.storybook.local',
    value: 'certificate.verification.storybook.local',
    status: 'success',
    validationType: 'ssl',
    statusColor: 'green',
  },
] satisfies Array<DomainRecord & { statusColor: ThemeColor }>;

const managedFixtureRecords =
  managedEmailDesignDnsRecords satisfies SettingsDnsRecord[];

const emptyTableLabel = 'DNS records for empty.storybook.local';
const verificationTableLabel = 'DNS records for verification.storybook.local';
const domainTableLabel = 'DNS records for domain.storybook.local';
const managedTableLabel = 'DNS records for mail.storybook.local';
const mobileTableLabel = 'DNS records for mobile.storybook.local';
const expectedAndObservedTableLabel =
  'DNS records for accessibility.storybook.local';
const safeProblemTableLabel = 'DNS records for problem.storybook.local';
const statusLabelsTableLabel = 'DNS records for statuses.storybook.local';

const longDkimHost = [
  'selector-20260821-very-long-key-name-that-must-remain-visible.',
  'recovery._domainkey.accessibility.storybook.local',
].join('');
const longDkimExpectedValue = [
  'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAthefull',
  'authoritativepublickeymustremainvisibletodnsadministratorswithoutatooltip',
  'forinspectionandcopyingacrossdesktopandmobilelayouts',
].join('');
const longDkimObservedValue = [
  'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAold',
  'publishedpublickeythatrequiresreplacementbeforeverificationcancomplete',
].join('');
const expectedAndObservedRecords = [
  {
    type: 'CNAME',
    key: longDkimHost,
    value: longDkimExpectedValue,
    observedValue: longDkimObservedValue,
  },
] satisfies SettingsDnsRecord[];

const safeProblemWithoutObservedRecords = [
  {
    type: 'TXT',
    key: '_dmarc.problem.storybook.local',
    value: 'v=DMARC1; p=none; rua=mailto:dmarc@problem.storybook.local',
    safeProblem:
      'The published DMARC policy is missing the required reporting address.',
  },
] satisfies SettingsDnsRecord[];

const statusLabelRecords = [
  {
    type: 'TXT',
    key: 'record-1.statuses.storybook.local',
    value: 'verified-value',
    status: 'verified',
  },
  {
    type: 'TXT',
    key: 'record-2.statuses.storybook.local',
    value: 'pending-value',
    status: 'pending',
  },
  {
    type: 'TXT',
    key: 'record-3.statuses.storybook.local',
    value: 'action-required-value',
    status: 'action-required',
  },
  {
    type: 'TXT',
    key: 'record-4.statuses.storybook.local',
    value: 'checking-value',
    status: 'checking',
  },
  {
    type: 'TXT',
    key: 'record-5.statuses.storybook.local',
    value: 'checking-dns-value',
    status: 'checking-dns',
  },
  {
    type: 'TXT',
    key: 'record-6.statuses.storybook.local',
    value: 'failed-value',
    status: 'failed',
  },
  {
    type: 'TXT',
    key: 'record-7.statuses.storybook.local',
    value: 'check-failed-value',
    status: 'check-failed',
  },
  {
    type: 'TXT',
    key: 'record-8.statuses.storybook.local',
    value: 'unknown-value',
    status: 'unknown',
  },
] satisfies SettingsDnsRecord[];

const statusLabelExpectations = [
  { code: 'verified', label: 'Verified' },
  { code: 'pending', label: 'Pending' },
  { code: 'action-required', label: 'Action required' },
  { code: 'checking', label: 'Checking' },
  { code: 'checking-dns', label: 'Checking DNS' },
  { code: 'failed', label: 'Failed' },
  { code: 'check-failed', label: 'Failed' },
  { code: 'unknown', label: 'Unknown' },
] as const;

const getCopyHostLabel = (
  domain: string,
  record: Pick<SettingsDnsRecord, 'key' | 'type'>,
) => `Copy host ${record.key} for ${record.type} record on ${domain}`;

const getCopyValueLabel = (
  domain: string,
  record: Pick<SettingsDnsRecord, 'key' | 'type'>,
) => `Copy value for ${record.type} record ${record.key} on ${domain}`;

const managedStatusLabels: Record<
  (typeof managedFixtureRecords)[number]['status'],
  string
> = {
  'action-required': 'Action required',
  pending: 'Pending',
  verified: 'Verified',
};

const assertSemanticTable = async ({
  canvasElement,
  label,
  columnHeaders,
  recordCount,
}: {
  canvasElement: HTMLElement;
  label: string;
  columnHeaders: string[];
  recordCount: number;
}) => {
  const table = await within(canvasElement).findByRole('table', {
    name: label,
  });
  const tableQueries = within(table);

  expect(tableQueries.getAllByRole('rowgroup')).toHaveLength(2);
  expect(tableQueries.getAllByRole('row')).toHaveLength(recordCount + 1);
  expect(tableQueries.getAllByRole('columnheader')).toHaveLength(
    columnHeaders.length,
  );
  expect(tableQueries.getAllByRole('cell')).toHaveLength(
    recordCount * columnHeaders.length,
  );

  for (const columnHeader of columnHeaders) {
    expect(
      tableQueries.getByRole('columnheader', { name: columnHeader }),
    ).toBeVisible();
  }

  return table;
};

const withClipboard = async (
  canvasElement: HTMLElement,
  writeText: (value: string) => Promise<void>,
  assertion: () => Promise<void>,
) => {
  const storyWindow = canvasElement.ownerDocument.defaultView;

  if (storyWindow === null) {
    throw new Error('The Storybook canvas must have a window');
  }

  const secureContextDescriptor = Object.getOwnPropertyDescriptor(
    storyWindow,
    'isSecureContext',
  );
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(
    storyWindow.navigator,
    'clipboard',
  );

  Object.defineProperty(storyWindow, 'isSecureContext', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(storyWindow.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });

  try {
    await assertion();
  } finally {
    if (secureContextDescriptor === undefined) {
      Reflect.deleteProperty(storyWindow, 'isSecureContext');
    } else {
      Object.defineProperty(
        storyWindow,
        'isSecureContext',
        secureContextDescriptor,
      );
    }

    if (clipboardDescriptor === undefined) {
      Reflect.deleteProperty(storyWindow.navigator, 'clipboard');
    } else {
      Object.defineProperty(
        storyWindow.navigator,
        'clipboard',
        clipboardDescriptor,
      );
    }
  }
};

const meta = {
  title: 'Modules/Settings/Components/SettingsDnsRecordsTable',
  component: SettingsDnsRecordsTableStory,
  decorators: [SnackBarDecorator, PageDecorator],
  args: {
    routePath: '/settings/dns-records-contract',
    routeParams: {},
    records: verificationRecords,
    domain: 'verification.storybook.local',
    ariaLabel: verificationTableLabel,
  },
  parameters: {
    msw: graphqlMocks,
    layout: 'fullscreen',
  },
} satisfies Meta<DnsRecordsStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DNSRecordsEmptyOptionalColumns: Story = {
  name: 'DNS Records Empty/Optional Columns',
  render: () => (
    <SnackBarProvider>
      <SettingsDnsRecordsTable
        records={[]}
        domain="empty.storybook.local"
        ariaLabel={emptyTableLabel}
      />
      <SettingsDnsRecordsTable
        records={verificationRecords}
        domain="verification.storybook.local"
        ariaLabel={verificationTableLabel}
      />
      <SettingsDnsRecordsTable
        records={transformedDomainRecords}
        domain="domain.storybook.local"
        ariaLabel={domainTableLabel}
      />
      <SettingsDnsRecordsTable
        records={managedFixtureRecords}
        domain="mail.storybook.local"
        ariaLabel={managedTableLabel}
      />
    </SnackBarProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const emptyState = await canvas.findByRole('status', {
      name: emptyTableLabel,
    });

    expect(emptyState).toHaveTextContent(
      'No DNS records are required for empty.storybook.local',
    );
    expect(
      canvas.queryByRole('table', { name: emptyTableLabel }),
    ).not.toBeInTheDocument();

    const verificationTable = await assertSemanticTable({
      canvasElement,
      label: verificationTableLabel,
      columnHeaders: ['Type', 'Host / Name', 'Value', 'Priority'],
      recordCount: verificationRecords.length,
    });

    expect(
      within(verificationTable).queryByRole('columnheader', { name: 'TTL' }),
    ).not.toBeInTheDocument();
    expect(
      within(verificationTable).queryByRole('columnheader', { name: 'Status' }),
    ).not.toBeInTheDocument();

    const domainTable = await assertSemanticTable({
      canvasElement,
      label: domainTableLabel,
      columnHeaders: ['Type', 'Host / Name', 'Value', 'Status'],
      recordCount: transformedDomainRecords.length,
    });

    expect(
      within(domainTable).queryByRole('columnheader', { name: 'Priority' }),
    ).not.toBeInTheDocument();
    expect(
      within(domainTable).queryByRole('columnheader', { name: 'TTL' }),
    ).not.toBeInTheDocument();

    const managedTable = await assertSemanticTable({
      canvasElement,
      label: managedTableLabel,
      columnHeaders: [
        'Type',
        'Host / Name',
        'Value',
        'Priority',
        'TTL',
        'Status',
      ],
      recordCount: managedFixtureRecords.length,
    });

    for (const record of managedFixtureRecords) {
      expect(
        within(managedTable).getByText(managedStatusLabels[record.status]),
      ).toBeVisible();
    }

    const expectedCopyLabels = [
      ...verificationRecords.flatMap((record) => [
        getCopyHostLabel('verification.storybook.local', record),
        getCopyValueLabel('verification.storybook.local', record),
      ]),
      ...transformedDomainRecords.flatMap((record) => [
        getCopyHostLabel('domain.storybook.local', record),
        getCopyValueLabel('domain.storybook.local', record),
      ]),
      ...managedFixtureRecords.flatMap((record) => [
        getCopyHostLabel('mail.storybook.local', record),
        getCopyValueLabel('mail.storybook.local', record),
      ]),
    ];

    const copyButtons = canvas.getAllByRole('button', { name: /^Copy / });
    const copyLabels = copyButtons.map((button) =>
      button.getAttribute('aria-label'),
    );

    expect(copyLabels).toEqual(expect.arrayContaining(expectedCopyLabels));
    expect(new Set(copyLabels).size).toBe(copyLabels.length);

    const copiedValues: string[] = [];
    await withClipboard(
      canvasElement,
      async (value) => {
        copiedValues.push(value);
      },
      async () => {
        await userEvent.click(
          within(verificationTable).getByRole('button', {
            name: getCopyHostLabel(
              'verification.storybook.local',
              verificationRecords[0],
            ),
          }),
        );

        expect(copiedValues).toEqual([verificationRecords[0].key]);
        await waitFor(() =>
          expect(
            canvas.getByRole('status', { name: 'Copied to clipboard' }),
          ).toBeVisible(),
        );
      },
    );

    await withClipboard(
      canvasElement,
      async () => {
        throw new Error('Clipboard access was rejected');
      },
      async () => {
        await userEvent.click(
          within(verificationTable).getByRole('button', {
            name: getCopyValueLabel(
              'verification.storybook.local',
              verificationRecords[0],
            ),
          }),
        );

        await waitFor(() =>
          expect(
            canvas.getByRole('status', {
              name: "Couldn't copy to clipboard",
            }),
          ).toBeVisible(),
        );
      },
    );
  },
};

export const DNSRecordsExpectedAndObservedAccessibleValues: Story = {
  name: 'DNS Records Long Exact Expected/Observed Values',
  args: {
    records: expectedAndObservedRecords,
    domain: 'accessibility.storybook.local',
    ariaLabel: expectedAndObservedTableLabel,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = await assertSemanticTable({
      canvasElement,
      label: expectedAndObservedTableLabel,
      columnHeaders: ['Type', 'Host / Name', 'Value'],
      recordCount: expectedAndObservedRecords.length,
    });
    const hostCell = within(table).getAllByRole('cell')[1];
    const valueCell = within(table).getAllByRole('cell')[2];

    expect(within(hostCell).getByText(longDkimHost)).toBeVisible();
    expect(within(valueCell).getByText(longDkimExpectedValue)).toBeVisible();
    expect(within(valueCell).getByText(longDkimObservedValue)).toBeVisible();
    expect(within(valueCell).getByText('Expected value')).toBeVisible();
    expect(within(valueCell).getByText('Observed value')).toBeVisible();
    expect(valueCell).toHaveAccessibleName(/Expected value/);
    expect(valueCell).toHaveAccessibleName(/Observed value/);

    const copiedValues: string[] = [];
    await withClipboard(
      canvasElement,
      async (value) => {
        copiedValues.push(value);
      },
      async () => {
        const copyValueButton = within(table).getByRole('button', {
          name: getCopyValueLabel(
            'accessibility.storybook.local',
            expectedAndObservedRecords[0],
          ),
        });

        copyValueButton.focus();
        expect(copyValueButton).toHaveFocus();
        await userEvent.keyboard('{Enter}');

        expect(copiedValues).toEqual([longDkimExpectedValue]);
        await waitFor(() =>
          expect(
            canvas.getByRole('status', { name: 'Copied to clipboard' }),
          ).toBeVisible(),
        );
      },
    );
  },
};

export const DNSRecordsStatusLabels: Story = {
  name: 'DNS Records Localized Status Labels',
  args: {
    records: statusLabelRecords,
    domain: 'statuses.storybook.local',
    ariaLabel: statusLabelsTableLabel,
  },
  play: async ({ canvasElement }) => {
    const table = await assertSemanticTable({
      canvasElement,
      label: statusLabelsTableLabel,
      columnHeaders: ['Type', 'Host / Name', 'Value', 'Status'],
      recordCount: statusLabelRecords.length,
    });
    const tableQueries = within(table);

    for (const { code, label } of statusLabelExpectations) {
      expect(tableQueries.getAllByText(label)[0]).toBeVisible();
      expect(
        tableQueries.queryByText(code, { exact: true }),
      ).not.toBeInTheDocument();
    }
  },
};

export const DNSRecordsMobile: Story = {
  name: 'DNS Records Mobile',
  args: {
    records: managedFixtureRecords,
    domain: 'mobile.storybook.local',
    ariaLabel: mobileTableLabel,
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
    const mobileRecords = await canvas.findByRole('region', {
      name: mobileTableLabel,
    });

    expect(
      canvas.queryByRole('table', { name: mobileTableLabel }),
    ).not.toBeInTheDocument();

    const cards = within(mobileRecords).getAllByRole('article');
    expect(cards).toHaveLength(managedFixtureRecords.length);

    for (const record of managedFixtureRecords) {
      const card = within(mobileRecords).getByRole('article', {
        name: `${record.type} record ${record.key}`,
      });
      const descriptionLists = card.querySelectorAll('dl');

      expect(descriptionLists).toHaveLength(1);

      const descriptionList = descriptionLists.item(0);
      if (descriptionList === null) {
        throw new Error(
          `Missing details for ${record.type} record ${record.key}`,
        );
      }

      const expectedDetails = [
        { term: 'Type', value: record.type },
        { term: 'Host / Name', value: record.key },
        { term: 'Value', value: record.value },
        ...(record.priority === undefined
          ? []
          : [{ term: 'Priority', value: String(record.priority) }]),
        ...(record.ttl === undefined
          ? []
          : [{ term: 'TTL', value: record.ttl }]),
        { term: 'Status', value: managedStatusLabels[record.status] },
      ];

      for (const { term, value } of expectedDetails) {
        const termElement = Array.from(
          descriptionList.querySelectorAll('dt'),
        ).find((candidate) => candidate.textContent === term);

        expect(termElement).toBeDefined();
        if (termElement === undefined) {
          throw new Error(
            `Missing ${term} details for ${record.type} record ${record.key}`,
          );
        }

        const nextSibling = termElement.nextElementSibling;
        const definition =
          nextSibling?.matches('dd') === true
            ? nextSibling
            : termElement.parentElement?.querySelector('dd');

        expect(definition).toBeInTheDocument();
        if (definition === null || definition === undefined) {
          throw new Error(
            `Missing ${term} value for ${record.type} record ${record.key}`,
          );
        }

        expect(definition).toHaveTextContent(value);
      }

      const hostCopyButton = within(card).getByRole('button', {
        name: getCopyHostLabel('mobile.storybook.local', record),
      });
      const valueCopyButton = within(card).getByRole('button', {
        name: getCopyValueLabel('mobile.storybook.local', record),
      });

      expect(hostCopyButton).toBeVisible();
      expect(valueCopyButton).toBeVisible();
      expect(
        hostCopyButton.getBoundingClientRect().width,
      ).toBeGreaterThanOrEqual(32);
      expect(
        hostCopyButton.getBoundingClientRect().height,
      ).toBeGreaterThanOrEqual(32);
      expect(
        valueCopyButton.getBoundingClientRect().width,
      ).toBeGreaterThanOrEqual(32);
      expect(
        valueCopyButton.getBoundingClientRect().height,
      ).toBeGreaterThanOrEqual(32);
    }

    const documentElement = canvasElement.ownerDocument.documentElement;
    expect(documentElement.scrollWidth).toBeLessThanOrEqual(
      documentElement.clientWidth,
    );

    const copiedValues: string[] = [];
    await withClipboard(
      canvasElement,
      async (value) => {
        copiedValues.push(value);
      },
      async () => {
        const firstRecord = managedFixtureRecords[0];
        const firstCard = within(mobileRecords).getByRole('article', {
          name: `${firstRecord.type} record ${firstRecord.key}`,
        });

        await userEvent.click(
          within(firstCard).getByRole('button', {
            name: getCopyValueLabel('mobile.storybook.local', firstRecord),
          }),
        );

        expect(copiedValues).toEqual([firstRecord.value]);
        await waitFor(() =>
          expect(
            canvas.getByRole('status', { name: 'Copied to clipboard' }),
          ).toBeVisible(),
        );
      },
    );
  },
};

export const DNSRecordsExpectedAndObservedAccessibleValuesMobile: Story = {
  name: 'DNS Records Long Exact Expected/Observed Values Mobile',
  args: {
    records: expectedAndObservedRecords,
    domain: 'accessibility.storybook.local',
    ariaLabel: expectedAndObservedTableLabel,
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
    const mobileRecords = await canvas.findByRole('region', {
      name: expectedAndObservedTableLabel,
    });
    const recordCard = within(mobileRecords).getByRole('article');

    expect(within(recordCard).getByText('Expected value')).toBeVisible();
    expect(within(recordCard).getByText('Observed value')).toBeVisible();
    expect(within(recordCard).getByText(longDkimHost)).toBeVisible();
    expect(within(recordCard).getByText(longDkimExpectedValue)).toBeVisible();
    expect(within(recordCard).getByText(longDkimObservedValue)).toBeVisible();
    expect(recordCard).toHaveAccessibleName(`CNAME record ${longDkimHost}`);
    expect(recordCard).toHaveAccessibleDescription(/Expected value/);
    expect(recordCard).toHaveAccessibleDescription(/Observed value/);

    const copiedValues: string[] = [];
    await withClipboard(
      canvasElement,
      async (value) => {
        copiedValues.push(value);
      },
      async () => {
        const copyValueButton = within(recordCard).getByRole('button', {
          name: getCopyValueLabel(
            'accessibility.storybook.local',
            expectedAndObservedRecords[0],
          ),
        });

        copyValueButton.focus();
        expect(copyValueButton).toHaveFocus();
        await userEvent.keyboard('{Enter}');

        expect(copiedValues).toEqual([longDkimExpectedValue]);
      },
    );
  },
};

export const DNSRecordsProblemWithoutObservedValueMobile: Story = {
  name: 'DNS Records Expected/Problem Without Observed Value Mobile',
  args: {
    records: safeProblemWithoutObservedRecords,
    domain: 'problem.storybook.local',
    ariaLabel: safeProblemTableLabel,
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
    const mobileRecords = await canvas.findByRole('region', {
      name: safeProblemTableLabel,
    });
    const recordCard = within(mobileRecords).getByRole('article');
    const safeProblem = safeProblemWithoutObservedRecords[0].safeProblem;
    const problemText = within(recordCard).getByText(safeProblem);
    const problemDetail = problemText.closest('[id]');

    expect(within(recordCard).getByText('Expected value')).toBeVisible();
    expect(within(recordCard).getByText('Problem')).toBeVisible();
    expect(problemText).toBeVisible();
    expect(
      within(recordCard).queryByText('Observed value'),
    ).not.toBeInTheDocument();
    expect(recordCard).toHaveAccessibleDescription(/Expected value/);
    expect(recordCard).toHaveAccessibleDescription(/Problem/);
    expect(recordCard).toHaveAccessibleDescription(
      /The published DMARC policy is missing the required reporting address/,
    );
    expect(problemDetail).not.toBeNull();

    if (problemDetail === null) {
      throw new Error('Missing a stable ID for the DNS problem detail');
    }

    expect(recordCard.getAttribute('aria-describedby')?.split(' ')).toContain(
      problemDetail.id,
    );
  },
};

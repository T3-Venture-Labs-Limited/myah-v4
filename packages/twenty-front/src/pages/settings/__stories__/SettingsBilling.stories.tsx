import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import {
  SettingsBilling,
  type SettingsBillingProps,
} from '~/pages/settings/billing/SettingsBilling';
import { type WorkspaceBillingViewModel } from '~/modules/settings/billing/components/SettingsWorkspaceBillingContent';
import {
  PageDecorator,
  type PageDecoratorArgs,
} from '~/testing/decorators/PageDecorator';
import { graphqlMocks } from '~/testing/graphqlMocks';
import { WorkspaceDecorator } from '~/testing/decorators/WorkspaceDecorator';
const healthyWorkspaceViewModel: WorkspaceBillingViewModel = {
  state: 'ready',
  balanceStatus: 'healthy',
  availableBalanceCents: 4280,
  sponsoredBalanceCents: 2500,
  purchasedBalanceCents: 1780,
  monthToDateSpendCents: 1720,
  settledOperationCount: 128,
  monthToDateRangeLabel: 'July 1–21, 2026',
  usageHistory: [
    {
      id: 'usage-1',
      occurredAt: '2026-07-21T08:16:00.000Z',
      activity: 'AI chat',
      member: 'Jordan Lee',
      status: 'settled',
      chargeCents: 18,
    },
    {
      id: 'usage-2',
      occurredAt: '2026-07-21T07:42:00.000Z',
      activity: 'Creator research',
      member: 'Amelia Stone',
      status: 'processing',
      chargeCents: null,
    },
    {
      id: 'usage-3',
      occurredAt: '2026-07-20T18:09:00.000Z',
      activity: 'AI chat',
      member: 'Jordan Lee',
      status: 'notCharged',
      chargeCents: 0,
    },
    {
      id: 'usage-4',
      occurredAt: '2026-07-20T17:32:00.000Z',
      activity: 'Audience analysis',
      member: 'Amelia Stone',
      status: 'underReview',
      chargeCents: null,
    },
    {
      id: 'usage-5',
      occurredAt: '2026-07-19T11:04:00.000Z',
      activity: 'AI chat without charge',
      member: 'Jordan Lee',
      status: 'settled',
      chargeCents: null,
    },
  ],
  billingHistory: [],
};

type SettingsBillingStoryArgs = PageDecoratorArgs & SettingsBillingProps;

const meta: Meta<SettingsBillingStoryArgs> = {
  title: 'Pages/Settings/SettingsBilling',
  component: SettingsBilling,
  decorators: [WorkspaceDecorator, PageDecorator],
  args: {
    routePath: '/settings/billing',
    routeParams: {},
  },
  parameters: { msw: graphqlMocks },
  render: ({ viewModel }) => <SettingsBilling viewModel={viewModel} />,
};

export default meta;

export type Story = StoryObj<typeof meta>;

export const ProductionNotConnected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.findByText('Live billing information has not been connected yet.'),
    ).resolves.toBeVisible();
    expect(canvas.queryByText('$0.00')).not.toBeInTheDocument();
    await expect(canvas.findAllByText('—')).resolves.toHaveLength(3);
    await expect(
      canvas.findByRole('button', { name: 'Add funds' }),
    ).resolves.toBeDisabled();
    await expect(
      canvas.findByText('Online top-ups coming soon'),
    ).resolves.toBeVisible();
  },
};

export const Loading: Story = {
  args: { viewModel: { state: 'loading' } },
};

export const Unavailable: Story = {
  args: {
    viewModel: { state: 'unavailable', reason: 'loadFailed' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.findByText('Billing information is temporarily unavailable.'),
    ).resolves.toBeVisible();
    expect(canvas.queryByText('$0.00')).not.toBeInTheDocument();
  },
};
export const HealthyFundedWorkspace: Story = {
  args: { viewModel: healthyWorkspaceViewModel },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('$42.80')).resolves.toBeVisible();
    await expect(canvas.findByText('$25.00 sponsored')).resolves.toBeVisible();
    await expect(canvas.findByText('$17.80 purchased')).resolves.toBeVisible();
    await expect(canvas.findByText('$17.20')).resolves.toBeVisible();
    await expect(
      canvas.findByText('128 managed operations'),
    ).resolves.toBeVisible();
    await expect(canvas.findByText('Last 30 days')).resolves.toBeVisible();

    const tabList = await canvas.findByRole('tablist', {
      name: 'Billing records',
    });
    await expect(tabList).toBeVisible();
    const usageTab = within(tabList).getByRole('tab', {
      name: 'Usage history',
    });
    const billingHistoryTab = within(tabList).getByRole('tab', {
      name: 'Billing history',
    });
    await expect(usageTab).toHaveAttribute('aria-selected', 'true');
    await expect(billingHistoryTab).toHaveAttribute('aria-selected', 'false');

    const usageTable = await canvas.findByRole('table', {
      name: 'Usage history',
    });
    await expect(usageTable).toBeVisible();
    await expect(
      within(usageTable).findAllByRole('columnheader'),
    ).resolves.toHaveLength(5);
    const usageRows = within(usageTable).getAllByRole('row');
    expect(usageRows).toHaveLength(6);
    const expectedStatusAndAmount = [
      ['Settled', '$0.18'],
      ['Processing', 'Pending'],
      ['Not charged', '$0.00'],
      ['Under review', 'Pending'],
      ['Settled', '—'],
    ];
    for (const [index, [status, amount]] of expectedStatusAndAmount.entries()) {
      const row = within(usageTable).getAllByRole('row')[index + 1];
      await expect(
        within(row).getByRole('cell', { name: status }),
      ).toBeVisible();
      await expect(
        within(row).getByRole('cell', { name: amount }),
      ).toBeVisible();
    }
    await expect(
      within(usageTable).findAllByRole('cell', { name: 'AI chat' }),
    ).resolves.toHaveLength(2);

    await userEvent.click(await canvas.findByText('Last 30 days'));
    const sevenDaysOption = await within(document.body).findByText(
      'Last 7 days',
    );
    await userEvent.click(sevenDaysOption);
    await expect(canvas.findByText('Last 7 days')).resolves.toBeVisible();
  },
};

export const MixedSponsoredAndPurchasedFunds: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      sponsoredBalanceCents: 1200,
      purchasedBalanceCents: 800,
      availableBalanceCents: 2000,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('$20.00')).resolves.toBeVisible();
    await expect(canvas.findByText('$12.00 sponsored')).resolves.toBeVisible();
    await expect(canvas.findByText('$8.00 purchased')).resolves.toBeVisible();
  },
};

export const SettledUsageWithoutCharge: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      usageHistory: [healthyWorkspaceViewModel.usageHistory[4]],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const usageTable = await canvas.findByRole('table', {
      name: 'Usage history',
    });
    const row = within(usageTable).getAllByRole('row')[1];
    await expect(
      within(row).getByRole('cell', { name: 'Settled' }),
    ).toBeVisible();
    await expect(within(row).getByRole('cell', { name: '—' })).toBeVisible();
  },
};

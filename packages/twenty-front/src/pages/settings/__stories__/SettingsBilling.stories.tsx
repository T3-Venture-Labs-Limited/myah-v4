import {
  type Decorator,
  type Meta,
  type StoryObj,
} from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';

import {
  SettingsBilling,
  type SettingsBillingProps,
} from '~/pages/settings/billing/SettingsBilling';
import {
  SettingsWorkspaceBillingContent,
  type WorkspaceBillingViewModel,
} from '~/modules/settings/billing/components/SettingsWorkspaceBillingContent';
import {
  PageDecorator,
  type PageDecoratorArgs,
} from '~/testing/decorators/PageDecorator';
import { graphqlMocks } from '~/testing/graphqlMocks';
import { WorkspaceDecorator } from '~/testing/decorators/WorkspaceDecorator';
const healthyWorkspaceViewModel = {
  state: 'ready',
  balanceStatus: 'healthy',
  availableBalanceCents: 4280,
  sponsoredBalanceCents: 2500,
  purchasedBalanceCents: 1780,
  monthToDateSpendCents: 1720,
  settledOperationCount: 128,
  monthToDateRangeLabel: 'July 1–21, 2026',
  paymentSettings: {
    state: 'ready',
    defaultPaymentMethod: {
      brand: 'Visa',
      lastFour: '4242',
      expiryMonth: 12,
      expiryYear: 2028,
    },
    automaticTopUp: {
      enabled: false,
      thresholdCents: 1000,
      topUpAmountCents: 5000,
      monthlyLimitCents: 20000,
    },
    isSaving: false,
  },
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
  billingHistory: [
    {
      id: 'funding-1',
      occurredAt: '2026-07-01T14:00:00.000Z',
      description: 'Purchased funds',
      type: 'purchasedTopUp',
      amountCents: 2500,
      document: {
        label: 'View receipt from July 1, 2026',
        url: '#receipt-july-1-2026',
      },
    },
    {
      id: 'funding-2',
      occurredAt: '2026-06-20T12:00:00.000Z',
      description: 'Sponsored funds from Myah',
      type: 'sponsoredGrant',
      amountCents: 2500,
    },
    {
      id: 'funding-3',
      occurredAt: '2026-06-18T11:00:00.000Z',
      description: 'Refund',
      type: 'refund',
      amountCents: -500,
      document: {
        label: 'View refund receipt from June 18, 2026',
        url: '#refund-june-18-2026',
      },
    },
  ],
} satisfies WorkspaceBillingViewModel;

type SettingsBillingStoryArgs = PageDecoratorArgs & SettingsBillingProps;
const BillingPageDecorator: Decorator<SettingsBillingStoryArgs> = (
  Story,
  context,
) =>
  context.parameters.componentCanvas === true ? (
    <Story />
  ) : (
    PageDecorator(Story, context)
  );

const meta: Meta<SettingsBillingStoryArgs> = {
  title: 'Pages/Settings/SettingsBilling',
  component: SettingsBilling,
  decorators: [WorkspaceDecorator, BillingPageDecorator],
  args: {
    routePath: '/settings/billing',
    routeParams: {},
  },
  parameters: { msw: graphqlMocks },
  render: ({ viewModel, onManagePaymentMethod, onSaveAutomaticTopUp }) => (
    <SettingsBilling
      viewModel={viewModel}
      onManagePaymentMethod={onManagePaymentMethod}
      onSaveAutomaticTopUp={onSaveAutomaticTopUp}
    />
  ),
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
    await expect(
      canvas.findByText(
        'Payment settings will appear when billing is connected.',
      ),
    ).resolves.toBeVisible();
    expect(canvas.queryByText(/4242/)).not.toBeInTheDocument();
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

    const billingHistoryTabList = await canvas.findByRole('tablist', {
      name: 'Billing history views',
    });
    const usageTab = await within(billingHistoryTabList).findByRole('tab', {
      name: 'Usage history',
    });
    const billingHistoryTab = await within(billingHistoryTabList).findByRole(
      'tab',
      {
        name: 'Billing history',
      },
    );
    await expect(usageTab).toHaveAttribute('aria-selected', 'true');
    await expect(usageTab).toHaveAttribute(
      'aria-controls',
      'workspace-billing-panel-usage',
    );
    await expect(billingHistoryTab).toHaveAttribute('aria-selected', 'false');
    await expect(billingHistoryTab).toHaveAttribute(
      'aria-controls',
      'workspace-billing-panel-billing-history',
    );
    await expect(
      canvas.findByRole('tabpanel', { name: 'Usage history' }),
    ).resolves.toBeVisible();
    const inactiveBillingHistoryPanel = canvasElement.querySelector(
      '#workspace-billing-panel-billing-history',
    );
    if (inactiveBillingHistoryPanel === null) {
      throw new Error('The Billing history panel must remain in the DOM');
    }
    await expect(inactiveBillingHistoryPanel).toHaveAttribute('hidden');
    await expect(inactiveBillingHistoryPanel).toHaveAttribute(
      'aria-labelledby',
      'tab-workspace-billing-tab-billing-history',
    );

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
    await userEvent.click(usageTab);
    await userEvent.keyboard('{ArrowRight}');
    await expect(billingHistoryTab).toHaveAttribute('aria-selected', 'true');
    await expect(billingHistoryTab).toHaveFocus();
    await userEvent.click(usageTab);

    await userEvent.click(await canvas.findByText('Last 30 days'));
    const sevenDaysOption = await within(document.body).findByText(
      'Last 7 days',
    );
    await userEvent.click(sevenDaysOption);
    await expect(canvas.findByText('Last 7 days')).resolves.toBeVisible();

    await userEvent.click(billingHistoryTab);
    await expect(billingHistoryTab).toHaveAttribute('aria-selected', 'true');
    await expect(usageTab).toHaveAttribute('aria-selected', 'false');
    await expect(
      canvas.findByRole('tabpanel', { name: 'Billing history' }),
    ).resolves.toBeVisible();
    const billingHistoryTable = await canvas.findByRole('table', {
      name: 'Billing history',
    });
    await expect(
      within(billingHistoryTable).findByRole('columnheader', { name: 'Event' }),
    ).resolves.toBeVisible();
    await expect(
      within(billingHistoryTable).findByRole('cell', {
        name: 'Purchased funds',
      }),
    ).resolves.toBeVisible();
    expect(
      within(billingHistoryTable).getAllByRole('row').length,
    ).toBeGreaterThan(1);
    await expect(
      canvas.findByText('Sponsored funds from Myah'),
    ).resolves.toBeVisible();
    await expect(canvas.findAllByText('+$25.00')).resolves.toHaveLength(2);
    await expect(canvas.findByText('-$5.00')).resolves.toBeVisible();
    await expect(
      canvas.findByRole('link', {
        name: 'View receipt from July 1, 2026',
      }),
    ).resolves.toBeVisible();
    expect(
      canvas.queryByRole('table', { name: 'Usage history' }),
    ).not.toBeInTheDocument();
    await expect(canvas.findByText('Payment settings')).resolves.toBeVisible();
    await expect(canvas.findByText(/Visa.*4242/)).resolves.toBeVisible();
    await expect(canvas.findByText('Expires 12/28')).resolves.toBeVisible();
    await expect(
      canvas.findByRole('button', { name: 'Manage payment method' }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('switch', { name: 'Automatic top-up' }),
    ).resolves.not.toBeChecked();
    await expect(
      canvas.findByRole('textbox', { name: 'Balance threshold' }),
    ).resolves.toBeDisabled();
    await expect(
      canvas.findByRole('button', { name: 'Save changes' }),
    ).resolves.toBeDisabled();
  },
};

export const AutomaticTopUpEnabled: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      paymentSettings: {
        ...healthyWorkspaceViewModel.paymentSettings,
        automaticTopUp: {
          enabled: true,
          thresholdCents: 1000,
          topUpAmountCents: 5000,
          monthlyLimitCents: 20000,
        },
      },
    },
    onManagePaymentMethod: fn(),
    onSaveAutomaticTopUp: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const threshold = await canvas.findByRole('textbox', {
      name: 'Balance threshold',
    });
    const topUpAmount = await canvas.findByRole('textbox', {
      name: 'Top-up amount',
    });
    const monthlyLimit = await canvas.findByRole('textbox', {
      name: 'Monthly automatic top-up limit (optional)',
    });

    await userEvent.clear(threshold);
    await userEvent.type(threshold, '12.50');
    await userEvent.clear(topUpAmount);
    await userEvent.type(topUpAmount, '60.00');
    await userEvent.clear(monthlyLimit);
    await userEvent.type(monthlyLimit, '240.00');
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save changes' }),
    );

    await expect(args.onSaveAutomaticTopUp).toHaveBeenCalledWith({
      enabled: true,
      thresholdCents: 1250,
      topUpAmountCents: 6000,
      monthlyLimitCents: 24000,
    });
  },
};

export const AutomaticTopUpWithoutMonthlyLimit: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      paymentSettings: {
        ...healthyWorkspaceViewModel.paymentSettings,
        automaticTopUp: {
          enabled: true,
          thresholdCents: 1000,
          topUpAmountCents: 5000,
          monthlyLimitCents: null,
        },
      },
    },
    onSaveAutomaticTopUp: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByText('No monthly limit allows repeated automatic charges.'),
    ).resolves.toBeVisible();
    const threshold = await canvas.findByRole('textbox', {
      name: 'Balance threshold',
    });
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '12.00');
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save changes' }),
    );
    await expect(args.onSaveAutomaticTopUp).toHaveBeenCalledWith({
      enabled: true,
      thresholdCents: 1200,
      topUpAmountCents: 5000,
      monthlyLimitCents: null,
    });
  },
};

export const NoPaymentMethod: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      paymentSettings: {
        ...healthyWorkspaceViewModel.paymentSettings,
        defaultPaymentMethod: null,
      },
    },
    onManagePaymentMethod: fn(),
    onSaveAutomaticTopUp: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByText('No payment method on file.'),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('button', { name: 'Add payment method' }),
    ).resolves.toBeVisible();
    const automaticTopUpSwitch = await canvas.findByRole('switch', {
      name: 'Automatic top-up',
    });
    await expect(automaticTopUpSwitch).toHaveAttribute('aria-disabled', 'true');
    await expect(automaticTopUpSwitch).toHaveAttribute('tabindex', '-1');
    await expect(
      canvas.findByText(
        'Add a payment method before enabling automatic top-up.',
      ),
    ).resolves.toBeVisible();
  },
};

export const ActiveAutomaticTopUpWithoutPaymentMethod: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      paymentSettings: {
        ...healthyWorkspaceViewModel.paymentSettings,
        defaultPaymentMethod: null,
        automaticTopUp: {
          enabled: true,
          thresholdCents: 1000,
          topUpAmountCents: 5000,
          monthlyLimitCents: 20000,
        },
      },
    },
    onManagePaymentMethod: fn(),
    onSaveAutomaticTopUp: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const automaticTopUpSwitch = await canvas.findByRole('switch', {
      name: 'Automatic top-up',
    });
    await expect(automaticTopUpSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(automaticTopUpSwitch).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(automaticTopUpSwitch).toHaveAttribute('tabindex', '0');
    await userEvent.click(automaticTopUpSwitch);
    await expect(automaticTopUpSwitch).toHaveAttribute('aria-checked', 'false');
    const saveButton = await canvas.findByRole('button', {
      name: 'Save changes',
    });
    await expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);
    await expect(args.onSaveAutomaticTopUp).toHaveBeenCalledWith({
      enabled: false,
      thresholdCents: 1000,
      topUpAmountCents: 5000,
      monthlyLimitCents: 20000,
    });
  },
};

export const AutomaticTopUpValidation: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      paymentSettings: {
        ...healthyWorkspaceViewModel.paymentSettings,
        automaticTopUp: {
          enabled: true,
          thresholdCents: 1000,
          topUpAmountCents: 5000,
          monthlyLimitCents: 20000,
        },
      },
    },
    onSaveAutomaticTopUp: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const monthlyLimit = await canvas.findByRole('textbox', {
      name: 'Monthly automatic top-up limit (optional)',
    });
    await userEvent.clear(monthlyLimit);
    await userEvent.type(monthlyLimit, '10.00');
    await expect(
      canvas.findByText('Monthly limit must be at least the top-up amount.'),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('button', { name: 'Save changes' }),
    ).resolves.toBeDisabled();
    await userEvent.click(
      await canvas.findByRole('switch', { name: 'Automatic top-up' }),
    );
    await expect(
      canvas.findByText('Monthly limit must be at least the top-up amount.'),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('button', { name: 'Save changes' }),
    ).resolves.toBeDisabled();
    await expect(args.onSaveAutomaticTopUp).not.toHaveBeenCalled();
  },
};

export const DisablingAutomaticTopUpWithInvalidRequiredDraft: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      paymentSettings: {
        ...healthyWorkspaceViewModel.paymentSettings,
        automaticTopUp: {
          enabled: true,
          thresholdCents: 1000,
          topUpAmountCents: 5000,
          monthlyLimitCents: 20000,
        },
      },
    },
    onSaveAutomaticTopUp: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const threshold = await canvas.findByRole('textbox', {
      name: 'Balance threshold',
    });
    await userEvent.clear(threshold);
    await expect(
      canvas.findByText('Enter a valid balance threshold.'),
    ).resolves.toBeVisible();
    await userEvent.click(
      await canvas.findByRole('switch', { name: 'Automatic top-up' }),
    );
    const saveButton = await canvas.findByRole('button', {
      name: 'Save changes',
    });
    await expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);
    await expect(args.onSaveAutomaticTopUp).toHaveBeenCalledWith({
      enabled: false,
      thresholdCents: 1000,
      topUpAmountCents: 5000,
      monthlyLimitCents: 20000,
    });
  },
};

export const TabletLedgerLayout: Story = {
  args: {
    viewModel: healthyWorkspaceViewModel,
  },
  parameters: {
    componentCanvas: true,
    layout: 'fullscreen',
    viewport: {
      options: {
        myahTablet: {
          name: 'Myah tablet',
          styles: { width: '834px', height: '1024px' },
        },
      },
      defaultViewport: 'myahTablet',
    },
  },
  render: ({ viewModel }) => (
    <MemoryRouter>
      <div
        data-testid="billing-tablet-canvas"
        style={{ margin: '0 auto', maxWidth: '550px' }}
      >
        <SettingsWorkspaceBillingContent
          viewModel={viewModel ?? healthyWorkspaceViewModel}
        />
      </div>
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabletCanvas = await canvas.findByTestId('billing-tablet-canvas');
    await expect(
      canvas.findByRole('table', { name: 'Usage history' }),
    ).resolves.toBeVisible();
    expect(tabletCanvas.scrollWidth).toBeLessThanOrEqual(
      tabletCanvas.clientWidth,
    );
    await userEvent.click(
      await canvas.findByRole('tab', { name: 'Billing history' }),
    );
    await expect(
      canvas.findByRole('table', { name: 'Billing history' }),
    ).resolves.toBeVisible();
    expect(tabletCanvas.scrollWidth).toBeLessThanOrEqual(
      tabletCanvas.clientWidth,
    );
  },
};

export const WidenedDrawerLedgerLayout: Story = {
  args: {
    viewModel: healthyWorkspaceViewModel,
  },
  parameters: {
    componentCanvas: true,
    layout: 'fullscreen',
    viewport: {
      options: {
        myahWidenedDrawer: {
          name: 'Myah widened drawer',
          styles: { width: '1000px', height: '1024px' },
        },
      },
      defaultViewport: 'myahWidenedDrawer',
    },
  },
  render: ({ viewModel }) => (
    <MemoryRouter>
      <div
        data-testid="billing-widened-drawer-canvas"
        style={{ margin: '0 auto', maxWidth: '586px' }}
      >
        <SettingsWorkspaceBillingContent
          viewModel={viewModel ?? healthyWorkspaceViewModel}
        />
      </div>
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const widenedDrawerCanvas = await canvas.findByTestId(
      'billing-widened-drawer-canvas',
    );
    await expect(
      canvas.findByRole('table', { name: 'Usage history' }),
    ).resolves.toBeVisible();
    expect(widenedDrawerCanvas.scrollWidth).toBeLessThanOrEqual(
      widenedDrawerCanvas.clientWidth,
    );
    await userEvent.click(
      await canvas.findByRole('tab', { name: 'Billing history' }),
    );
    await expect(
      canvas.findByRole('table', { name: 'Billing history' }),
    ).resolves.toBeVisible();
    expect(widenedDrawerCanvas.scrollWidth).toBeLessThanOrEqual(
      widenedDrawerCanvas.clientWidth,
    );
    const billingHistoryTable = await canvas.findByRole('table', {
      name: 'Billing history',
    });
    const [, firstBillingHistoryRow, secondBillingHistoryRow] =
      within(billingHistoryTable).getAllByRole('row');
    expect(
      firstBillingHistoryRow.getBoundingClientRect().height,
    ).toBeGreaterThan(32);
    expect(
      secondBillingHistoryRow.getBoundingClientRect().top,
    ).toBeGreaterThanOrEqual(
      firstBillingHistoryRow.getBoundingClientRect().bottom,
    );
  },
};

export const MobileAutomaticTopUp: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      paymentSettings: {
        ...healthyWorkspaceViewModel.paymentSettings,
        automaticTopUp: {
          enabled: true,
          thresholdCents: 1000,
          topUpAmountCents: 5000,
          monthlyLimitCents: 20000,
        },
      },
    },
    onManagePaymentMethod: fn(),
    onSaveAutomaticTopUp: fn(),
  },
  parameters: {
    componentCanvas: true,
    layout: 'fullscreen',
    viewport: {
      options: {
        myahMobile: {
          name: 'Myah mobile',
          styles: { width: '390px', height: '844px' },
        },
      },
      defaultViewport: 'myahMobile',
    },
  },
  render: ({ viewModel, onManagePaymentMethod, onSaveAutomaticTopUp }) => (
    <MemoryRouter>
      <div data-testid="billing-mobile-canvas">
        <SettingsWorkspaceBillingContent
          viewModel={viewModel ?? healthyWorkspaceViewModel}
          onManagePaymentMethod={onManagePaymentMethod}
          onSaveAutomaticTopUp={onSaveAutomaticTopUp}
        />
      </div>
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Payment settings')).resolves.toBeVisible();
    await expect(
      canvas.findByRole('textbox', { name: 'Balance threshold' }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('textbox', { name: 'Top-up amount' }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('textbox', {
        name: 'Monthly automatic top-up limit (optional)',
      }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('table', { name: 'Usage history' }),
    ).resolves.toBeVisible();
    const mobileCanvas = await canvas.findByTestId('billing-mobile-canvas');
    expect(mobileCanvas.scrollWidth).toBeLessThanOrEqual(
      mobileCanvas.clientWidth,
    );
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

export const LowBalance: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      balanceStatus: 'low',
      availableBalanceCents: 350,
      sponsoredBalanceCents: 350,
      purchasedBalanceCents: 0,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Low balance')).resolves.toBeVisible();
    await expect(
      canvas.findByText('Managed services may pause soon.'),
    ).resolves.toBeVisible();
    await expect(canvas.findByText('Creator research')).resolves.toBeVisible();
  },
};

export const EmptyBlockedBalance: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      balanceStatus: 'empty',
      availableBalanceCents: 0,
      sponsoredBalanceCents: 0,
      purchasedBalanceCents: 0,
      monthToDateSpendCents: 0,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByText(
        'Your balance is empty. Managed services are paused until funds are added.',
      ),
    ).resolves.toBeVisible();
    expect((await canvas.findAllByText('$0.00')).length).toBeGreaterThan(0);
    await expect(
      canvas.findByRole('button', { name: 'Add funds' }),
    ).resolves.toBeDisabled();
  },
};

export const NoUsage: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      usageHistory: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('No usage yet')).resolves.toBeVisible();
    await expect(canvas.findByText('$42.80')).resolves.toBeVisible();
  },
};

export const NoBillingHistory: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      billingHistory: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('tab', { name: 'Billing history' }),
    );
    await expect(
      canvas.findByText('No billing events yet'),
    ).resolves.toBeVisible();
    await expect(canvas.findByText('$42.80')).resolves.toBeVisible();
  },
};

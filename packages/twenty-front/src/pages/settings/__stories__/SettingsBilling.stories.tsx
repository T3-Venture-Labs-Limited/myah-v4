import { type Decorator, type Meta, type StoryObj } from '@storybook/react-vite';
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

const billingSummary = {
  address: {
    city: 'San Francisco',
    country: 'US',
    line1: '123 Market Street',
    line2: null,
    postalCode: '94105',
    state: 'CA',
  },
  card: { brand: 'Visa', expiryMonth: 12, expiryYear: 2030, last4: '4242' },
  name: 'Myah Test LLC',
  paymentMethodReady: true,
  taxId: { country: 'US', type: 'us_ein' },
};
const healthyWorkspaceViewModel = {
  availableBalanceCents: 10_000,
  customerFundingAvailable: true,
  customerFundingBillingSummary: billingSummary,
  customerFundingPaymentMethodReady: true,
  customerFundingPresets: [
    { id: 'AI_25_USD', principalCents: 2_500 },
    { id: 'AI_50_USD', principalCents: 5_000 },
    { id: 'AI_100_USD', principalCents: 10_000 },
  ],
  fundingHistory: [
    {
      actionRequired: false,
      collectedTotalCents: 2_700,
      createdAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2027-08-20T10:05:00.000Z',
      fundingType: 'PURCHASED',
      id: 'funding-active',
      invoiceUrl: '#invoice-active',
      presetId: 'AI_25_USD',
      principalCents: 2_500,
      state: 'BALANCE_ACTIVE',
      taxCents: 200,
      updatedAt: '2026-08-20T10:05:00.000Z',
    },
  ],
  isSubmitting: false,
  pendingOperationCount: 0,
  reconciliationRequiredOperationCount: 0,
  state: 'ready',
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
  args: { routePath: '/settings/billing', routeParams: {} },
  parameters: { msw: graphqlMocks },
};

export default meta;
export type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { viewModel: { state: 'loading' } },
};

export const Unavailable: Story = {
  args: { viewModel: { state: 'unavailable', reason: 'loadFailed' } },
};

export const HealthyFundedWorkspace: Story = {
  args: { viewModel: healthyWorkspaceViewModel },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.findByText('$100.00')).resolves.toBeVisible();
    await expect(
      canvas.findByRole('button', { name: '$25' }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByText(/plus applicable tax/i),
    ).resolves.toBeVisible();
    expect(canvas.queryByText(/automatic top-up/i)).not.toBeInTheDocument();
  },
};

export const PaymentActionRequired: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      fundingHistory: [
        {
          ...healthyWorkspaceViewModel.fundingHistory[0],
          actionRequired: true,
          expiresAt: null,
          id: 'funding-action-required',
          state: 'AWAITING_PAYMENT',
        },
      ],
    },
  },
};

export const MissingPaymentDetails: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      customerFundingBillingSummary: {
        ...billingSummary,
        card: null,
        paymentMethodReady: false,
      },
      customerFundingPaymentMethodReady: false,
    },
  },
};

export const MobileFixedTopUps: Story = {
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
  render: () => {
    const onRequestTopUp = fn();

    return (
      <MemoryRouter>
        <div data-testid="billing-mobile-canvas">
          <SettingsWorkspaceBillingContent
            onRequestTopUp={onRequestTopUp}
            viewModel={healthyWorkspaceViewModel}
          />
        </div>
      </MemoryRouter>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '$50' }));
    await expect(
      canvas.findByRole('button', { name: 'Add $50 credit' }),
    ).resolves.toBeVisible();
    const mobileCanvas = await canvas.findByTestId('billing-mobile-canvas');
    expect(mobileCanvas.scrollWidth).toBeLessThanOrEqual(
      mobileCanvas.clientWidth,
    );
  },
};

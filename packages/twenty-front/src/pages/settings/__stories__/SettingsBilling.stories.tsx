import {
  type Decorator,
  type Meta,
  type StoryObj,
} from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { expect, fn, userEvent, within } from 'storybook/test';

import {
  SettingsWorkspaceBillingContent,
  type WorkspaceBillingViewModel,
} from '~/modules/settings/billing/components/SettingsWorkspaceBillingContent';
import { ManagedProviderCustomerFundingPaymentForm } from '~/modules/settings/billing/components/ManagedProviderCustomerFundingStripeForms';
import {
  SettingsBilling,
  type SettingsBillingProps,
} from '~/pages/settings/billing/SettingsBilling';
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
  customerFundingPolicy: {
    incrementCents: 100,
    maximumPrincipalCents: 50_000,
    minimumPrincipalCents: 500,
    suggestedPrincipalCents: [2_500, 5_000, 10_000],
  },
  fundingHistory: [
    {
      actionRequired: false,
      collectedTotalCents: 2_700,
      createdAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2027-08-20T10:05:00.000Z',
      fundingType: 'PURCHASED',
      id: 'funding-active',
      invoiceUrl: '#invoice-active',
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
    const customAmountInput = await canvas.findByRole('textbox', {
      name: 'Custom amount',
    });
    await userEvent.type(customAmountInput, '37');
    await expect(
      canvas.findByRole('button', { name: 'Add $37 credit' }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByText('Total collected: $27.00'),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByText(/Visa •••• 4242.*12\/30/i),
    ).resolves.toBeVisible();
    expect(canvas.queryByText(/automatic top-up/i)).not.toBeInTheDocument();
  },
};

export const CustomerFundingUnavailable: Story = {
  args: {
    viewModel: {
      ...healthyWorkspaceViewModel,
      customerFundingAvailable: false,
    },
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

export const PaymentAndBillingDetailsEditor: Story = {
  parameters: { componentCanvas: true },
  render: () => (
    <ManagedProviderCustomerFundingPaymentForm
      billingSummary={billingSummary}
      clientSecret={null}
      onCancel={fn()}
      onComplete={() => Promise.resolve()}
      publishableKey={null}
      setupIntentId={null}
    />
  ),
};

export const MobileCustomTopUps: Story = {
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
    const onRequestFunding = fn();

    return (
      <MemoryRouter>
        <div data-testid="billing-mobile-canvas">
          <SettingsWorkspaceBillingContent
            onRequestFunding={onRequestFunding}
            viewModel={healthyWorkspaceViewModel}
          />
        </div>
      </MemoryRouter>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const customAmountInput = await canvas.findByRole('textbox', {
      name: 'Custom amount',
    });
    await userEvent.type(customAmountInput, '500');
    await expect(
      canvas.findByRole('button', { name: 'Add $500 credit' }),
    ).resolves.toBeVisible();
    const mobileCanvas = await canvas.findByTestId('billing-mobile-canvas');
    expect(mobileCanvas.scrollWidth).toBeLessThanOrEqual(
      mobileCanvas.clientWidth,
    );
  },
};

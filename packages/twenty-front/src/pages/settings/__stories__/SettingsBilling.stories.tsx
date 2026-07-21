import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

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

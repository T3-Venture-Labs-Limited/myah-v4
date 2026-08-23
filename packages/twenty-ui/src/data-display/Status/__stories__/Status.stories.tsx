import { type Meta, type StoryObj } from '@storybook/react-vite';
import {
  A11Y_DEFER_COLOR_CONTRAST,
  CatalogDecorator,
  type CatalogStory,
  ComponentDecorator,
} from '@ui/testing';
import { type ThemeColor, MAIN_COLOR_NAMES } from '@ui/theme';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Status } from '@ui/data-display/Status/Status';

const meta: Meta<typeof Status> = {
  title: 'UI/Data Display/Status',
  component: Status,
  args: {
    text: 'Urgent',
    weight: 'medium',
  },
};

export default meta;
type Story = StoryObj<typeof Status>;

export const Default: Story = {
  args: {
    color: 'red',
  },
  decorators: [ComponentDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(
      canvas.getByRole('heading', { level: 3, name: 'Urgent' }),
    ).toBeVisible();
  },
};

export const Clickable: Story = {
  args: {
    color: 'red',
    onClick: fn(),
  },
  decorators: [ComponentDecorator],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole('button', { name: 'Urgent' });

    await userEvent.tab();
    expect(status).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('[Space]');

    expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const WithLongText: Story = {
  decorators: [ComponentDecorator],
  args: {
    color: 'green',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
  },
  parameters: {
    a11y: A11Y_DEFER_COLOR_CONTRAST,
    container: { width: 100 },
  },
};

export const Catalog: CatalogStory<Story, typeof Status> = {
  argTypes: {
    color: { control: false },
  },
  parameters: {
    a11y: A11Y_DEFER_COLOR_CONTRAST,
    catalog: {
      dimensions: [
        {
          name: 'colors',
          values: MAIN_COLOR_NAMES,
          props: (color: ThemeColor) => ({ color }),
        },
      ],
    },
  },
  decorators: [CatalogDecorator],
};

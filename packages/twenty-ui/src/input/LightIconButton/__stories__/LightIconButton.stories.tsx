import { type Meta, type StoryObj } from '@storybook/react-vite';
import { createRef } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { IconSearch } from '@ui/icon';
import {
  A11Y_DEFER_COLOR_CONTRAST,
  CatalogDecorator,
  type CatalogStory,
  ComponentDecorator,
} from '@ui/testing';
import {
  LightIconButton,
  type LightIconButtonAccent,
  type LightIconButtonSize,
} from '@ui/input/LightIconButton/LightIconButton';

const meta: Meta<typeof LightIconButton> = {
  title: 'UI/Input/Button/LightIconButton',
  component: LightIconButton,
};

export default meta;
type Story = StoryObj<typeof LightIconButton>;

const lightIconButtonRef = createRef<HTMLButtonElement>();

const onLightIconButtonClick = fn();
const onLightIconButtonKeyDown = fn();

export const Default: Story = {
  args: {
    title: 'Filter',
    accent: 'secondary',
    disabled: false,
    active: false,
    focus: false,
    Icon: IconSearch,
  },
  argTypes: {
    Icon: { control: false },
  },
  decorators: [ComponentDecorator],
};

export const Catalog: CatalogStory<Story, typeof LightIconButton> = {
  args: { title: 'Filter', Icon: IconSearch },
  argTypes: {
    accent: { control: false },
    disabled: { control: false },
    active: { control: false },
    focus: { control: false },
  },
  parameters: {
    a11y: A11Y_DEFER_COLOR_CONTRAST,
    pseudo: { hover: ['.hover'], active: ['.pressed'] },
    catalog: {
      dimensions: [
        {
          name: 'states',
          values: [
            'default',
            'hover',
            'pressed',
            'disabled',
            'active',
            'focus',
            'disabled+focus',
            'disabled+active',
          ],
          props: (state: string) => {
            switch (state) {
              case 'default':
                return {};
              case 'hover':
              case 'pressed':
                return { className: state };
              case 'focus':
                return { focus: true };
              case 'disabled':
                return { disabled: true };
              case 'active':
                return { active: true };
              case 'disabled+focus':
                return { disabled: true, focus: true };
              case 'disabled+active':
                return { disabled: true, active: true };
              default:
                return {};
            }
          },
        },
        {
          name: 'accents',
          values: ['secondary', 'tertiary'] satisfies LightIconButtonAccent[],
          props: (accent: LightIconButtonAccent) => ({ accent }),
        },
        {
          name: 'sizes',
          values: ['small', 'medium'] satisfies LightIconButtonSize[],
          props: (size: LightIconButtonSize) => ({ size }),
        },
      ],
    },
  },
  decorators: [CatalogDecorator],
};

export const NativeTriggerProps: Story = {
  decorators: [ComponentDecorator],
  render: () => (
    <LightIconButton
      ref={lightIconButtonRef}
      Icon={IconSearch}
      aria-label="Mailbox actions"
      aria-controls="mailbox-actions"
      aria-expanded={false}
      onClick={onLightIconButtonClick}
      onKeyDown={onLightIconButtonKeyDown}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Mailbox actions' });

    expect(button.tagName).toBe('BUTTON');
    expect(lightIconButtonRef.current).toBe(button);
    expect(button).toHaveAttribute('aria-controls', 'mailbox-actions');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    await userEvent.keyboard('{ArrowDown}');

    expect(onLightIconButtonClick).toHaveBeenCalledTimes(1);
    expect(onLightIconButtonKeyDown).toHaveBeenCalledTimes(1);
  },
};

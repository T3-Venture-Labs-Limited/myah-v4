import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import {
  A11Y_DEFER_COLOR_CONTRAST,
  CatalogDecorator,
  type CatalogStory,
  ComponentDecorator,
} from '@ui/testing';

import { RadioGroup } from '@ui/input/RadioGroup/RadioGroup';
import { LabelPosition, Radio, RadioSize } from '@ui/input/Radio/Radio';

const EmptyValueRadioGroup = () => {
  const [selectedValue, setSelectedValue] = useState('');

  return (
    <RadioGroup
      aria-label="Plan type"
      value={selectedValue}
      onValueChange={setSelectedValue}
    >
      <Radio label="Empty option" value="" />
      <Radio label="Paid option" value="paid" />
    </RadioGroup>
  );
};

const meta: Meta<typeof Radio> = {
  title: 'UI/Input/Radio/Radio',
  component: Radio,
};

export default meta;
type Story = StoryObj<typeof Radio>;

export const Default: Story = {
  args: {
    label: 'Radio',
    checked: false,
    disabled: false,
    size: RadioSize.Small,
  },
  decorators: [ComponentDecorator],
};

export const GroupedEmptyValue: Story = {
  render: () => <EmptyValueRadioGroup />,
  decorators: [ComponentDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: 'Plan type' });
    const empty = within(group).getByRole('radio', { name: 'Empty option' });
    const paid = within(group).getByRole('radio', { name: 'Paid option' });

    expect(empty).toBeChecked();
    expect(paid).not.toBeChecked();

    await userEvent.click(paid);

    expect(paid).toBeChecked();
    expect(empty).not.toBeChecked();

    await userEvent.click(empty);

    expect(empty).toBeChecked();
    expect(paid).not.toBeChecked();
  },
};

export const Catalog: CatalogStory<Story, typeof Radio> = {
  args: {
    label: 'Radio',
  },
  argTypes: {
    size: { control: false },
  },
  parameters: {
    a11y: A11Y_DEFER_COLOR_CONTRAST,
    catalog: {
      dimensions: [
        {
          name: 'checked',
          values: [false, true],
          props: (checked: boolean) => ({ checked }),
        },
        {
          name: 'disabled',
          values: [false, true],
          props: (disabled: boolean) => ({ disabled }),
        },
        {
          name: 'size',
          values: Object.values(RadioSize),
          props: (size: RadioSize) => ({ size }),
        },
        {
          name: 'labelPosition',
          values: Object.values(LabelPosition),
          props: (labelPosition: LabelPosition) => ({
            labelPosition,
          }),
        },
      ],
    },
  },
  decorators: [CatalogDecorator],
};

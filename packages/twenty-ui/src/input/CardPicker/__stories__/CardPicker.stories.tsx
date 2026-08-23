import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { CardPicker } from '@ui/input/CardPicker/CardPicker';
import { RadioGroup } from '@ui/input/RadioGroup/RadioGroup';
import { ComponentDecorator } from '@ui/testing';

const BillingIntervalPicker = () => {
  const [selectedInterval, setSelectedInterval] = useState('monthly');

  return (
    <RadioGroup
      aria-label="Billing interval"
      value={selectedInterval}
      onValueChange={setSelectedInterval}
    >
      <CardPicker aria-label="Monthly plan" value="monthly">
        <strong>Monthly plan</strong>
        <span>$25 per seat / month</span>
      </CardPicker>
      <CardPicker aria-label="Yearly plan" value="yearly">
        <strong>Yearly plan</strong>
        <span>$19 per seat / month</span>
      </CardPicker>
    </RadioGroup>
  );
};

const meta: Meta<typeof CardPicker> = {
  title: 'UI/Input/CardPicker/CardPicker',
  component: CardPicker,
  decorators: [ComponentDecorator],
};

export default meta;
type Story = StoryObj<typeof CardPicker>;

export const RadioGroupSemantics: Story = {
  render: () => <BillingIntervalPicker />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: 'Billing interval' });
    const monthly = within(group).getByRole('radio', { name: 'Monthly plan' });
    const yearly = within(group).getByRole('radio', { name: 'Yearly plan' });
    const radios = [monthly, yearly];

    expect(monthly).toBeChecked();
    expect(yearly).not.toBeChecked();
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    expect(
      group.querySelectorAll(
        'button, [role="button"], [role="radio"], input:not([aria-hidden="true"])',
      ),
    ).toHaveLength(2);

    monthly.focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(yearly).toHaveFocus();
    expect(yearly).toBeChecked();

    monthly.focus();
    await userEvent.keyboard('[Space]');

    expect(monthly).toBeChecked();
  },
};

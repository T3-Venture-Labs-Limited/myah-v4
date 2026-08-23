import {
  type Decorator,
  type Meta,
  type StoryObj,
} from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import {
  ENTERPRISE_PLAN_MODAL_ID,
  EnterprisePlanModal,
} from '@/settings/enterprise/components/EnterprisePlanModal';
import { SnackBarDecorator } from '~/testing/decorators/SnackBarDecorator';
import { RootDecorator } from '~/testing/decorators/RootDecorator';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { focusStackState } from '@/ui/utilities/focus/states/focusStackState';
import { FocusComponentType } from '@/ui/utilities/focus/types/FocusComponentType';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { ComponentDecorator } from 'twenty-ui/testing';

const ModalStateDecorator: Decorator = (Story) => {
  jotaiStore.set(
    isModalOpenedComponentState.atomFamily({
      instanceId: ENTERPRISE_PLAN_MODAL_ID,
    }),
    true,
  );
  jotaiStore.set(focusStackState.atom, [
    {
      focusId: ENTERPRISE_PLAN_MODAL_ID,
      componentInstance: {
        componentType: FocusComponentType.MODAL,
        componentInstanceId: ENTERPRISE_PLAN_MODAL_ID,
      },
      globalHotkeysConfig: {
        enableGlobalHotkeysWithModifiers: true,
        enableGlobalHotkeysConflictingWithKeyboard: true,
      },
    },
  ]);

  return <Story />;
};

const meta: Meta<typeof EnterprisePlanModal> = {
  title: 'Modules/Settings/Enterprise/EnterprisePlanModal',
  component: EnterprisePlanModal,
  decorators: [
    ModalStateDecorator,
    RootDecorator,
    SnackBarDecorator,
    ComponentDecorator,
  ],
  parameters: {
    disableHotkeyInitialization: true,
  },
};

export default meta;
type Story = StoryObj<typeof EnterprisePlanModal>;

export const BillingIntervalSemantics: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const group = await canvas.findByRole('radiogroup', {
      name: 'Billing interval',
    });
    const monthly = within(group).getByRole('radio', { name: 'Monthly' });
    const yearly = within(group).getByRole('radio', { name: 'Yearly' });
    const radios = [monthly, yearly];

    expect(monthly).toBeChecked();
    expect(yearly).not.toBeChecked();
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    expect(
      group.querySelectorAll(
        'button, [role="button"], [role="radio"], input:not([aria-hidden="true"])',
      ),
    ).toHaveLength(2);
    expect(canvas.getByText('$25', { exact: true })).toBeVisible();

    await userEvent.click(yearly);

    expect(yearly).toBeChecked();
    expect(canvas.getByText('$19', { exact: true })).toBeVisible();

    monthly.focus();
    await userEvent.keyboard('[Space]');

    expect(monthly).toBeChecked();
    expect(canvas.getByText('$25', { exact: true })).toBeVisible();

    monthly.focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(yearly).toHaveFocus();
    expect(yearly).toBeChecked();
  },
};

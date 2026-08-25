import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { StepBar } from '@/ui/navigation/step-bar/components/StepBar';
import { ComponentDecorator } from 'twenty-ui/testing';

const stepBarLabel = 'Configuración del correo';

const assertStepBarSemantics = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const list = canvas.getByRole('list', { name: stepBarLabel });
  const steps = within(list).getAllByRole('listitem');
  const completedStep = within(list).getByRole('listitem', { name: /Dominio/ });
  const currentStep = within(list).getByRole('listitem', { name: /Buzón/ });
  const upcomingStep = within(list).getByRole('listitem', { name: /Revisión/ });

  await expect(list.tagName).toBe('OL');
  await expect(steps).toHaveLength(3);
  await expect(completedStep).toHaveAccessibleName(/Step 1 of 3.*completed/i);
  await expect(currentStep).toHaveAttribute('aria-current', 'step');
  await expect(currentStep).toHaveAccessibleName(/Step 2 of 3.*current/i);
  await expect(upcomingStep).toHaveAccessibleName(/Step 3 of 3/i);
};

const meta: Meta<typeof StepBar> = {
  title: 'Modules/UI/Navigation/StepBar',
  component: StepBar,
  decorators: [ComponentDecorator],
};

export default meta;
type Story = StoryObj<typeof StepBar>;

export const DesktopSemantics: Story = {
  render: () => (
    <StepBar aria-label={stepBarLabel} activeStep={1}>
      <StepBar.Step label="Dominio" />
      <StepBar.Step label="Buzón" />
      <StepBar.Step label="Revisión" />
    </StepBar>
  ),
  play: async ({ canvasElement }) => {
    await assertStepBarSemantics(canvasElement);
  },
};

export const MobileSemantics: Story = {
  render: () => (
    <StepBar aria-label={stepBarLabel} activeStep={1}>
      <StepBar.Step label="Dominio" />
      <StepBar.Step label="Buzón" />
      <StepBar.Step label="Revisión" />
    </StepBar>
  ),
  parameters: {
    viewport: {
      options: {
        myahStepBarMobile: {
          name: 'Myah step bar mobile',
          styles: { width: '390px', height: '844px' },
        },
      },
      defaultViewport: 'myahStepBarMobile',
    },
  },
  play: async ({ canvasElement }) => {
    await assertStepBarSemantics(canvasElement);
  },
};

export const MobileInitialStepRetention: Story = {
  render: () => (
    <StepBar aria-label={stepBarLabel} activeStep={-1}>
      <StepBar.Step label="Dominio" />
      <StepBar.Step label="Buzón" />
      <StepBar.Step label="Revisión" />
    </StepBar>
  ),
  parameters: {
    viewport: {
      options: {
        myahStepBarMobile: {
          name: 'Myah step bar mobile',
          styles: { width: '390px', height: '844px' },
        },
      },
      defaultViewport: 'myahStepBarMobile',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('list', { name: stepBarLabel });
    const steps = within(list).getAllByRole('listitem');
    const initialStep = within(list).getByRole('listitem', {
      name: /Step 1 of 3 Dominio/,
    });
    const nextStep = within(list).getByRole('listitem', {
      name: /Step 2 of 3 Buzón/,
    });
    const finalStep = within(list).getByRole('listitem', {
      name: /Step 3 of 3 Revisión/,
    });

    await expect(steps).toHaveLength(3);
    await expect(initialStep).not.toHaveAttribute('data-visually-hidden');
    await expect(nextStep).toHaveAttribute('data-visually-hidden', 'true');
    await expect(finalStep).toHaveAttribute('data-visually-hidden', 'true');
  },
};

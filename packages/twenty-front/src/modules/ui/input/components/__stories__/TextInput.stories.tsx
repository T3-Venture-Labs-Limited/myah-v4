import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';

import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import {
  TextInput,
  type TextInputComponentProps,
} from '@/ui/input/components/TextInput';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ComponentDecorator } from 'twenty-ui/testing';

type RenderProps = TextInputComponentProps;

const Render = (args: RenderProps) => {
  const [value, setValue] = useState(args.value);
  const handleChange = (text: string) => {
    args.onChange?.(text);
    setValue(text);
  };

  // oxlint-disable-next-line react/jsx-props-no-spreading
  return <TextInput {...args} value={value} onChange={handleChange} />;
};

const NativePropsAndExternalRefRender = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.focus()}>
        Focus native input
      </button>
      <div id="mailbox-password-hint">Use your SMTP app password</div>
      <div id="mailbox-protocol-settings" />
      <form id="mailbox-connection-form" />
      <SettingsTextInput
        ref={inputRef}
        instanceId="mailbox-password-input"
        id="mailbox-password"
        label="Mailbox password"
        name="smtp.password"
        aria-label="Mailbox credential"
        aria-controls="mailbox-protocol-settings"
        aria-describedby="mailbox-password-hint"
        form="mailbox-connection-form"
        pattern="[A-Za-z0-9]+"
        data-testid="native-input"
        value={value}
        onChange={setValue}
      />
    </>
  );
};

const meta: Meta<typeof TextInput> = {
  title: 'UI/Input/TextInput',
  component: TextInput,
  decorators: [ComponentDecorator],
  args: { placeholder: 'Tim' },
  render: Render,
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = {};

export const Filled: Story = {
  args: { value: 'Tim' },
};

export const Disabled: Story = {
  args: { disabled: true, value: 'Tim' },
};

export const AutoGrow: Story = {
  args: { autoGrow: true, value: 'Tim' },
};

export const AutoGrowWithPlaceholder: Story = {
  args: { autoGrow: true, placeholder: 'Tim' },
};

export const Small: Story = {
  args: { sizeVariant: 'sm', value: 'Tim' },
};

export const AutoGrowSmall: Story = {
  args: { autoGrow: true, sizeVariant: 'sm', value: 'Tim' },
};

export const WithLeftAdornment: Story = {
  args: {
    leftAdornment: 'https://',
  },
};

export const WithRightAdornment: Story = {
  args: {
    rightAdornment: '@twenty.com',
  },
};

export const PasswordVisibilityToggle: Story = {
  args: {
    label: 'IMAP Password',
    type: 'password',
    'aria-label': 'Mailbox credential',
    error: 'Enter a password',
    value: 'not-a-real-password',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Mailbox credential');
    const showPasswordButton = await canvas.findByRole('button', {
      name: 'Show Mailbox credential',
    });

    expect(showPasswordButton).toHaveAttribute('type', 'button');
    expect(showPasswordButton).toHaveAttribute('aria-pressed', 'false');
    expect(input).toHaveAttribute('type', 'password');

    await userEvent.click(showPasswordButton);

    const hidePasswordButton = canvas.getByRole('button', {
      name: 'Hide Mailbox credential',
    });

    expect(hidePasswordButton).toHaveAttribute('aria-pressed', 'true');
    expect(input).toHaveAttribute('type', 'text');

    hidePasswordButton.focus();
    await userEvent.keyboard('[Space]');

    expect(
      canvas.getByRole('button', {
        name: 'Show Mailbox credential',
      }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(input).toHaveAttribute('type', 'password');
  },
};

export const PasswordVisibilityReservesTextSpace: Story = {
  args: {
    label: 'Long password',
    type: 'password',
    value:
      'not-a-real-password-that-is-long-enough-to-scroll-beyond-the-visibility-button',
    width: 260,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Long password');
    const showPasswordButton = await canvas.findByRole('button', {
      name: 'Show Long password',
    });

    await userEvent.click(input);
    await userEvent.keyboard('{End}');

    await waitFor(() => {
      expect(input.scrollLeft).toBeGreaterThan(0);
    });

    const inputRect = input.getBoundingClientRect();
    const showPasswordButtonRect = showPasswordButton.getBoundingClientRect();
    const inputPaddingRight = Number.parseFloat(
      getComputedStyle(input).paddingRight,
    );

    expect(inputRect.width).toBeGreaterThan(0);
    expect(showPasswordButtonRect.width).toBeGreaterThan(0);
    expect(inputRect.right - inputPaddingRight).toBeLessThanOrEqual(
      showPasswordButtonRect.left,
    );
  },
};

export const LocalizedPasswordVisibilityToggle: Story = {
  args: {
    label: 'Mot de passe IMAP',
    type: 'password',
    value: 'not-a-real-password',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const showPasswordButton = await canvas.findByRole('button', {
      name: 'Show Mot de passe IMAP',
    });

    await userEvent.click(showPasswordButton);

    expect(
      canvas.getByRole('button', {
        name: 'Hide Mot de passe IMAP',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  },
};

export const DisabledPasswordVisibilityToggle: Story = {
  args: {
    disabled: true,
    label: 'SMTP Password',
    type: 'password',
    value: 'not-a-real-password',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const showPasswordButton = await canvas.findByRole('button', {
      name: 'Show SMTP Password',
    });

    expect(showPasswordButton).toBeDisabled();
  },
};

export const ErrorAssociation: Story = {
  args: {
    id: 'mailbox-password',
    label: 'Mailbox password',
    error: 'Enter a password',
    'aria-describedby': 'mailbox-password-hint',
  },
  render: (args) => (
    <>
      <div id="mailbox-password-hint">Use your SMTP app password</div>
      <Render {...args} />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Mailbox password');
    const error = await canvas.findByText('Enter a password');
    const errorId = 'mailbox-password-error';
    const describedBy =
      input.getAttribute('aria-describedby')?.split(' ') ?? [];

    expect(input).toHaveAttribute('id', 'mailbox-password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-errormessage', errorId);
    expect(error).toHaveAttribute('id', errorId);
    expect(describedBy).toContain('mailbox-password-hint');
    expect(describedBy).toContain(errorId);
  },
};

export const ErrorWithoutLocalHelper: Story = {
  args: {
    id: 'mailbox-password',
    error: 'Enter a password',
    noErrorHelper: true,
    'aria-describedby': 'mailbox-password-hint',
    'aria-errormessage': 'external-password-error',
  },
  render: (args) => (
    <>
      <div id="mailbox-password-hint">Use your SMTP app password</div>
      <div id="external-password-error">Enter a password</div>
      <Render {...args} />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'mailbox-password-hint');
    expect(input).toHaveAttribute(
      'aria-errormessage',
      'external-password-error',
    );
    expect(canvas.queryAllByText('Enter a password')).toHaveLength(1);
  },
};

export const NativePropsAndExternalRef: Story = {
  render: NativePropsAndExternalRefRender,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', {
      name: 'Mailbox credential',
    });

    expect(input).toHaveAttribute('id', 'mailbox-password');
    expect(input).toHaveAttribute('name', 'smtp.password');
    expect(input).toHaveAttribute('aria-controls', 'mailbox-protocol-settings');
    expect(input).toHaveAttribute('aria-describedby', 'mailbox-password-hint');
    expect(input).toHaveAttribute('form', 'mailbox-connection-form');
    expect(input).toHaveAttribute('pattern', '[A-Za-z0-9]+');
    expect(input).toHaveAttribute('data-testid', 'native-input');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Focus native input' }),
    );

    expect(input).toHaveFocus();
  },
};

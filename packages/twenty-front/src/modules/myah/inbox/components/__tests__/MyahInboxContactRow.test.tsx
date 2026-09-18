import { fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxContactRow } from '@/myah/inbox/components/MyahInboxContactRow';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

jest.mock('twenty-ui/data-display', () => ({
  Avatar: ({
    placeholder,
    placeholderColorSeed,
  }: {
    placeholder: string;
    placeholderColorSeed: string;
  }) => (
    <span data-color-seed={placeholderColorSeed}>
      {placeholder.slice(0, 1)}
    </span>
  ),
}));

jest.mock('twenty-ui/icon', () => ({
  IconBrandInstagram: () => <span aria-hidden="true">Instagram icon</span>,
  IconMail: () => <span aria-hidden="true">Email icon</span>,
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: {
      transparent: { light: 'lightgray', lighter: 'whitesmoke' },
    },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { rounded: '9999px' },
    },
    font: {
      color: {
        danger: 'darkred',
        primary: 'black',
        secondary: 'dimgray',
        tertiary: 'gray',
      },
      family: 'sans-serif',
      size: { sm: '13px', xs: '11px' },
      weight: { medium: 500 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
  useTheme: () => ({
    icon: { size: { sm: 16 }, stroke: { sm: 1.5 } },
  }),
}));

const contact: MyahInboxContact = {
  id: 'contact-1',
  identityKind: 'CREATOR',
  displayName: 'Ada Creator',
  instagramUsername: 'ada',
  creator: { id: 'creator-1', name: 'Ada Creator' },
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  latestChannel: 'INSTAGRAM',
  preview: 'Can we move the launch to Friday?',
  sender: '@ada',
  needsAttention: true,
  triage: {
    isAvailable: true,
    inboxOwnerId: null,
    inboxState: 'NEEDS_REPLY',
    snoozedUntil: null,
    revision: 1,
    identityGeneration: '1',
  },
  email: {
    isAvailable: true,
    threadCount: 2,
    threadIds: ['thread-1', 'thread-2'],
    latestThreadId: 'thread-2',
    needsAttention: false,
  },
  instagram: {
    isAvailable: true,
    state: 'READY',
    needsAttention: true,
    conversations: [],
  },
};

describe('MyahInboxContactRow', () => {
  it('uses the contact identity as the selectable option with a native avatar fallback', () => {
    const onSelect = jest.fn();

    render(
      <MyahInboxContactRow
        contact={contact}
        isSelected
        tabIndex={0}
        rowRef={() => undefined}
        onSelect={onSelect}
        onKeyDown={() => undefined}
      />,
    );

    const row = screen.getByRole('option', { name: /Ada Creator/ });

    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveAttribute('tabindex', '0');
    expect(
      screen
        .getByRole('img', { name: 'Ada Creator avatar' })
        .querySelector('[data-color-seed="contact-1"]'),
    ).not.toBeNull();
    expect(row).toHaveTextContent('Can we move the launch to Friday?');
    expect(row).not.toHaveTextContent('Subject');

    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('contact-1');
  });

  it('shows quiet availability and attention indicators without nesting buttons', () => {
    render(
      <MyahInboxContactRow
        contact={contact}
        isSelected={false}
        tabIndex={-1}
        rowRef={() => undefined}
        onSelect={jest.fn()}
        onKeyDown={() => undefined}
      />,
    );

    const row = screen.getByRole('option', { name: /Ada Creator/ });

    expect(screen.getByLabelText('Email available')).toBeVisible();
    expect(screen.getByLabelText('Instagram available')).toBeVisible();
    expect(screen.getByText('Needs attention')).toBeVisible();
    expect(row.querySelector('button')).toBeNull();
  });

  it('omits unavailable channels and attention when the contact is quiet', () => {
    render(
      <MyahInboxContactRow
        contact={{
          ...contact,
          needsAttention: false,
          email: { ...contact.email, isAvailable: false },
          instagram: { ...contact.instagram, isAvailable: false },
        }}
        isSelected={false}
        tabIndex={-1}
        rowRef={() => undefined}
        onSelect={jest.fn()}
        onKeyDown={() => undefined}
      />,
    );

    expect(screen.queryByLabelText('Email available')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Instagram available'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });
});

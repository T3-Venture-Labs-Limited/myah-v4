import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type CampaignSequence } from 'twenty-shared/workflow';

import { CampaignSequenceEditor } from '@/myah-outreach/components/CampaignSequenceEditor';

const email = (id: string, subject: string) => ({
  id,
  channel: 'EMAIL' as const,
  subject,
  body: '',
  files: [],
  replyToThread: false,
});

const initial: CampaignSequence = {
  schemaVersion: 1,
  messages: [
    email('a0000000-0000-4000-8000-000000000001', 'First'),
    email('b0000000-0000-4000-8000-000000000002', 'Second'),
  ],
  delaysSeconds: [86400],
};

const Harness = ({ sequence = initial }: { sequence?: CampaignSequence }) => {
  const [draft, setDraft] = useState(sequence);
  const [selected, setSelected] = useState<string | null>(
    draft.messages[0]?.id ?? null,
  );

  return (
    <CampaignSequenceEditor
      editable
      issues={[]}
      onChange={setDraft}
      onSelectMessage={setSelected}
      selectedMessageId={selected}
      sequence={draft}
    />
  );
};

describe('CampaignSequenceEditor', () => {
  it('moves messages while leaving positional delay controls unchanged and selects by id', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Move message 2 up' }));

    const list = screen.getByRole('list', { name: 'Campaign sequence' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('Second');
    expect(cards[1]).toHaveTextContent('First');
    expect(screen.getByText('Wait before step 2')).toBeVisible();
    expect(
      screen.getByRole('spinbutton', { name: 'Wait before step 2' }),
    ).toHaveValue(1);
    fireEvent.click(screen.getByText('Edit precise delay'));
    expect(
      screen.getByRole('spinbutton', { name: 'Delay 1 days' }),
    ).toHaveValue(1);
    expect(
      screen.getByRole('button', { name: 'Edit message 2' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows waits as a single value while preserving precise existing durations', () => {
    render(<Harness sequence={{ ...initial, delaysSeconds: [90000] }} />);
    const wait = screen.getByRole('spinbutton', { name: 'Wait before step 2' });
    expect(wait).toHaveValue(25);
    expect(wait.closest('label')).toHaveTextContent('hours');
    fireEvent.change(wait, { target: { value: '26' } });
    fireEvent.click(screen.getByText('Edit precise delay'));
    expect(
      screen.getByRole('spinbutton', { name: 'Delay 1 days' }),
    ).toHaveValue(1);
    expect(
      screen.getByRole('spinbutton', { name: 'Delay 1 hours' }),
    ).toHaveValue(2);
  });

  it('marks the selected ordered step and preserves authored content through channel selection', () => {
    render(<Harness />);

    const list = screen.getByRole('list', { name: 'Campaign sequence' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards[0]).toHaveAttribute('data-selected', 'true');
    expect(cards[0]).toHaveTextContent('New conversation');
    expect(cards[1]).toHaveAttribute('data-selected', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Edit message 2' }));
    expect(within(list).getAllByRole('listitem')[1]).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('First');
  });

  it('inserts an unset positional delay and reports missing, zero, and overflow durations', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Instagram' }));
    expect(screen.getByText('Set a delay between messages')).toBeVisible();

    fireEvent.click(screen.getAllByText('Edit precise delay')[1]);
    const seconds = screen.getByRole('spinbutton', { name: 'Delay 2 seconds' });
    fireEvent.change(seconds, { target: { value: '0' } });
    expect(screen.getByText('Delay must be greater than zero')).toBeVisible();

    fireEvent.change(seconds, {
      target: { value: String(Number.MAX_SAFE_INTEGER) },
    });
    expect(screen.getByText('Delay is too large')).toBeVisible();
  });

  it('keeps controls in keyboard order and disables all authoring in read-only mode', () => {
    const { rerender } = render(<Harness />);
    const controls = within(screen.getAllByRole('listitem')[0])
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(
      within(
        screen.getByRole('group', { name: 'Add sequence step' }),
      ).getAllByRole('button'),
    ).toHaveLength(2);
    expect(
      within(
        screen.getByRole('group', { name: 'Message 1 actions' }),
      ).getAllByRole('button'),
    ).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Add email' })).toHaveAttribute(
      'data-variant',
      'primary',
    );
    expect(
      screen.getByRole('button', { name: 'Add Instagram' }),
    ).toHaveAttribute('data-variant', 'secondary');
    expect(
      screen.getByRole('button', { name: 'Move message 1 down' }),
    ).toHaveAttribute('data-variant', 'tertiary');
    expect(controls).toEqual([
      'Edit message 1',
      'Move message 1 up',
      'Move message 1 down',
      'Remove message 1',
    ]);

    rerender(
      <CampaignSequenceEditor
        editable={false}
        issues={[]}
        onChange={jest.fn()}
        onSelectMessage={jest.fn()}
        selectedMessageId={initial.messages[0].id}
        sequence={initial}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add email' })).toBeDisabled();
    expect(
      screen.getByRole('spinbutton', { name: 'Wait before step 2' }),
    ).toBeDisabled();
  });
});

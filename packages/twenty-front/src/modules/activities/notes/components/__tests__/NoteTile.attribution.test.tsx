import { render, screen } from '@testing-library/react';

import { NoteTile } from '@/activities/notes/components/NoteTile';
import { type Note } from '@/activities/types/Note';

jest.mock(
  '@/activities/inline-cell/hooks/useActivityTargetsComponentInstanceId',
  () => ({
    useActivityTargetsComponentInstanceId: () => 'targets',
  }),
);
jest.mock(
  '@/activities/inline-cell/components/ActivityTargetsInlineCell',
  () => ({
    ActivityTargetsInlineCell: () => null,
  }),
);
jest.mock(
  '@/object-record/record-field/ui/components/FieldContextProvider',
  () => ({
    FieldContextProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  }),
);
jest.mock(
  '@/object-record/record-field-list/contexts/RecordFieldsScopeContext',
  () => ({
    RecordFieldsScopeContextProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => children,
  }),
);
jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: jest.fn() }),
}));

const note: Note = {
  id: 'note-id',
  title: 'Creator relationship',
  createdAt: '2026-09-22T12:00:00.000Z',
  updatedAt: '2026-09-22T12:00:00.000Z',
  __typename: 'Note',
};

describe('NoteTile attribution', () => {
  it('shows only the linked note’s own recorded actor and time', () => {
    render(
      <NoteTile
        note={{ ...note, createdBy: { name: 'Alex Rivera', source: 'MANUAL' } }}
        isSingleNote
      />,
    );

    expect(
      screen.getByText(/Created by Alex Rivera.*Source: MANUAL/),
    ).toBeVisible();
    expect(screen.getByText(/Sep 22, 2026/)).toBeVisible();
  });

  it('labels absent author without guessing from campaign membership', () => {
    render(<NoteTile note={note} isSingleNote />);

    expect(screen.getByText(/Author unavailable/)).toBeVisible();
    expect(screen.queryByText(/Source:/)).not.toBeInTheDocument();
  });
});

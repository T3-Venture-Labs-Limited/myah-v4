import { render, screen } from '@testing-library/react';

import { FormSingleRecordFieldChip } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordFieldChip';

jest.mock('@/object-record/components/RecordChip', () => ({
  RecordChip: ({ forceDisableClick }: { forceDisableClick?: boolean }) => (
    <output data-testid="record-chip">{String(forceDisableClick)}</output>
  ),
}));

describe('FormSingleRecordFieldChip', () => {
  it('keeps the selected record navigable by default', () => {
    render(
      <FormSingleRecordFieldChip
        draftValue={{ type: 'static', value: 'creator-id' }}
        selectedRecord={{ id: 'creator-id' } as never}
        objectNameSingular="creator"
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByTestId('record-chip')).toHaveTextContent('false');
  });

  it('prevents a selected record from intercepting its picker trigger when requested', () => {
    render(
      <FormSingleRecordFieldChip
        draftValue={{ type: 'static', value: 'creator-id' }}
        selectedRecord={{ id: 'creator-id' } as never}
        objectNameSingular="creator"
        onRemove={jest.fn()}
        shouldPreventRecordNavigation
      />,
    );

    expect(screen.getByTestId('record-chip')).toHaveTextContent('true');
  });
});

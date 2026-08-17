import { render, screen } from '@testing-library/react';

import { RecordTableEmptyStateNoGroupNoRecordAtAll } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateNoGroupNoRecordAtAll';

const mockRecordTableEmptyStateDisplay = jest.fn();

jest.mock(
  '@/object-record/record-table/contexts/RecordTableContext',
  () => ({
    useRecordTableContextOrThrow: () => ({
      objectMetadataItem: { nameSingular: 'campaignCreator' },
    }),
  }),
);

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useOptionalRecordIndexContext: () => ({ hideEmptyStateSubtitle: true }),
}));

jest.mock('@/object-metadata/hooks/useObjectLabel', () => ({
  useObjectLabel: () => 'Campaign Creator',
}));

jest.mock(
  '@/object-record/record-table/hooks/useCreateNewIndexRecord',
  () => ({
    useCreateNewIndexRecord: () => ({ createNewIndexRecord: jest.fn() }),
  }),
);

jest.mock(
  '@/object-record/record-table/empty-state/utils/getEmptyStateTitle',
  () => ({
    getEmptyStateTitle: () => 'Add your first Campaign Creator',
  }),
);

jest.mock(
  '@/object-record/record-table/empty-state/utils/getEmptyStateSubTitle',
  () => ({
    getEmptyStateSubTitle: () =>
      'Use our API or add your first Campaign Creator manually',
  }),
);

jest.mock(
  '@/object-record/record-table/empty-state/components/RecordTableEmptyStateDisplay',
  () => ({
    RecordTableEmptyStateDisplay: (props: {
      animatedPlaceholderType: string;
      subTitle?: string;
      title: string;
    }) => {
      mockRecordTableEmptyStateDisplay(props);
      return (
        <>
          <div>{props.title}</div>
          {props.subTitle && <div>{props.subTitle}</div>}
        </>
      );
    },
  }),
);

describe('RecordTableEmptyStateNoGroupNoRecordAtAll', () => {
  it('suppresses the inherited subtitle without changing the native empty state title', () => {
    render(<RecordTableEmptyStateNoGroupNoRecordAtAll />);

    expect(screen.getByText('Add your first Campaign Creator')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Use our API or add your first Campaign Creator manually',
      ),
    ).not.toBeInTheDocument();
    expect(mockRecordTableEmptyStateDisplay).toHaveBeenCalledWith(
      expect.objectContaining({ animatedPlaceholderType: 'noRecord' }),
    );
  });
});

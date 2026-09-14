import { fireEvent, render, screen } from '@testing-library/react';

import { RecordTableEmptyStateNoGroupNoRecordAtAll } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateNoGroupNoRecordAtAll';

const mockRecordTableEmptyStateDisplay = jest.fn();
const mockCreateNewIndexRecord = jest.fn();

let recordIndexContext:
  | {
      embeddedSurfaceOptions?: { hideAddNew?: boolean };
      hideEmptyStateSubtitle: boolean;
    }
  | undefined = { hideEmptyStateSubtitle: true };

jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: () => ({
    objectMetadataItem: { nameSingular: 'campaignCreator' },
  }),
}));

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useOptionalRecordIndexContext: () => recordIndexContext,
}));

jest.mock('@/object-metadata/hooks/useObjectLabel', () => ({
  useObjectLabel: () => 'Campaign Creator',
}));

jest.mock('@/object-record/record-table/hooks/useCreateNewIndexRecord', () => ({
  useCreateNewIndexRecord: () => ({
    createNewIndexRecord: mockCreateNewIndexRecord,
  }),
}));

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
      onClick?: () => void;
      buttonTitle?: string;
      subTitle?: string;
      title: string;
    }) => {
      mockRecordTableEmptyStateDisplay(props);
      return (
        <>
          <div>{props.title}</div>
          {props.subTitle && <div>{props.subTitle}</div>}
          {props.buttonTitle && (
            <button onClick={props.onClick}>{props.buttonTitle}</button>
          )}
        </>
      );
    },
  }),
);

describe('RecordTableEmptyStateNoGroupNoRecordAtAll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recordIndexContext = { hideEmptyStateSubtitle: true };
  });

  it('forwards a native create gesture', () => {
    render(<RecordTableEmptyStateNoGroupNoRecordAtAll />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a Campaign Creator' }),
    );
    expect(mockCreateNewIndexRecord).toHaveBeenCalledTimes(1);
  });

  it('suppresses the inherited subtitle without changing the native empty state title', () => {
    render(<RecordTableEmptyStateNoGroupNoRecordAtAll />);

    expect(
      screen.getByText('Add your first Campaign Creator'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Use our API or add your first Campaign Creator manually',
      ),
    ).not.toBeInTheDocument();
    expect(mockRecordTableEmptyStateDisplay).toHaveBeenCalledWith(
      expect.objectContaining({ animatedPlaceholderType: 'noRecord' }),
    );
  });

  it('keeps the inherited subtitle for non-opt-in record index surfaces', () => {
    recordIndexContext = undefined;

    render(<RecordTableEmptyStateNoGroupNoRecordAtAll />);

    expect(
      screen.getByText(
        'Use our API or add your first Campaign Creator manually',
      ),
    ).toBeInTheDocument();
  });

  it('removes the empty-state create control for Campaign tables', () => {
    recordIndexContext = {
      embeddedSurfaceOptions: { hideAddNew: true },
      hideEmptyStateSubtitle: true,
    };

    render(<RecordTableEmptyStateNoGroupNoRecordAtAll />);

    expect(
      screen.queryByRole('button', { name: 'Add a Campaign Creator' }),
    ).not.toBeInTheDocument();
    expect(
      mockRecordTableEmptyStateDisplay.mock.calls.at(-1)?.[0],
    ).not.toHaveProperty('buttonTitle');
  });
});

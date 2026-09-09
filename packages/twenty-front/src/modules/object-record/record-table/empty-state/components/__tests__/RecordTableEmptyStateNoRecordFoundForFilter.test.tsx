import { fireEvent, render, screen } from '@testing-library/react';

import { RecordTableEmptyStateNoRecordFoundForFilter } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateNoRecordFoundForFilter';

const mockRecordTableEmptyStateDisplay = jest.fn();
const mockCreateNewIndexRecord = jest.fn();

let hideAddNew = false;

jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: () => ({
    objectMetadataItem: { nameSingular: 'campaignCreator' },
  }),
}));

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useOptionalRecordIndexContext: () => ({
    embeddedSurfaceOptions: { hideAddNew },
  }),
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
  '@/object-record/record-table/empty-state/components/RecordTableEmptyStateDisplay',
  () => ({
    RecordTableEmptyStateDisplay: (props: {
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

describe('RecordTableEmptyStateNoRecordFoundForFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hideAddNew = false;
  });

  it('forwards a native create gesture', () => {
    render(<RecordTableEmptyStateNoRecordFoundForFilter />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a Campaign Creator' }),
    );
    expect(mockCreateNewIndexRecord).toHaveBeenCalledTimes(1);
  });

  it('keeps the create control for normal tables', () => {
    render(<RecordTableEmptyStateNoRecordFoundForFilter />);

    expect(
      screen.getByRole('button', { name: 'Add a Campaign Creator' }),
    ).toBeInTheDocument();
  });

  it('removes the create control for filtered Campaign tables', () => {
    hideAddNew = true;

    render(<RecordTableEmptyStateNoRecordFoundForFilter />);

    expect(
      screen.queryByRole('button', { name: 'Add a Campaign Creator' }),
    ).not.toBeInTheDocument();
    expect(
      mockRecordTableEmptyStateDisplay.mock.calls.at(-1)?.[0],
    ).not.toHaveProperty('buttonTitle');
  });
});

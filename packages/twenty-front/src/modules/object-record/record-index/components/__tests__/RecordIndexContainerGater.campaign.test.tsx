import { fireEvent, render, screen } from '@testing-library/react';
import { RecordIndexContainerGater } from '@/object-record/record-index/components/RecordIndexContainerGater';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { ViewType } from '@/views/types/ViewType';

let currentView: { universalIdentifier: string; type: ViewType } | undefined;
let objectNameSingular = 'campaign';

jest.mock('@/object-record/record-index/components/RecordIndexSurface', () => ({
  RecordIndexSurface: jest.fn(({ campaignOverviewSummary }) => (
    <>{campaignOverviewSummary}</>
  )),
}));
jest.mock(
  '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore',
  () => ({
    useRecordIndexIdFromCurrentContextStore: () => ({
      objectMetadataItem: { nameSingular: objectNameSingular },
    }),
  }),
);
jest.mock(
  '@/object-record/record-index/hooks/useHandleIndexIdentifierClick',
  () => ({
    useHandleIndexIdentifierClick: () => ({
      indexIdentifierUrl: () => '/campaign',
    }),
  }),
);
jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({ currentView }),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => 'current-view',
  }),
);

const campaignView = '5865bdbf-be33-5457-9d91-184885276b94';
const renderGater = () =>
  render(
    <RecordIndexContainerGater
      campaignCreationAction={<button>Named draft</button>}
      campaignOverviewSummary={<span>Summary</span>}
      campaignOverviewContent={<span>Portfolio rows</span>}
    />,
  );

describe('standard Campaign overview creation placement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    objectNameSingular = 'campaign';
    currentView = { universalIdentifier: campaignView, type: ViewType.TABLE };
  });

  it('passes the action only to the standard Campaign table', () => {
    renderGater();
    expect(RecordIndexSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignCreationAction: expect.anything(),
        campaignOverviewSummary: expect.anything(),
      }),
      undefined,
    );
  });

  it('shows designed rows first while retaining the native advanced table', () => {
    renderGater();
    expect(RecordIndexSurface).toHaveBeenLastCalledWith(
      expect.objectContaining({ campaignOverviewContent: expect.anything() }),
      undefined,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Advanced table' }));
    expect(RecordIndexSurface).toHaveBeenLastCalledWith(
      expect.objectContaining({ campaignOverviewContent: undefined }),
      undefined,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Campaign overview' }));
    expect(RecordIndexSurface).toHaveBeenLastCalledWith(
      expect.objectContaining({ campaignOverviewContent: expect.anything() }),
      undefined,
    );
  });

  it.each([
    ['alternate Campaign board', 'campaign', campaignView, ViewType.KANBAN],
    ['alternate Campaign table', 'campaign', 'alternate-view', ViewType.TABLE],
    ['ordinary object', 'creator', campaignView, ViewType.TABLE],
  ])('leaves native New intact for %s', (_label, name, viewId, type) => {
    objectNameSingular = name;
    currentView = { universalIdentifier: viewId, type };
    renderGater();
    expect(RecordIndexSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignCreationAction: undefined,
        campaignOverviewSummary: undefined,
      }),
      undefined,
    );
  });
});

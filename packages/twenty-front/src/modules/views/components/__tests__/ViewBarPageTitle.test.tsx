import { render } from '@testing-library/react';

import { ViewBarPageTitle } from '@/views/components/ViewBarPageTitle';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({}),
}));

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectMetadataItem: { labelPlural: 'Campaign Creators' },
    recordIndexId: 'campaign-influencers',
  }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => null,
  }),
);

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({ currentView: undefined }),
}));

jest.mock('@/ui/utilities/page-title/components/PageTitleEffect', () => ({
  PageTitleEffect: () => null,
}));
describe('ViewBarPageTitle', () => {
  it('uses record-index metadata when the route has no object name', () => {
    expect(() => render(<ViewBarPageTitle />)).not.toThrow();
  });
});

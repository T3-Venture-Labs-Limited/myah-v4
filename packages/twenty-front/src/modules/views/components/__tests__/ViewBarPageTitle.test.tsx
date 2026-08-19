import { render } from '@testing-library/react';

import { ViewBarPageTitle } from '@/views/components/ViewBarPageTitle';
import { useObjectNameSingularFromPlural } from '@/object-metadata/hooks/useObjectNameSingularFromPlural';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({}),
}));

jest.mock('@/object-metadata/hooks/useObjectNameSingularFromPlural', () => ({
  useObjectNameSingularFromPlural: jest.fn(),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: jest.fn(),
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

jest.mock('@/ui/utilities/page-title/components/PageTitle', () => ({
  PageTitle: () => null,
}));
describe('ViewBarPageTitle', () => {
  it('uses the record-index metadata when the route has no object name', () => {
    jest
      .mocked(useObjectNameSingularFromPlural)
      .mockReturnValue({ objectNameSingular: '' });
    jest.mocked(useObjectMetadataItem).mockImplementation(() => {
      throw new Error('route metadata should not be resolved');
    });

    expect(() => render(<ViewBarPageTitle />)).not.toThrow();
  });
});

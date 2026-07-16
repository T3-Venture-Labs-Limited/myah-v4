import { NavigationMenuItemType } from 'twenty-shared/types';

import { RecordIndexPageHeader } from '@/object-record/record-index/components/RecordIndexPageHeader';
import { render, screen } from '@testing-library/react';

const mockedUseFilteredObjectMetadataItems = jest.fn();
const mockedUseRecordIndexContextOrThrow = jest.fn();
const mockedUseAtomComponentStateValue = jest.fn();
const mockedUseAtomStateValue = jest.fn();
const mockedUseGetCurrentViewOnly = jest.fn();

jest.mock('@/object-metadata/hooks/useFilteredObjectMetadataItems', () => ({
  useFilteredObjectMetadataItems: () => mockedUseFilteredObjectMetadataItems(),
}));

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => mockedUseRecordIndexContextOrThrow(),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => mockedUseAtomComponentStateValue(),
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockedUseAtomStateValue(),
}));

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => mockedUseGetCurrentViewOnly(),
}));

jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({ title }: { title: React.ReactNode }) => <div>{title}</div>,
}));

describe('RecordIndexPageHeader', () => {
  beforeEach(() => {
    mockedUseFilteredObjectMetadataItems.mockReturnValue({
      findObjectMetadataItemByNamePlural: () => ({
        labelPlural: 'Myah social conversations',
      }),
    });
    mockedUseRecordIndexContextOrThrow.mockReturnValue({
      objectNamePlural: 'myahSocialConversations',
    });
    mockedUseAtomComponentStateValue.mockReturnValue(0);
    mockedUseAtomStateValue.mockReturnValue([
      {
        applicationId: 'myah-app',
        type: NavigationMenuItemType.VIEW,
        viewId: 'inbox-view',
      },
    ]);
    mockedUseGetCurrentViewOnly.mockReturnValue({
      currentView: { id: 'inbox-view', name: 'Inbox' },
    });
  });

  it('uses the application-owned view name as the native table heading', () => {
    render(<RecordIndexPageHeader />);

    expect(screen.getByText('Inbox')).toBeVisible();
    expect(
      screen.queryByText('Myah social conversations'),
    ).not.toBeInTheDocument();
  });
});

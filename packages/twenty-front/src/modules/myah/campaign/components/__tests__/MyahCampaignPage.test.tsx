import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { MyahCampaignPage } from '@/myah/campaign/components/MyahCampaignPage';

const mockPermission = jest.fn();
const mockRecord = jest.fn();
const mockRefetch = jest.fn();

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-metadata' },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => mockPermission(),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (options: unknown) => mockRecord(options),
}));
jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock(
  '@/myah/campaign/components/MyahCampaignPageContent',
  () => ({
    MyahCampaignPageContent: ({ campaignId }: { campaignId: string }) => (
      <div>Campaign content:{campaignId}</div>
    ),
  }),
  { virtual: true },
);

const renderPage = (path = '/myah/campaigns/campaign-1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/myah/campaigns/:campaignId"
          element={<MyahCampaignPage />}
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  mockPermission.mockReturnValue({ canReadObjectRecords: true });
  mockRefetch.mockReset().mockResolvedValue({});
  mockRecord.mockReturnValue({
    record: { id: 'campaign-1' },
    loading: false,
    refetch: mockRefetch,
  });
});

it('opens a Campaign by route identity without layout metadata', () => {
  renderPage();
  expect(screen.getByText('Campaign content:campaign-1')).toBeInTheDocument();
});

it('does not mount Campaign actions when reading is forbidden, loading, or missing', () => {
  mockPermission.mockReturnValue({ canReadObjectRecords: false });
  const { unmount } = renderPage();
  expect(
    screen.getByText(/permission to view this Campaign/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Campaign content:/)).not.toBeInTheDocument();
  expect(mockRecord).toHaveBeenLastCalledWith(
    expect.objectContaining({ skip: true }),
  );
  unmount();

  mockPermission.mockReturnValue({ canReadObjectRecords: true });
  mockRecord.mockReturnValue({ record: undefined, loading: true });
  const pending = renderPage();
  expect(screen.getByText('Loading Campaign')).toBeInTheDocument();
  pending.unmount();

  mockRecord.mockReturnValue({
    record: null,
    loading: false,
    refetch: mockRefetch,
  });
  renderPage();
  expect(screen.getByText('Campaign not found.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Campaign content:/)).not.toBeInTheDocument();
});

it('does not mount actions after a failed record lookup', () => {
  mockRecord.mockReturnValue({
    record: null,
    loading: false,
    error: new Error('Forbidden or unavailable'),
    refetch: mockRefetch,
  });
  renderPage();
  expect(screen.getByText('Campaign could not load.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Campaign content:/)).not.toBeInTheDocument();
});

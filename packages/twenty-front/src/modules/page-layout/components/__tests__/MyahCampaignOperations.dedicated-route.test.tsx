// History traversal here intentionally uses navigate(-1).
/* oxlint-disable twenty/no-navigate-prefer-link */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { MyahCampaignOperations } from '@/page-layout/components/MyahCampaignOperations';
import { RecordShowPageRoute } from '~/pages/object-record/RecordShowPageRoute';

const mockLink = jest.fn().mockResolvedValue({});
const mockError = jest.fn();
const mockSuccess = jest.fn();

jest.mock('@/page-layout/components/MyahCampaignRichTextSettings', () => ({
  MyahCampaignRichTextSettings: ({
    contentBeforeFields,
  }: {
    contentBeforeFields: React.ReactNode;
  }) => <>{contentBeforeFields}</>,
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [],
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { campaignEmailAccounts: [], campaignEmailAccountCandidates: [] },
    loading: false,
    refetch: jest.fn(),
  }),
  useMutation: () => [mockLink, { loading: false }],
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockError,
    enqueueSuccessSnackBar: mockSuccess,
  }),
}));
jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: jest.fn() }),
}));
jest.mock('@/settings/accounts/components/EmailAccountConnectionCards', () => ({
  EmailAccountConnectionCards: ({ returnTo }: { returnTo: string }) => (
    <span data-testid="oauth-return-to">{returnTo}</span>
  ),
}));
jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    dropdownComponents,
  }: {
    clickableComponent: React.ReactNode;
    dropdownComponents: React.ReactNode;
  }) => (
    <>
      {clickableComponent}
      {dropdownComponents}
    </>
  ),
}));
jest.mock('~/pages/object-record/RecordShowPage', () => ({
  RecordShowPage: () => <div>Other record</div>,
}));

const OperationsDestination = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>
      <MyahCampaignOperations
        campaignId="campaign-1"
        title="Operations"
        dedicatedPage
      />
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
};

const renderRoute = (path: string) =>
  render(
    <MemoryRouter initialEntries={['/previous', path]} initialIndex={1}>
      <Routes>
        <Route path="/previous" element={<div>Previous</div>} />
        <Route
          path={AppPath.RecordShowPage}
          element={<RecordShowPageRoute />}
        />
        <Route
          path="/myah/campaigns/:campaignId"
          element={<OperationsDestination />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe('dedicated Campaign Operations account return', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the real account component without page-layout context and returns OAuth to dedicated Operations', () => {
    renderRoute('/myah/campaigns/campaign-1?section=operations');
    expect(
      screen.getByRole('heading', { name: 'Email Accounts' }),
    ).toBeVisible();
    expect(screen.getByTestId('oauth-return-to')).toHaveTextContent(
      '/myah/campaigns/campaign-1?section=operations&linkConnectedAccount=1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Previous')).toBeVisible();
    expect(mockLink).not.toHaveBeenCalled();
  });

  it('consumes a legacy OAuth callback once and preserves Operations on navigation', async () => {
    renderRoute(
      '/object/campaign/campaign-1?linkConnectedAccount=1&connectedAccountId=123e4567-e89b-42d3-a456-426614174000#operations',
    );
    await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
    expect(mockLink).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            campaignId: 'campaign-1',
            connectedAccountId: '123e4567-e89b-42d3-a456-426614174000',
          },
        },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/myah/campaigns/campaign-1?section=operations',
      ),
    );
    expect(screen.getByTestId('location')).not.toHaveTextContent(
      'linkConnectedAccount',
    );
    expect(mockSuccess).toHaveBeenCalled();
  });

  it('consumes a failed legacy OAuth callback without linking', async () => {
    renderRoute(
      '/object/campaign/campaign-1?emailAccountConnectionFailed=1&linkConnectedAccount=1#operations',
    );
    await waitFor(() =>
      expect(mockError).toHaveBeenCalledWith({
        message: 'Email account connection failed. Try connecting it again.',
      }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/myah/campaigns/campaign-1?section=operations',
    );
    expect(screen.getByTestId('location')).not.toHaveTextContent(
      'emailAccountConnectionFailed',
    );
    expect(mockLink).not.toHaveBeenCalled();
  });
});

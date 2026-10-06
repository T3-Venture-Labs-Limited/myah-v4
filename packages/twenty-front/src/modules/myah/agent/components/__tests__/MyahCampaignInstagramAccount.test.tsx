import { MyahCampaignInstagramAccount } from '@/myah/agent/components/MyahCampaignInstagramAccount';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsPath } from 'twenty-shared/types';

let mockAccounts = [
  { id: 'saved-account', username: 'glowco.studio', status: 'INACTIVE' },
];
let mockCanManage = true;
let mockEnabled = true;
let mockHasAccess = true;
let mockMarker = true;
const mockNavigate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/myah/agent/components/MyahCampaignAgentSettings', () => ({
  useMyahCampaignAgentSetting: () => ({
    setting: {
      instagramAccountId: 'saved-account',
      instagramAccountOptions: mockAccounts,
    },
    loading: false,
    saving: false,
    update: mockUpdate,
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-metadata' },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canUpdateObjectRecords: true }),
}));
jest.mock('twenty-ui/feedback', () => ({
  InlineBanner: ({ message }: { message: string }) => <aside>{message}</aside>,
}));
jest.mock('@/settings/billing/hooks/useMyahWorkspaceUsage', () => ({
  useMyahWorkspaceUsage: () => ({
    isEnabled: mockEnabled,
    hasAccess: mockHasAccess,
    usage: { exhausted: true, instagramReconnectRequired: mockMarker },
  }),
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockCanManage,
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigate,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAccounts = [
    { id: 'saved-account', username: 'glowco.studio', status: 'INACTIVE' },
  ];
  mockEnabled = true;
  mockCanManage = true;
  mockHasAccess = true;
  mockMarker = true;
});

it('keeps the selected account and offers reconnection through Settings even at the AI limit', () => {
  render(<MyahCampaignInstagramAccount campaignId="campaign" />);
  expect(screen.getByRole('combobox')).toHaveValue('saved-account');
  expect(screen.getByRole('option')).toHaveTextContent(
    '@glowco.studio · disconnected',
  );
  expect(
    screen.getByText(/Your conversations and Campaign selection are saved/),
  ).toBeVisible();
  const reconnect = screen.getByRole('button', { name: 'Reconnect Instagram' });
  expect(reconnect).toBeEnabled();
  fireEvent.click(reconnect);
  expect(mockNavigate).toHaveBeenCalledWith(SettingsPath.AccountsInstagram);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('shows the explanation even when no account option is returned', () => {
  mockAccounts = [];
  render(<MyahCampaignInstagramAccount campaignId="campaign" />);
  expect(screen.getByText('Disconnected')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Reconnect Instagram' }),
  ).toBeEnabled();
});

it('asks an admin when the member cannot manage connected accounts', () => {
  mockCanManage = false;
  render(<MyahCampaignInstagramAccount campaignId="campaign" />);
  expect(
    screen.getByText('Ask a workspace admin to reconnect Instagram.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Reconnect Instagram' }),
  ).not.toBeInTheDocument();
});

it('removes the prompt when the account is active even if the marker cache is stale', () => {
  const view = render(<MyahCampaignInstagramAccount campaignId="campaign" />);
  mockAccounts = [{ ...mockAccounts[0], status: 'ACTIVE' }];
  view.rerender(<MyahCampaignInstagramAccount campaignId="campaign" />);
  expect(
    screen.queryByText(/Your conversations and Campaign selection are saved/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Reconnect Instagram' }),
  ).not.toBeInTheDocument();
  expect(mockUpdate).not.toHaveBeenCalled();
});

it.each(['off', 'no-access', 'not-a-lapse'])(
  'does not show a lapse prompt for %s',
  (scenario) => {
    if (scenario === 'off') mockEnabled = false;
    if (scenario === 'no-access') mockHasAccess = false;
    if (scenario === 'not-a-lapse') mockMarker = false;
    render(<MyahCampaignInstagramAccount campaignId="campaign" />);
    expect(
      screen.queryByText(/Your conversations and Campaign selection are saved/),
    ).not.toBeInTheDocument();
  },
);

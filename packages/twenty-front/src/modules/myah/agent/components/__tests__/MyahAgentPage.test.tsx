import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MyahAgentPage } from '@/myah/agent/components/MyahAgentPage';
import { MyahCampaignAgentSettings } from '@/myah/agent/components/MyahCampaignAgentSettings';

const mockUpdate = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();
let mockCanEdit = true;
let mockCanUpdateCampaign = true;
const agent = {
  tone: 'Warm and friendly',
  responseLength: 'Concise',
  language: "Match the creator's language",
  brandInformation: 'Clean skincare.',
  replyRules: 'Ask for rates.',
  escalationBoundaries: 'Fees above the brief.',
  sendingMode: 'DRAFT_FOR_APPROVAL',
  sendingModeEnabledByName: null,
  sendingModeEnabledAt: null,
};
const setting = {
  campaignId: 'campaign-1',
  preferredChannel: 'INSTAGRAM',
  requireReplyApproval: false,
  instagramAccountId: 'ig-1',
  instagramAccountOptions: [
    { id: 'ig-1', username: 'glowco.studio', status: 'ACTIVE' },
  ],
};

jest.mock('@apollo/client/react', () => ({
  useQuery: (document: {
    definitions: Array<{ kind: string; name?: { value: string } }>;
  }) => {
    const name = document.definitions.find(
      (definition) => definition.kind === 'OperationDefinition',
    )?.name?.value;
    return name === 'MyahAgent'
      ? { data: { myahAgent: agent }, loading: false }
      : { data: { myahCampaignAgentSetting: setting }, loading: false };
  },
  useMutation: () => [mockUpdate, { loading: false }],
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockCanEdit,
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueSuccessSnackBar: mockSuccess,
    enqueueErrorSnackBar: mockError,
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: { id: 'campaign' } }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canUpdateObjectRecords: mockCanUpdateCampaign,
  }),
}));

describe('MyahAgentPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanEdit = true;
    mockUpdate.mockResolvedValue({});
  });

  it('saves edited guidance', async () => {
    render(<MyahAgentPage />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply rules' }), {
      target: { value: 'Ask for a media kit.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save guidance' }));
    await waitFor(() => expect(mockSuccess).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith({
      variables: {
        input: expect.objectContaining({ replyRules: 'Ask for a media kit.' }),
      },
    });
  });

  it('reports a failed save without claiming success', async () => {
    mockUpdate.mockRejectedValue(new Error('nope'));
    render(<MyahAgentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save guidance' }));
    await waitFor(() => expect(mockError).toHaveBeenCalled());
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('asks for confirmation before sending automatically', async () => {
    render(<MyahAgentPage />);
    fireEvent.click(screen.getByLabelText(/Send automatically/));
    expect(mockUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        variables: { input: { sendingMode: 'SEND_AUTOMATICALLY' } },
      }),
    );
  });

  it('is read-only without workspace settings permission', () => {
    mockCanEdit = false;
    render(<MyahAgentPage />);
    expect(screen.getByRole('textbox', { name: 'Reply rules' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save guidance' }),
    ).toBeDisabled();
  });
});

describe('MyahCampaignAgentSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanUpdateCampaign = true;
    mockUpdate.mockResolvedValue({});
  });

  it('names the Instagram account and saves the preferred channel and approval', () => {
    render(
      <MemoryRouter>
        <MyahCampaignAgentSettings campaignId="campaign-1" />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/invites them once to DM @glowco.studio/),
    ).toBeVisible();
    fireEvent.click(screen.getByLabelText(/No preference/));
    expect(mockUpdate).toHaveBeenCalledWith({
      variables: {
        input: { campaignId: 'campaign-1', preferredChannel: 'NO_PREFERENCE' },
      },
    });
    fireEvent.click(screen.getByLabelText(/Always require approval/));
    expect(mockUpdate).toHaveBeenLastCalledWith({
      variables: {
        input: { campaignId: 'campaign-1', requireReplyApproval: true },
      },
    });
  });

  it('is read-only without Campaign update permission', () => {
    mockCanUpdateCampaign = false;
    render(
      <MemoryRouter>
        <MyahCampaignAgentSettings campaignId="campaign-1" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/Always require approval/)).toBeDisabled();
  });
});

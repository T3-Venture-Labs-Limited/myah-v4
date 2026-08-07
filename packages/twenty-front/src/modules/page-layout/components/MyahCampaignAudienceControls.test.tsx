import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MyahCampaignAudienceControls } from './MyahCampaignAudienceControls';

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockPicker = jest.fn();

jest.mock('@apollo/client', () => ({
  gql: (source: TemplateStringsArray) => source.join(''),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal, closeModal: mockCloseModal }),
}));
  ModalStatefulWrapper: ({ children, onClose }: { children: ReactNode; onClose?: () => void }) => (
  ModalStatefulWrapper: ({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) => (
    <div role="dialog">{children}<button onClick={onClose}>Close picker</button></div>
  ),
}));
jest.mock('@/object-record/record-picker/single-record-picker/components/SingleRecordPicker', () => ({
  SingleRecordPicker: (props: { onMorphItemSelected: (item: { recordId: string }) => void }) => {
    mockPicker(props);
    return <button onClick={() => props.onMorphItemSelected({ recordId: 'list-selected' })}>Select native record</button>;
  },
}));
jest.mock('twenty-ui/input', () => ({
  Button: ({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onClick}>{title}</button>
  ),
}));

describe('MyahCampaignAudienceControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery
      .mockReturnValueOnce({ data: { campaignInfluencerSnapshot: { campaignCreatorLists: [] } }, refetch: jest.fn().mockResolvedValue(undefined) })
      .mockReturnValue({ data: undefined });
    mockUseMutation
      .mockReturnValueOnce([jest.fn().mockResolvedValue(undefined)])
      .mockReturnValueOnce([jest.fn().mockResolvedValue(undefined)])
      .mockReturnValueOnce([jest.fn().mockResolvedValue(undefined)]);
  });
  it('uses the native picker record id as the attach intent input', async () => {
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);
    const attach = mockUseMutation.mock.results[0]?.value?.[0];
    fireEvent.click(screen.getByRole('button', { name: 'Attach Creator List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select native record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Attach selected Creator List' }));
    await waitFor(() => expect(attach).toHaveBeenCalledWith({ variables: { input: { campaignId: 'campaign-1', creatorListIds: ['list-selected'] } } }));
    expect(mockOpenModal).toHaveBeenCalledWith('campaign-list-picker');
  });

  it('forwards the removal impact confirmation token unchanged', async () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    const detach = jest.fn().mockResolvedValue(undefined);
    mockUseQuery.mockReset();
    mockUseQuery
      .mockReturnValueOnce({ data: { campaignInfluencerSnapshot: { campaignCreatorLists: [{ id: 'join-1', creatorListId: 'list-1' }] } }, refetch })
      .mockReturnValueOnce({ data: { campaignCreatorListRemovalImpact: { affectedCreatorIds: ['creator-1'], requiresConfirmation: true, confirmationToken: 'token-1' } } });
    mockUseMutation.mockReset();
    mockUseMutation.mockReturnValueOnce([jest.fn()]).mockReturnValueOnce([jest.fn()]).mockReturnValueOnce([detach]);
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Creator List list-1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirm removal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Creator List removal' }));
    await waitFor(() => expect(detach).toHaveBeenCalledWith({ variables: { input: { campaignId: 'campaign-1', creatorListId: 'list-1', confirmedCreatorIds: ['creator-1'], confirmationToken: 'token-1' } } }));
    expect(refetch).toHaveBeenCalled();
  });
});

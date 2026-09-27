import { fireEvent, render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { TimelineActivityContext } from '@/activities/timeline-activities/contexts/TimelineActivityContext';
import { MyahCampaignCreatorContextPanel } from '@/page-layout/components/MyahCampaignCreatorContextPanel';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: jest.fn(),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(),
}));
jest.mock('@/page-layout/components/MyahCampaignCreatorMessages', () => ({
  MyahCampaignCreatorMessages: ({
    campaignId,
    membershipId,
  }: {
    campaignId: string;
    membershipId: string;
  }) => (
    <div>
      Read-only messages for {campaignId}/{membershipId}
    </div>
  ),
}));
jest.mock('@/activities/notes/components/NotesCard', () => ({
  NotesCard: () => <div>Native Creator notes</div>,
}));
jest.mock('@/activities/timeline-activities/components/TimelineCard', () => ({
  TimelineCard: () => {
    const { recordId } = useContext(TimelineActivityContext);
    return <div>Native activity for {recordId}</div>;
  },
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  LayoutRenderingProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/ui/layout/side-panel/contexts/SidePanelContext', () => ({
  SidePanelProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFind = useFindOneRecord as jest.Mock;
const mockMetadata = useObjectMetadataItems as jest.Mock;
const showPanel = (
  campaignId = 'campaign-a',
  membershipId = 'membership-a',
  initialTab?: 'messages',
) =>
  render(
    <MyahCampaignCreatorContextPanel
      campaignId={campaignId}
      membershipId={membershipId}
      onClose={jest.fn()}
      initialTab={initialTab}
      returnTarget={{
        workspaceId: 'workspace-a',
        campaignId,
        membershipId,
        influencerTabId: 'influencers-tab',
        pathname: '/object/campaign/campaign-a',
        search: '',
      }}
    />,
  );

describe('MyahCampaignCreatorContextPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMetadata.mockReturnValue({
      objectMetadataItems: [
        {
          nameSingular: 'campaignCreator',
          fields: [
            {
              name: 'stage',
              options: [
                { value: 'READY', label: 'Not contacted' },
                { value: 'NEGOTIATING', label: 'Negotiating' },
                { value: 'PRODUCT_SENT', label: 'Product sent' },
              ],
            },
          ],
        },
      ],
    });
    mockFind.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) =>
        objectNameSingular === 'campaignCreator'
          ? {
              record: {
                id: 'membership-a',
                campaignId: 'campaign-a',
                creatorId: 'creator-a',
                stage: 'NEGOTIATING',
              },
              loading: false,
              hasReadPermission: true,
            }
          : {
              record: {
                id: 'creator-a',
                name: 'Ava Rivera',
                email: 'ava@example.invalid',
                instagramUsername: 'ava.studio',
                instagramBio: 'Thoughtful routines',
                instagramFollowerCount: 42800,
              },
              loading: false,
              hasReadPermission: true,
            },
    );
  });

  it('opens ordinary inspection on read-only campaign messages, with the profile route still available', () => {
    showPanel();
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('Read-only messages for campaign-a/membership-a'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }));
    expect(
      screen.getByRole('link', { name: 'Open Creator profile and files' }),
    ).toBeVisible();
  });

  it('opens the read-only Messages tab when returning from exact Inbox', () => {
    showPanel('campaign-a', 'membership-a', 'messages');
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('Read-only messages for campaign-a/membership-a'),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open Creator profile and files' }),
    ).not.toBeInTheDocument();
  });

  it('resolves the membership before querying Creator and uses the Creator ID for native notes', () => {
    showPanel();
    expect(mockFind.mock.calls[0][0]).toMatchObject({
      objectNameSingular: 'campaignCreator',
      objectRecordId: 'membership-a',
    });
    expect(mockFind.mock.calls[1][0]).toMatchObject({
      objectNameSingular: 'creator',
      objectRecordId: 'creator-a',
    });
    expect(
      screen.getByText(/Recorded campaign stage: Negotiating/),
    ).toBeVisible();
    expect(screen.getByText('42,800 Instagram followers')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Instagram: @ava.studio' }),
    ).toHaveAttribute('href', 'https://www.instagram.com/ava.studio/');
    expect(
      screen.getByLabelText('No profile image available'),
    ).toHaveTextContent('AR');
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.getByText('Native Creator notes')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(
      screen.getByText('Read-only messages for campaign-a/membership-a'),
    ).toBeVisible();
  });

  it.each([
    ['READY', 'Not contacted'],
    ['PRODUCT_SENT', 'Product sent'],
    ['UNKNOWN_STAGE', 'Unknown stage'],
    [null, 'Unavailable'],
  ])('shows a truthful recorded stage label for %s', (stage, label) => {
    const find = mockFind.getMockImplementation();
    mockFind.mockImplementation((args: { objectNameSingular: string }) => {
      const result = find?.(args);
      return args.objectNameSingular === 'campaignCreator'
        ? { ...result, record: { ...result.record, stage } }
        : result;
    });

    showPanel();
    expect(
      screen.getByText(
        `Recorded campaign stage: ${label} · not outreach evidence`,
      ),
    ).toBeVisible();
  });

  it('uses the current workspace stage label rather than an assumed default', () => {
    mockMetadata.mockReturnValue({
      objectMetadataItems: [
        {
          nameSingular: 'campaignCreator',
          fields: [
            {
              name: 'stage',
              options: [{ value: 'NEGOTIATING', label: 'In talks' }],
            },
          ],
        },
      ],
    });
    showPanel();
    expect(screen.getByText(/Recorded campaign stage: In talks/)).toBeVisible();
  });

  it('shows the authorized identity once and retains the native Creator files route', () => {
    showPanel();
    expect(screen.getAllByText('Ava Rivera')).toHaveLength(1);
    expect(screen.getAllByText('ava@example.invalid')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Ava Rivera' }).parentElement,
    ).toContainElement(screen.getByLabelText('No profile image available'));
    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }));
    expect(
      screen.getByRole('link', { name: 'Open Creator profile and files' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Close creator context' }),
    ).toHaveFocus();
  });

  it('does not turn a malformed handle into a navigable URL', () => {
    mockFind.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) =>
        objectNameSingular === 'campaignCreator'
          ? {
              record: {
                id: 'membership-a',
                campaignId: 'campaign-a',
                creatorId: 'creator-a',
              },
              loading: false,
              hasReadPermission: true,
            }
          : {
              record: {
                id: 'creator-a',
                name: 'Ava Rivera',
                instagramUsername: 'not/a-valid-handle',
              },
              loading: false,
              hasReadPermission: true,
            },
    );

    showPanel();

    expect(
      screen.queryByRole('link', { name: /Instagram/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Instagram: @not/a-valid-handle')).toBeVisible();
  });

  it('scopes native timeline activity to the Creator rather than the enclosing campaign', () => {
    showPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('Native activity for creator-a')).toBeVisible();
  });

  it('does not expose Creator data when membership is for another campaign', () => {
    showPanel('campaign-b');
    expect(mockFind.mock.calls[1][0]).toMatchObject({
      objectRecordId: '',
      skip: true,
    });
    expect(screen.queryByText('Ava Rivera')).not.toBeInTheDocument();
    expect(screen.getByText(/unavailable for this campaign/)).toBeVisible();
  });

  it('does not query or expose a cached Creator after membership read access is revoked', () => {
    mockFind.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) =>
        objectNameSingular === 'campaignCreator'
          ? {
              record: {
                id: 'membership-a',
                campaignId: 'campaign-a',
                creatorId: 'creator-a',
              },
              loading: false,
              hasReadPermission: false,
            }
          : {
              record: { id: 'creator-a', name: 'Previously visible Creator' },
              loading: false,
              hasReadPermission: true,
            },
    );

    showPanel();

    expect(mockFind.mock.calls[1][0]).toMatchObject({
      objectRecordId: '',
      skip: true,
    });
    expect(
      screen.queryByText('Previously visible Creator'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Notes' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/unavailable for this campaign/)).toBeVisible();
  });

  it('does not expose a cached Creator after Creator read access is revoked', () => {
    mockFind.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) =>
        objectNameSingular === 'campaignCreator'
          ? {
              record: {
                id: 'membership-a',
                campaignId: 'campaign-a',
                creatorId: 'creator-a',
              },
              loading: false,
              hasReadPermission: true,
            }
          : {
              record: { id: 'creator-a', name: 'Previously visible Creator' },
              loading: false,
              hasReadPermission: false,
            },
    );

    showPanel();

    expect(
      screen.queryByText('Previously visible Creator'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Notes' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/unavailable for this campaign/)).toBeVisible();
  });

  it('does not expose a previous Creator response for another membership', () => {
    mockFind.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) =>
        objectNameSingular === 'campaignCreator'
          ? {
              record: {
                id: 'membership-a',
                campaignId: 'campaign-a',
                creatorId: 'creator-a',
              },
              loading: true,
              hasReadPermission: true,
            }
          : {
              record: { id: 'creator-a', name: 'Ava Rivera' },
              loading: false,
              hasReadPermission: true,
            },
    );
    showPanel('campaign-a', 'membership-b');
    expect(screen.queryByText('Ava Rivera')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading creator context',
    );
  });
});

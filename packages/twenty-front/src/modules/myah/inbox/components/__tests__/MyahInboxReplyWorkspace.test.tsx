import { render, screen, within } from '@testing-library/react';

import { MyahInboxReplyWorkspace } from '@/myah/inbox/components/MyahInboxReplyWorkspace';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: { lighter: 'whitesmoke' } },
    border: { color: { light: 'lightgray' }, radius: { md: '8px' } },
    font: {
      color: { primary: 'black', secondary: 'gray' },
      size: { sm: '13px', xs: '11px' },
      weight: { medium: 500 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
}));

const mockUseFindOneRecord = jest.fn();
let mockCurrentWorkspaceMember: { id: string } | null = { id: 'member-1' };

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (...args: unknown[]) => mockUseFindOneRecord(...args),
}));

let mockObjectMetadataItems = [{ nameSingular: 'messageThread' }];

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockCurrentWorkspaceMember,
}));

jest.mock('@/myah/inbox/components/MyahInboxDraftEditor', () => ({
  MyahInboxDraftEditor: ({ canEdit }: { canEdit: boolean }) => (
    <div aria-label="Shared reply draft editor">
      Draft is {canEdit ? 'editable' : 'read-only'}
    </div>
  ),
}));

const thread = {
  id: 'thread-1',
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  subject: 'First conversation',
  lastMessagePreview: 'First preview',
  lastMessageSender: 'Ada',
  state: 'NEEDS_REPLY' as const,
  snoozedUntil: null,
  creator: { id: 'creator-1', name: 'Ada Creator' },
  campaign: null,
  inboxOwner: { id: 'member-1', name: 'Zachary' },
};

describe('MyahInboxReplyWorkspace', () => {
  beforeEach(() => {
    mockCurrentWorkspaceMember = { id: 'member-1' };
    mockObjectMetadataItems = [{ nameSingular: 'messageThread' }];
    mockUseFindOneRecord.mockReturnValue({
      record: {
        id: 'thread-1',
        __typename: 'MessageThread',
        myahReplyDraftBody: { markdown: 'Saved draft', blocknote: null },
        myahReplyDraftRevision: 3,
      },
      loading: false,
    });
  });

  it('defers the draft lookup until MessageThread metadata is available', () => {
    mockObjectMetadataItems = [];

    render(<MyahInboxReplyWorkspace thread={thread} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading shared draft',
    );
    expect(mockUseFindOneRecord).not.toHaveBeenCalled();
  });

  it('renders the draft editor without a separate proposal preview or Apply action', () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    const composer = screen.getByRole('region', { name: 'Reply composer' });
    expect(
      within(composer).getByLabelText('Shared reply draft editor'),
    ).toBeVisible();
    expect(
      within(composer).queryByLabelText('AI proposal'),
    ).not.toBeInTheDocument();
    expect(
      within(composer).queryByRole('button', { name: /apply/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('region', { name: 'Reply composer' }),
    ).toHaveLength(1);
  });
});

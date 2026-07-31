import { fireEvent, render, screen, within } from '@testing-library/react';
import type * as ReactType from 'react';

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
  MyahInboxDraftEditor: ({
    canEdit,
    readOnlyReason,
    appliedProposal,
    onDraftSavingChange,
    onProposalApplicationSettled,
  }: {
    canEdit: boolean;
    readOnlyReason?: string;
    appliedProposal: { body: { markdown: string } } | null;
    onDraftSavingChange: (isSaving: boolean) => void;
    onProposalApplicationSettled: () => void;
  }) => (
    <div aria-label="Shared reply draft editor">
      Draft is {canEdit ? 'editable' : 'read-only'}
      {readOnlyReason && <span>{readOnlyReason}</span>}
      <output aria-label="Applied proposal">
        {appliedProposal?.body.markdown ?? 'none'}
      </output>
      <button onClick={() => onDraftSavingChange(true)}>
        Start manual draft save test double
      </button>
      <button onClick={() => onDraftSavingChange(false)}>
        Finish manual draft save test double
      </button>
      <button onClick={onProposalApplicationSettled}>
        Finish proposal persistence test double
      </button>
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxProposalPreview', () => ({
  MyahInboxProposalPreview: ({
    disabled,
    onApply,
    renderGenerateAction,
  }: {
    disabled: boolean;
    onApply: (body: { markdown: string; blocknote: null }) => void;
    renderGenerateAction: (
      generateAction: ReactType.ReactNode,
    ) => ReactType.ReactNode;
  }) => (
    <>
      {renderGenerateAction(
        <button disabled={disabled}>Generate proposal test double</button>,
      )}
      <button
        disabled={disabled}
        onClick={() =>
          onApply({ markdown: 'proposal copied explicitly', blocknote: null })
        }
      >
        Apply proposal test double
      </button>
    </>
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

  it('places the draft editor and proposal controls in one labelled reply composer', () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    const composer = screen.getByRole('region', { name: 'Reply composer' });
    expect(
      within(composer).getByLabelText('Shared reply draft editor'),
    ).toBeVisible();
    expect(
      within(composer).getByRole('button', {
        name: 'Apply proposal test double',
      }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('region', { name: 'Reply composer' }),
    ).toHaveLength(1);
  });

  it('keeps the shared draft editable for a non-owner', () => {
    mockCurrentWorkspaceMember = { id: 'member-2' };

    render(<MyahInboxReplyWorkspace thread={thread} />);

    expect(screen.getByText('Draft is editable')).toBeVisible();
    expect(
      screen.queryByText('Only Zachary can edit this shared draft.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply proposal test double' }),
    ).toBeEnabled();
  });

  it('blocks applying a proposal while a manual draft save is pending', () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    const applyProposalButton = screen.getByRole('button', {
      name: 'Apply proposal test double',
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Start manual draft save test double',
      }),
    );

    expect(applyProposalButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Finish manual draft save test double',
      }),
    );

    expect(applyProposalButton).toBeEnabled();
  });

  it('blocks repeated proposal application until draft persistence settles', () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    const applyProposalButton = screen.getByRole('button', {
      name: 'Apply proposal test double',
    });
    fireEvent.click(applyProposalButton);

    expect(screen.getByLabelText('Applied proposal')).toHaveTextContent(
      'proposal copied explicitly',
    );
    expect(applyProposalButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Finish proposal persistence test double',
      }),
    );

    expect(applyProposalButton).toBeEnabled();
    expect(mockUseFindOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'messageThread',
      objectRecordId: 'thread-1',
      recordGqlFields: {
        id: true,
        myahReplyDraftBody: { markdown: true, blocknote: true },
        myahReplyDraftRevision: true,
      },
      skip: false,
    });
  });
});

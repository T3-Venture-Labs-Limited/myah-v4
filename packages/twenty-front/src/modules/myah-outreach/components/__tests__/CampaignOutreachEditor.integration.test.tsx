import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { type MockedResponse } from '@apollo/client/testing';
import { getDefaultStore } from 'jotai';
import { MockedProvider } from '@apollo/client/testing/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type CampaignSequence } from 'twenty-shared/workflow';
import { UploadWorkflowFileDocument } from '~/generated-metadata/graphql';

import { tokenPairState } from '@/auth/states/tokenPairState';
import { CampaignOutreachTab } from '@/myah-outreach/components/CampaignOutreachTab';
import { CampaignSequenceMessageEditor } from '@/myah-outreach/components/CampaignSequenceMessageEditor';
import {
  CAMPAIGN_SEQUENCE,
  SAVE_CAMPAIGN_SEQUENCE,
} from '@/myah-outreach/graphql/operations';
import { PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT } from '@/page-layout/constants/PageLayoutSidePanelTabChangeEvent';

// The generic workflow chip expects a workflow-version provider; Campaign
// authoring does not use that resolver. Keep the real TipTap JSON/node editor.
jest.mock('@/workflow/workflow-variables/hooks/useSearchVariable', () => ({
  useSearchVariable: () => ({
    variableLabel: 'Creator name',
    variablePathLabel: 'Creator name',
  }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));

const campaignId = 'a0000000-0000-4000-8000-000000000001';
const workflowId = 'b0000000-0000-4000-8000-000000000002';
const versionOne = 'c0000000-0000-4000-8000-000000000003';
const versionTwo = 'd0000000-0000-4000-8000-000000000004';
const firstId = 'e0000000-0000-4000-8000-000000000005';
const secondId = 'f0000000-0000-4000-8000-000000000006';
const thirdId = '10000000-0000-4000-8000-000000000007';

const body = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  });

const email = (
  id: string,
  subject: string,
  bodyText: string,
  replyToThread = false,
) => ({
  id,
  channel: 'EMAIL' as const,
  subject,
  body: body(bodyText),
  files: [],
  replyToThread,
});

const initialSequence: CampaignSequence = {
  schemaVersion: 1,
  messages: [
    email(firstId, 'First subject', 'First body'),
    email(secondId, 'Second subject', 'Second body'),
    email(thirdId, 'Third subject', 'Third body', true),
  ],
  delaysSeconds: [10, 20],
};

const snapshot = (
  versionId: string,
  sequence: CampaignSequence = initialSequence,
  lifecycleStatus = 'DRAFT',
  editable = true,
) => ({
  __typename: 'CampaignSequenceSnapshot',
  campaignId,
  workflowId,
  versionId,
  sequence,
  lifecycleStatus,
  editable,
  issues: [],
});

const loadMock = (
  sequence: CampaignSequence = initialSequence,
  versionId = versionOne,
): MockedResponse => ({
  request: { query: CAMPAIGN_SEQUENCE, variables: { campaignId } },
  result: {
    data: {
      campaignSequence: {
        __typename: 'CampaignSequencePresent',
        kind: 'SEQUENCE',
        snapshot: snapshot(versionId, sequence),
      },
    },
  },
});

const renderEditor = (mocks: MockedResponse[], isInSidePanel = false) => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <MockedProvider mocks={mocks}>
          <CampaignOutreachTab
            campaignId={campaignId}
            isInSidePanel={isInSidePanel}
          />
        </MockedProvider>
      ),
    },
  ]);

  return render(
    <I18nProvider i18n={i18n}>
      <RouterProvider future={{ v7_startTransition: true }} router={router} />
    </I18nProvider>,
  );
};

const bodyEditor = () =>
  within(screen.getByRole('group', { name: 'Body' })).getByRole('textbox');

const editMessage = async (number: number) => {
  await userEvent.click(
    screen.getByRole('button', { name: `Edit message ${number}` }),
  );
};

describe('Campaign Outreach assembled editor', () => {
  afterEach(() => getDefaultStore().set(tokenPairState.atom, null));

  beforeAll(() => {
    // ProseMirror requests browser selection geometry after real editor
    // transactions. JSDOM has no layout engine, so adapt only that boundary.
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => ({
        item: () => null,
        length: 0,
        [Symbol.iterator]: function* () {
          return;
        },
      }),
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.body,
    });
    Object.defineProperty(window, 'scrollBy', {
      configurable: true,
      value: () => undefined,
    });
  });

  it('keeps an unsaved sequence subject when same-login credentials rotate', async () => {
    const store = getDefaultStore();
    store.set(tokenPairState.atom, {
      accessOrWorkspaceAgnosticToken: { token: 'same-login-initial-token' },
    } as never);
    renderEditor([loadMock()]);
    await screen.findByRole('group', { name: 'Subject' });
    const subject = within(
      screen.getByRole('group', { name: 'Subject' }),
    ).getByRole('textbox');
    act(() => subject.focus());
    await userEvent.keyboard('{Control>}a{/Control}{Backspace}Unsent subject');
    expect(subject).toHaveTextContent('Unsent subject');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();

    act(() =>
      store.set(tokenPairState.atom, {
        accessOrWorkspaceAgnosticToken: { token: 'same-login-renewed-token' },
      } as never),
    );
    expect(subject).toHaveTextContent('Unsent subject');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });

  it('renders trusted PAUSED lifecycle as Stopped and keeps authoring enabled', async () => {
    const pausedLoad: MockedResponse = {
      request: { query: CAMPAIGN_SEQUENCE, variables: { campaignId } },
      result: {
        data: {
          campaignSequence: {
            __typename: 'CampaignSequencePresent',
            kind: 'SEQUENCE',
            snapshot: snapshot(versionOne, initialSequence, 'PAUSED', true),
          },
        },
      },
    };

    renderEditor([pausedLoad]);

    expect(
      await screen.findByRole('heading', { name: 'Stopped' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Subject' })).getByRole(
        'textbox',
      ),
    ).not.toBeDisabled();
    expect(
      screen.queryByText(
        'Stop Campaign outreach before editing this saved sequence.',
      ),
    ).not.toBeInTheDocument();
  });

  it('renders PAUSED as Stopped for read-only users', async () => {
    const pausedLoad: MockedResponse = {
      request: { query: CAMPAIGN_SEQUENCE, variables: { campaignId } },
      result: {
        data: {
          campaignSequence: {
            __typename: 'CampaignSequencePresent',
            kind: 'SEQUENCE',
            snapshot: snapshot(versionOne, initialSequence, 'PAUSED', false),
          },
        },
      },
    };

    renderEditor([pausedLoad]);

    expect(
      await screen.findByRole('heading', { name: 'Stopped' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Subject' })).getByRole(
        'textbox',
      ),
    ).toHaveAttribute('contenteditable', 'false');
  });

  it('isolates real JSON editors across selection and reload and serializes their save payload', async () => {
    const user = userEvent.setup();
    let saveCalls = 0;
    const reloadedSequence: CampaignSequence = {
      ...initialSequence,
      messages: [
        email(firstId, 'First reloaded', 'First body reloaded'),
        email(secondId, 'Second reloaded', 'Second body reloaded'),
        email(thirdId, 'Third reloaded', 'Third body reloaded', true),
      ],
    };
    const editedSequence: CampaignSequence = {
      ...initialSequence,
      messages: [
        initialSequence.messages[0],
        email(secondId, 'Second subject', 'Second body changed'),
        initialSequence.messages[2],
      ],
    };
    const saveMock: MockedResponse = {
      request: {
        query: SAVE_CAMPAIGN_SEQUENCE,
        variables: {
          input: {
            campaignId,
            expectedVersionId: versionOne,
            sequence: editedSequence,
          },
        },
      },
      result: () => {
        saveCalls += 1;
        return {
          data: {
            saveCampaignSequence: snapshot(versionTwo, editedSequence),
          },
        };
      },
    };
    renderEditor([
      loadMock(),
      saveMock,
      loadMock(reloadedSequence, versionTwo),
    ]);

    await screen.findByRole('group', { name: 'Body' });
    expect(bodyEditor()).toHaveTextContent('First body');
    await editMessage(2);
    expect(bodyEditor()).toHaveTextContent('Second body');

    act(() => bodyEditor().focus());
    await user.keyboard('{Control>}a{/Control}{Backspace}Second body changed');
    await editMessage(1);
    expect(bodyEditor()).toHaveTextContent('First body');
    await editMessage(2);
    expect(bodyEditor()).toHaveTextContent('Second body changed');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveCalls).toBe(1));

    await user.click(
      screen.getByRole('button', { name: 'Reload from server' }),
    );
    await waitFor(() =>
      expect(bodyEditor()).toHaveTextContent('Second body reloaded'),
    );
    await editMessage(1);
    expect(bodyEditor()).toHaveTextContent('First body reloaded');
  });

  it('saves added, reordered, removed and edited wait steps with validation from the assembled rail', async () => {
    const user = userEvent.setup();
    let savedSequence: CampaignSequence | undefined;
    const saveMock: MockedResponse = {
      request: {
        query: SAVE_CAMPAIGN_SEQUENCE,
        variables: ({
          input,
        }: {
          input: {
            campaignId: string;
            expectedVersionId: string;
            sequence: CampaignSequence;
          };
        }) =>
          input.campaignId === campaignId &&
          input.expectedVersionId === versionOne,
      },
      result: ({ input }: { input: { sequence: CampaignSequence } }) => {
        savedSequence = input.sequence;
        return {
          data: {
            saveCampaignSequence: snapshot(versionTwo, input.sequence),
          },
        };
      },
    };
    renderEditor([
      loadMock(),
      saveMock,
      {
        request: { query: CAMPAIGN_SEQUENCE, variables: { campaignId } },
        result: () => {
          if (!savedSequence)
            throw new Error('Expected saved sequence before reload');
          return {
            data: {
              campaignSequence: {
                __typename: 'CampaignSequencePresent',
                kind: 'SEQUENCE',
                snapshot: snapshot(versionTwo, savedSequence),
              },
            },
          };
        },
      },
    ]);

    await screen.findByRole('button', { name: 'Add Instagram' });
    await user.click(screen.getByRole('button', { name: 'Add Instagram' }));
    expect(screen.getByText('Set a delay between messages')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(
      within(screen.getByRole('region', { name: 'Sequence review' })).getByText(
        'Set a delay between messages',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Instagram message' }),
      {
        target: { value: 'Synthetic Instagram draft' },
      },
    );
    await user.click(screen.getByRole('button', { name: 'Move message 4 up' }));
    await user.click(screen.getByRole('button', { name: 'Remove message 2' }));
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Delay 1 seconds' }),
      { target: { value: '45' } },
    );
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Delay 2 seconds' }),
      { target: { value: '30' } },
    );
    expect(
      screen.queryByText('Set a delay between messages'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Delay 1 seconds' }),
    ).toHaveValue(45);
    expect(
      screen.getByRole('spinbutton', { name: 'Delay 2 seconds' }),
    ).toHaveValue(30);
    expect(
      screen.getByRole('button', { name: 'Edit message 3' }),
    ).toHaveTextContent('Third subject');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(savedSequence).toBeDefined());
    expect(savedSequence).toEqual({
      schemaVersion: 1,
      messages: [
        initialSequence.messages[0],
        expect.objectContaining({
          channel: 'INSTAGRAM',
          text: 'Synthetic Instagram draft',
        }),
        initialSequence.messages[2],
      ],
      delaysSeconds: [45, 30],
    });
    expect(savedSequence?.messages[1].id).not.toBe(secondId);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Reload from server' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit message 2' }),
      ).toHaveTextContent('Synthetic Instagram draft'),
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Delay 1 seconds' }),
    ).toHaveValue(45);
    expect(
      screen.getByRole('spinbutton', { name: 'Delay 2 seconds' }),
    ).toHaveValue(30);
    expect(screen.queryByText('Second subject')).not.toBeInTheDocument();
  });

  it('retains the existing TipTap variableTag JSON across selection, save and reload', async () => {
    const user = userEvent.setup();
    const richBody = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'variableTag', attrs: { variable: '{{creator.name}}' } },
            { type: 'text', text: ', welcome!' },
          ],
        },
      ],
    });
    const richSequence: CampaignSequence = {
      ...initialSequence,
      messages: [
        { ...email(firstId, 'First subject', 'First body'), body: richBody },
        ...initialSequence.messages.slice(1),
      ],
    };
    const changedSequence: CampaignSequence = {
      ...richSequence,
      messages: [
        {
          ...email(firstId, 'Personalized subject', 'First body'),
          body: richBody,
        },
        ...richSequence.messages.slice(1),
      ],
    };
    let saveCalls = 0;
    renderEditor([
      loadMock(richSequence),
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: {
            input: {
              campaignId,
              expectedVersionId: versionOne,
              sequence: changedSequence,
            },
          },
        },
        result: () => {
          saveCalls += 1;
          return {
            data: {
              saveCampaignSequence: snapshot(versionTwo, changedSequence),
            },
          };
        },
      },
      loadMock(changedSequence, versionTwo),
    ]);

    await screen.findByRole('group', { name: 'Body' });
    expect(bodyEditor()).toHaveTextContent('Hello');
    await editMessage(2);
    await editMessage(1);
    const subjectEditor = within(
      screen.getByRole('group', { name: 'Subject' }),
    ).getByRole('textbox');
    act(() => subjectEditor.focus());
    await user.keyboard('{Control>}a{/Control}{Backspace}Personalized subject');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveCalls).toBe(1));
    await user.click(
      screen.getByRole('button', { name: 'Reload from server' }),
    );
    await waitFor(() => expect(bodyEditor()).toHaveTextContent('Hello'));
    expect(bodyEditor()).toHaveTextContent('welcome!');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  it('preserves reorder, delay, and removal edits when delayed keyboard attachment completes', async () => {
    const user = userEvent.setup();
    let saveCalls = 0;
    const attachmentFile = new File(['brief'], 'brief.pdf', {
      type: 'application/pdf',
    });
    const uploadedAttachment = {
      __typename: 'WorkflowAttachment',
      id: '20000000-0000-4000-8000-000000000008',
      path: 'workflow/attachment/brief.pdf',
      size: 5,
      createdAt: '2026-08-13T00:00:00.000Z',
    };
    const expectedAttachment = {
      id: uploadedAttachment.id,
      name: 'brief.pdf',
      size: uploadedAttachment.size,
      type: 'pdf',
      createdAt: uploadedAttachment.createdAt,
    };
    const expectedSequence: CampaignSequence = {
      schemaVersion: 1,
      messages: [
        {
          ...email(firstId, 'First subject', 'First body'),
          files: [expectedAttachment],
        },
        initialSequence.messages[2],
      ],
      delaysSeconds: [45],
    };
    const saveMock: MockedResponse = {
      request: {
        query: SAVE_CAMPAIGN_SEQUENCE,
        variables: {
          input: {
            campaignId,
            expectedVersionId: versionOne,
            sequence: expectedSequence,
          },
        },
      },
      result: () => {
        saveCalls += 1;
        return {
          data: {
            saveCampaignSequence: snapshot(versionTwo, expectedSequence),
          },
        };
      },
    };
    const uploadMock = (): MockedResponse => ({
      request: {
        query: UploadWorkflowFileDocument,
        variables: { file: attachmentFile },
      },
      delay: 100,
      result: { data: { uploadWorkflowFile: uploadedAttachment } },
    });
    renderEditor([loadMock(), uploadMock(), uploadMock(), saveMock]);

    await screen.findByRole('button', { name: 'Add attachments' });
    const attachmentButton = screen.getByRole('button', {
      name: 'Add attachments',
    });
    const fileInput = screen.getByLabelText('Choose attachments');
    const fileInputClick = jest.spyOn(fileInput, 'click');
    attachmentButton.focus();
    await user.keyboard('{Enter}');
    expect(fileInputClick).toHaveBeenCalledTimes(1);
    fireEvent.change(fileInput, {
      target: { files: [attachmentFile] },
    });

    await user.click(screen.getByRole('button', { name: 'Move message 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Remove message 3' }));
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Delay 1 seconds' }),
      {
        target: { value: '45' },
      },
    );

    expect(await screen.findByText('brief.pdf')).toBeVisible();
    const removeAttachment = screen.getByRole('button', {
      name: 'Remove attachment brief.pdf',
    });
    removeAttachment.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText('brief.pdf')).not.toBeInTheDocument();

    fireEvent.change(fileInput, {
      target: { files: [attachmentFile] },
    });
    expect(await screen.findByText('brief.pdf')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveCalls).toBe(1));
    fileInputClick.mockRestore();
  });

  it('does not attach an upload to a different selected step after the original editor unmounts', async () => {
    const attachmentFile = new File(['brief'], 'brief.pdf', {
      type: 'application/pdf',
    });
    let uploadResolved = false;
    renderEditor([
      loadMock(),
      {
        request: {
          query: UploadWorkflowFileDocument,
          variables: { file: attachmentFile },
        },
        delay: 100,
        result: () => {
          uploadResolved = true;
          return {
            data: {
              uploadWorkflowFile: {
                __typename: 'WorkflowAttachment',
                id: '20000000-0000-4000-8000-000000000008',
                path: 'workflow/attachment/brief.pdf',
                size: 5,
                createdAt: '2026-08-13T00:00:00.000Z',
              },
            },
          };
        },
      },
    ]);

    await screen.findByRole('button', { name: 'Add attachments' });
    fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: { files: [attachmentFile] },
    });
    await editMessage(2);
    await waitFor(() => expect(uploadResolved).toBe(true));
    expect(screen.queryByText('brief.pdf')).not.toBeInTheDocument();
    await editMessage(1);
    expect(screen.queryByText('brief.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  it('does not attach to or resurrect a message switched away from and removed during upload', async () => {
    const user = userEvent.setup();
    const attachmentFile = new File(['brief'], 'brief.pdf', {
      type: 'application/pdf',
    });
    renderEditor([
      loadMock(),
      {
        request: {
          query: UploadWorkflowFileDocument,
          variables: { file: attachmentFile },
        },
        delay: 100,
        result: {
          data: {
            uploadWorkflowFile: {
              __typename: 'WorkflowAttachment',
              id: '20000000-0000-4000-8000-000000000008',
              path: 'workflow/attachment/brief.pdf',
              size: 5,
              createdAt: '2026-08-13T00:00:00.000Z',
            },
          },
        },
      },
    ]);

    await screen.findByRole('button', { name: 'Add attachments' });
    fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: { files: [attachmentFile] },
    });
    await editMessage(2);
    await user.click(screen.getByRole('button', { name: 'Remove message 1' }));
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(screen.queryByText('First subject')).not.toBeInTheDocument();
    expect(screen.queryByText('brief.pdf')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it.each([
    ['ACTIVE', 'ACTIVE'],
    ['ARCHIVED', 'ARCHIVED'],
  ])(
    'keeps %s sequence rail and composer read-only without authoring mutations',
    async (lifecycleStatus, versionStatus) => {
      const readOnlyLoad: MockedResponse = {
        request: { query: CAMPAIGN_SEQUENCE, variables: { campaignId } },
        result: {
          data: {
            campaignSequence: {
              __typename: 'CampaignSequencePresent',
              kind: 'SEQUENCE',
              snapshot: {
                ...snapshot(
                  versionOne,
                  initialSequence,
                  lifecycleStatus,
                  false,
                ),
                versionStatus,
              },
            },
          },
        },
      };
      renderEditor([readOnlyLoad]);

      await screen.findByRole('button', { name: 'Edit message 2' });
      expect(screen.getByRole('button', { name: 'Add email' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Add Instagram' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Move message 2 up' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Remove message 2' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('spinbutton', { name: 'Delay 1 seconds' }),
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
      await editMessage(2);
      expect(
        within(screen.getByRole('group', { name: 'Subject' })).getByRole(
          'textbox',
        ),
      ).toHaveAttribute('contenteditable', 'false');
      expect(bodyEditor()).toHaveAttribute('contenteditable', 'false');
      expect(screen.getByLabelText('Choose attachments')).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Add attachments' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('checkbox', { name: 'Reply to earlier email' }),
      ).toBeDisabled();
    },
  );

  it('synchronizes the real subject editor only when its selected message reloads', async () => {
    const renderSelected = (
      subject: string,
      replyToThread: boolean,
      reloadGeneration: number,
    ) => (
      <I18nProvider i18n={i18n}>
        <MockedProvider mocks={[]}>
          <CampaignSequenceMessageEditor
            editable
            hasPriorEmail
            issues={[]}
            message={email(thirdId, subject, 'Third body', replyToThread)}
            messageIndex={2}
            onAttachmentsAdded={jest.fn()}
            onChange={jest.fn()}
            reloadGeneration={reloadGeneration}
          />
        </MockedProvider>
      </I18nProvider>
    );
    const { rerender } = render(renderSelected('Discarded subject', false, 0));
    const subject = () =>
      within(screen.getByRole('group', { name: 'Subject' })).getByRole(
        'textbox',
      );
    expect(subject()).toHaveTextContent('Discarded subject');
    rerender(renderSelected('Ordinary draft rerender', false, 0));
    expect(subject()).toHaveTextContent('Discarded subject');
    rerender(renderSelected('Third subject', true, 1));
    await waitFor(() =>
      expect(subject()).toHaveAttribute('contenteditable', 'false'),
    );
    expect(subject()).toHaveTextContent('Third subject');
    expect(subject()).not.toHaveTextContent('Discarded subject');
  });

  it('restores the saved read-only reply subject after discarding an edited new-email subject', async () => {
    const user = userEvent.setup();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      renderEditor([loadMock(), loadMock()]);
      await screen.findByRole('button', { name: 'Edit message 3' });
      await editMessage(3);
      const subject = () =>
        within(screen.getByRole('group', { name: 'Subject' })).getByRole(
          'textbox',
        );
      expect(subject()).toHaveTextContent('Third subject');
      expect(subject()).toHaveAttribute('contenteditable', 'false');

      await user.click(
        screen.getByRole('checkbox', { name: 'Reply to earlier email' }),
      );
      expect(subject()).toHaveAttribute('contenteditable', 'true');
      act(() => subject().focus());
      await user.keyboard('{Control>}a{/Control}{Backspace}Discarded subject');
      expect(subject()).toHaveTextContent('Discarded subject');
      await user.click(
        screen.getByRole('button', { name: 'Reload from server' }),
      );
      await waitFor(() =>
        expect(subject()).toHaveAttribute('contenteditable', 'false'),
      );
      expect(subject()).toHaveTextContent('Third subject');
      expect(subject()).not.toHaveTextContent('Discarded subject');
      expect(
        screen.getByRole('checkbox', { name: 'Reply to earlier email' }),
      ).toBeChecked();
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
      expect(confirm).toHaveBeenCalledTimes(1);
    } finally {
      confirm.mockRestore();
    }
  });

  it('keeps distinct authored reply subject through mode round trip and blocks invalid predecessor after removal', async () => {
    const user = userEvent.setup();
    renderEditor([loadMock()]);

    await screen.findByRole('button', { name: 'Edit message 3' });
    await editMessage(3);
    const subject = () =>
      within(screen.getByRole('group', { name: 'Subject' })).getByRole(
        'textbox',
      );
    expect(subject()).toHaveTextContent('Third subject');
    expect(subject()).toHaveAttribute('contenteditable', 'false');
    expect(
      screen.getByRole('button', { name: 'Edit message 2' }),
    ).toHaveTextContent('Second subject');
    await user.click(
      screen.getByRole('checkbox', { name: 'Reply to earlier email' }),
    );
    expect(subject()).toHaveAttribute('contenteditable', 'true');
    expect(subject()).toHaveTextContent('Third subject');
    await user.click(
      screen.getByRole('checkbox', { name: 'Reply to earlier email' }),
    );
    expect(subject()).toHaveAttribute('contenteditable', 'false');
    await user.click(screen.getByRole('button', { name: 'Remove message 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove message 1' }));
    expect(subject()).toHaveTextContent('Third subject');
    expect(
      screen.getByText('A reply requires an earlier email in the sequence'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Turn off reply' }));
    expect(subject()).toHaveAttribute('contenteditable', 'true');
    expect(subject()).toHaveTextContent('Third subject');
  });

  it('invalidates reply intent through actual reorder and retains a dirty side-panel draft on cancel', async () => {
    const user = userEvent.setup();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor([loadMock()], true);

    await screen.findByRole('button', { name: 'Edit message 3' });
    await editMessage(3);
    await user.click(screen.getByRole('button', { name: 'Move message 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Move message 2 up' }));
    expect(
      screen.getByText(
        'Move this email after an earlier email or turn off reply.',
      ),
    ).toBeVisible();

    expect(
      within(screen.getByRole('group', { name: 'Subject' })).getByRole(
        'textbox',
      ),
    ).toHaveAttribute('contenteditable', 'false');
    await user.click(screen.getByRole('button', { name: 'Turn off reply' }));
    const subjectEditor = within(
      screen.getByRole('group', { name: 'Subject' }),
    ).getByRole('textbox');
    act(() => subjectEditor.focus());
    await user.keyboard(
      '{Control>}a{/Control}{Backspace}Dirty retained subject',
    );
    const transitionAccepted = window.dispatchEvent(
      new CustomEvent(PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT, {
        cancelable: true,
      }),
    );

    expect(transitionAccepted).toBe(false);
    expect(
      within(screen.getByRole('group', { name: 'Subject' })).getByRole(
        'textbox',
      ),
    ).toHaveTextContent('Dirty retained subject');

    confirm.mockReturnValue(true);
    expect(
      window.dispatchEvent(
        new CustomEvent(PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT, {
          cancelable: true,
        }),
      ),
    ).toBe(true);
    confirm.mockRestore();
  });
});

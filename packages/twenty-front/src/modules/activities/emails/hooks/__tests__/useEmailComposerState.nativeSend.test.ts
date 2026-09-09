import { act, renderHook } from '@testing-library/react';

import { SEND_EMAIL } from '@/activities/emails/graphql/mutations/sendEmail';
import { getTimelineThreadsFromObjectRecord } from '@/activities/emails/graphql/queries/getTimelineThreadsFromObjectRecord';
import { useEmailComposerState } from '@/activities/emails/hooks/useEmailComposerState';

const mockMutate = jest.fn();
const mockMutationHook = jest.fn();
const mockRefetch = jest.fn();
const mockClient = { refetchQueries: mockRefetch };
const mockSuccess = jest.fn();
const mockError = jest.fn();

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: (document: unknown) => {
    mockMutationHook(document);
    return [mockMutate, { loading: false }];
  },
}));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueSuccessSnackBar: mockSuccess,
    enqueueErrorSnackBar: mockError,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRefetch.mockResolvedValue([]);
  mockMutate.mockResolvedValue({
    data: {
      sendEmail: {
        success: true,
        error: null,
        messageThreadId: 'thread-id',
      },
    },
  });
});

it('explicit Send retains native account, fields, attachments, mutation and success behavior', async () => {
  const onSent = jest.fn();
  const { result } = renderHook(() =>
    useEmailComposerState({ connectedAccountId: 'first-account', onSent }),
  );

  expect(result.current.canSend).toBe(false);
  act(() => {
    result.current.setConnectedAccountId('selected-account');
    result.current.setTo(' to@example.com ');
    result.current.setCc(' cc@example.com ');
    result.current.setBcc(' bcc@example.com ');
    result.current.setSubject('Native subject');
    result.current.setBody('<p>Native <strong>rich text</strong></p>');
    result.current.setFiles([{ id: 'local-attachment-id', name: 'note.txt' }]);
  });
  expect(result.current.canSend).toBe(true);
  expect(mockMutate).not.toHaveBeenCalled();

  await act(async () => {
    await result.current.handleSend();
  });

  expect(mockMutationHook).toHaveBeenCalledWith(SEND_EMAIL);
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        connectedAccountId: 'selected-account',
        to: 'to@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: 'Native subject',
        body: '<p>Native <strong>rich text</strong></p>',
        inReplyTo: undefined,
        draftMessageId: undefined,
        files: [{ id: 'local-attachment-id', name: 'note.txt' }],
      },
    },
  });
  expect(mockSuccess).toHaveBeenCalledTimes(1);
  expect(mockSuccess).toHaveBeenCalledWith({
    message: 'Email sent successfully',
  });
  expect(mockError).not.toHaveBeenCalled();
  expect(mockRefetch).toHaveBeenCalledWith({
    include: [
      getTimelineThreadsFromObjectRecord,
      'FindManyMessages',
      'FindManyMessageParticipants',
      'FindManyMessageChannelMessageAssociations',
    ],
  });
  expect(onSent).toHaveBeenCalledTimes(1);
  expect(onSent).toHaveBeenCalledWith('thread-id');
});

it.each(['response-error', 'transport-error'])(
  'retains native %s behavior without closing',
  async (failure) => {
    if (failure === 'response-error') {
      mockMutate.mockResolvedValue({
        data: {
          sendEmail: {
            success: false,
            error: 'Local rejected send',
            messageThreadId: null,
          },
        },
      });
    } else {
      mockMutate.mockRejectedValue(new Error('Local transport failure'));
    }
    const onSent = jest.fn();
    const { result } = renderHook(() =>
      useEmailComposerState({
        connectedAccountId: 'account-id',
        defaultTo: 'to@example.com',
        onSent,
      }),
    );

    expect(mockMutate).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.handleSend();
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith({
      message:
        failure === 'response-error'
          ? 'Local rejected send'
          : 'Failed to send email',
    });
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(result.current.to).toBe('to@example.com');
    expect(result.current.canSend).toBe(true);
  },
);

it('does not send with empty editable To', async () => {
  const { result } = renderHook(() =>
    useEmailComposerState({ connectedAccountId: 'account-id' }),
  );

  expect(result.current.to).toBe('');
  expect(result.current.canSend).toBe(false);
  await act(async () => {
    await result.current.handleSend();
  });
  expect(mockMutate).not.toHaveBeenCalled();
});

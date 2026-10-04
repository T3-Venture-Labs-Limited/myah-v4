import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { MyahCampaignExecutionControls } from '@/page-layout/components/MyahCampaignExecutionControls';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { focusStackState } from '@/ui/utilities/focus/states/focusStackState';
import { type AuthTokenPair } from '~/generated-metadata/graphql';

const started = (replayed = false) => ({
  status: 'STARTED',
  lifecycleStatus: 'ACTIVE',
  reason: null,
  replayed,
  changed: !replayed,
  inFlightCount: null,
});
const stopped = (changed = true, inFlightCount = 1) => ({
  status: 'STOPPED',
  lifecycleStatus: 'STOPPED',
  reason: null,
  replayed: false,
  changed,
  inFlightCount,
});
const metadataMutate = jest.fn();
const mockListen = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const coreClient = { query: jest.fn() };
const mockUseQuery = jest.fn();
const refetchCampaign = jest.fn();
const refetchSequence = jest.fn();
const refetchAudience = jest.fn();
const refetchSenderPool = jest.fn();
let lifecycleStatus: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' = 'DRAFT';
let currentCampaignId = 'campaign';
let canRead = true;
let canUpdate = true;
let sequenceData: Record<string, unknown>;
let senderPoolData: Record<string, unknown>;
let audienceData: Record<string, unknown>;
let campaignLoading = false;
let sequenceLoading = false;
let audienceLoading = false;
let senderPoolLoading = false;
let campaignError: Error | undefined;
let sequenceError: Error | undefined;
let audienceError: Error | undefined;
let senderPoolError: Error | undefined;

jest.mock(
  '@/browser-event/hooks/useListenToObjectRecordOperationBrowserEvent',
  () => ({
    useListenToObjectRecordOperationBrowserEvent: (...args: unknown[]) =>
      mockListen(...args),
  }),
);
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => coreClient,
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-meta' },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: canRead,
    canUpdateObjectRecords: canUpdate,
  }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: ({ objectRecordId }: { objectRecordId: string }) => {
    currentCampaignId = objectRecordId;
    return {
      record: { id: objectRecordId, lifecycleStatus },
      loading: campaignLoading,
      error: campaignError,
      refetch: refetchCampaign,
    };
  },
}));
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ mutate: metadataMutate }),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));
jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    title,
    subtitle,
    confirmButtonText,
    onConfirmClick,
  }: {
    title: string;
    subtitle: string;
    confirmButtonText: string;
    onConfirmClick: () => void;
  }) => (
    <div>
      <span>{title}</span>
      <span>{subtitle}</span>
      <button onClick={onConfirmClick}>{confirmButtonText}</button>
    </div>
  ),
}));
jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    disabled,
    onClick,
  }: {
    title: string;
    disabled: boolean;
    onClick: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));
jest.mock('twenty-ui/layout', () => ({
  Section: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
jest.mock('twenty-ui/typography', () => ({
  H2Title: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  lifecycleStatus = 'DRAFT';
  currentCampaignId = 'campaign';
  canRead = true;
  canUpdate = true;
  sequenceData = {
    campaignSequence: {
      kind: 'SEQUENCE',
      snapshot: {
        issues: [],
        sequence: { messages: [{ channel: 'EMAIL' }] },
        versionStatus: 'ACTIVE',
      },
    },
  };
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'LOADED',
      campaignId: 'campaign',
      eligibleCount: 1,
      eligibleCreators: [
        {
          campaignCreatorId: 'membership-1',
          creatorId: 'creator-1',
          creatorName: 'Ada Creator',
        },
      ],
      excludedCount: 0,
      excludedCreators: [],
    },
  };
  senderPoolData = {
    campaignEmailSenderPool: {
      mailboxes: [{ bindingStatus: 'RESOLVED_BINDING', status: 'READY' }],
    },
  };
  campaignLoading = false;
  sequenceLoading = false;
  audienceLoading = false;
  senderPoolLoading = false;
  campaignError = undefined;
  sequenceError = undefined;
  audienceError = undefined;
  senderPoolError = undefined;
  mockUseQuery.mockImplementation((document: any, options: any) => {
    const operationName = document.definitions[0].name.value;
    if (operationName === 'CampaignSequenceExecutionReadiness')
      return {
        data: sequenceData,
        loading: sequenceLoading,
        error: sequenceError,
        refetch: refetchSequence,
      };
    if (operationName === 'CampaignOutreachAudienceReview')
      return {
        data: {
          ...audienceData,
          campaignOutreachAudienceReview: {
            ...(audienceData.campaignOutreachAudienceReview as object),
            campaignId:
              (
                audienceData.campaignOutreachAudienceReview as {
                  campaignId: string;
                }
              ).campaignId === 'campaign'
                ? options.variables.campaignId
                : (
                    audienceData.campaignOutreachAudienceReview as {
                      campaignId: string;
                    }
                  ).campaignId,
          },
        },
        loading: audienceLoading,
        error: audienceError,
        refetch: refetchAudience,
      };
    return {
      data: senderPoolData,
      loading: senderPoolLoading,
      error: senderPoolError,
      refetch: refetchSenderPool,
    };
  });
  refetchCampaign.mockImplementation(() =>
    Promise.resolve({
      data: { campaign: { id: currentCampaignId, lifecycleStatus } },
    }),
  );
  refetchSequence.mockImplementation(() =>
    Promise.resolve({ data: sequenceData }),
  );
  refetchAudience.mockImplementation(() =>
    Promise.resolve({
      data: {
        campaignOutreachAudienceReview: {
          ...(audienceData.campaignOutreachAudienceReview as object),
          campaignId: currentCampaignId,
        },
      },
    }),
  );
  refetchSenderPool.mockImplementation(() =>
    Promise.resolve({ data: senderPoolData }),
  );
});

it('uses a stable Start attempt key across a failed retry and prevents double submit', async () => {
  metadataMutate
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({
      data: { startCampaignExecution: started() },
    });
  render(
    <MyahCampaignExecutionControls campaignId="10000000-0000-4000-8000-000000000001" />,
  );
  const start = screen.getByRole('button', { name: 'Start' });
  fireEvent.click(start);
  fireEvent.click(start);
  await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(1));
  fireEvent.click(start);
  await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(2));
  expect(
    metadataMutate.mock.calls[0][0].variables.input.startIdempotencyKey,
  ).toBe(metadataMutate.mock.calls[1][0].variables.input.startIdempotencyKey);
  expect(metadataMutate.mock.calls[0][0].variables.input).toEqual(
    expect.objectContaining({
      campaignId: '10000000-0000-4000-8000-000000000001',
    }),
  );
  expect(refetchCampaign).toHaveBeenCalled();
  expect(refetchSequence).toHaveBeenCalled();
  expect(refetchAudience).toHaveBeenCalled();
  expect(refetchSenderPool).toHaveBeenCalled();
});

it('does not misreport or repeat an acknowledged Start when status refresh fails', async () => {
  metadataMutate.mockResolvedValue({
    data: {
      startCampaignExecution: {
        status: 'STARTED',
        lifecycleStatus: 'ACTIVE',
        reason: null,
        replayed: false,
        changed: true,
        inFlightCount: null,
      },
    },
  });
  refetchCampaign.mockRejectedValueOnce(new Error('refresh unavailable'));
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() =>
    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message:
        'Campaign Start confirmed, but status could not be refreshed. Reload before taking another action.',
    }),
  );
  expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Reload status' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(metadataMutate).toHaveBeenCalledTimes(1);
});

it('shows historical acknowledgment without claiming ACTIVE in the header when status refresh fails', async () => {
  metadataMutate.mockResolvedValue({
    data: {
      startCampaignExecution: {
        status: 'ACKNOWLEDGED',
        lifecycleStatus: null,
        reason: null,
        replayed: true,
        changed: false,
        inFlightCount: null,
      },
    },
  });
  refetchCampaign.mockRejectedValueOnce(new Error('refresh unavailable'));
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Earlier Start attempt acknowledged, but current Campaign status could not be refreshed. Reload before taking another action.',
    ),
  );
  expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Reload status' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(metadataMutate).toHaveBeenCalledTimes(1);
});

it('resets a failed Start retry when the record header navigates to another Campaign', async () => {
  metadataMutate.mockRejectedValueOnce(new Error('network'));
  const { rerender } = render(
    <MyahCampaignExecutionControls
      campaignId="campaign-a"
      key="campaign-a"
      variant="header"
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
  await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(1));

  lifecycleStatus = 'ACTIVE';
  rerender(
    <MyahCampaignExecutionControls
      campaignId="campaign-b"
      key="campaign-b"
      variant="header"
    />,
  );

  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Start' }),
  ).not.toBeInTheDocument();
});

it.each([
  [
    'the sender pool no longer has a READY mailbox',
    () =>
      (senderPoolData = {
        campaignEmailSenderPool: { mailboxes: [] },
      }),
  ],
  [
    'sender readiness reload fails',
    () => (senderPoolError = new Error('metadata unavailable')),
  ],
  [
    'Campaign state becomes stale',
    () => (campaignError = new Error('campaign unavailable')),
  ],
])(
  'does not let an outstanding Start retry bypass safety when %s',
  async (_label, makeUnsafe) => {
    metadataMutate.mockRejectedValueOnce(new Error('network'));
    const { rerender } = render(
      <MyahCampaignExecutionControls campaignId="campaign" />,
    );
    const start = screen.getByRole('button', { name: 'Start' });
    fireEvent.click(start);
    await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(start).toBeEnabled());

    makeUnsafe();
    rerender(<MyahCampaignExecutionControls campaignId="campaign" />);

    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(metadataMutate).toHaveBeenCalledTimes(1);
  },
);

it('reviews the published email snapshot and executable mailbox separately from linked drafting accounts', () => {
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(
    screen.getByRole('region', { name: 'Launch readiness' }),
  ).toHaveTextContent('Published sequence ready');
  expect(
    screen.getByRole('region', { name: 'Launch readiness' }),
  ).toHaveTextContent(
    '1 ready email mailbox in the sender pool. Linked drafting accounts do not determine execution readiness.',
  );
  expect(
    screen.getByRole('region', { name: 'Launch readiness' }),
  ).not.toHaveTextContent('readiness.`');
  expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
});

it('does not report launch readiness as ready when the published snapshot is missing', () => {
  sequenceData = {
    campaignSequence: {
      kind: 'SEQUENCE',
      snapshot: {
        issues: [],
        sequence: { messages: [{ channel: 'EMAIL' }] },
        versionStatus: 'DRAFT',
      },
    },
  };
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(
    screen.getByRole('region', { name: 'Launch readiness' }),
  ).toHaveTextContent('Publish the current sequence before Start');
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
});

it('uses UTC all-day defaults without showing timezone or window inputs', () => {
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.queryByLabelText('Sending timezone')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('End time')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save sending window' }),
  ).not.toBeInTheDocument();
});

it('routes sequence readiness to core and audience, sender readiness, plus mutations to metadata', async () => {
  metadataMutate.mockResolvedValue({
    data: { startCampaignExecution: started() },
  });
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  const queryCalls = mockUseQuery.mock.calls.map(([document, options]) => ({
    client: options.client,
    operationName: document.definitions[0].name.value,
    variables: options.variables,
  }));
  expect(queryCalls.slice(-3)).toEqual([
    {
      client: coreClient,
      operationName: 'CampaignSequenceExecutionReadiness',
      variables: { campaignId: 'campaign' },
    },
    {
      client: undefined,
      operationName: 'CampaignOutreachAudienceReview',
      variables: { campaignId: 'campaign' },
    },
    {
      client: undefined,
      operationName: 'CampaignEmailSenderPoolExecutionReadiness',
      variables: { input: { campaignId: 'campaign' } },
    },
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(1));
  expect(coreClient.query).not.toHaveBeenCalled();
});

it('keeps Start disabled until both readiness sources have loaded', () => {
  senderPoolLoading = true;

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
});

it.each([
  ['core sequence', () => (sequenceError = new Error('core unavailable'))],
  [
    'metadata sender pool',
    () => (senderPoolError = new Error('metadata unavailable')),
  ],
])('fails closed when the %s readiness query fails', (_source, failQuery) => {
  failQuery();

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(
    screen.getByText(
      'Campaign readiness could not be loaded. Reload before Start.',
    ),
  ).toBeVisible();
});

it.each(['DRAFT', 'ACTIVE'] as const)(
  'fails closed when cached %s Campaign state has a refresh error',
  (status) => {
    lifecycleStatus = status;
    campaignError = new Error('campaign unavailable');

    render(<MyahCampaignExecutionControls campaignId="campaign" />);

    expect(
      screen.getByRole('button', {
        name: status === 'ACTIVE' ? 'Stop' : 'Start',
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Campaign status could not be loaded. Reload before Start or Stop.',
      ),
    ).toBeVisible();
  },
);

it('blocks Start without update permission', () => {
  canUpdate = false;
  render(<MyahCampaignExecutionControls campaignId="campaign" />);
  expect(
    screen.getByText(
      "You don't have permission to Start or Stop this Campaign.",
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
});

it.each(['DRAFT', 'ACTIVE'] as const)(
  'hides cached readiness and disables %s execution on local Campaign read revocation',
  (status) => {
    lifecycleStatus = status;
    const { rerender } = render(
      <MyahCampaignExecutionControls campaignId="campaign" />,
    );
    expect(screen.getByText('Ada Creator')).toBeVisible();

    canRead = false;
    rerender(<MyahCampaignExecutionControls campaignId="campaign" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      "You don't have permission to view this Campaign.",
    );
    expect(screen.queryByText('Ada Creator')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/ready email mailbox in the sender pool/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: status === 'ACTIVE' ? 'Stop' : 'Start',
      }),
    ).not.toBeInTheDocument();
    expect(metadataMutate).not.toHaveBeenCalled();
  },
);

it.each([
  [
    'multiple READY mailboxes',
    [
      { bindingStatus: 'RESOLVED_BINDING', status: 'READY' },
      { bindingStatus: 'RESOLVED_BINDING', status: 'READY' },
    ],
  ],
  [
    'a mixed READY and blocked mailbox pool',
    [
      { bindingStatus: 'RESOLVED_BINDING', status: 'BLOCKED' },
      { bindingStatus: 'RESOLVED_BINDING', status: 'READY' },
    ],
  ],
])('enables Start with %s', (_label, mailboxes) => {
  senderPoolData = { campaignEmailSenderPool: { mailboxes } };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
});

it.each([
  ['no selected mailboxes', []],
  [
    'only blocked mailboxes',
    [{ bindingStatus: 'RESOLVED_BINDING', status: 'BLOCKED' }],
  ],
  [
    'a READY status without a resolved binding',
    [{ bindingStatus: 'MISSING_CORE_BINDING', status: 'READY' }],
  ],
])('blocks Start with %s', (_label, mailboxes) => {
  senderPoolData = { campaignEmailSenderPool: { mailboxes } };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(
    screen.getByText('Select at least one ready email mailbox before Start.'),
  ).toBeVisible();
});

it('refetches the audience after Creator or Campaign Creator record changes', () => {
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  const activeListeners = mockListen.mock.calls.slice(-2);
  expect(activeListeners).toHaveLength(2);
  for (const [{ onObjectRecordOperationBrowserEvent }] of activeListeners)
    onObjectRecordOperationBrowserEvent();
  expect(refetchAudience).toHaveBeenCalledTimes(2);
});

it('asks for confirmation in the header and names who will be skipped before Start', async () => {
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'LOADED',
      campaignId: 'campaign',
      eligibleCount: 1,
      eligibleCreators: [
        {
          campaignCreatorId: 'membership-1',
          creatorId: 'creator-1',
          creatorName: 'Poppy Hartwell',
        },
      ],
      excludedCount: 1,
      excludedCreators: [
        {
          campaignCreatorId: 'membership-2',
          creatorId: 'creator-2',
          creatorName: 'Myah Insta',
          reasons: ['NO_USABLE_CHANNEL'],
        },
      ],
    },
  };
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(metadataMutate).not.toHaveBeenCalled();
  expect(screen.getByText('Start this Campaign?')).toBeVisible();
  expect(screen.getByText('1 will be contacted · 1 skipped.')).toBeVisible();
  expect(
    screen.getByText(
      'Myah Insta: No Instagram handle or usable email for this sequence',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
  await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(1));
});

it('shows eligible and excluded Creator names with actionable reasons', () => {
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'LOADED',
      campaignId: 'campaign',
      eligibleCount: 1,
      eligibleCreators: [
        {
          campaignCreatorId: 'membership-1',
          creatorId: 'creator-1',
          creatorName: 'Ada Eligible',
        },
      ],
      excludedCount: 1,
      excludedCreators: [
        {
          campaignCreatorId: 'membership-2',
          creatorId: 'creator-2',
          creatorName: 'Grace Excluded',
          reasons: ['INVALID_STAGE', 'INVALID_EMAIL'],
        },
      ],
    },
  };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByText('1 eligible · 1 excluded')).toBeVisible();
  expect(screen.getByText('Ada Eligible')).toBeVisible();
  expect(
    screen.getByText(
      'Grace Excluded — Stage must be Not contacted or Contacted; Creator needs a valid email address',
    ),
  ).toBeVisible();
});

it('describes an ineligible recorded stage without inventing a reply-stop reason', () => {
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'LOADED',
      campaignId: 'campaign',
      eligibleCount: 0,
      eligibleCreators: [],
      excludedCount: 1,
      excludedCreators: [
        {
          campaignCreatorId: 'membership-progressed',
          creatorId: 'creator-progressed',
          creatorName: 'Grace Progressed',
          reasons: ['INVALID_STAGE'],
        },
      ],
    },
  };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(
    screen.getByText(
      'Grace Progressed — Stage must be Not contacted or Contacted',
    ),
  ).toBeVisible();
  expect(screen.queryByText(/Reply received/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
});

it('explains an operator-excluded Creator without changing eligibility counts', () => {
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'LOADED',
      campaignId: 'campaign',
      eligibleCount: 0,
      eligibleCreators: [],
      excludedCount: 1,
      excludedCreators: [
        {
          campaignCreatorId: 'membership-excluded',
          creatorId: 'creator-excluded',
          creatorName: 'Ada Excluded',
          reasons: ['OPERATOR_EXCLUDED'],
        },
      ],
    },
  };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByText('0 eligible · 1 excluded')).toBeVisible();
  expect(screen.getByText('Ada Excluded — Excluded by operator')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
});

it('shows audience load failure as an error and disables Start', () => {
  audienceError = new Error('audience unavailable');

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('alert')).toHaveTextContent(
    'This is not an empty audience',
  );
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
});

it('treats the server audience ERROR state as unavailable rather than empty', () => {
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'ERROR',
      errorCode: 'AUDIENCE_UNAVAILABLE',
      campaignId: 'campaign',
      eligibleCount: 0,
      eligibleCreators: [],
      excludedCount: 0,
      excludedCreators: [],
    },
  };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Campaign audience review is unavailable',
  );
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
});

it('disables Start for zero eligible Creators', () => {
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'LOADED',
      campaignId: 'campaign',
      eligibleCount: 0,
      eligibleCreators: [],
      excludedCount: 1,
      excludedCreators: [
        {
          campaignCreatorId: 'membership-1',
          creatorId: 'creator-1',
          creatorName: 'Excluded Creator',
          reasons: ['DUPLICATE_CREATOR_EMAIL'],
        },
      ],
    },
  };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(
    screen.getByText('No Campaign Creators are currently eligible.'),
  ).toBeVisible();
});

it('rejects a stale audience response owned by another Campaign', () => {
  audienceData = {
    campaignOutreachAudienceReview: {
      state: 'LOADED',
      campaignId: 'other-campaign',
      eligibleCount: 1,
      eligibleCreators: [],
      excludedCount: 0,
      excludedCreators: [],
    },
  };

  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(
    screen.getByText('Campaign audience review is unavailable.'),
  ).toBeVisible();
});

it('shows launch review without duplicate execution actions in the Operations variant', () => {
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="review" />,
  );

  expect(
    screen.getByRole('region', { name: 'Launch readiness' }),
  ).toHaveTextContent('Published sequence ready');
  expect(
    screen.getByRole('region', { name: 'Campaign outreach audience review' }),
  ).toHaveTextContent('1 eligible · 0 excluded');
  expect(
    screen.queryByRole('button', { name: 'Start' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Stop' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Stop Campaign' }),
  ).not.toBeInTheDocument();
});

it('renders the applicable action in the compact record-header variant', () => {
  lifecycleStatus = 'ACTIVE';

  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );

  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  expect(screen.queryByText('Campaign execution')).not.toBeInTheDocument();
});

it('does not misreport or repeat an acknowledged Stop when status refresh fails', async () => {
  lifecycleStatus = 'ACTIVE';
  metadataMutate.mockResolvedValue({
    data: {
      stopCampaignExecution: {
        status: 'STOPPED',
        lifecycleStatus: 'STOPPED',
        reason: null,
        replayed: false,
        changed: true,
        inFlightCount: 1,
      },
    },
  });
  refetchCampaign.mockRejectedValueOnce(new Error('refresh unavailable'));
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
  await waitFor(() =>
    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message:
        'Campaign Stop confirmed, but status could not be refreshed. Reload before taking another action.',
    }),
  );
  expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
  expect(metadataMutate).toHaveBeenCalledTimes(1);
});

it('distinguishes a confirmed Stop receipt from a fresh ACTIVE status after concurrent restart', async () => {
  lifecycleStatus = 'ACTIVE';
  metadataMutate.mockResolvedValue({
    data: { stopCampaignExecution: stopped() },
  });
  refetchCampaign.mockResolvedValue({
    data: { campaign: { id: 'campaign', lifecycleStatus: 'ACTIVE' } },
  });
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
  await waitFor(() =>
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message: expect.stringContaining('Campaign is ACTIVE again'),
    }),
  );
  expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalledWith({
    message: expect.stringContaining('Campaign stopped.'),
  });
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  expect(metadataMutate).toHaveBeenCalledTimes(1);
});

it('uses Stop language and explicitly does not promise provider recall', async () => {
  lifecycleStatus = 'ACTIVE';
  metadataMutate.mockResolvedValue({
    data: { stopCampaignExecution: stopped() },
  });
  render(<MyahCampaignExecutionControls campaignId="campaign" />);
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  expect(
    screen.getByText(/already accepted by a provider cannot be recalled/i),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
  await waitFor(() =>
    expect(metadataMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { input: { campaignId: 'campaign' } },
      }),
    ),
  );
  expect(metadataMutate.mock.calls[0][0].variables.input).not.toHaveProperty(
    'lifecycleStatus',
  );
});

it.each(['campaign', 'sequence', 'audience', 'sender'] as const)(
  'keeps the confirmed Start barrier when %s refresh fails, then recovers with reads only',
  async (failed) => {
    metadataMutate.mockResolvedValue({
      data: { startCampaignExecution: started() },
    });
    const refetch = {
      campaign: refetchCampaign,
      sequence: refetchSequence,
      audience: refetchAudience,
      sender: refetchSenderPool,
    }[failed];
    refetch.mockRejectedValueOnce(new Error('refresh unavailable'));
    render(
      <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Campaign Start confirmed, but status could not be refreshed',
      ),
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload status' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Reload status' }),
      ).not.toBeInTheDocument(),
    );
    expect(metadataMutate).toHaveBeenCalledTimes(1);
    expect(refetchCampaign).toHaveBeenCalledTimes(2);
    expect(refetchSequence).toHaveBeenCalledTimes(2);
    expect(refetchAudience).toHaveBeenCalledTimes(2);
    expect(refetchSenderPool).toHaveBeenCalledTimes(2);
  },
);

it('does not release the barrier on missing or mismatched fresh Campaign data', async () => {
  metadataMutate.mockResolvedValue({
    data: { startCampaignExecution: started() },
  });
  refetchCampaign.mockResolvedValue({
    data: { campaign: { id: 'other-campaign', lifecycleStatus: 'ACTIVE' } },
  });
  render(<MyahCampaignExecutionControls campaignId="campaign" />);
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Reload status' })).toBeVisible(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reload status' }));
  await waitFor(() => expect(refetchCampaign).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(metadataMutate).toHaveBeenCalledTimes(1);
});

it('does not clear a confirmed receipt when a subordinate fresh read is missing', async () => {
  metadataMutate.mockResolvedValue({
    data: { startCampaignExecution: started() },
  });
  refetchSenderPool.mockResolvedValue({ data: null });
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Campaign Start confirmed, but status could not be refreshed',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reload status' }));
  await waitFor(() => expect(refetchSenderPool).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(metadataMutate).toHaveBeenCalledTimes(1);
});

it('reports BLOCKED separately from an uncertain missing Start receipt and retains the same key', async () => {
  metadataMutate
    .mockResolvedValueOnce({
      data: {
        startCampaignExecution: {
          status: 'BLOCKED',
          lifecycleStatus: null,
          reason: 'CAMPAIGN_ALREADY_ACTIVE',
          replayed: false,
          changed: false,
          inFlightCount: null,
        },
      },
    })
    .mockResolvedValueOnce({ data: null });
  render(<MyahCampaignExecutionControls campaignId="campaign" />);
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'CAMPAIGN_ALREADY_ACTIVE',
    ),
  );
  expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Start could not be confirmed',
    ),
  );
  expect(
    metadataMutate.mock.calls[0][0].variables.input.startIdempotencyKey,
  ).toBe(metadataMutate.mock.calls[1][0].variables.input.startIdempotencyKey);
  expect(refetchCampaign).not.toHaveBeenCalled();
});

it('uses historical ACK only as an older receipt, not a current ACTIVE state', async () => {
  metadataMutate.mockResolvedValueOnce({
    data: {
      startCampaignExecution: {
        status: 'ACKNOWLEDGED',
        lifecycleStatus: null,
        reason: null,
        replayed: true,
        changed: false,
        inFlightCount: null,
      },
    },
  });
  lifecycleStatus = 'PAUSED';
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
  await waitFor(() =>
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('No new activation was created'),
      }),
    ),
  );
  expect(
    screen.queryByRole('button', { name: 'Stop' }),
  ).not.toBeInTheDocument();
  expect(metadataMutate).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
  'recognizes a canonical Stop with changed=%s without promising recall',
  async (changed) => {
    lifecycleStatus = 'ACTIVE';
    metadataMutate.mockResolvedValue({
      data: { stopCampaignExecution: stopped(changed, 2) },
    });
    refetchCampaign.mockResolvedValue({
      data: { campaign: { id: 'campaign', lifecycleStatus: 'PAUSED' } },
    });
    render(<MyahCampaignExecutionControls campaignId="campaign" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
    await waitFor(() =>
      expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('cannot be recalled'),
        }),
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Stop' }),
    ).not.toBeInTheDocument();
    expect(metadataMutate).toHaveBeenCalledTimes(1);
  },
);

it('ignores an old Campaign receipt after navigation while its mutation is pending', async () => {
  let complete!: (value: unknown) => void;
  metadataMutate.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const { rerender } = render(
    <MyahCampaignExecutionControls campaignId="campaign-a" variant="header" />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
  expect(metadataMutate).toHaveBeenCalledTimes(1);
  rerender(
    <MyahCampaignExecutionControls campaignId="campaign-b" variant="header" />,
  );
  complete({ data: { startCampaignExecution: started() } });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled(),
  );
  expect(refetchCampaign).not.toHaveBeenCalled();
  expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
});

it('keeps BLOCKED Stop distinct from a confirmed Stop and requires a read to recover', async () => {
  lifecycleStatus = 'ACTIVE';
  metadataMutate.mockResolvedValue({
    data: {
      stopCampaignExecution: {
        status: 'BLOCKED',
        lifecycleStatus: null,
        reason: 'HISTORY_UNAVAILABLE',
        replayed: false,
        changed: false,
        inFlightCount: null,
      },
    },
  });
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('HISTORY_UNAVAILABLE'),
  );
  expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reload status' })).toBeVisible();
  expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
});

it('does not retry Stop on an unconfirmed response and only offers read-only recovery', async () => {
  lifecycleStatus = 'ACTIVE';
  metadataMutate.mockResolvedValue({
    data: {
      stopCampaignExecution: { status: 'ACKNOWLEDGED', lifecycleStatus: null },
    },
  });
  render(
    <MyahCampaignExecutionControls campaignId="campaign" variant="header" />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Stop could not be confirmed',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
  expect(metadataMutate).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Reload status' })).toBeVisible();
});

it('updates its identity fence after auth atoms hydrate before an operator action', async () => {
  lifecycleStatus = 'ACTIVE';
  const store = createStore();
  store.set(tokenPairState.atom, null);
  metadataMutate.mockResolvedValue({
    data: { stopCampaignExecution: stopped() },
  });
  const { unmount } = render(
    <Provider store={store}>
      <MyahCampaignExecutionControls campaignId="campaign" variant="header" />
    </Provider>,
  );
  try {
    act(() => store.set(currentUserState.atom, { id: 'user' } as any));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
    await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(1));
  } finally {
    unmount();
    store.set(currentUserState.atom, null);
  }
});

it.each(['lost-response', 'canonical'])(
  'keeps Start identity through ordinary access-token renewal (%s)',
  async (outcome) => {
    const store = createStore();
    const payload = btoa(
      JSON.stringify({
        type: 'ACCESS',
        workspaceId: 'workspace',
        userId: 'user',
        userWorkspaceId: 'user-workspace',
        workspaceMemberId: 'member',
      }),
    ).replace(/=+$/, '');
    const pair = (signature: string) =>
      ({
        accessOrWorkspaceAgnosticToken: {
          token: `e30.${payload}.${signature}`,
        },
      }) as AuthTokenPair;
    store.set(currentUserState.atom, { id: 'user' } as any);
    store.set(currentWorkspaceState.atom, { id: 'workspace' } as any);
    store.set(currentWorkspaceMemberState.atom, { id: 'member' } as any);
    store.set(tokenPairState.atom, pair('first'));
    let completeStart!: (value: unknown) => void;
    let rejectStart!: (reason?: unknown) => void;
    metadataMutate.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          completeStart = resolve;
          rejectStart = reject;
        }),
    );
    if (outcome === 'lost-response')
      metadataMutate.mockResolvedValueOnce({
        data: { startCampaignExecution: started() },
      });
    const control = () => (
      <Provider store={store}>
        <MyahCampaignExecutionControls campaignId="campaign" variant="header" />
      </Provider>
    );
    try {
      const { rerender } = render(control());
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
      expect(metadataMutate).toHaveBeenCalledTimes(1);
      await act(async () => {
        store.set(tokenPairState.atom, pair('renewed'));
        rerender(control());
        if (outcome === 'canonical')
          completeStart({ data: { startCampaignExecution: started() } });
        else rejectStart(new Error('network after token renewal'));
      });
      if (outcome === 'canonical') {
        await waitFor(() =>
          expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
            message: 'Campaign Start confirmed.',
          }),
        );
        expect(refetchCampaign).toHaveBeenCalled();
        expect(metadataMutate).toHaveBeenCalledTimes(1);
      } else {
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Start' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
        await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(2));
        expect(
          metadataMutate.mock.calls[1][0].variables.input.startIdempotencyKey,
        ).toBe(
          metadataMutate.mock.calls[0][0].variables.input.startIdempotencyKey,
        );
      }
    } finally {
      store.set(tokenPairState.atom, null);
      store.set(currentUserState.atom, null);
      store.set(currentWorkspaceState.atom, null);
      store.set(currentWorkspaceMemberState.atom, null);
    }
  },
);

it.each([
  ['read', false],
  ['read', true],
  ['write', false],
  ['write', true],
] as const)(
  'requires a fresh read after Stop loses %s permission (restore before settlement: %s)',
  async (permission, restoreBeforeSettlement) => {
    lifecycleStatus = 'ACTIVE';
    let settleStop!: (value: unknown) => void;
    metadataMutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleStop = resolve;
        }),
    );
    const store = createStore();
    store.set(tokenPairState.atom, null);
    const control = () => (
      <Provider store={store}>
        <MyahCampaignExecutionControls campaignId="campaign" variant="header" />
      </Provider>
    );
    const { rerender } = render(control());
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
    expect(metadataMutate).toHaveBeenCalledTimes(1);
    if (permission === 'read') canRead = false;
    else canUpdate = false;
    rerender(control());
    if (restoreBeforeSettlement) {
      canRead = true;
      canUpdate = true;
      rerender(control());
    }
    await act(async () => {
      settleStop({ data: { stopCampaignExecution: stopped() } });
    });
    if (!restoreBeforeSettlement) {
      canRead = true;
      canUpdate = true;
      rerender(control());
    }
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload status' })).toBeVisible();
    expect(metadataMutate).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
    refetchCampaign.mockResolvedValueOnce({
      data: {
        campaign: {
          id: 'campaign',
          lifecycleStatus: restoreBeforeSettlement ? 'ACTIVE' : 'PAUSED',
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reload status' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Reload status' }),
      ).not.toBeInTheDocument(),
    );
    if (restoreBeforeSettlement)
      expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    else
      expect(
        screen.queryByRole('button', { name: 'Stop' }),
      ).not.toBeInTheDocument();
    expect(metadataMutate).toHaveBeenCalledTimes(1);
  },
);

it.each(['read', 'write'])(
  'closes a pre-opened native Stop confirmation on %s permission loss and requires new consent after a current read',
  async (permission) => {
    lifecycleStatus = 'ACTIVE';
    const store = createStore();
    store.set(tokenPairState.atom, null);
    metadataMutate.mockResolvedValue({
      data: { stopCampaignExecution: stopped() },
    });
    const modalId = 'stop-campaign-execution-campaign';
    const modalAtom = isModalOpenedComponentState.atomFamily({
      instanceId: modalId,
    });
    const control = () => (
      <Provider store={store}>
        <MyahCampaignExecutionControls campaignId="campaign" variant="header" />
      </Provider>
    );
    const { rerender, unmount } = render(control());
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(store.get(modalAtom)).toBe(true);
      expect(
        store
          .get(focusStackState.atom)
          .some(({ focusId }) => focusId === modalId),
      ).toBe(true);
      expect(metadataMutate).not.toHaveBeenCalled();

      if (permission === 'read') canRead = false;
      else canUpdate = false;
      rerender(control());
      expect(store.get(modalAtom)).toBe(false);
      expect(
        store
          .get(focusStackState.atom)
          .some(({ focusId }) => focusId === modalId),
      ).toBe(false);
      if (permission === 'write')
        expect(
          screen.getByRole('button', { name: 'Reload status' }),
        ).toBeDisabled();
      canRead = true;
      canUpdate = true;
      rerender(control());
      expect(store.get(modalAtom)).toBe(false);
      expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Reload status' }),
      ).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
      expect(metadataMutate).not.toHaveBeenCalled();

      // Another authorization may now be ACTIVE; stale consent cannot stop it.
      refetchCampaign.mockResolvedValueOnce({
        data: { campaign: { id: 'campaign', lifecycleStatus: 'ACTIVE' } },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Reload status' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled(),
      );
      expect(store.get(modalAtom)).toBe(false);
      expect(metadataMutate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(store.get(modalAtom)).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Stop Campaign' }));
      await waitFor(() => expect(metadataMutate).toHaveBeenCalledTimes(1));
    } finally {
      unmount();
      canRead = true;
      canUpdate = true;
    }
  },
);

it('does not let the read-only Operations review close the header Stop confirmation on tab unmount', () => {
  lifecycleStatus = 'ACTIVE';
  const store = createStore();
  const control = (showReview: boolean) => (
    <Provider store={store}>
      <MyahCampaignExecutionControls campaignId="campaign" variant="header" />
      {showReview ? (
        <MyahCampaignExecutionControls campaignId="campaign" variant="review" />
      ) : null}
    </Provider>
  );
  const { rerender, unmount } = render(control(true));
  const modalAtom = isModalOpenedComponentState.atomFamily({
    instanceId: 'stop-campaign-execution-campaign',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(store.get(modalAtom)).toBe(true);

  rerender(control(false));
  expect(store.get(modalAtom)).toBe(true);
  expect(metadataMutate).not.toHaveBeenCalled();
  unmount();
  expect(store.get(modalAtom)).toBe(false);
});

it('closes native Stop modal state and focus when the Campaign host is replaced', () => {
  lifecycleStatus = 'ACTIVE';
  const store = createStore();
  store.set(tokenPairState.atom, null);
  const control = (campaignId: string) => (
    <Provider store={store}>
      <MyahCampaignExecutionControls
        campaignId={campaignId}
        key={campaignId}
        variant="header"
      />
    </Provider>
  );
  const { rerender, unmount } = render(control('campaign-a'));
  const modalId = 'stop-campaign-execution-campaign-a';
  const modalAtom = isModalOpenedComponentState.atomFamily({
    instanceId: modalId,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(store.get(modalAtom)).toBe(true);
  expect(
    store.get(focusStackState.atom).some(({ focusId }) => focusId === modalId),
  ).toBe(true);

  rerender(control('campaign-b'));
  expect(store.get(modalAtom)).toBe(false);
  expect(
    store.get(focusStackState.atom).some(({ focusId }) => focusId === modalId),
  ).toBe(false);
  rerender(control('campaign-a'));
  expect(store.get(modalAtom)).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(store.get(modalAtom)).toBe(true);
  expect(
    store
      .get(focusStackState.atom)
      .filter(({ focusId }) => focusId === modalId),
  ).toHaveLength(1);
  unmount();
  expect(store.get(modalAtom)).toBe(false);
  expect(metadataMutate).not.toHaveBeenCalled();
});

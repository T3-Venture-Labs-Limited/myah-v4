import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MyahCampaignExecutionControls } from '@/page-layout/components/MyahCampaignExecutionControls';

const metadataMutate = jest.fn();
const mockListen = jest.fn();
const coreClient = { query: jest.fn() };
const mockUseQuery = jest.fn();
const refetchCampaign = jest.fn();
const refetchSequence = jest.fn();
const refetchAudience = jest.fn();
const refetchSenderPool = jest.fn();
let lifecycleStatus: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' = 'DRAFT';
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
    canReadObjectRecords: true,
    canUpdateObjectRecords: canUpdate,
  }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({
    record: { id: 'campaign', lifecycleStatus },
    loading: campaignLoading,
    error: campaignError,
    refetch: refetchCampaign,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ mutate: metadataMutate }),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: jest.fn() }),
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
  refetchCampaign.mockResolvedValue(undefined);
  refetchSequence.mockResolvedValue(undefined);
  refetchAudience.mockResolvedValue(undefined);
  refetchSenderPool.mockResolvedValue(undefined);
});

it('uses a stable Start attempt key across a failed retry and prevents double submit', async () => {
  metadataMutate
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({
      data: { startCampaignExecution: { status: 'STARTED', replayed: false } },
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

it('saves only an explicitly entered Campaign sending window', async () => {
  metadataMutate.mockResolvedValue({
    data: { updateCampaignSendingWindow: { status: 'UPDATED', reason: null } },
  });
  render(<MyahCampaignExecutionControls campaignId="campaign" />);
  fireEvent.change(screen.getByLabelText('Sending timezone'), {
    target: { value: 'America/New_York' },
  });
  fireEvent.change(screen.getByLabelText('Start time'), {
    target: { value: '09:00' },
  });
  fireEvent.change(screen.getByLabelText('End time'), {
    target: { value: '17:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save sending window' }));
  await waitFor(() =>
    expect(metadataMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            campaignId: 'campaign',
            timeZone: 'America/New_York',
            startLocalTime: '09:00:00',
            endLocalTime: '17:00:00',
          },
        },
      }),
    ),
  );
});

it('routes sequence readiness to core and audience, sender readiness, plus mutations to metadata', async () => {
  metadataMutate.mockResolvedValue({
    data: { startCampaignExecution: { status: 'STARTED', replayed: false } },
  });
  render(<MyahCampaignExecutionControls campaignId="campaign" />);

  const queryCalls = mockUseQuery.mock.calls.map(([document, options]) => ({
    client: options.client,
    operationName: document.definitions[0].name.value,
    variables: options.variables,
  }));
  expect(queryCalls).toEqual([
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

  expect(mockListen).toHaveBeenCalledTimes(2);
  for (const [{ onObjectRecordOperationBrowserEvent }] of mockListen.mock.calls)
    onObjectRecordOperationBrowserEvent();
  expect(refetchAudience).toHaveBeenCalledTimes(2);
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

it('uses Stop language and explicitly does not promise provider recall', async () => {
  lifecycleStatus = 'ACTIVE';
  metadataMutate.mockResolvedValue({
    data: {
      stopCampaignExecution: {
        status: 'STOPPED',
        changed: true,
        inFlightCount: 1,
      },
    },
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

import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useCampaignSequence } from '@/myah-outreach/hooks/useCampaignSequence';
import { MyahCampaignExecutionControls } from '@/page-layout/components/MyahCampaignExecutionControls';
import { MyahCampaignOperations } from '@/page-layout/components/MyahCampaignOperations';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';

const campaignId = 'a0000000-0000-4000-8000-000000000001';
const versionId = 'b0000000-0000-4000-8000-000000000002';
const sequence = {
  schemaVersion: 1,
  messages: [
    {
      id: 'c0000000-0000-4000-8000-000000000003',
      channel: 'EMAIL',
      subject: 'Hello',
      body: '{"type":"doc","content":[]}',
      files: [],
      replyToThread: false,
    },
  ],
  delaysSeconds: [],
};
const snapshot = (versionStatus: 'DRAFT' | 'ACTIVE') => ({
  __typename: 'CampaignSequenceSnapshot',
  campaignId,
  workflowId: 'd0000000-0000-4000-8000-000000000004',
  versionId,
  sequence,
  lifecycleStatus: 'DRAFT',
  versionStatus,
  editable: versionStatus === 'DRAFT',
  issues: [],
});

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: { id: 'metadata' } }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
  }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({
    record: { id: campaignId, lifecycleStatus: 'DRAFT' },
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
}));
jest.mock(
  '@/browser-event/hooks/useListenToObjectRecordOperationBrowserEvent',
  () => ({
    useListenToObjectRecordOperationBrowserEvent: () => undefined,
  }),
);
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: jest.fn(), closeModal: jest.fn() }),
}));
jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    confirmButtonText,
    onConfirmClick,
  }: {
    confirmButtonText: string;
    onConfirmClick: () => void;
  }) =>
    confirmButtonText === 'Start Campaign' ? (
      <button onClick={onConfirmClick}>{confirmButtonText}</button>
    ) : null,
}));
jest.mock('@/page-layout/components/MyahCampaignEmailAccounts', () => ({
  MyahCampaignEmailAccounts: () => null,
}));
jest.mock('@/myah/agent/components/MyahCampaignInstagramAccount', () => ({
  MyahCampaignInstagramAccount: () => null,
}));
jest.mock('@/page-layout/components/MyahCampaignRichTextSettings', () => ({
  MyahCampaignRichTextSettings: ({
    contentBeforeFields,
    sidebar,
  }: {
    contentBeforeFields: React.ReactNode;
    sidebar: React.ReactNode;
  }) => (
    <section aria-label="Campaign Operations">
      {contentBeforeFields}
      {sidebar}
    </section>
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

const CampaignWithPublication = () => {
  const { snapshot: authoredSnapshot, publish } =
    useCampaignSequence(campaignId);
  return (
    <>
      <button
        disabled={authoredSnapshot?.versionStatus !== 'DRAFT'}
        onClick={() => void publish()}
      >
        Publish
      </button>
      <MyahCampaignExecutionControls campaignId={campaignId} variant="header" />
      <MyahCampaignOperations
        campaignId={campaignId}
        title="Campaign operations"
        fieldsWidget={{} as PageLayoutWidget}
      />
    </>
  );
};

it('mounts Operations review on the shared cache and refreshes readiness after publishing while the header owns Start', async () => {
  let published = false;
  let readinessReads = 0;
  let startCalls = 0;
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          const name = operation.operationName;
          if (name === 'CampaignSequenceExecutionReadiness')
            readinessReads += 1;
          if (name === 'PublishCampaignSequence') published = true;
          if (name === 'StartCampaignExecution') startCalls += 1;
          const data =
            name === 'CampaignSequence' ||
            name === 'CampaignSequenceExecutionReadiness'
              ? {
                  campaignSequence: {
                    __typename: 'CampaignSequencePresent',
                    kind: 'SEQUENCE',
                    snapshot: snapshot(published ? 'ACTIVE' : 'DRAFT'),
                  },
                }
              : name === 'PublishCampaignSequence'
                ? { publishCampaignSequence: snapshot('ACTIVE') }
                : name === 'CampaignOutreachAudienceReview'
                  ? {
                      campaignOutreachAudienceReview: {
                        __typename: 'CampaignOutreachAudienceReview',
                        state: 'LOADED',
                        errorCode: null,
                        campaignId,
                        eligibleCount: 1,
                        eligibleCreators: [
                          {
                            campaignCreatorId: 'member',
                            creatorId: 'creator',
                            creatorName: 'Ada',
                          },
                        ],
                        excludedCount: 0,
                        excludedCreators: [],
                      },
                    }
                  : name === 'CampaignEmailSenderPoolExecutionReadiness'
                    ? {
                        campaignEmailSenderPool: {
                          mailboxes: [
                            {
                              bindingStatus: 'RESOLVED_BINDING',
                              status: 'READY',
                            },
                          ],
                        },
                      }
                    : name === 'StartCampaignExecution'
                      ? {
                          startCampaignExecution: {
                            status: 'STARTED',
                            lifecycleStatus: 'ACTIVE',
                            reason: null,
                            replayed: false,
                            changed: true,
                            inFlightCount: null,
                          },
                        }
                      : null;
          if (!data) observer.error(new Error(`Unexpected operation: ${name}`));
          else {
            observer.next({ data });
            observer.complete();
          }
        }),
    ),
  });

  render(
    <ApolloProvider client={client}>
      <CampaignWithPublication />
    </ApolloProvider>,
  );

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled(),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled(),
  );
  const operations = screen.getByRole('region', {
    name: 'Campaign Operations',
  });
  expect(operations).toContainElement(
    screen.getByRole('region', { name: 'Launch readiness' }),
  );
  expect(operations).toHaveTextContent(
    'Publish the current sequence before Start',
  );
  expect(operations).toHaveTextContent('1 eligible · 0 excluded');
  expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1);
  expect(readinessReads).toBe(1);

  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(readinessReads).toBeGreaterThan(1));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled(),
  );
  expect(operations).toHaveTextContent('Published sequence ready');
  expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(startCalls).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Start Campaign' }));
  await waitFor(() => expect(startCalls).toBe(1));
});

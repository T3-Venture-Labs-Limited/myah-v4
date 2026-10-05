import { renderHook } from '@testing-library/react';
import { act } from 'react';
import gql from 'graphql-tag';

import { CoreObjectNameSingular } from 'twenty-shared/types';
import { OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME } from '@/browser-event/constants/ObjectRecordOperationBrowserEventName';
import { spreadsheetImportDialogState } from '@/spreadsheet-import/states/spreadsheetImportDialogState';
import { useOpenObjectRecordsSpreadsheetImportDialog } from '@/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const COMPANY_ID = 'cb2e9f4b-20c3-4759-9315-4ffeecfaf71a';

jest.mock('uuid', () => ({
  ...jest.requireActual('uuid'),
  v4: jest.fn(() => 'cb2e9f4b-20c3-4759-9315-4ffeecfaf71a'),
}));

const mockBatchCreateManyRecords = jest.fn().mockResolvedValue([]);
const mockApolloCoreClient = {
  mutate: jest.fn(),
  refetchQueries: jest.fn(),
};
const mockApolloMetadataClient = { mutate: jest.fn() };

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useApolloClient: () => mockApolloMetadataClient,
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

jest.mock('@/object-record/hooks/useBatchCreateManyRecords', () => ({
  useBatchCreateManyRecords: () => ({
    batchCreateManyRecords: mockBatchCreateManyRecords,
  }),
}));

const mockQueryExistingCreatorSocialProfiles = jest.fn();
const mockBuildCreatorSpreadsheetImportSession = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
let mockCreatorSession: Record<string, unknown>;

jest.mock(
  '@/myah/creator-crm/spreadsheet-import/hooks/useQueryExistingCreatorSocialProfiles',
  () => ({
    useQueryExistingCreatorSocialProfiles: () => ({
      queryExistingCreatorSocialProfiles:
        mockQueryExistingCreatorSocialProfiles,
    }),
  }),
);

jest.mock(
  '@/myah/creator-crm/spreadsheet-import/utils/buildCreatorSpreadsheetImportSession',
  () => ({
    buildCreatorSpreadsheetImportSession: (...args: unknown[]) =>
      mockBuildCreatorSpreadsheetImportSession(...args),
  }),
);

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));

jest.mock('@lingui/react/macro', () => ({
  useLingui: () => ({
    t: (descriptor: { message: string; values?: Record<string, unknown> }) =>
      Object.entries(descriptor.values ?? {}).reduce(
        (message, [key, value]) =>
          message.replaceAll(`{${key}}`, String(value)),
        descriptor.message,
      ),
  }),
}));

jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (
        descriptor: { message: string; values?: Record<string, unknown> },
        values?: Record<string, unknown>,
      ) =>
        Object.entries(values ?? descriptor.values ?? {}).reduce(
          (message, [key, value]) =>
            message.replaceAll(`{${key}}`, String(value)),
          descriptor.message,
        ),
    },
  }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => {
  const actual = jest.requireActual(
    '@/object-metadata/hooks/useObjectMetadataItem',
  );

  return {
    useObjectMetadataItem: (args: { objectNameSingular: string }) =>
      args.objectNameSingular === 'creator'
        ? {
            objectMetadataItem: {
              id: 'creator-metadata-id',
              nameSingular: 'creator',
              namePlural: 'creators',
              fields: [
                {
                  id: 'creator-id-field-id',
                  name: 'id',
                  type: 'UUID',
                },
              ],
              updatableFields: [],
              readableFields: [],
              indexMetadatas: [],
              searchFieldMetadatas: [],
              labelIdentifierFieldMetadataId: 'creator-name-field-id',
            },
          }
        : actual.useObjectMetadataItem(args),
  };
});

const mockResult = jest.fn(() => ({
  data: {
    createCompanies: [
      {
        id: COMPANY_ID,
        name: 'Example Company',
        employees: 0,
        idealCustomerProfile: true,
        __typename: 'Company',
      },
    ],
  },
}));

const companyMocks = [
  {
    request: {
      query: gql`
        mutation CreateCompanies(
          $data: [CompanyCreateInput!]!
          $upsert: Boolean
        ) {
          createCompanies(data: $data, upsert: $upsert) {
            id
            name
            employees
            idealCustomerProfile
            __typename
          }
        }
      `,
    },
    variableMatcher: () => true,
    result: mockResult,
  },
  {
    request: {
      query: gql`
        mutation CommitCreatorImport($input: CommitCreatorImportInput!) {
          commitCreatorImport(input: $input) {
            receiptId
            creatorId
            socialProfileIds
            noteId
            noteTargetId
            replayed
          }
        }
      `,
      variables: {
        input: {
          attemptKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
          operationKey: 'row-row-a',
          creator: { name: 'Ada' },
          profiles: [],
        },
      },
    },
    result: {
      data: {
        commitCreatorImport: {
          receiptId: 'receipt-1',
          creatorId: 'creator-1',
          socialProfileIds: [],
          noteId: null,
          noteTargetId: null,
          replayed: false,
        },
      },
    },
  },
  ...[new Error('response lost'), null].map((error, index) => ({
    request: {
      query: gql`
        mutation CommitCreatorImport($input: CommitCreatorImportInput!) {
          commitCreatorImport(input: $input) {
            receiptId
            creatorId
            socialProfileIds
            noteId
            noteTargetId
            replayed
          }
        }
      `,
      variables: {
        input: {
          attemptKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
          operationKey: 'row-row-retry',
          creator: { name: 'Ada' },
          profiles: [],
        },
      },
    },
    ...(error
      ? { error }
      : {
          result: {
            data: {
              commitCreatorImport: {
                receiptId: 'receipt-retry',
                creatorId: 'creator-retry',
                socialProfileIds: [],
                noteId: null,
                noteTargetId: null,
                replayed: index > 0,
              },
            },
          },
        }),
  })),
];

const fakeCsv = () => {
  const csvContent = 'name\nExample Company';
  const blob = new Blob([csvContent], { type: 'text/csv' });
  return new File([blob], 'fakeData.csv', { type: 'text/csv' });
};

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: companyMocks,
});

describe('useOpenObjectRecordsSpreadsheetImportDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApolloCoreClient.mutate.mockReset();
    mockApolloMetadataClient.mutate.mockReset();
    mockApolloCoreClient.refetchQueries.mockReset();
    mockApolloCoreClient.refetchQueries.mockResolvedValue(undefined);
    mockCreatorSession = {
      spreadsheetImportFields: [],
      headerAliases: { first_name: { fieldKey: 'name' } },
      headerProfile: {
        key: 'influencer-club',
        label: 'Influencer Club CSV',
        isDetected: jest.fn(),
      },
      matchColumnsStepHook: jest.fn(),
      tableHook: jest.fn((table) => table),
      beforeSubmitHook: jest.fn(),
      getSubmissionBlockReason: jest.fn(),
      getExistingCreatorIds: jest.fn(() => []),
      getSummary: jest.fn(() => ({ existing: 0, conflicts: 0 })),
      getRowPreview: jest.fn(() => ({
        creatorFields: ['Name'],
        socialProfiles: [],
        supplementaryNoteFields: [],
        excludedFields: [],
      })),
      buildRowCommitPlan: jest.fn(() => ({
        creator: { name: 'Ada' },
        profiles: [],
      })),
    };
    mockBuildCreatorSpreadsheetImportSession.mockImplementation(
      () => mockCreatorSession,
    );
  });

  it('should open dialog and configure onSubmit function correctly', async () => {
    const { result } = renderHook(
      () => {
        const { openObjectRecordsSpreadsheetImportDialog } =
          useOpenObjectRecordsSpreadsheetImportDialog(
            CoreObjectNameSingular.Company,
          );
        return {
          openObjectRecordsSpreadsheetImportDialog,
        };
      },
      { wrapper: Wrapper },
    );

    const spreadsheetImportDialog = jotaiStore.get(
      spreadsheetImportDialogState.atom,
    );

    expect(spreadsheetImportDialog.isOpen).toBe(false);
    expect(spreadsheetImportDialog.options).toBeNull();

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const dialogAfterOpen = jotaiStore.get(spreadsheetImportDialogState.atom);

    expect(dialogAfterOpen.isOpen).toBe(true);
    expect(dialogAfterOpen.options).toHaveProperty('onSubmit');
    expect(dialogAfterOpen.options?.onSubmit).toBeInstanceOf(Function);
    expect(dialogAfterOpen.options).toHaveProperty('spreadsheetImportFields');
    expect(
      Array.isArray(dialogAfterOpen.options?.spreadsheetImportFields),
    ).toBe(true);
    expect(dialogAfterOpen.options).not.toHaveProperty('headerAliases');
    expect(dialogAfterOpen.options).not.toHaveProperty('headerProfile');
    expect(dialogAfterOpen.options).not.toHaveProperty('beforeSubmitHook');
    expect(dialogAfterOpen.options).not.toHaveProperty(
      'getSubmissionBlockReason',
    );
  });

  it('should call batchCreateManyRecords when onSubmit is executed', async () => {
    const { result } = renderHook(
      () => {
        const { openObjectRecordsSpreadsheetImportDialog } =
          useOpenObjectRecordsSpreadsheetImportDialog(
            CoreObjectNameSingular.Company,
          );
        return {
          openObjectRecordsSpreadsheetImportDialog,
        };
      },
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const spreadsheetImportDialog = jotaiStore.get(
      spreadsheetImportDialogState.atom,
    );

    const submitData = {
      validStructuredRows: [
        {
          id: COMPANY_ID,
          name: 'Example Company',
          idealCustomerProfile: true,
          employees: '0',
        },
      ],
      validStructuredRowIndexes: ['cbc3985f-dde9-46d1-bae2-c124141700ac'],
      invalidStructuredRows: [],
      allStructuredRows: [
        {
          id: COMPANY_ID,
          name: 'Example Company',
          __index: 'cbc3985f-dde9-46d1-bae2-c124141700ac',
          idealCustomerProfile: true,
          employees: '0',
        },
      ],
    };

    await act(async () => {
      await spreadsheetImportDialog.options?.onSubmit(submitData, fakeCsv());
    });

    expect(mockBatchCreateManyRecords).toHaveBeenCalledTimes(1);

    const callArgs = mockBatchCreateManyRecords.mock.calls[0][0];
    expect(callArgs).toHaveProperty('recordsToCreate');
    expect(callArgs).toHaveProperty('upsert', true);
    expect(Array.isArray(callArgs.recordsToCreate)).toBe(true);
    expect(callArgs.recordsToCreate).toHaveLength(1);

    const recordToCreate = callArgs.recordsToCreate[0];
    expect(recordToCreate).toHaveProperty('name', 'Example Company');
    expect(recordToCreate).toHaveProperty('idealCustomerProfile', true);
    expect(recordToCreate).toHaveProperty('employees', 0);
  });

  it('activates Creator-specific matching, preflight, and durable row submission', async () => {
    mockCreatorSession.spreadsheetImportFields = [
      { key: 'instagram', label: 'Instagram profile URL' },
    ];
    (mockCreatorSession.getSummary as jest.Mock).mockReturnValue({
      existing: 2,
      conflicts: 1,
    });
    const { result } = renderHook(
      () =>
        useOpenObjectRecordsSpreadsheetImportDialog('creator')
          .openObjectRecordsSpreadsheetImportDialog,
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current();
    });

    const options = jotaiStore.get(spreadsheetImportDialogState.atom).options;

    expect(mockBuildCreatorSpreadsheetImportSession).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetImportFields: [],
        queryExistingCreators: mockQueryExistingCreatorSocialProfiles,
      }),
    );
    expect(options).toEqual(
      expect.objectContaining({
        headerAliases: mockCreatorSession.headerAliases,
        spreadsheetImportFields: mockCreatorSession.spreadsheetImportFields,
        headerProfile: mockCreatorSession.headerProfile,
        matchColumnsStepHook: mockCreatorSession.matchColumnsStepHook,
        beforeSubmitHook: mockCreatorSession.beforeSubmitHook,
        getSubmissionBlockReason: mockCreatorSession.getSubmissionBlockReason,
      }),
    );

    const table = [{ name: 'Ada' }];
    options?.tableHook?.(table, jest.fn());
    expect(mockCreatorSession.tableHook).toHaveBeenCalledWith(
      table,
      expect.any(Function),
    );

    await act(async () => {
      await options?.onSubmit(
        {
          validStructuredRows: [{ name: 'Ada' }],
          validStructuredRowIndexes: ['row-a'],
          invalidStructuredRows: [{}, {}, {}],
          allStructuredRows: [{ name: 'Ada', __index: 'row-a' }],
        },
        fakeCsv(),
      );
    });

    expect(mockBatchCreateManyRecords).not.toHaveBeenCalled();
    expect(mockCreatorSession.buildRowCommitPlan).toHaveBeenCalledWith({
      name: 'Ada',
    });
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message:
        'Imported 1 creators. 2 already existed, 1 conflicted, and 1 had validation errors.',
    });
  });

  it('routes Creator import commits through the metadata Apollo client', async () => {
    mockApolloMetadataClient.mutate.mockResolvedValue({
      data: {
        commitCreatorImport: {
          receiptId: 'receipt-core',
          creatorId: 'creator-core',
          socialProfileIds: [],
          noteId: null,
          noteTargetId: null,
          replayed: false,
        },
      },
    });
    const recordOperationEvents: unknown[] = [];
    const recordOperationListener = (event: Event) =>
      recordOperationEvents.push((event as CustomEvent).detail);
    window.addEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      recordOperationListener,
    );
    const { result } = renderHook(
      () =>
        useOpenObjectRecordsSpreadsheetImportDialog('creator')
          .openObjectRecordsSpreadsheetImportDialog,
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current();
    });

    const options = jotaiStore.get(spreadsheetImportDialogState.atom).options;

    await act(async () => {
      await options?.onSubmit(
        {
          validStructuredRows: [{ name: 'Ada' }],
          validStructuredRowIndexes: ['row-core'],
          invalidStructuredRows: [],
          allStructuredRows: [{ name: 'Ada', __index: 'row-core' }],
        },
        fakeCsv(),
      );
    });

    expect(mockApolloMetadataClient.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            attemptKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
            operationKey: 'row-row-core',
            creator: { name: 'Ada' },
            profiles: [],
          },
        },
      }),
    );
    expect(mockApolloCoreClient.mutate).not.toHaveBeenCalled();
    expect(mockApolloCoreClient.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({ updateCache: expect.any(Function) }),
    );
    // An open Creator table reloads its rows, not only its count.
    expect(recordOperationEvents).toEqual([
      expect.objectContaining({ operation: { type: 'create-many' } }),
    ]);
  });

  it('reuses the attempt and stable source-row identity after response loss', async () => {
    mockApolloMetadataClient.mutate
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        data: {
          commitCreatorImport: {
            receiptId: 'receipt-retry',
            creatorId: 'creator-retry',
            socialProfileIds: [],
            noteId: null,
            noteTargetId: null,
            replayed: true,
          },
        },
      });
    const { result } = renderHook(
      () =>
        useOpenObjectRecordsSpreadsheetImportDialog('creator')
          .openObjectRecordsSpreadsheetImportDialog,
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current();
    });
    const options = jotaiStore.get(spreadsheetImportDialogState.atom).options;
    const validationResult = {
      validStructuredRows: [{ name: 'Retry' }],
      validStructuredRowIndexes: ['row-retry'],
      invalidStructuredRows: [],
      allStructuredRows: [{ name: 'Retry', __index: 'row-retry' }],
    };

    await expect(
      options?.onSubmit(validationResult, fakeCsv()),
    ).rejects.toThrow('response lost');
    await expect(
      options?.onSubmit(validationResult, fakeCsv()),
    ).resolves.toBeUndefined();
    expect(mockApolloMetadataClient.mutate).toHaveBeenCalledTimes(2);
    expect(mockApolloCoreClient.mutate).not.toHaveBeenCalled();
  });

  it('gives a different file its own attempt and the same file the same attempt (MYAH-457)', async () => {
    (mockCreatorSession.buildRowCommitPlan as jest.Mock).mockImplementation(
      (row: { name: string }) => ({
        creator: { name: row.name },
        profiles: [],
      }),
    );
    mockApolloMetadataClient.mutate.mockResolvedValue({
      data: {
        commitCreatorImport: {
          receiptId: 'receipt',
          creatorId: 'creator',
          socialProfileIds: [],
          noteId: null,
          noteTargetId: null,
          replayed: false,
        },
      },
    });
    const { result } = renderHook(
      () =>
        useOpenObjectRecordsSpreadsheetImportDialog('creator')
          .openObjectRecordsSpreadsheetImportDialog,
      { wrapper: Wrapper },
    );
    const submit = async (name: string) => {
      await act(async () => {
        result.current();
      });
      const options = jotaiStore.get(spreadsheetImportDialogState.atom).options;
      await options?.onSubmit(
        {
          validStructuredRows: [{ name }],
          validStructuredRowIndexes: ['row-1'],
          invalidStructuredRows: [],
          allStructuredRows: [{ name, __index: 'row-1' }],
        },
        fakeCsv(),
      );
      const calls = mockApolloMetadataClient.mutate.mock.calls;
      return calls[calls.length - 1][0].variables.input as {
        attemptKey: string;
        operationKey: string;
      };
    };

    const sample = await submit('Sample creator');
    const realFile = await submit('Real creator');
    const sampleAgain = await submit('Sample creator');

    expect(realFile.operationKey).toBe(sample.operationKey);
    expect(realFile.attemptKey).not.toBe(sample.attemptKey);
    expect(sampleAgain.attemptKey).toBe(sample.attemptKey);
  });

  it('skips the Creator mutation when every row already exists', async () => {
    (mockCreatorSession.getSummary as jest.Mock).mockReturnValue({
      existing: 1,
      conflicts: 0,
    });
    const { result } = renderHook(
      () =>
        useOpenObjectRecordsSpreadsheetImportDialog('creator')
          .openObjectRecordsSpreadsheetImportDialog,
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current();
    });

    const options = jotaiStore.get(spreadsheetImportDialogState.atom).options;

    await act(async () => {
      await options?.onSubmit(
        {
          validStructuredRows: [],
          validStructuredRowIndexes: [],
          invalidStructuredRows: [{ instagram: 'existing' }],
          allStructuredRows: [{ instagram: 'existing', __index: 'row-a' }],
        },
        fakeCsv(),
      );
    });

    expect(mockBatchCreateManyRecords).not.toHaveBeenCalled();
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message:
        'Imported 0 creators. 1 already existed, 0 conflicted, and 0 had validation errors.',
    });
  });
});

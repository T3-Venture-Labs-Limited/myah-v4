import { renderHook } from '@testing-library/react';
import { act } from 'react';
import gql from 'graphql-tag';

import { CoreObjectNameSingular } from 'twenty-shared/types';
import { spreadsheetImportDialogState } from '@/spreadsheet-import/states/spreadsheetImportDialogState';
import { useOpenObjectRecordsSpreadsheetImportDialog } from '@/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const COMPANY_ID = 'cb2e9f4b-20c3-4759-9315-4ffeecfaf71a';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'cb2e9f4b-20c3-4759-9315-4ffeecfaf71a'),
}));

const mockBatchCreateManyRecords = jest.fn().mockResolvedValue([]);

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
      getSummary: jest.fn(() => ({ existing: 0, conflicts: 0 })),
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

  it('activates Creator-specific matching, preflight, and non-upsert submission', async () => {
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
          invalidStructuredRows: [{}, {}, {}],
          allStructuredRows: [{ name: 'Ada', __index: 'row-a' }],
        },
        fakeCsv(),
      );
    });

    expect(mockBatchCreateManyRecords).toHaveBeenCalledWith({
      recordsToCreate: [{}],
      upsert: false,
    });
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message:
        'Imported 1 creators. 2 already existed, 1 conflicted, and 1 had validation errors.',
    });
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

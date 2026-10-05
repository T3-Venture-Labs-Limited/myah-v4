import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ValidationStep } from '@/spreadsheet-import/steps/components/ValidationStep/ValidationStep';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';

const mockAddErrorsAndRunHooks = jest.fn();
const mockBeforeSubmitHook = jest.fn();
const mockGetSubmissionBlockReason = jest.fn();
const mockOnSubmit = jest.fn();
const mockOnClose = jest.fn();
const mockHideStepBar = jest.fn();
const mockEnqueueDialog = jest.fn();
const mockSetCurrentStepState = jest.fn();

let mockContext: Record<string, unknown>;

jest.mock('@/spreadsheet-import/hooks/useSpreadsheetImportInternal', () => ({
  useSpreadsheetImportInternal: () => mockContext,
}));

jest.mock('@/spreadsheet-import/hooks/useHideStepBar', () => ({
  useHideStepBar: () => mockHideStepBar,
}));

jest.mock('@/spreadsheet-import/utils/dataMutations', () => ({
  addErrorsAndRunHooks: (...args: unknown[]) =>
    mockAddErrorsAndRunHooks(...args),
}));

jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager', () => ({
  useDialogManager: () => ({ enqueueDialog: mockEnqueueDialog }),
}));

jest.mock(
  '@/spreadsheet-import/steps/components/ValidationStep/components/columns',
  () => ({ generateColumns: () => [] }),
);

jest.mock('@/spreadsheet-import/components/SpreadsheetImportTable', () => ({
  SpreadsheetImportTable: () => <div data-testid="import-table" />,
}));

jest.mock('@/spreadsheet-import/components/StepNavigationButton', () => ({
  StepNavigationButton: ({
    onContinue,
    onBack,
  }: {
    onContinue: () => void;
    onBack: () => void;
  }) => (
    <>
      <button onClick={onBack}>Back</button>
      <button onClick={onContinue}>Confirm</button>
    </>
  ),
}));

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== null && value !== undefined,
}));

jest.mock('twenty-ui/icon', () => ({ IconTrash: () => null }));

jest.mock('twenty-ui/input', () => ({
  Button: () => null,
  Toggle: () => null,
}));

jest.mock('twenty-ui/surfaces', () => ({
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { secondary: 'white' },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { md: '4px' },
    },
    spacing: { 2: '8px', 3: '12px', 8: '32px' },
    boxShadow: { strong: 'none' },
    font: {
      color: {
        primary: 'black',
        secondary: 'gray',
        tertiary: 'lightgray',
      },
      size: { sm: '12px', md: '14px' },
      weight: { regular: 400, semiBold: 600 },
    },
  },
}));

jest.mock('@lingui/react', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    i18n: {
      _: (message: string | { message?: string; id?: string }) =>
        typeof message === 'string'
          ? message
          : (message.message ?? message.id ?? ''),
    },
  }),
}));

const initialRows = [{ __index: 0, name: 'Ada' }];
const refreshedConflictRows = [
  {
    __index: 0,
    name: 'Ada',
    __creatorImportClassification: 'conflict',
  },
];

const renderStep = () =>
  render(
    <ValidationStep
      initialData={[{ name: 'Ada' }]}
      importedColumns={[
        {
          index: 0,
          header: 'first_name',
          type: SpreadsheetColumnType.matched,
          value: 'name',
        },
      ]}
      file={new File(['first_name\nAda'], 'creators.csv')}
      onBack={jest.fn()}
      setCurrentStepState={mockSetCurrentStepState}
    />,
  );

describe('ValidationStep pre-submit hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = {
      spreadsheetImportFields: [],
      onClose: mockOnClose,
      onSubmit: mockOnSubmit,
      rowHook: undefined,
      tableHook: undefined,
      beforeSubmitHook: mockBeforeSubmitHook,
      getSubmissionBlockReason: mockGetSubmissionBlockReason,
    };
    mockBeforeSubmitHook.mockResolvedValue(undefined);
    mockAddErrorsAndRunHooks
      .mockReturnValueOnce(initialRows)
      .mockReturnValueOnce(refreshedConflictRows);
  });

  it('renders an optional multi-record preview for the first row', () => {
    mockAddErrorsAndRunHooks.mockReset().mockReturnValue(initialRows);
    mockContext.getValidationPreview = jest.fn().mockReturnValue({
      title: 'First row preview',
      sections: [
        { label: 'Creator', items: ['name', 'email'] },
        { label: 'Social profiles', items: ['Instagram (URL, followers)'] },
        { label: 'Supplementary note', items: ['engagement'] },
        { label: 'Excluded', items: [] },
      ],
    });

    renderStep();

    expect(mockContext.getValidationPreview).toHaveBeenCalledWith(
      initialRows[0],
    );
    expect(
      screen.getByTestId('spreadsheet-import-validation-preview'),
    ).toHaveTextContent('Creator: name, email');
    expect(
      screen.getByTestId('spreadsheet-import-validation-preview'),
    ).toHaveTextContent('Social profiles: Instagram (URL, followers)');
    expect(
      screen.getByTestId('spreadsheet-import-validation-preview'),
    ).toHaveTextContent('Supplementary note: engagement');
    expect(
      screen.getByTestId('spreadsheet-import-validation-preview'),
    ).toHaveTextContent('Excluded: None');
  });

  it('uses one refreshed local snapshot for the guard and blocks submission', async () => {
    mockGetSubmissionBlockReason.mockReturnValue(
      'Remove conflicting Creator rows before importing',
    );

    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockGetSubmissionBlockReason).toHaveBeenCalledWith(
        refreshedConflictRows,
      ),
    );

    expect(mockBeforeSubmitHook).toHaveBeenCalledWith(initialRows);
    expect(mockEnqueueDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Import blocked',
        message: 'Remove conflicting Creator rows before importing',
        buttons: [{ title: 'Return' }],
      }),
    );
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('blocks submission when no valid rows remain', async () => {
    const invalidRows = [
      {
        __index: 0,
        name: '',
        __errors: {
          name: { level: 'error', message: 'Enter a Creator Name' },
        },
      },
    ];
    mockGetSubmissionBlockReason.mockReturnValue(undefined);
    mockAddErrorsAndRunHooks
      .mockReset()
      .mockReturnValueOnce(initialRows)
      .mockReturnValueOnce(invalidRows);

    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockEnqueueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Import blocked',
          message: 'No valid rows remain to import.',
          buttons: [{ title: 'Return' }],
        }),
      ),
    );
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('allows only one asynchronous preflight per submission attempt', async () => {
    let resolvePreflight: (() => void) | undefined;
    mockBeforeSubmitHook.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePreflight = resolve;
      }),
    );
    mockGetSubmissionBlockReason.mockReturnValue(
      'Remove conflicting Creator rows before importing',
    );

    renderStep();
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(mockBeforeSubmitHook).toHaveBeenCalledTimes(1);

    resolvePreflight?.();
    await waitFor(() =>
      expect(mockGetSubmissionBlockReason).toHaveBeenCalledTimes(1),
    );
  });

  it('shows safe feedback and remains open when the refresh rejects', async () => {
    mockBeforeSubmitHook.mockRejectedValue(
      new Error('sensitive provider error'),
    );

    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockEnqueueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Unable to validate import',
          message: 'The import could not be refreshed. Please try again.',
        }),
      ),
    );

    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('does not call a partial import a validation refresh failure', async () => {
    mockGetSubmissionBlockReason.mockReturnValue(undefined);
    mockAddErrorsAndRunHooks.mockReset().mockReturnValue(initialRows);
    mockOnSubmit.mockRejectedValue(new Error('a later row failed'));
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockEnqueueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Import may be incomplete',
          message:
            'Some rows may already have been imported. Review your records before starting another import.',
        }),
      ),
    );
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'submits all-existing rows only when explicitly classified as existing (%s)',
    async (alreadyImported) => {
      mockGetSubmissionBlockReason.mockReset().mockReturnValue(undefined);
      const rows = [
        {
          __index: '1',
          name: 'Ada',
          __errors: { name: { level: 'error', message: 'Already exists' } },
        },
      ];
      mockAddErrorsAndRunHooks.mockReset().mockReturnValue(rows);
      mockOnSubmit.mockReset().mockResolvedValue(undefined);
      mockContext.isAlreadyImportedRow = () => alreadyImported;

      renderStep();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      if (alreadyImported) {
        await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            validStructuredRows: [],
            allStructuredRows: rows,
          }),
          expect.any(File),
        );
        expect(mockEnqueueDialog).not.toHaveBeenCalled();
      } else {
        await waitFor(() =>
          expect(mockEnqueueDialog).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'No valid rows remain to import.',
            }),
          ),
        );
        expect(mockOnSubmit).not.toHaveBeenCalled();
      }
    },
  );

  it('preserves generic submission when optional callbacks are absent', async () => {
    mockContext.beforeSubmitHook = undefined;
    mockContext.getSubmissionBlockReason = undefined;
    mockAddErrorsAndRunHooks.mockReset();
    mockAddErrorsAndRunHooks.mockReturnValue(initialRows);
    mockOnSubmit.mockResolvedValue(undefined);

    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));

    expect(mockOnSubmit).toHaveBeenCalledWith(
      {
        validStructuredRows: [{ name: 'Ada' }],
        validStructuredRowIndexes: [0],
        invalidStructuredRows: [],
        allStructuredRows: initialRows,
      },
      expect.any(File),
    );
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('retries the exact failed snapshot without duplicate preflight after response loss', async () => {
    mockGetSubmissionBlockReason.mockReset().mockReturnValue(undefined);
    mockAddErrorsAndRunHooks.mockReset().mockReturnValue(initialRows);
    mockOnSubmit
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(undefined);

    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));
    expect(mockSetCurrentStepState).toHaveBeenLastCalledWith({
      type: 'validateData',
      data: initialRows,
      importedColumns: [
        {
          index: 0,
          header: 'first_name',
          type: SpreadsheetColumnType.matched,
          value: 'name',
        },
      ],
    });
    expect(mockOnClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(2));
    expect(mockBeforeSubmitHook).toHaveBeenCalledTimes(1);
    expect(mockOnSubmit.mock.calls[1]).toEqual(mockOnSubmit.mock.calls[0]);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

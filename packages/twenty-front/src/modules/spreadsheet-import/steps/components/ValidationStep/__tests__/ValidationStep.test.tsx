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
    border: { color: { medium: 'gray' }, radius: { md: '4px' } },
    spacing: { 2: '8px', 3: '12px', 8: '32px' },
    boxShadow: { strong: 'none' },
    font: {
      color: { secondary: 'gray', tertiary: 'lightgray' },
      size: { md: '14px' },
      weight: { regular: 400 },
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
      setCurrentStepState={jest.fn()}
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
        invalidStructuredRows: [],
        allStructuredRows: initialRows,
      },
      expect.any(File),
    );
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MatchColumnsStep } from '@/spreadsheet-import/steps/components/MatchColumnsStep/MatchColumnsStep';
import { SpreadsheetImportStepType } from '@/spreadsheet-import/steps/types/SpreadsheetImportStepType';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';

const matchColumnsStepHook = jest.fn();
const setColumns = jest.fn();
const enqueueDialog = jest.fn();

const headerProfile = {
  key: 'influencer-club',
  label: 'Influencer Club CSV',
  isDetected: (headers: unknown[]) => headers.includes('first_name'),
};

jest.mock('@/spreadsheet-import/hooks/useSpreadsheetImportInternal', () => ({
  useSpreadsheetImportInternal: () => ({
    spreadsheetImportFields: [
      { key: 'name', label: 'Name', fieldType: { type: 'input' } },
    ],
    headerProfile,
    matchColumnsStepHook,
  }),
}));

jest.mock(
  '@/spreadsheet-import/steps/components/MatchColumnsStep/components/states/initialComputedColumnsState',
  () => ({ initialComputedColumnsSelector: {} }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorState',
  () => ({
    useAtomFamilySelectorState: () => [
      [
        {
          index: 0,
          header: 'first_name',
          type: SpreadsheetColumnType.matched,
          value: 'name',
        },
      ],
      setColumns,
    ],
  }),
);

jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager', () => ({
  useDialogManager: () => ({ enqueueDialog }),
}));

jest.mock('@/spreadsheet-import/utils/normalizeTableData', () => ({
  normalizeTableData: () => [{ name: 'Ada' }],
}));

jest.mock(
  '@/spreadsheet-import/steps/components/MatchColumnsStep/components/ColumnGrid',
  () => ({ ColumnGrid: () => <div data-testid="column-grid" /> }),
);

jest.mock(
  '@/spreadsheet-import/steps/components/MatchColumnsStep/components/TemplateColumn',
  () => ({ TemplateColumn: () => null }),
);

jest.mock(
  '@/spreadsheet-import/steps/components/MatchColumnsStep/components/UnmatchColumn',
  () => ({ UnmatchColumn: () => null }),
);

jest.mock(
  '@/spreadsheet-import/steps/components/MatchColumnsStep/components/UserTableColumn',
  () => ({ UserTableColumn: () => null }),
);

jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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
      <button onClick={onBack}>Restart Import</button>
      <button onClick={onContinue}>Next Step</button>
    </>
  ),
}));

jest.mock('twenty-ui/feedback', () => ({
  InlineBanner: ({
    message,
    button,
  }: {
    message: string;
    button: { title: string; onClick: () => void };
  }) => (
    <div>
      <span>{message}</span>
      <button onClick={button.onClick}>{button.title}</button>
    </div>
  ),
}));

jest.mock('twenty-ui/surfaces', () => ({
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    spacing: { 4: '16px' },
    font: {
      color: { primary: 'black' },
      size: { sm: '12px' },
      weight: { medium: 500, regular: 400 },
    },
  },
}));

jest.mock('@lingui/react', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    i18n: {
      _: (message: string | { message?: string; id?: string }) => {
        const text =
          typeof message === 'string'
            ? message
            : (message.message ?? message.id ?? '');

        return text.startsWith('Detected format:')
          ? 'Detected format: Influencer Club CSV'
          : text;
      },
    },
  }),
}));

jest.mock('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (message, part, index) =>
          `${message}${part}${index < values.length ? String(values[index]) : ''}`,
        '',
      ),
  }),
}));

const renderStep = (activeHeaderProfileKey?: string | null) => {
  const setCurrentStepState = jest.fn();
  const setPreviousStepState = jest.fn();
  const nextStep = jest.fn();

  render(
    <MatchColumnsStep
      data={[['Ada']]}
      headerValues={['first_name']}
      setCurrentStepState={setCurrentStepState}
      setPreviousStepState={setPreviousStepState}
      currentStepState={{
        type: SpreadsheetImportStepType.matchColumns,
        data: [['Ada']],
        headerValues: ['first_name'],
        activeHeaderProfileKey,
      }}
      nextStep={nextStep}
      onError={jest.fn()}
    />,
  );

  return { setCurrentStepState, setPreviousStepState, nextStep };
};

describe('MatchColumnsStep header profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    matchColumnsStepHook.mockResolvedValue([{ name: 'Ada' }]);
  });

  it('shows an exact detected-profile notice and passes its key on Continue', async () => {
    renderStep();

    expect(
      screen.getByText('Detected format: Influencer Club CSV'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));

    await waitFor(() =>
      expect(matchColumnsStepHook).toHaveBeenCalledWith(
        [{ name: 'Ada' }],
        [['Ada']],
        expect.any(Array),
        'influencer-club',
      ),
    );
  });

  it('clears only the active profile when generic mapping is selected', async () => {
    renderStep();

    fireEvent.click(
      screen.getByRole('button', { name: 'Use generic mapping' }),
    );

    expect(
      screen.queryByText('Detected format: Influencer Club CSV'),
    ).not.toBeInTheDocument();
    expect(setColumns).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));

    await waitFor(() =>
      expect(matchColumnsStepHook).toHaveBeenCalledWith(
        [{ name: 'Ada' }],
        [['Ada']],
        expect.any(Array),
        undefined,
      ),
    );
  });

  it('preserves a cleared profile when returning from Validation', async () => {
    const { setPreviousStepState } = renderStep(null);

    expect(
      screen.queryByText('Detected format: Influencer Club CSV'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));

    await waitFor(() =>
      expect(setPreviousStepState).toHaveBeenCalledWith(
        expect.objectContaining({ activeHeaderProfileKey: null }),
      ),
    );
    expect(matchColumnsStepHook).toHaveBeenCalledWith(
      [{ name: 'Ada' }],
      [['Ada']],
      expect.any(Array),
      undefined,
    );
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PreComputedChipGeneratorsContext } from '@/object-metadata/contexts/PreComputedChipGeneratorsContext';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { ThemeContext } from 'twenty-ui/theme-constants';

const mockUseFindOneRecord = jest.fn();

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => mockUseFindOneRecord(),
}));

jest.mock('@/object-record/components/RecordChip', () => ({
  RecordChip: () => <div>Record chip</div>,
}));
jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => jest.fn(),
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    clickableComponentAriaLabel,
    onClickableComponentRef,
    onClose,
  }: {
    clickableComponent: React.ReactNode;
    clickableComponentAriaLabel?: string;
    onClickableComponentRef?: (element: HTMLDivElement | null) => void;
    onClose?: () => void;
  }) => (
    <div>
      <div
        ref={onClickableComponentRef}
        aria-label={clickableComponentAriaLabel}
        data-testid="picker-trigger"
        tabIndex={0}
      >
        {clickableComponent}
      </div>
      <button onClick={onClose}>Close picker</button>
    </div>
  ),
}));

describe('FormSingleRecordPicker', () => {
  beforeEach(() => {
    mockUseFindOneRecord.mockReturnValue({ record: undefined });
  });

  it('returns focus to its keyboard trigger when the picker closes', async () => {
    const user = userEvent.setup();

    render(
      <ThemeContext.Provider
        value={
          {
            theme: {
              spacing: { 1: '4px' },
              icon: { size: { md: 16 } },
              font: { color: { light: 'gray' } },
            },
          } as never
        }
      >
        <FormSingleRecordPicker
          defaultValue={undefined}
          objectNameSingulars={['creator']}
          onChange={jest.fn()}
          shouldAutoFocusPickerTrigger
        />
      </ThemeContext.Provider>,
    );

    const trigger = screen.getByTestId('picker-trigger');
    trigger.focus();

    await user.click(screen.getByRole('button', { name: 'Close picker' }));

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAccessibleName('Record: No record');
  });

  it('includes the field label and current no-record state in the trigger name', () => {
    render(
      <ThemeContext.Provider
        value={
          {
            theme: {
              spacing: { 1: '4px' },
              icon: { size: { md: 16 } },
              font: { color: { light: 'gray' } },
            },
          } as never
        }
      >
        <FormSingleRecordPicker
          defaultValue={null}
          label="Creator"
          objectNameSingulars={['creator']}
          onChange={jest.fn()}
        />
      </ThemeContext.Provider>,
    );

    expect(screen.getByTestId('picker-trigger')).toHaveAccessibleName(
      'Creator: No record',
    );
  });

  it('uses the metadata identifier label for selected composite records', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: {
        firstName: 'Ada',
        id: 'person-1',
        lastName: 'Lovelace',
        name: { firstName: 'Ada', lastName: 'Lovelace' },
      },
    });

    render(
      <ThemeContext.Provider
        value={
          {
            theme: {
              spacing: { 1: '4px' },
              icon: { size: { md: 16 } },
              font: { color: { light: 'gray' } },
            },
          } as never
        }
      >
        <PreComputedChipGeneratorsContext.Provider
          value={
            {
              identifierChipGeneratorPerObject: {
                creator: () => ({ name: 'Ada Lovelace' }),
              },
            } as never
          }
        >
          <FormSingleRecordPicker
            defaultValue="person-1"
            label="Creator"
            objectNameSingulars={['creator']}
            onChange={jest.fn()}
          />
        </PreComputedChipGeneratorsContext.Provider>
      </ThemeContext.Provider>,
    );

    expect(screen.getByTestId('picker-trigger')).toHaveAccessibleName(
      'Creator: Ada Lovelace',
    );
  });

  it('uses the visible Untitled fallback for an empty identifier', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'creator-1', name: '' },
    });

    render(
      <ThemeContext.Provider
        value={
          {
            theme: {
              spacing: { 1: '4px' },
              icon: { size: { md: 16 } },
              font: { color: { light: 'gray' } },
            },
          } as never
        }
      >
        <PreComputedChipGeneratorsContext.Provider
          value={
            {
              identifierChipGeneratorPerObject: {
                creator: () => ({ name: ' ' }),
              },
            } as never
          }
        >
          <FormSingleRecordPicker
            defaultValue="creator-1"
            label="Creator"
            objectNameSingulars={['creator']}
            onChange={jest.fn()}
          />
        </PreComputedChipGeneratorsContext.Provider>
      </ThemeContext.Provider>,
    );

    expect(screen.getByTestId('picker-trigger')).toHaveAccessibleName(
      'Creator: Untitled',
    );
  });
});

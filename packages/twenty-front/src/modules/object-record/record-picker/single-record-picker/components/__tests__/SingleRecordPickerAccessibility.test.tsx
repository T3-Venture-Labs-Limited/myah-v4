import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { SingleRecordPicker } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker';
import { searchRecordStoreFamilyState } from '@/object-record/record-picker/multiple-record-picker/states/searchRecordStoreComponentFamilyState';
import { singleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSearchFilterComponentState';
import { singleRecordPickerSelectedIdComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSelectedIdComponentState';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import { focusStackState } from '@/ui/utilities/focus/states/focusStackState';
import { FocusComponentType } from '@/ui/utilities/focus/types/FocusComponentType';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { JestObjectMetadataItemSetter } from '~/testing/jest/JestObjectMetadataItemSetter';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { type SearchRecord } from '~/generated/graphql';

const mockUseSingleRecordPickerRecords = jest.fn();

const mockUseObjectPermissions = jest.fn();

jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => mockUseObjectPermissions(),
}));

jest.mock(
  '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerRecords',
  () => ({
    useSingleRecordPickerRecords: () => mockUseSingleRecordPickerRecords(),
  }),
);

const recordPickerInstanceId = 'single-record-picker';
const focusId = 'single-record-picker-focus';
const personObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');

const searchRecords: SearchRecord[] = [
  {
    recordId: 'nadine-id',
    objectNameSingular: 'person',
    objectLabelSingular: 'Person',
    label: 'Nadine',
    imageUrl: null,
    tsRank: 0,
    tsRankCD: 0,
  },
  {
    recordId: 'elyas-id',
    objectNameSingular: 'person',
    objectLabelSingular: 'Person',
    label: 'Elyas',
    imageUrl: null,
    tsRank: 0,
    tsRankCD: 0,
  },
];

const pickableMorphItems: RecordPickerPickableMorphItem[] = searchRecords.map(
  (searchRecord) => ({
    recordId: searchRecord.recordId,
    objectMetadataId: personObjectMetadataItem.id,
    isSelected: searchRecord.recordId === 'nadine-id',
    isMatchingSearchFilter: true,
  }),
);
const Wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}>
    <JotaiProvider store={jotaiStore}>
      <JestObjectMetadataItemSetter>{children}</JestObjectMetadataItemSetter>
    </JotaiProvider>
  </I18nProvider>
);

const renderPicker = ({
  emptyLabel,
  layoutDirection,
  objectNameSingulars = ['person'],
  onCancel = jest.fn(),
  onCreate = jest.fn(),
  onMorphItemSelected = jest.fn(),
}: {
  emptyLabel?: string;
  layoutDirection?: 'search-bar-on-top' | 'search-bar-on-bottom';
  objectNameSingulars?: string[];
  onCancel?: jest.Mock;
  onCreate?: jest.Mock;
  onMorphItemSelected?: jest.Mock;
} = {}) => {
  render(
    <SingleRecordPicker
      componentInstanceId={recordPickerInstanceId}
      focusId={focusId}
      objectNameSingulars={objectNameSingulars}
      emptyLabel={emptyLabel}
      layoutDirection={layoutDirection}
      onCancel={onCancel}
      onCreate={onCreate}
      onMorphItemSelected={onMorphItemSelected}
    />,
    { wrapper: Wrapper },
  );

  return { onCancel, onCreate, onMorphItemSelected };
};

const getFilteredPickableMorphItems = () => {
  const searchFilter = jotaiStore.get(
    singleRecordPickerSearchFilterComponentState.atomFamily({
      instanceId: recordPickerInstanceId,
    }),
  );

  return pickableMorphItems.map((morphItem) => ({
    ...morphItem,
    isMatchingSearchFilter: searchRecords
      .find((searchRecord) => searchRecord.recordId === morphItem.recordId)
      ?.label.toLowerCase()
      .includes(searchFilter.toLowerCase()),
  }));
};

describe('SingleRecordPicker accessibility', () => {
  beforeEach(() => {
    resetJotaiStore();

    searchRecords.forEach((searchRecord) => {
      jotaiStore.set(
        searchRecordStoreFamilyState.atomFamily(searchRecord.recordId),
        searchRecord,
      );
    });

    jotaiStore.set(
      singleRecordPickerSelectedIdComponentState.atomFamily({
        instanceId: recordPickerInstanceId,
      }),
      'nadine-id',
    );
    jotaiStore.set(focusStackState.atom, [
      {
        focusId,
        componentInstance: {
          componentType: FocusComponentType.DROPDOWN,
          componentInstanceId: recordPickerInstanceId,
        },
        globalHotkeysConfig: {
          enableGlobalHotkeysWithModifiers: true,
          enableGlobalHotkeysConflictingWithKeyboard: true,
        },
      },
    ]);
    mockUseObjectPermissions.mockReturnValue({
      objectPermissionsByObjectMetadataId: {
        [personObjectMetadataItem.id]: {
          objectMetadataId: personObjectMetadataItem.id,
          canUpdateObjectRecords: true,
        },
      },
    });

    mockUseSingleRecordPickerRecords.mockImplementation(() => ({
      pickableMorphItems: getFilteredPickableMorphItems(),
      loading: false,
      error: undefined,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exposes named results and selects the active filtered record with the search input keyboard', async () => {
    const user = userEvent.setup();
    const { onMorphItemSelected } = renderPicker();

    const searchInput = await screen.findByRole('combobox', {
      name: 'Search Person',
    });

    expect(searchInput).toHaveAttribute(
      'aria-controls',
      'single-record-picker-results',
    );
    expect(
      screen.getByRole('listbox', { name: 'Person results' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Nadine/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: /Nadine/ })).toHaveAttribute(
      'id',
      'single-record-picker-results-option-nadine-id',
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 Person results');

    await user.click(searchInput);
    await user.type(searchInput, 'Elyas');
    await waitFor(() => {
      expect(
        screen.queryByRole('option', { name: /Nadine/ }),
      ).not.toBeInTheDocument();
    });
    await user.keyboard('{ArrowDown}');

    const activeOption = screen.getByRole('option', { name: /Elyas/ });

    expect(searchInput).toHaveAttribute(
      'aria-activedescendant',
      activeOption.id,
    );

    await user.keyboard('{Enter}');

    expect(onMorphItemSelected).toHaveBeenCalledWith({
      recordId: 'elyas-id',
      objectMetadataId: personObjectMetadataItem.id,
      isSelected: false,
      isMatchingSearchFilter: true,
    });
  });

  it('uses generic names when searching several record types', async () => {
    renderPicker({ objectNameSingulars: ['person', 'company'] });

    expect(
      await screen.findByRole('combobox', { name: 'Search records' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listbox', { name: 'Record results' }),
    ).toBeInTheDocument();
  });

  it('selects the active filtered record with Space', async () => {
    const user = userEvent.setup();
    const { onMorphItemSelected } = renderPicker();

    const searchInput = await screen.findByRole('combobox', {
      name: 'Search Person',
    });

    await user.click(searchInput);
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');

    expect(onMorphItemSelected).toHaveBeenCalledWith(pickableMorphItems[0]);
  });

  it('keeps Space available for search text until an option is active', async () => {
    const user = userEvent.setup();
    const { onMorphItemSelected } = renderPicker();

    const searchInput = await screen.findByRole('combobox', {
      name: 'Search Person',
    });

    await user.click(searchInput);
    await user.keyboard(' ');

    expect(searchInput).toHaveValue(' ');
    expect(onMorphItemSelected).not.toHaveBeenCalled();
  });

  it('assigns an active descendant ID when a result record arrives after its initial render', async () => {
    const user = userEvent.setup();
    searchRecords.forEach((searchRecord) => {
      jotaiStore.set(
        searchRecordStoreFamilyState.atomFamily(searchRecord.recordId),
        undefined,
      );
    });

    renderPicker();

    const searchInput = await screen.findByRole('combobox', {
      name: 'Search Person',
    });
    expect(
      screen.queryByRole('option', { name: /Nadine/ }),
    ).not.toBeInTheDocument();

    act(() => {
      jotaiStore.set(
        searchRecordStoreFamilyState.atomFamily(searchRecords[0].recordId),
        searchRecords[0],
      );
    });

    const arrivedOption = await screen.findByRole('option', { name: /Nadine/ });

    await user.click(searchInput);
    await user.keyboard('{ArrowDown}');

    expect(arrivedOption).toHaveAttribute(
      'id',
      'single-record-picker-results-option-nadine-id',
    );
    expect(searchInput).toHaveAttribute(
      'aria-activedescendant',
      arrivedOption.id,
    );
  });

  it('cancels with Escape from the focused search input without selecting a record', async () => {
    const user = userEvent.setup();
    const { onCancel, onMorphItemSelected } = renderPicker();

    await user.click(
      await screen.findByRole('combobox', { name: 'Search Person' }),
    );
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onMorphItemSelected).not.toHaveBeenCalled();
  });

  it('references the no-record option while it is active', async () => {
    const user = userEvent.setup();
    mockUseSingleRecordPickerRecords.mockReturnValue({
      pickableMorphItems: [],
      loading: false,
      error: undefined,
    });

    renderPicker({ emptyLabel: 'No record' });

    const searchInput = await screen.findByRole('combobox', {
      name: 'Search Person',
    });
    const noRecordOption = screen.getByRole('option', { name: 'No record' });

    await user.click(searchInput);
    await user.keyboard('{ArrowDown}');

    expect(noRecordOption).toHaveAttribute(
      'id',
      'single-record-picker-results-option-select-none',
    );
    expect(searchInput).toHaveAttribute(
      'aria-activedescendant',
      noRecordOption.id,
    );
  });

  it('clears the active descendant when filtering removes the active option', async () => {
    const user = userEvent.setup();
    renderPicker();

    const searchInput = await screen.findByRole('combobox', {
      name: 'Search Person',
    });
    await user.click(searchInput);
    await user.keyboard('{ArrowDown}');
    expect(searchInput).toHaveAttribute(
      'aria-activedescendant',
      'single-record-picker-results-option-nadine-id',
    );

    await user.type(searchInput, 'Elyas');

    await waitFor(() => {
      expect(
        screen.queryByRole('option', { name: /Nadine/ }),
      ).not.toBeInTheDocument();
    });
    expect(searchInput).not.toHaveAttribute('aria-activedescendant');
  });

  it.each(['search-bar-on-top', 'search-bar-on-bottom'] as const)(
    'renders Add New outside the results listbox when the search bar is on %s',
    async (layoutDirection) => {
      const user = userEvent.setup();
      const { onCreate } = renderPicker({ layoutDirection });

      expect(await screen.findAllByRole('listbox')).toHaveLength(1);

      await user.click(screen.getByText('Add New'));

      expect(onCreate).toHaveBeenCalledWith('');
    },
  );

  it('exposes the no-record option and announces an empty search', async () => {
    mockUseSingleRecordPickerRecords.mockReturnValue({
      pickableMorphItems: [],
      loading: false,
      error: undefined,
    });

    renderPicker({ emptyLabel: 'No record' });

    expect(
      await screen.findByRole('option', { name: 'No record' }),
    ).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('No Person results');
  });

  it.each([
    {
      name: 'no record option',
      result: {
        pickableMorphItems: [],
        loading: false,
        error: undefined,
      },
      status: 'No Person results',
    },
    {
      name: 'loading results',
      result: {
        pickableMorphItems,
        loading: true,
        error: undefined,
      },
      status: 'Loading Person results',
    },
    {
      name: 'query error',
      result: {
        pickableMorphItems: [],
        loading: false,
        error: new Error('Search failed'),
      },
      status: 'Unable to load Person results',
    },
  ])('announces $name', async ({ result, status }) => {
    mockUseSingleRecordPickerRecords.mockReturnValue(result);

    renderPicker();

    expect(await screen.findByRole('status')).toHaveTextContent(status);
  });

  it.each([
    {
      name: 'loading results',
      result: {
        pickableMorphItems,
        loading: true,
        error: undefined,
      },
    },
    {
      name: 'failed results',
      result: {
        pickableMorphItems,
        loading: false,
        error: new Error('Search failed'),
      },
    },
  ])('does not expose stale options for $name', async ({ result }) => {
    mockUseSingleRecordPickerRecords.mockReturnValue(result);

    renderPicker();

    expect(
      await screen.findByRole('listbox', { name: 'Person results' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Nadine/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Elyas/ }),
    ).not.toBeInTheDocument();
  });
});

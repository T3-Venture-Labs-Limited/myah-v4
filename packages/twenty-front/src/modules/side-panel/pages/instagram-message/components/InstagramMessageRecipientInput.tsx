import { useId, useState } from 'react';
import { t } from '@lingui/core/macro';
import { searchRecordStoreFamilyState } from '@/object-record/record-picker/multiple-record-picker/states/searchRecordStoreComponentFamilyState';
import { useSingleRecordPickerPerformSearch } from '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch';
import { SingleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/single-record-picker/states/contexts/SingleRecordPickerComponentInstanceContext';
import { type InstagramMessageComposerState } from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { StyledMenuItemSelect } from 'twenty-ui/navigation';

export type InstagramMessageRecipientInputProps = {
  recipient: InstagramMessageComposerState['recipient'];
  disabled: boolean;
  onChange: (recipient: InstagramMessageComposerState['recipient']) => void;
};

const CreatorLabel = ({ recordId }: { recordId: string }) => {
  const searchRecordStore = useAtomFamilyStateValue(
    searchRecordStoreFamilyState,
    recordId,
  );
  return <>{searchRecordStore?.label ?? t`Selected Creator`}</>;
};

type RecipientComboboxProps = InstagramMessageRecipientInputProps;

const RecipientCombobox = ({
  recipient,
  disabled,
  onChange,
}: RecipientComboboxProps) => {
  const id = useId();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const creatorRecordId =
    recipient && 'creatorRecordId' in recipient
      ? recipient.creatorRecordId
      : null;
  const { pickableMorphItems, loading, error } =
    useSingleRecordPickerPerformSearch({
      objectNameSingulars: ['creator'],
      searchFilter: search,
      selectedIds: creatorRecordId ? [creatorRecordId] : [],
    });
  // Syntax is UX only; preparation remains the authority for handle and Creator identity.
  const rawHandle = search.trim().replace(/^@/, '').toLowerCase();
  const validHandle = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/.test(
    rawHandle,
  );
  const creators =
    loading || error
      ? []
      : pickableMorphItems.filter(
          ({ isMatchingSearchFilter }) => isMatchingSearchFilter,
        );
  const options: Array<
    NonNullable<InstagramMessageComposerState['recipient']>
  > = [
    ...creators.map(({ recordId }) => ({ creatorRecordId: recordId })),
    ...(validHandle ? [{ rawHandle }] : []),
  ];
  const select = (index: number) => {
    const option = options[index];
    if (index < 0 || index >= options.length || disabled) return;
    onChange(option);
    setSearch('');
    setExpanded(false);
    setActiveIndex(-1);
  };
  return (
    <div>
      <label htmlFor={id}>{t`To`}</label>
      {recipient ? (
        <div role="status">
          {creatorRecordId ? (
            <CreatorLabel recordId={creatorRecordId} />
          ) : (
            `@${'rawHandle' in recipient ? recipient.rawHandle : ''}`
          )}
        </div>
      ) : null}
      <DropdownMenuSearchInput
        id={id}
        aria-label={t`To`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded && !disabled}
        aria-controls={`${id}-results`}
        aria-activedescendant={
          expanded && activeIndex >= 0 && activeIndex < options.length
            ? `${id}-option-${activeIndex}`
            : undefined
        }
        placeholder={t`Search Creators or enter @handle`}
        disabled={disabled}
        value={search}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          setSearch(event.target.value);
          setExpanded(true);
          setActiveIndex(-1);
          onChange(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            setExpanded(true);
            setActiveIndex((index) =>
              options.length
                ? (index +
                    (event.key === 'ArrowDown' ? 1 : options.length - 1) +
                    options.length) %
                  options.length
                : -1,
            );
          } else if (event.key === 'Enter' && expanded) {
            event.preventDefault();
            event.stopPropagation();
            select(activeIndex);
          } else if (event.key === 'Escape' && expanded) {
            event.preventDefault();
            event.stopPropagation();
            setExpanded(false);
          }
        }}
      />
      {expanded && !disabled ? (
        <>
          <div role={error ? 'alert' : 'status'}>
            {loading
              ? t`Searching Creators`
              : error
                ? t`Could not load Creators. Try searching again.`
                : search && !validHandle && !creators.length
                  ? t`Enter a valid Instagram handle or choose a Creator.`
                  : null}
          </div>
          <DropdownMenuItemsContainer
            id={`${id}-results`}
            role="listbox"
            ariaLabel={t`Instagram recipients`}
            hasMaxHeight
          >
            {options.map((option, index) => (
              <StyledMenuItemSelect
                key={
                  'creatorRecordId' in option
                    ? option.creatorRecordId
                    : 'raw-handle'
                }
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                focused={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(index)}
              >
                {'creatorRecordId' in option ? (
                  <CreatorLabel recordId={option.creatorRecordId} />
                ) : (
                  t`Use @${option.rawHandle}`
                )}
              </StyledMenuItemSelect>
            ))}
          </DropdownMenuItemsContainer>
        </>
      ) : null}
    </div>
  );
};

export const InstagramMessageRecipientInput = (
  props: InstagramMessageRecipientInputProps,
) => {
  const instanceId = useId();
  return (
    <SingleRecordPickerComponentInstanceContext.Provider value={{ instanceId }}>
      <RecipientCombobox
        recipient={props.recipient}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </SingleRecordPickerComponentInstanceContext.Provider>
  );
};

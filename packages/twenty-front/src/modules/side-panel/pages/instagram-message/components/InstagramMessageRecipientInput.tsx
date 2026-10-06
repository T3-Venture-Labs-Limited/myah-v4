import { useEffect, useId, useRef, useState } from 'react';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { searchRecordStoreFamilyState } from '@/object-record/record-picker/multiple-record-picker/states/searchRecordStoreComponentFamilyState';
import { useSingleRecordPickerPerformSearch } from '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch';
import { SingleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/single-record-picker/states/contexts/SingleRecordPickerComponentInstanceContext';
import { type InstagramMessageComposerState } from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { Chip, ChipVariant } from 'twenty-ui/data-display';
import { IconX } from 'twenty-ui/icon';
import { LightIconButton } from 'twenty-ui/input';
import { StyledMenuItemSelect } from 'twenty-ui/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export type InstagramMessageRecipientInputProps = {
  recipient: InstagramMessageComposerState['recipient'];
  confirmedHandle?: string | null;
  disabled: boolean;
  onChange: (recipient: InstagramMessageComposerState['recipient']) => void;
};

export const StyledInstagramMessageFieldLabel = styled.label`
  color: ${themeCssVariables.font.color.light};
  display: block;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledRecipientRow = styled.div`
  display: flex;
  padding: ${themeCssVariables.spacing[1]} 0;
`;

const useCreatorLabel = (recordId: string | null) =>
  useAtomFamilyStateValue(searchRecordStoreFamilyState, recordId ?? '')
    ?.label ?? t`Selected Creator`;

const CreatorLabel = ({ recordId }: { recordId: string }) => (
  <>{useCreatorLabel(recordId)}</>
);

const RecipientTag = ({
  recipient,
  confirmedHandle,
  disabled,
  labelId,
  onRemove,
}: {
  recipient: NonNullable<InstagramMessageComposerState['recipient']>;
  labelId: string;
  confirmedHandle?: string | null;
  disabled: boolean;
  onRemove: () => void;
}) => {
  const creatorRecordId =
    'creatorRecordId' in recipient ? recipient.creatorRecordId : null;
  const creatorLabel = useCreatorLabel(creatorRecordId);
  const handle =
    confirmedHandle ?? ('rawHandle' in recipient ? recipient.rawHandle : null);
  const label = creatorRecordId
    ? handle
      ? t`${creatorLabel} · @${handle}`
      : creatorLabel
    : t`@${handle ?? ''}`;
  return (
    <StyledRecipientRow role="group" aria-labelledby={labelId}>
      <Chip
        label={label}
        variant={ChipVariant.Highlighted}
        clickable={false}
        rightComponent={
          disabled ? null : (
            <LightIconButton
              aria-label={t`Remove recipient`}
              Icon={IconX}
              size="small"
              onClick={onRemove}
            />
          )
        }
      />
    </StyledRecipientRow>
  );
};

const RecipientCombobox = ({
  id,
  disabled,
  onChange,
}: Pick<InstagramMessageRecipientInputProps, 'disabled' | 'onChange'> & {
  id: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Focus once on mount only; the shared search input refocuses on every render,
  // which stole keystrokes from the message field (MYAH-474).
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const { pickableMorphItems, loading, error } =
    useSingleRecordPickerPerformSearch({
      objectNameSingulars: ['creator'],
      searchFilter: search,
      selectedIds: [],
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
  };
  return (
    <>
      <DropdownMenuSearchInput
        ref={inputRef}
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
        placeholder={t`Search for one Creator or enter @handle`}
        disabled={disabled}
        value={search}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          setSearch(event.target.value);
          setExpanded(true);
          setActiveIndex(-1);
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
    </>
  );
};

export const InstagramMessageRecipientInput = ({
  recipient,
  confirmedHandle,
  disabled,
  onChange,
}: InstagramMessageRecipientInputProps) => {
  const instanceId = useId();
  return (
    <SingleRecordPickerComponentInstanceContext.Provider value={{ instanceId }}>
      <div>
        {recipient ? (
          <StyledInstagramMessageFieldLabel as="div" id={`${instanceId}-label`}>
            {t`To`}
          </StyledInstagramMessageFieldLabel>
        ) : (
          <StyledInstagramMessageFieldLabel htmlFor={`${instanceId}-to`}>
            {t`To`}
          </StyledInstagramMessageFieldLabel>
        )}
        {recipient ? (
          <RecipientTag
            labelId={`${instanceId}-label`}
            recipient={recipient}
            confirmedHandle={confirmedHandle}
            disabled={disabled}
            onRemove={() => onChange(null)}
          />
        ) : (
          <RecipientCombobox
            id={`${instanceId}-to`}
            disabled={disabled}
            onChange={onChange}
          />
        )}
      </div>
    </SingleRecordPickerComponentInstanceContext.Provider>
  );
};

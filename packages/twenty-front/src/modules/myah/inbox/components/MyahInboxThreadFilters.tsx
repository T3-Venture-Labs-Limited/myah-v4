import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { TextInput } from '@/ui/input/components/TextInput';
import { Select } from '@/ui/input/components/Select';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { styled } from '@linaria/react';
import { IconFilter, IconRefresh } from 'twenty-ui/icon';
import { IconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type MyahInboxFilters,
  type MyahInboxStateFilter,
} from '@/myah/inbox/states/myahInboxSelectionState';

const StyledFilters = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledSearch = styled.div`
  position: relative;
`;

const StyledSearchActions = styled.div`
  bottom: ${themeCssVariables.spacing[1]};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  position: absolute;
  right: ${themeCssVariables.spacing[1]};
`;

const StyledFilterMenu = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const STATE_OPTIONS = [
  { label: 'Needs reply', value: 'NEEDS_REPLY' },
  { label: 'Waiting on creator', value: 'WAITING_ON_CREATOR' },
  { label: 'Snoozed', value: 'SNOOZED' },
  { label: 'Closed', value: 'CLOSED' },
] satisfies Array<{ label: string; value: MyahInboxStateFilter }>;

export type MyahInboxRefreshStatus =
  | 'idle'
  | 'refreshing'
  | 'succeeded'
  | 'failed';

export type MyahInboxThreadFiltersProps = {
  filters: MyahInboxFilters;
  isRefreshing: boolean;
  loading: boolean;
  loadingMore: boolean;
  onFiltersChange: (filters: MyahInboxFilters) => void;
  onRefresh: () => void;
  refreshError: string | null;
  refreshStatus: MyahInboxRefreshStatus;
};

export const MyahInboxThreadFilters = ({
  filters,
  isRefreshing,
  loading,
  loadingMore,
  onFiltersChange,
  onRefresh,
  refreshError,
  refreshStatus,
}: MyahInboxThreadFiltersProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const isCampaignMetadataReady = objectMetadataItems.some(
    (item) => item.nameSingular === 'campaign',
  );

  return (
    <StyledFilters>
      <StyledSearch>
        <TextInput
          label="Search conversations"
          placeholder="Search messages"
          value={filters.search}
          fullWidth
          onChange={(search) => onFiltersChange({ ...filters, search })}
        />
        <StyledSearchActions role="group" aria-label="Inbox search actions">
          <Dropdown
            dropdownId="myah-inbox-filter-menu"
            clickableComponent={
              <IconButton
                Icon={IconFilter}
                ariaLabel="Filter conversations"
                size="small"
                variant="tertiary"
              />
            }
            dropdownComponents={
              <DropdownContent>
                <StyledFilterMenu aria-label="Inbox filters">
                  <Select
                    dropdownId="myah-inbox-state-filter"
                    label="State"
                    fullWidth
                    value={filters.states[0] ?? ''}
                    options={STATE_OPTIONS}
                    emptyOption={{ label: 'All states', value: '' }}
                    onChange={(state) =>
                      onFiltersChange({
                        ...filters,
                        states: state ? [state] : [],
                      })
                    }
                  />
                  {isCampaignMetadataReady ? (
                    <FormSingleRecordPicker
                      label="Campaign filter"
                      objectNameSingulars={['campaign']}
                      defaultValue={filters.campaignId}
                      onChange={(campaignId) =>
                        onFiltersChange({ ...filters, campaignId })
                      }
                    />
                  ) : (
                    <span role="status">Loading campaign filter</span>
                  )}
                </StyledFilterMenu>
              </DropdownContent>
            }
            dropdownPlacement="bottom-end"
          />
          <IconButton
            Icon={IconRefresh}
            ariaLabel="Refresh Inbox"
            size="small"
            variant="tertiary"
            disabled={loading || loadingMore || isRefreshing}
            onClick={onRefresh}
          />
        </StyledSearchActions>
      </StyledSearch>
      {refreshStatus === 'failed' && refreshError && (
        <span role="alert">{refreshError}</span>
      )}
    </StyledFilters>
  );
};

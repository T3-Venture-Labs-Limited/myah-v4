import { gql } from '@apollo/client';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  IconChevronDown,
  IconMail,
  IconRefresh,
  IconSearch,
} from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useOpenCampaignMessageOverviewPanel } from '@/myah/campaign-messages/hooks/useOpenCampaignMessageOverviewPanel';
import { type CampaignMessageOverviewRow as Row } from '@/myah/campaign-messages/types/CampaignMessageOverviewRow';
import { isCampaignMessageOverviewReturnTarget } from '@/myah/campaign-messages/types/CampaignMessageOverviewReturnTarget';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const GET_CAMPAIGN_MESSAGE_OVERVIEW = gql`
  query GetCampaignMessageOverview($input: CampaignMessageOverviewInput!) {
    campaignMessageOverview(input: $input) {
      nodes {
        occurrenceId
        campaignId
        campaignName
        creatorId
        creatorName
        recipient
        subject
        preview
        sequenceStep
        platform
        status
        estimatedSendAt
        sentAt
        eligibleAfter
        connectedAccountId
        connectedAccountLabel
        senderIsEstimated
        needsAttention
        reason
        inboxContactId
        inboxThreadId
      }
      filterOptions {
        campaigns {
          id
          name
        }
        connectedAccounts {
          id
          label
        }
      }
      pageInfo {
        hasNextPage
        endCursor
        generationId
        generatedAt
        horizonEndsAt
        forecastComplete
        refreshing
      }
    }
  }
`;

const StyledPage = styled.main`
  background: ${themeCssVariables.background.primary};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  min-height: 100%;
  min-width: 0;
`;
const StyledHeader = styled.header`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  height: 48px;
  padding: 0 ${themeCssVariables.spacing[4]};
  h1 {
    font-size: ${themeCssVariables.font.size.md};
    font-weight: ${themeCssVariables.font.weight.semiBold};
    margin: 0;
  }
`;
const StyledTabs = styled.nav`
  align-items: stretch;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[5]};
  height: 42px;
  padding: 0 ${themeCssVariables.spacing[4]};
`;
const StyledTab = styled.button`
  align-items: center;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  padding: 0;
  &[aria-current='page'] {
    border-bottom-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.primary};
  }
`;
const StyledCount = styled.span`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 10px;
  padding: 1px 5px;
`;
const StyledToolbar = styled.section`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;
const StyledSearch = styled.label`
  align-items: center;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  max-width: 270px;
  min-width: 210px;
  padding: 0 ${themeCssVariables.spacing[2]};
  input {
    background: transparent;
    border: 0;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: ${themeCssVariables.font.size.sm};
    height: 30px;
    min-width: 0;
    outline: none;
    width: 100%;
  }
`;
const StyledFilter = styled.details`
  position: relative;
  summary {
    align-items: center;
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    display: flex;
    font-size: ${themeCssVariables.font.size.sm};
    gap: ${themeCssVariables.spacing[2]};
    height: 30px;
    list-style: none;
    padding: 0 ${themeCssVariables.spacing[2]};
    white-space: nowrap;
  }
  summary::-webkit-details-marker {
    display: none;
  }
`;
const StyledPopover = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  left: 0;
  min-width: 240px;
  padding: ${themeCssVariables.spacing[2]};
  position: absolute;
  top: 36px;
  z-index: 5;
  label {
    align-items: center;
    color: ${themeCssVariables.font.color.secondary};
    display: flex;
    gap: ${themeCssVariables.spacing[2]};
    padding: ${themeCssVariables.spacing[2]};
  }
`;
const StyledSelectLabel = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  margin-left: auto;
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.secondary};
    font-family: inherit;
    font-size: ${themeCssVariables.font.size.sm};
    height: 30px;
    padding: 0 ${themeCssVariables.spacing[2]};
  }
`;
const StyledQuietButton = styled.button`
  align-items: center;
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]};
  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;
const StyledMeta = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  justify-content: space-between;
  padding: 0 ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[3]};
`;
const StyledNotice = styled.div`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0 ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;
const StyledTableWrap = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  overflow: auto;
`;
const StyledTable = styled.table`
  border-collapse: collapse;
  min-width: 1080px;
  table-layout: fixed;
  text-align: left;
  width: 100%;
  col:nth-child(1) {
    width: 180px;
  }
  col:nth-child(2) {
    width: 90px;
  }
  col:nth-child(3) {
    width: 235px;
  }
  col:nth-child(4) {
    width: 180px;
  }
  col:nth-child(5) {
    width: 125px;
  }
  col:nth-child(6) {
    width: 175px;
  }
  col:nth-child(7) {
    width: 145px;
  }
  col:nth-child(8) {
    width: 130px;
  }
  th {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    color: ${themeCssVariables.font.color.tertiary};
    font-size: ${themeCssVariables.font.size.xs};
    font-weight: ${themeCssVariables.font.weight.regular};
    height: 32px;
    padding: 0 ${themeCssVariables.spacing[3]};
  }
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
    height: 52px;
    overflow: hidden;
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
    text-overflow: ellipsis;
    vertical-align: middle;
  }
  th:first-child,
  td:first-child {
    padding-left: ${themeCssVariables.spacing[4]};
  }
  tbody tr:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }
`;
const StyledRecipientButton = styled.button`
  align-items: center;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: flex;
  font-family: inherit;
  gap: ${themeCssVariables.spacing[2]};
  max-width: 100%;
  padding: 0;
  text-align: left;
`;
const StyledAvatar = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.transparent.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 9px;
  height: 26px;
  justify-content: center;
  width: 26px;
`;
const StyledCellText = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const StyledSubText = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 10px;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const StyledBadge = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.transparent.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 10px;
  gap: 5px;
  padding: 3px 6px;
  &[data-status='SCHEDULED'] {
    background: ${themeCssVariables.tag.background.blue};
    color: ${themeCssVariables.tag.text.blue};
  }
  &[data-status='SENT'] {
    background: ${themeCssVariables.tag.background.green};
    color: ${themeCssVariables.tag.text.green};
  }
  &[data-status='NEEDS_ATTENTION'] {
    background: ${themeCssVariables.tag.background.orange};
    color: ${themeCssVariables.tag.text.orange};
  }
`;
const StyledDot = styled.span`
  background: currentColor;
  border-radius: 50%;
  height: 4px;
  width: 4px;
`;
const StyledEmpty = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  padding: 72px ${themeCssVariables.spacing[4]};
  text-align: center;
  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.lg};
    margin: 0 0 ${themeCssVariables.spacing[2]};
  }
`;
const StyledFooter = styled.footer`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[4]};
  justify-content: space-between;
  line-height: 1.6;
  margin-top: auto;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

type View = 'ALL' | 'SCHEDULED' | 'SENT' | 'NEEDS_ATTENTION';
type DateBasis = 'ESTIMATED_SEND' | 'SENT_AT';
type Data = {
  campaignMessageOverview: {
    nodes: Row[];
    filterOptions: {
      campaigns: Array<{ id: string; name: string }>;
      connectedAccounts: Array<{ id: string; label: string }>;
    };
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
      generationId: string | null;
      generatedAt: string | null;
      horizonEndsAt: string | null;
      forecastComplete: boolean;
      refreshing: boolean;
    };
  };
};
type Variables = {
  input: {
    first: number;
    after?: string;
    view: View;
    campaignIds?: string[];
    connectedAccountIds?: string[];
    search?: string;
    dateBasis?: DateBasis;
    dateFrom?: string;
    dateTo?: string;
  };
};

const VIEW_LABELS: Record<View, string> = {
  ALL: 'All',
  SCHEDULED: 'Scheduled',
  SENT: 'Sent',
  NEEDS_ATTENTION: 'Needs attention',
};
const displayTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';
const initials = (name: string | null) =>
  name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : '?';

const MultiFilter = ({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) => (
  <StyledFilter>
    <summary>
      {label} · {selected.length || 'All'} <IconChevronDown size={12} />
    </summary>
    <StyledPopover>
      {options.length ? (
        options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value),
                )
              }
            />
            {option.label}
          </label>
        ))
      ) : (
        <label>No options available</label>
      )}
    </StyledPopover>
  </StyledFilter>
);

export const MyahCampaignMessagesPage = () => {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // oxlint-disable-next-line twenty/no-state-useref
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // oxlint-disable-next-line twenty/no-state-useref
  const returnFetchInFlight = useRef(false);
  const view = (params.get('view') as View | null) ?? 'ALL';
  const search = params.get('search') ?? '';
  const dateBasis = (params.get('dateBasis') as DateBasis | null) ?? undefined;
  const dateFrom = params.get('dateFrom') ?? undefined;
  const dateTo = params.get('dateTo') ?? undefined;
  const campaignIds = params.getAll('campaign');
  const connectedAccountIds = params.getAll('account');
  const hasActiveFilters =
    view !== 'ALL' ||
    search.trim() !== '' ||
    campaignIds.length > 0 ||
    connectedAccountIds.length > 0 ||
    dateFrom !== undefined ||
    dateTo !== undefined;
  const client = useApolloClient();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { openCampaignMessageOverviewPanel } =
    useOpenCampaignMessageOverviewPanel();
  const variables = useMemo<Variables>(
    () => ({
      input: {
        first: 50,
        view,
        ...(campaignIds.length ? { campaignIds } : {}),
        ...(connectedAccountIds.length ? { connectedAccountIds } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(dateBasis ? { dateBasis } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      },
    }),
    [
      campaignIds,
      connectedAccountIds,
      dateBasis,
      dateFrom,
      dateTo,
      search,
      view,
    ],
  );
  const overview = useQuery<Data, Variables>(GET_CAMPAIGN_MESSAGE_OVERVIEW, {
    client,
    variables,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30_000,
  });
  const overviewNodes = overview.data?.campaignMessageOverview.nodes;
  const rows = overviewNodes ?? [];
  const pageInfo = overview.data?.campaignMessageOverview.pageInfo;
  const campaigns =
    overview.data?.campaignMessageOverview.filterOptions.campaigns ?? [];
  const accounts =
    overview.data?.campaignMessageOverview.filterOptions.connectedAccounts ??
    [];
  const update = (name: string, values: string[]) => {
    const next = new URLSearchParams(params);
    next.delete(name);
    for (const value of values) next.append(name, value);
    setParams(next);
  };
  const setOne = (name: string, value?: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(name, value) : next.delete(name);
    setParams(next);
  };
  const setDate = (offset?: number) => {
    const next = new URLSearchParams(params);
    if (offset === undefined) {
      next.delete('dateFrom');
      next.delete('dateTo');
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + offset);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      next.set('dateFrom', start.toISOString());
      next.set('dateTo', end.toISOString());
      if (!dateBasis) next.set('dateBasis', 'ESTIMATED_SEND');
    }
    setParams(next);
  };
  const selectedDate = (() => {
    if (!dateFrom || !dateTo) return 'all';
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (const offset of [0, 1]) {
      const candidate = new Date(start);
      candidate.setDate(candidate.getDate() + offset);
      const end = new Date(candidate);
      end.setDate(end.getDate() + 1);
      if (candidate.toISOString() === dateFrom && end.toISOString() === dateTo)
        return String(offset);
    }
    return 'custom';
  })();

  useEffect(() => {
    const target = location.state?.campaignMessageOverviewReturnTarget;
    if (
      !currentWorkspace ||
      !isCampaignMessageOverviewReturnTarget(target, currentWorkspace.id)
    )
      return;
    const button = rowRefs.current.get(target.occurrenceId);
    if (button) {
      button.focus();
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
      return;
    }
    if (
      overview.loading ||
      returnFetchInFlight.current ||
      !pageInfo?.hasNextPage ||
      !pageInfo.endCursor
    )
      return;
    returnFetchInFlight.current = true;
    void overview
      .fetchMore({
        variables: {
          input: { ...variables.input, after: pageInfo.endCursor },
        },
        updateQuery: (previous, { fetchMoreResult }) => ({
          campaignMessageOverview: {
            ...fetchMoreResult.campaignMessageOverview,
            nodes: [
              ...previous.campaignMessageOverview.nodes,
              ...fetchMoreResult.campaignMessageOverview.nodes,
            ],
          },
        }),
      })
      .finally(() => {
        returnFetchInFlight.current = false;
      });
  }, [
    currentWorkspace,
    location,
    navigate,
    overview,
    overviewNodes,
    pageInfo,
    variables.input,
  ]);

  const clearFilters = () => setParams(new URLSearchParams());
  const openRow = (row: Row) =>
    currentWorkspace &&
    openCampaignMessageOverviewPanel({
      row,
      workspaceId: currentWorkspace.id,
      returnTarget: {
        workspaceId: currentWorkspace.id,
        pathname: '/myah/messages',
        search: location.search,
        occurrenceId: row.occurrenceId,
      },
    });

  return (
    <StyledPage aria-label="Campaign messages">
      <StyledHeader>
        <IconMail size={16} />
        <h1>Campaign messages</h1>
      </StyledHeader>
      <StyledTabs aria-label="Message views">
        {(Object.keys(VIEW_LABELS) as View[]).map((item) => (
          <StyledTab
            key={item}
            aria-current={view === item ? 'page' : undefined}
            onClick={() => setOne('view', item)}
          >
            {VIEW_LABELS[item]}
            {view === item ? <StyledCount>{rows.length}</StyledCount> : null}
          </StyledTab>
        ))}
      </StyledTabs>
      <StyledToolbar aria-label="Message filters">
        <StyledSearch>
          <IconSearch size={14} />
          <input
            aria-label="Search recipient or subject"
            placeholder="Search recipient or subject"
            type="search"
            value={search}
            onChange={(event) =>
              setOne('search', event.target.value || undefined)
            }
          />
        </StyledSearch>
        <MultiFilter
          label="Campaigns"
          options={campaigns.map(({ id, name }) => ({
            label: name,
            value: id,
          }))}
          selected={campaignIds}
          onChange={(values) => update('campaign', values)}
        />
        <MultiFilter
          label="Sending accounts"
          options={accounts.map(({ id, label }) => ({
            label,
            value: id,
          }))}
          selected={connectedAccountIds}
          onChange={(values) => update('account', values)}
        />
        <StyledSelectLabel>
          Date
          <select
            aria-label="Date"
            value={selectedDate}
            onChange={(event) => {
              const value = event.target.value;
              if (value !== 'custom')
                setDate(value === 'all' ? undefined : Number(value));
            }}
          >
            <option value="all">All dates</option>
            <option value="0">Today</option>
            <option value="1">Tomorrow</option>
            {selectedDate === 'custom' ? (
              <option value="custom">Custom date</option>
            ) : null}
          </select>
        </StyledSelectLabel>
        <StyledSelectLabel>
          Date basis
          <select
            value={dateBasis ?? 'ESTIMATED_SEND'}
            onChange={(event) => setOne('dateBasis', event.target.value)}
          >
            <option value="ESTIMATED_SEND">Estimated send</option>
            <option value="SENT_AT">Sent at</option>
          </select>
        </StyledSelectLabel>
        {hasActiveFilters ? (
          <StyledQuietButton onClick={clearFilters}>
            Clear filters
          </StyledQuietButton>
        ) : null}
        <StyledQuietButton
          aria-label="Refresh messages"
          disabled={overview.loading}
          onClick={() => void overview.refetch()}
        >
          <IconRefresh size={13} />
        </StyledQuietButton>
      </StyledToolbar>
      <StyledMeta>
        <span>{`${rows.length} messages · ${campaigns.length} Campaign${campaigns.length === 1 ? '' : 's'} · ${accounts.length} sending account${accounts.length === 1 ? '' : 's'}`}</span>
        <span>{`Times in ${Intl.DateTimeFormat().resolvedOptions().timeZone} · Read-only overview`}</span>
      </StyledMeta>
      {pageInfo?.refreshing ? (
        <StyledNotice role="status">
          Estimates are refreshing. Sending continues independently.
        </StyledNotice>
      ) : null}
      {overview.error ? (
        <StyledNotice role="alert">
          Some message information is unavailable. Existing sending safeguards
          are unaffected.
        </StyledNotice>
      ) : null}
      <StyledTableWrap>
        <StyledTable aria-label="Campaign outreach messages">
          <colgroup>
            {Array.from({ length: 8 }, (_, index) => (
              <col key={index} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Platform</th>
              <th>Message</th>
              <th>Campaign / Step</th>
              <th>Status</th>
              <th>Sending account</th>
              <th>Estimated send</th>
              <th>Sent at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const estimated = row.estimatedSendAt
                ? displayTime(row.estimatedSendAt)
                : row.eligibleAfter &&
                    pageInfo?.horizonEndsAt &&
                    pageInfo.forecastComplete &&
                    row.eligibleAfter >= pageInfo.horizonEndsAt
                  ? 'Outside 48-hour forecast'
                  : pageInfo?.forecastComplete
                    ? 'No estimate available'
                    : 'Forecast pending or incomplete';
              return (
                <tr key={row.occurrenceId}>
                  <td>
                    <StyledRecipientButton
                      aria-label={row.creatorName ?? 'Creator unavailable'}
                      ref={(element) => {
                        if (element)
                          rowRefs.current.set(row.occurrenceId, element);
                        else rowRefs.current.delete(row.occurrenceId);
                      }}
                      type="button"
                      onClick={() => openRow(row)}
                    >
                      <StyledAvatar>{initials(row.creatorName)}</StyledAvatar>
                      <span>
                        <StyledCellText>
                          {row.creatorName ?? 'Creator unavailable'}
                        </StyledCellText>
                        <StyledSubText>
                          {row.recipient ?? 'Recipient unavailable'}
                        </StyledSubText>
                      </span>
                    </StyledRecipientButton>
                  </td>
                  <td>{row.platform}</td>
                  <td>
                    <StyledCellText>
                      {row.subject ?? 'Message unavailable'}
                    </StyledCellText>
                    <StyledSubText>
                      {row.preview ?? 'Preview unavailable'}
                    </StyledSubText>
                  </td>
                  <td>
                    <StyledCellText>{row.campaignName}</StyledCellText>
                    <StyledSubText>{`Step ${row.sequenceStep} · Email`}</StyledSubText>
                  </td>
                  <td>
                    <StyledBadge data-status={row.status}>
                      <StyledDot />
                      {row.status === 'SCHEDULED'
                        ? 'Scheduled'
                        : row.status === 'NEEDS_ATTENTION'
                          ? 'Needs attention'
                          : row.status[0] + row.status.slice(1).toLowerCase()}
                    </StyledBadge>
                    {row.needsAttention ? (
                      <StyledSubText>
                        {row.reason ?? 'Review required'}
                      </StyledSubText>
                    ) : null}
                  </td>
                  <td>
                    <StyledCellText>
                      {row.connectedAccountLabel ?? 'Unassigned'}
                    </StyledCellText>
                    {row.senderIsEstimated ? (
                      <StyledSubText>Estimated account</StyledSubText>
                    ) : null}
                  </td>
                  <td>
                    <StyledCellText>{estimated}</StyledCellText>
                    {!row.estimatedSendAt && row.eligibleAfter ? (
                      <StyledSubText>{`Eligible ${displayTime(row.eligibleAfter)}`}</StyledSubText>
                    ) : null}
                  </td>
                  <td>{displayTime(row.sentAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </StyledTable>
      </StyledTableWrap>
      {rows.length === 0 && !overview.loading ? (
        <StyledEmpty>
          <h2>No messages match these filters</h2>
          <p>No permitted Campaign messages match these filters.</p>
          <StyledQuietButton onClick={clearFilters}>
            Clear filters
          </StyledQuietButton>
        </StyledEmpty>
      ) : null}
      <StyledFooter>
        <span>
          {pageInfo?.hasNextPage && pageInfo.endCursor ? (
            <StyledQuietButton
              onClick={() =>
                void overview.fetchMore({
                  variables: {
                    input: {
                      ...variables.input,
                      after: pageInfo.endCursor as string,
                    },
                  },
                  updateQuery: (previous, { fetchMoreResult }) => ({
                    campaignMessageOverview: {
                      ...fetchMoreResult.campaignMessageOverview,
                      nodes: [
                        ...previous.campaignMessageOverview.nodes,
                        ...fetchMoreResult.campaignMessageOverview.nodes,
                      ],
                    },
                  }),
                })
              }
            >
              Load more
            </StyledQuietButton>
          ) : (
            `Showing ${rows.length} message${rows.length === 1 ? '' : 's'}`
          )}
        </span>
        <span>
          Estimates use current eligibility and capacity and do not authorize
          sends. Sent means provider accepted, not confirmed delivery.
          {pageInfo?.generatedAt
            ? ` Calculated ${displayTime(pageInfo.generatedAt)}; horizon ends ${displayTime(pageInfo.horizonEndsAt)}.`
            : !hasActiveFilters
              ? ' No forecast is available yet.'
              : ''}
        </span>
      </StyledFooter>
    </StyledPage>
  );
};

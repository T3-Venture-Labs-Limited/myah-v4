import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { campaignMessageOverviewSelectionState } from '@/myah/campaign-messages/states/campaignMessageOverviewSelectionState';
import { useOpenMyahInboxConversation } from '@/myah/inbox/hooks/useOpenMyahInboxConversation';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { SidePanelFooter } from '@/ui/layout/side-panel/components/SidePanelFooter';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledContainer = styled.section`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[5]};
`;

const StyledEyebrow = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.06em;
  margin-bottom: ${themeCssVariables.spacing[2]};
  text-transform: uppercase;
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  line-height: 1.35;
  margin: 0 0 ${themeCssVariables.spacing[3]};
`;

const StyledBadge = styled.span<{ attention: boolean; sent: boolean }>`
  background: ${({ attention, sent }) =>
    attention
      ? themeCssVariables.color.orange1
      : sent
        ? themeCssVariables.color.green1
        : themeCssVariables.color.blue1};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ attention, sent }) =>
    attention
      ? themeCssVariables.color.orange9
      : sent
        ? themeCssVariables.color.green9
        : themeCssVariables.color.blue9};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledDetails = styled.dl`
  display: grid;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  grid-template-columns: 104px minmax(0, 1fr);
  line-height: 1.5;
  margin: ${themeCssVariables.spacing[6]} 0;

  dt {
    color: ${themeCssVariables.font.color.tertiary};
  }

  dd {
    color: ${themeCssVariables.font.color.primary};
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

const StyledSection = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  margin-top: ${themeCssVariables.spacing[5]};
  padding-top: ${themeCssVariables.spacing[5]};
`;

const StyledSectionTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0 0 ${themeCssVariables.spacing[3]};
`;

const StyledPreview = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.6;
  padding: ${themeCssVariables.spacing[4]};
  white-space: pre-wrap;
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  margin: ${themeCssVariables.spacing[3]} 0 0;
`;

const StyledEvents = styled.ol`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.6;
  margin: 0;
  padding-left: ${themeCssVariables.spacing[5]};

  li + li {
    margin-top: ${themeCssVariables.spacing[2]};
  }
`;

const displayTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Unavailable';

export const SidePanelCampaignMessageOverviewPage = () => {
  const campaignMessageOverviewSelection = useAtomStateValue(
    campaignMessageOverviewSelectionState,
  );
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { openMyahInboxConversation } = useOpenMyahInboxConversation();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  if (
    !campaignMessageOverviewSelection ||
    campaignMessageOverviewSelection.workspaceId !== currentWorkspace?.id
  ) {
    return <p>Message details are unavailable in this workspace.</p>;
  }
  const { row } = campaignMessageOverviewSelection;
  const normalizedStatus = row.status.replaceAll('_', ' ').toLowerCase();
  const statusLabel =
    normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
  const inboxAvailable = Boolean(row.inboxContactId && row.inboxThreadId);

  return (
    <StyledContainer aria-label="Campaign message details">
      <StyledContent>
        <StyledEyebrow>Campaign email · Read only</StyledEyebrow>
        <StyledTitle>{row.subject ?? 'Message preview'}</StyledTitle>
        <StyledBadge attention={row.needsAttention} sent={Boolean(row.sentAt)}>
          {statusLabel}
        </StyledBadge>

        <StyledDetails>
          <dt>Recipient</dt>
          <dd>
            {row.creatorName ?? 'Creator unavailable'}
            {row.recipient ? ` · ${row.recipient}` : ''}
          </dd>
          <dt>Sending account</dt>
          <dd>
            {row.connectedAccountLabel
              ? `${row.connectedAccountLabel}${row.senderIsEstimated ? ' · Estimated until claimed' : ''}`
              : 'Unassigned'}
          </dd>
          <dt>Campaign</dt>
          <dd>{row.campaignName}</dd>
          <dt>Sequence step</dt>
          <dd>{`Step ${row.sequenceStep} · ${row.platform}`}</dd>
        </StyledDetails>

        <StyledSection>
          <StyledSectionTitle>Message preview</StyledSectionTitle>
          <StyledPreview>
            {row.preview ?? 'Message content is redacted or unavailable.'}
          </StyledPreview>
          {!row.sentAt && (
            <StyledHint>
              Current authorized preview. Content may change before sending.
            </StyledHint>
          )}
        </StyledSection>

        <StyledSection>
          <StyledSectionTitle>Message events</StyledSectionTitle>
          <StyledEvents>
            <li>
              {row.sentAt
                ? `Provider accepted · ${displayTime(row.sentAt)}`
                : `Eligible after · ${displayTime(row.eligibleAfter)}`}
            </li>
            {row.reason ? <li>{row.reason}</li> : null}
            {row.needsAttention && !row.reason ? (
              <li>Review required</li>
            ) : null}
          </StyledEvents>
        </StyledSection>

        {!inboxAvailable && (
          <StyledHint>
            Inbox is unavailable until an exact readable conversation is linked.
          </StyledHint>
        )}
      </StyledContent>

      <SidePanelFooter
        actions={[
          <Button
            key="creator"
            size="small"
            title="View Creator"
            variant="secondary"
            onClick={() =>
              openRecordInSidePanel({
                recordId: row.creatorId,
                objectNameSingular: 'creator',
              })
            }
          />,
          ...(inboxAvailable
            ? [
                <Button
                  key="inbox"
                  size="small"
                  title="Open in Inbox"
                  variant="primary"
                  accent="brand"
                  onClick={() =>
                    openMyahInboxConversation({
                      workspaceId: campaignMessageOverviewSelection.workspaceId,
                      contactId: row.inboxContactId as string,
                      threadId: row.inboxThreadId as string,
                      returnTarget:
                        campaignMessageOverviewSelection.returnTarget,
                    })
                  }
                />,
              ]
            : []),
        ]}
      />
    </StyledContainer>
  );
};

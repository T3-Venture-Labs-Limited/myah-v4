import { type CSSProperties } from 'react';
import { Status } from 'twenty-ui/data-display';
import { InlineBanner, Loader } from 'twenty-ui/feedback';
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleX,
  IconLock,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { useTheme } from 'twenty-ui/theme-constants';

import { type CampaignOverviewSnapshot } from 'src/front-components/types/campaign-overview-snapshot.type';
import { type CampaignStatus } from 'src/front-components/types/campaign-status.type';
import { deriveCampaignOverviewState } from 'src/front-components/utils/derive-campaign-overview-state.util';
import { getCampaignLifecycleActions } from 'src/front-components/utils/get-campaign-lifecycle-actions.util';

type CampaignOverviewLoadState =
  | { kind: 'loading' }
  | { kind: 'no-context' }
  | { kind: 'missing' }
  | { kind: 'read-restricted' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; snapshot: CampaignOverviewSnapshot };

type CampaignOverviewFeedback = {
  kind: 'error' | 'conflict';
  message: string;
};

type CampaignOverviewReadinessViewProps = {
  loadState: CampaignOverviewLoadState;
  isUpdateRestricted?: boolean;
  isSaving?: boolean;
  feedback?: CampaignOverviewFeedback | null;
  onRetry?: () => void;
  onChangeStatus?: (targetStatus: CampaignStatus) => void;
};

const statusPresentationByStatus: Record<
  CampaignStatus,
  { color: 'gray' | 'green' | 'orange' | 'blue'; text: string }
> = {
  DRAFT: { color: 'gray', text: 'Draft' },
  ACTIVE: { color: 'green', text: 'Active' },
  PAUSED: { color: 'orange', text: 'Paused' },
  COMPLETED: { color: 'blue', text: 'Completed' },
};

export const CampaignOverviewReadinessView = ({
  loadState,
  isUpdateRestricted = false,
  isSaving = false,
  feedback = null,
  onRetry,
  onChangeStatus,
}: CampaignOverviewReadinessViewProps) => {
  const theme = useTheme();
  const rootStyle: CSSProperties = {
    display: 'grid',
    gap: theme.spacing[4],
    padding: theme.spacing[2],
    color: theme.font.color.primary,
    fontFamily: theme.font.family,
    fontSize: theme.font.size.md,
    lineHeight: theme.text.lineHeight.md,
  };
  const quietStateStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing[2],
    color: theme.font.color.secondary,
  };

  if (loadState.kind === 'loading') {
    return (
      <div aria-label="Loading Campaign readiness" style={quietStateStyle}>
        <Loader />
        <span>Loading Campaign readiness</span>
      </div>
    );
  }

  if (loadState.kind === 'no-context') {
    return (
      <div style={quietStateStyle}>Open one Campaign to see its readiness.</div>
    );
  }

  if (loadState.kind === 'missing') {
    return <div style={quietStateStyle}>This Campaign is unavailable.</div>;
  }

  if (loadState.kind === 'read-restricted') {
    return (
      <div style={quietStateStyle}>
        <IconLock
          aria-hidden="true"
          color={theme.font.color.tertiary}
          size={theme.icon.size.md}
        />
        <span>You don't have permission to view this Campaign.</span>
      </div>
    );
  }

  if (loadState.kind === 'error') {
    return (
      <InlineBanner
        color="danger"
        LeftIcon={IconAlertTriangle}
        message={loadState.message}
        button={{ title: 'Retry', onClick: onRetry }}
      />
    );
  }

  const { snapshot } = loadState;
  const readiness = deriveCampaignOverviewState(snapshot);
  const actions = getCampaignLifecycleActions(snapshot.status);
  const statusPresentation = statusPresentationByStatus[snapshot.status];
  const checklistItems = [
    { label: 'Name', complete: readiness.hasName },
    { label: 'Objective', complete: readiness.hasObjective },
    { label: 'Audience', complete: readiness.hasAudience },
  ];

  return (
    <div style={rootStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing[2],
        }}
      >
        <span
          style={{
            color: theme.font.color.primary,
            fontWeight: theme.font.weight.medium,
          }}
        >
          Campaign readiness
        </span>
        <Status
          color={statusPresentation.color}
          text={statusPresentation.text}
          weight="medium"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gap: theme.spacing[1],
        }}
      >
        <span style={{ color: theme.font.color.secondary }}>
          {snapshot.effectiveAudienceCount}{' '}
          {snapshot.effectiveAudienceCount === 1 ? 'creator' : 'creators'}
        </span>
        {checklistItems.map(({ label, complete }) => {
          const ChecklistIcon = complete ? IconCheck : IconCircleX;

          return (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing[1],
                minHeight: theme.spacing[6],
                color: complete
                  ? theme.font.color.primary
                  : theme.font.color.danger,
              }}
            >
              <ChecklistIcon
                aria-hidden="true"
                color={
                  complete ? theme.accent.primary : theme.font.color.danger
                }
                size={theme.icon.size.md}
              />
              <span>{`${label} ${complete ? 'complete' : 'incomplete'}`}</span>
            </div>
          );
        })}
      </div>

      {readiness.blockers.map((blocker) => (
        <InlineBanner key={blocker} color="danger" message={blocker} />
      ))}

      {feedback !== null ? (
        <InlineBanner
          color={feedback.kind === 'error' ? 'danger' : 'blue'}
          LeftIcon={feedback.kind === 'error' ? IconAlertTriangle : undefined}
          message={feedback.message}
        />
      ) : null}

      {isUpdateRestricted ? (
        <div style={quietStateStyle}>
          <IconLock
            aria-hidden="true"
            color={theme.font.color.tertiary}
            size={theme.icon.size.md}
          />
          <span>
            You don't have permission to change this Campaign's status.
          </span>
        </div>
      ) : actions.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: theme.spacing[2],
          }}
        >
          {actions.map((action) => (
            <Button
              key={action.targetStatus}
              title={action.label}
              disabled={
                isSaving ||
                (action.targetStatus === 'ACTIVE' &&
                  !readiness.isActivationReady)
              }
              isLoading={isSaving}
              onClick={() => onChangeStatus?.(action.targetStatus)}
              size="small"
              type="button"
              variant="secondary"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

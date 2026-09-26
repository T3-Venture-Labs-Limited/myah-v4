import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import {
  type ReviewedGenericAction,
  type ReviewedGenericActionRecord,
} from 'twenty-shared/ai';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSectionTitle = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledRecord = styled.div`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing['0.5']};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledRecordLabel = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledLine = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  overflow-wrap: anywhere;
`;

const StyledArguments = styled.pre`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  max-height: 180px;
  overflow: auto;
  padding: ${themeCssVariables.spacing[2]};
  white-space: pre-wrap;
`;

const formatValue = (value: unknown): string =>
  value === null || value === undefined
    ? '—'
    : value === ''
      ? '""'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);

type AiChatReviewedActionSummaryProps = {
  reviewedAction: ReviewedGenericAction;
};

// Renders the server-derived action the founder approves: the real target and
// exact changes, never the assistant's own description.
export const AiChatReviewedActionSummary = ({
  reviewedAction,
}: AiChatReviewedActionSummaryProps) => {
  const { t } = useLingui();
  const { target } = reviewedAction;

  if (target.kind === 'arguments_only') {
    return (
      <StyledSection>
        <StyledSectionTitle>{t`What will run`}</StyledSectionTitle>
        <StyledLine>{reviewedAction.toolLabel}</StyledLine>
        <StyledArguments>
          {JSON.stringify(reviewedAction.arguments, null, 2)}
        </StyledArguments>
      </StyledSection>
    );
  }

  const sectionTitle =
    target.operation === 'create'
      ? t`What will be created`
      : target.operation === 'delete'
        ? t`What will be deleted`
        : t`What will change`;
  const hiddenCount = target.totalCount - target.records.length;

  const renderRecord = (record: ReviewedGenericActionRecord, index: number) => {
    const linkedLabels = new Map(
      record.linkedRecords.map((linked) => [linked.field, linked.label]),
    );
    const recordLabel =
      record.label ?? record.recordId ?? t`New ${target.objectNameSingular}`;

    return (
      <StyledRecord key={record.recordId ?? index}>
        <StyledRecordLabel>
          {recordLabel} ({target.objectNameSingular})
        </StyledRecordLabel>
        {record.changes.map((change) => {
          const linkedLabel = linkedLabels.get(change.field);
          const proposed = linkedLabel
            ? `${linkedLabel} (${formatValue(change.proposed)})`
            : formatValue(change.proposed);

          return (
            <StyledLine key={change.field}>
              {target.operation === 'update'
                ? `${change.field}: ${formatValue(change.current)} → ${proposed}`
                : `${change.field}: ${proposed}`}
            </StyledLine>
          );
        })}
      </StyledRecord>
    );
  };

  return (
    <StyledSection>
      <StyledSectionTitle>{sectionTitle}</StyledSectionTitle>
      {target.records.map(renderRecord)}
      {hiddenCount > 0 && (
        <StyledLine>{t`and ${hiddenCount} more records`}</StyledLine>
      )}
    </StyledSection>
  );
};

import { styled } from '@linaria/react';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledBoundary = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[2]}
    ${themeCssVariables.spacing[1]};
`;

const StyledRule = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  flex: 1;
`;

const StyledThreadTarget = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.transparent.lighter
      : themeCssVariables.background.primary};
  border: 0;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-family: ${themeCssVariables.font.family};
  gap: ${themeCssVariables.spacing[1]};
  max-width: 100%;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  text-align: center;

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.border.color.medium};
    outline-offset: 2px;
  }
`;

const StyledSubject = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledThreadDetail = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const getMyahInboxSafeEmailSubject = (subject: string | null) => {
  if (subject === FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED) {
    return 'Restricted subject';
  }

  return subject?.trim() || 'No subject';
};

export type MyahInboxEmailSubjectSeparatorProps = {
  messageThreadId: string;
  subject: string | null;
  detailLabel: string;
  isSelected: boolean;
  onSelectEmailThread: (messageThreadId: string) => void;
};

export const MyahInboxEmailSubjectSeparator = ({
  messageThreadId,
  subject,
  detailLabel,
  isSelected,
  onSelectEmailThread,
}: MyahInboxEmailSubjectSeparatorProps) => {
  const safeSubject = getMyahInboxSafeEmailSubject(subject);

  return (
    <StyledBoundary>
      <StyledRule
        role="separator"
        aria-label={`Email thread: ${safeSubject}, ${detailLabel}`}
      />
      <StyledThreadTarget
        type="button"
        isSelected={isSelected}
        aria-label={`${
          isSelected ? 'Selected' : 'Select'
        } email thread ${safeSubject}, ${detailLabel}`}
        aria-pressed={isSelected}
        onClick={() => onSelectEmailThread(messageThreadId)}
      >
        <StyledSubject>{safeSubject}</StyledSubject>
        <StyledThreadDetail>{detailLabel}</StyledThreadDetail>
      </StyledThreadTarget>
      <StyledRule aria-hidden />
    </StyledBoundary>
  );
};

import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { i18n } from '@lingui/core';

import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledAttribution = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type ActivityAttributionProps = {
  createdAt?: string | null;
  createdBy?: { name?: string | null; source?: string | null } | null;
};

export const ActivityAttribution = ({
  createdAt,
  createdBy,
}: ActivityAttributionProps) => {
  const author = createdBy?.name?.trim();
  const source = createdBy?.source?.trim();
  const creationDate = createdAt ? new Date(createdAt) : null;
  const hasCreationDate =
    creationDate !== null && !Number.isNaN(creationDate.getTime());

  return (
    <StyledAttribution>
      {author ? t`Created by ${author}` : t`Author unavailable`}
      {source ? ` · ${t`Source: ${source}`}` : null}
      {hasCreationDate && creationDate !== null
        ? ` · ${i18n.date(creationDate, { dateStyle: 'medium', timeStyle: 'short' })}`
        : null}
    </StyledAttribution>
  );
};

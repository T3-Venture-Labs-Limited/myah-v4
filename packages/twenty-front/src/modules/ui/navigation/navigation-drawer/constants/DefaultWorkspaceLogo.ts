import { isNonEmptyString } from '@sniptt/guards';

import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

export const DEFAULT_WORKSPACE_LOGO = '/images/brand/myah-mark.png';

export const getWorkspaceLogoUrl = (
  workspaceLogo?: string | null,
): string =>
  isNonEmptyString(workspaceLogo)
    ? (getAbsoluteImageUrl(workspaceLogo) ?? DEFAULT_WORKSPACE_LOGO)
    : DEFAULT_WORKSPACE_LOGO;

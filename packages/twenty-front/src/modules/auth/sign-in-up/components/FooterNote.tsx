import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';

import { useWorkspaceBypass } from '@/auth/sign-in-up/hooks/useWorkspaceBypass';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledBypassContainer = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
`;

const StyledBypassButton = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  padding: 0;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

export const FooterNote = () => {
  const { isOnAWorkspace } = useIsCurrentLocationOnAWorkspace();

  const { shouldOfferBypass, shouldUseBypass, enableBypass } =
    useWorkspaceBypass();

  if (!isOnAWorkspace || !shouldOfferBypass || shouldUseBypass) {
    return null;
  }

  return (
    <StyledBypassContainer>
      <StyledBypassButton type="button" onClick={enableBypass}>
        <Trans>Bypass SSO</Trans>
      </StyledBypassButton>
    </StyledBypassContainer>
  );
};

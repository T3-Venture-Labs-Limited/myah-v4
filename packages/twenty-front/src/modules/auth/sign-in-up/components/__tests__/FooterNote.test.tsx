import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';

import { FooterNote } from '@/auth/sign-in-up/components/FooterNote';
import { useWorkspaceBypass } from '@/auth/sign-in-up/hooks/useWorkspaceBypass';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';

jest.mock('@/auth/sign-in-up/hooks/useWorkspaceBypass');
jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace');

describe('FooterNote', () => {
  const enableBypass = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useWorkspaceBypass).mockReturnValue({
      shouldOfferBypass: false,
      shouldUseBypass: false,
      enableBypass,
    });
  });

  it('omits legal links and assent outside a workspace', () => {
    jest.mocked(useIsCurrentLocationOnAWorkspace).mockReturnValue({
      isOnAWorkspace: false,
    });

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <FooterNote />
      </I18nProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the workspace SSO bypass control without legal links', () => {
    jest.mocked(useIsCurrentLocationOnAWorkspace).mockReturnValue({
      isOnAWorkspace: true,
    });
    jest.mocked(useWorkspaceBypass).mockReturnValue({
      shouldOfferBypass: true,
      shouldUseBypass: false,
      enableBypass,
    });

    render(
      <I18nProvider i18n={i18n}>
        <FooterNote />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bypass SSO' }));

    expect(enableBypass).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

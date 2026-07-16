import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import {
  AiChatActionApprovalEvidence,
  type ActionApprovalProposalEvidence,
  type ActionExecutionReceiptEvidence,
} from '@/ai/components/AiChatActionApprovalEvidence';

jest.mock('@linaria/react', () => {
  const React = jest.requireActual('react');
  const styled = new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        () =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    },
  );

  return { styled };
});

jest.mock('@/object-metadata/states/objectMetadataItemsSelector', () => ({
  objectMetadataItemsSelector: {},
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [],
}));

const proposalWithUnsafeFields = {
  action: 'send_instagram_reply',
  state: 'CONSUMED',
  occurredAt: '2026-07-16T10:01:00.000Z',
  evidenceLinks: [
    {
      objectMetadataId: 'unknown-object-metadata-id',
      recordId: 'deleted-record-id',
      role: 'recipient',
    },
  ],
  body: 'body-must-not-render',
  preview: 'preview-must-not-render',
} satisfies ActionApprovalProposalEvidence & { body: string; preview: string };

const receiptWithUnsafeFields = {
  state: 'PROVIDER_ACCEPTED',
  occurredAt: '2026-07-16T10:02:00.000Z',
  outcome: 'accepted',
  evidenceLinks: [
    {
      objectMetadataId: 'unknown-object-metadata-id',
      recordId: 'deleted-record-id',
      role: 'recipient',
    },
  ],
  rawProviderPayload: 'raw-provider-payload-must-not-render',
  providerToken: 'provider-token-must-not-render',
  rawFailureReason: 'raw-failure-must-not-render',
} satisfies ActionExecutionReceiptEvidence & {
  rawProviderPayload: string;
  providerToken: string;
  rawFailureReason: string;
};

const renderEvidence = () =>
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <AiChatActionApprovalEvidence
          proposal={proposalWithUnsafeFields}
          receipt={receiptWithUnsafeFields}
        />
      </ThemeProvider>
    </I18nProvider>,
  );

describe('AiChatActionApprovalEvidence', () => {
  it('renders provider acceptance as neutral pending projection', () => {
    renderEvidence();

    expect(screen.getByText('Accepted; waiting for projection')).toBeInTheDocument();
    expect(screen.getByText('Send Instagram reply')).toBeInTheDocument();
  });

  it('renders expired history without a proposal body or preview', () => {
    render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <AiChatActionApprovalEvidence
            proposal={{
              action: 'send_instagram_reply',
              state: 'EXPIRED',
              occurredAt: '2026-07-16T10:01:00.000Z',
              evidenceLinks: [],
            }}
            receipt={null}
          />
        </ThemeProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText(/body|preview/i)).not.toBeInTheDocument();
  });

  it('renders proposal evidence before a receipt exists', () => {
    render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <AiChatActionApprovalEvidence
            proposal={proposalWithUnsafeFields}
            receipt={null}
          />
        </ThemeProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Evidence unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders unknown or deleted evidence as a non-clickable fallback', () => {
    renderEvidence();

    expect(screen.getByText('Evidence unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not render arbitrary raw approval or provider fields', () => {
    renderEvidence();

    const rendered = document.body.textContent ?? '';
    for (const unsafeValue of [
      'body-must-not-render',
      'preview-must-not-render',
      'raw-provider-payload-must-not-render',
      'provider-token-must-not-render',
      'raw-failure-must-not-render',
    ]) {
      expect(rendered).not.toContain(unsafeValue);
    }
  });
});

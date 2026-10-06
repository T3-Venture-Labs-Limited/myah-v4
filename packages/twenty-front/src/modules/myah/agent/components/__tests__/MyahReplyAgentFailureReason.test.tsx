import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MyahReplyAgentDraftLabel } from '@/myah/agent/components/MyahReplyAgentDraftLabel';
import { GET_MYAH_REPLY_AGENT_DRAFT_LABEL } from '@/myah/agent/graphql/myahReplyAgentOperations';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { PermissionFlagType } from '~/generated-metadata/graphql';

jest.mock('@/settings/roles/hooks/usePermissionFlagMap', () => ({
  usePermissionFlagMap: jest.fn(),
}));

const showLabel = (reason: string, billingAllowed = true) => {
  jest.mocked(usePermissionFlagMap).mockReturnValue({
    [PermissionFlagType.BILLING]: billingAllowed,
  } as ReturnType<typeof usePermissionFlagMap>);
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <MockedProvider
          mocks={[
            {
              request: {
                query: GET_MYAH_REPLY_AGENT_DRAFT_LABEL,
                variables: {
                  input: { channel: 'EMAIL', conversationRecordId: 'thread-1' },
                },
              },
              result: {
                data: {
                  myahReplyAgentDraftLabel: {
                    kind: 'NEEDS_YOU',
                    reason,
                    campaignName: null,
                  },
                },
              },
            },
          ]}
        >
          <MyahReplyAgentDraftLabel
            channel="EMAIL"
            conversationRecordId="thread-1"
          />
        </MockedProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
};

it.each([
  'Your AI usage is used up. Review Billing, then regenerate, or reply yourself.',
  'AI credit is used up. Add credit, then Regenerate, or reply yourself.',
])(
  'shows a usable Billing link for current and historical exhausted runs',
  async (reason) => {
    showLabel(reason);
    expect(await screen.findByRole('note')).toHaveTextContent(
      'Needs you: Your AI usage is used up.',
    );
    expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute(
      'href',
      '/settings/billing',
    );
    expect(screen.getByRole('note')).toHaveTextContent(/reply yourself/i);
  },
);

it('gives a non-admin an honest recovery action without a forbidden Billing link', async () => {
  showLabel(
    'Your AI usage is used up. Review Billing, then regenerate, or reply yourself.',
    false,
  );
  expect(await screen.findByRole('note')).toHaveTextContent(
    /Ask a workspace admin/,
  );
  expect(
    screen.queryByRole('link', { name: 'Billing' }),
  ).not.toBeInTheDocument();
});

it('preserves other hand-off reasons', async () => {
  showLabel('The creator asked about a contract.');
  expect(await screen.findByRole('note')).toHaveTextContent(
    'Needs you: The creator asked about a contract.',
  );
  expect(
    screen.queryByRole('link', { name: 'Billing' }),
  ).not.toBeInTheDocument();
});

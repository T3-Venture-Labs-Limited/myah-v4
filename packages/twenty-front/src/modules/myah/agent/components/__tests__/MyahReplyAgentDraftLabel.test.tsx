import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { MyahReplyAgentDraftLabel } from '@/myah/agent/components/MyahReplyAgentDraftLabel';
import { GET_MYAH_REPLY_AGENT_DRAFT_LABEL } from '@/myah/agent/graphql/myahReplyAgentOperations';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';
import { SettingsPath } from 'twenty-shared/types';
import { ThemeProvider } from 'twenty-ui/theme-constants';

let mockCanManage = true;
const mockNavigate = jest.fn();
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockCanManage,
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigate,
}));
const usedUp =
  "This month's AI usage is used up. It resets on 2026-11-05. Regenerate after it resets, or reply yourself.";
const mount = (reason = usedUp, kind = 'NEEDS_YOU') =>
  render(
    <Provider store={jotaiStore}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <MockedProvider
            mocks={[
              {
                request: {
                  query: GET_MYAH_REPLY_AGENT_DRAFT_LABEL,
                  variables: {
                    input: {
                      channel: 'INSTAGRAM',
                      conversationRecordId: 'conversation',
                    },
                  },
                },
                result: {
                  data: {
                    myahReplyAgentDraftLabel: {
                      kind,
                      reason,
                      campaignName: 'Autumn glow',
                    },
                  },
                },
              },
            ]}
          >
            <MyahReplyAgentDraftLabel
              channel="INSTAGRAM"
              conversationRecordId="conversation"
            />
          </MockedProvider>
        </ThemeProvider>
      </I18nProvider>
    </Provider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  resetJotaiStore();
  mockCanManage = true;
  jotaiStore.set(isMyahSubscriptionRequiredState.atom, true);
});

it('keeps the used-up reason and date and links a Billing member to Settings', async () => {
  mount();
  expect(await screen.findByRole('note')).toHaveTextContent(usedUp);
  fireEvent.click(screen.getByRole('button', { name: 'View billing' }));
  expect(mockNavigate).toHaveBeenCalledWith(SettingsPath.Billing);
});

it('preserves the retrying handoff wording', async () => {
  mount(
    "This month's AI usage is used up. It resets when the renewal payment goes through. Regenerate after it resets, or reply yourself.",
  );
  expect(await screen.findByRole('note')).toHaveTextContent(
    'when the renewal payment goes through',
  );
  expect(screen.getByRole('button', { name: 'View billing' })).toBeVisible();
});

it.each(['member', 'off', 'unrelated', 'ended', 'drafted'])(
  'does not add a Billing link for %s',
  async (scenario) => {
    if (scenario === 'member') mockCanManage = false;
    if (scenario === 'off')
      jotaiStore.set(isMyahSubscriptionRequiredState.atom, false);
    const reason =
      scenario === 'unrelated'
        ? 'Asks for a paid rate'
        : scenario === 'ended'
          ? 'The workspace subscription has ended. Ask an admin to resubscribe, then Regenerate, or reply yourself.'
          : usedUp;
    mount(reason, scenario === 'drafted' ? 'DRAFTED' : 'NEEDS_YOU');
    expect(await screen.findByRole('note')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'View billing' }),
    ).not.toBeInTheDocument();
  },
);

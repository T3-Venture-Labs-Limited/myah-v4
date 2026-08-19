import { ManagedEmailDetails } from '@/settings/workspace/components/managed-email/ManagedEmailDetails';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages } from '~/locales/generated/en';
import {
  type ManagedEmailDomain,
  type ManagedEmailMailbox,
} from '~/generated-metadata/graphql';

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const mailbox: ManagedEmailMailbox = {
  address: 'maya@creator-network.com',
  adminDailyCap: 12,
  campaignEligibility: 'NEW_THREADS_BLOCKED',
  domain: 'creator-network.com',
  domainId: 'domain-1',
  id: 'mailbox-1',
  infrastructureState: 'ACTIVE',
  infrastructureCancelAtPeriodEnd: false,
  lastHealthEvaluatedAt: '2026-08-06T12:00:00.000Z',
  personaDisplayName: 'Maya Chen',
  personaRole: 'Partnerships',
  policySafeDailyCapacity: 20,
  safeFailureCode: 'INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER',
  servicePaidThrough: '2026-09-06T12:00:00.000Z',
  warmupCancelAtPeriodEnd: false,
  warmupPaidThrough: '2026-10-06T12:00:00.000Z',
  warmupState: 'WARMING',
};

const domain: ManagedEmailDomain = {
  cancelAtPeriodEnd: false,
  dependentMailboxCount: 1,
  domain: 'creator-network.com',
  id: 'domain-1',
  infrastructureState: 'ACTIVE',
  paidThrough: '2027-08-06T12:00:00.000Z',
  renewalEnabled: true,
  safeFailureCode: null,
};

const renderDetails = ({
  domains = [domain],
  mailboxes = [mailbox],
  onCancelDomainRenewal = jest.fn(),
  onCancelWarmup = jest.fn(),
  onPauseWarmup = jest.fn(),
  onResumeWarmup = jest.fn(),
  onSetCampaignCap = jest.fn(),
  onStopMailbox = jest.fn(),
}: Partial<ComponentProps<typeof ManagedEmailDetails>> = {}) =>
  render(
    <I18nProvider i18n={i18n}>
      <ManagedEmailDetails
        domains={domains}
        mailboxes={mailboxes}
        onCancelDomainRenewal={onCancelDomainRenewal}
        onCancelWarmup={onCancelWarmup}
        onPauseWarmup={onPauseWarmup}
        onResumeWarmup={onResumeWarmup}
        onSetCampaignCap={onSetCampaignCap}
        onStopMailbox={onStopMailbox}
      />
    </I18nProvider>,
  );

describe('ManagedEmailDetails', () => {
  it('selects a mailbox and renders customer-safe lifecycle details', async () => {
    const user = userEvent.setup();
    renderDetails();

    await user.click(
      screen.getByRole('button', { name: /maya@creator-network.com/i }),
    );

    expect(screen.getByRole('heading', { name: 'Maya Chen' })).toBeVisible();
    expect(
      screen.getByText('New threads are currently blocked.'),
    ).toBeVisible();
    expect(screen.getByText('20 emails per day')).toBeVisible();
    expect(
      screen.getByText('Mailbox service paid through').parentElement,
    ).toHaveTextContent('Sep 6, 2026');
    expect(
      screen.getByText('Warmup paid through').parentElement,
    ).toHaveTextContent('Oct 6, 2026');
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
    expect(
      screen.queryByText('INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER'),
    ).not.toBeInTheDocument();
  });

  it.each([0, 12])(
    'raises an admin cap from %s within the policy capacity',
    async (adminDailyCap) => {
      const user = userEvent.setup();
      const onSetCampaignCap = jest.fn();

      renderDetails({
        mailboxes: [{ ...mailbox, adminDailyCap }],
        onSetCampaignCap,
      });
      await user.click(
        screen.getByRole('button', { name: /maya@creator-network.com/i }),
      );

      const capInput = screen.getByRole('spinbutton', {
        name: 'Daily campaign cap',
      });
      await user.clear(capInput);
      await user.type(capInput, '15');
      await user.click(
        screen.getByRole('button', { name: /^Update campaign cap/ }),
      );

      expect(onSetCampaignCap).toHaveBeenCalledWith('mailbox-1', 15);
    },
  );

  it('clears an admin cap to use the policy capacity', async () => {
    const user = userEvent.setup();
    const onSetCampaignCap = jest.fn();

    renderDetails({ onSetCampaignCap });
    await user.click(
      screen.getByRole('button', { name: /maya@creator-network.com/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /^Use policy capacity/ }),
    );

    expect(onSetCampaignCap).toHaveBeenCalledWith('mailbox-1', null);
  });

  it('confirms immediate warmup pauses before invoking the callback', async () => {
    const user = userEvent.setup();
    const onPauseWarmup = jest.fn();
    renderDetails({ onPauseWarmup });

    await user.click(
      screen.getByRole('button', { name: /maya@creator-network.com/i }),
    );
    await user.click(screen.getByRole('button', { name: /^Pause warmup/ }));

    expect(onPauseWarmup).not.toHaveBeenCalled();
    expect(screen.getByText('Pause warmup immediately?')).toBeVisible();
    expect(
      screen.getByText(
        'This pauses warmup now. It does not cancel your warmup renewal.',
      ),
    ).toBeVisible();

    await user.click(screen.getByTestId('confirmation-modal-confirm-button'));
    expect(onPauseWarmup).toHaveBeenCalledWith('mailbox-1');
  });

  it('keeps immediate pause available after warmup renewal is cancelled', async () => {
    const user = userEvent.setup();

    renderDetails({
      mailboxes: [
        {
          ...mailbox,
          warmupCancelAtPeriodEnd: true,
          warmupState: 'MAINTENANCE',
        },
      ],
    });

    await user.click(
      screen.getByRole('button', { name: /maya@creator-network.com/i }),
    );

    expect(screen.getByText('Warmup renewal').parentElement).toHaveTextContent(
      'Ends after paid period',
    );
    expect(screen.getByRole('button', { name: /^Pause warmup/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Cancel warmup renewal' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer resume after a cancelled warmup is paused', async () => {
    const user = userEvent.setup();

    renderDetails({
      mailboxes: [
        {
          ...mailbox,
          warmupCancelAtPeriodEnd: true,
          warmupState: 'PAUSED',
        },
      ],
    });

    await user.click(
      screen.getByRole('button', { name: /maya@creator-network.com/i }),
    );

    expect(screen.getByText('Warmup renewal').parentElement).toHaveTextContent(
      'Ends after paid period',
    );
    expect(
      screen.queryByRole('button', { name: 'Resume warmup' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel warmup renewal' }),
    ).not.toBeInTheDocument();
  });

  it('describes mailbox service cancellation as an end-of-period action', async () => {
    const user = userEvent.setup();
    const onStopMailbox = jest.fn();

    renderDetails({ onStopMailbox });

    await user.click(
      screen.getByRole('button', { name: /maya@creator-network.com/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /^Cancel mailbox service renewal/ }),
    );

    expect(onStopMailbox).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'This cancels mailbox service renewal at the end of the paid period. The mailbox remains active until then.',
      ),
    ).toBeVisible();

    await user.click(screen.getByTestId('confirmation-modal-confirm-button'));
    expect(onStopMailbox).toHaveBeenCalledWith('mailbox-1');
  });

  it('shows a completed mailbox service cancellation without another action', async () => {
    const user = userEvent.setup();

    renderDetails({
      mailboxes: [{ ...mailbox, infrastructureCancelAtPeriodEnd: true }],
    });

    await user.click(
      screen.getByRole('button', { name: /maya@creator-network.com/i }),
    );

    expect(screen.getByText('Ends after paid period')).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /^Cancel mailbox service renewal/,
      }),
    ).not.toBeInTheDocument();
  });

  it('warns about dependent mailboxes before domain renewal can be disabled', async () => {
    const user = userEvent.setup();

    renderDetails();

    await user.click(
      screen.getByRole('button', { name: /^creator-network\.com/ }),
    );

    expect(
      screen.getByText(
        'Stop 1 dependent mailbox service before disabling domain renewal.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Disable domain renewal/ }),
    ).not.toBeInTheDocument();
  });

  it('allows domain renewal cancellation when all dependents already end at period close', async () => {
    const user = userEvent.setup();

    renderDetails({
      mailboxes: [{ ...mailbox, infrastructureCancelAtPeriodEnd: true }],
    });

    await user.click(
      screen.getByRole('button', { name: /^creator-network\.com/ }),
    );

    expect(
      screen.queryByText(
        'Stop 1 dependent mailbox service before disabling domain renewal.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Disable domain renewal/ }),
    ).toBeVisible();
  });

  it('confirms domain renewal cancellation when no mailboxes depend on it', async () => {
    const user = userEvent.setup();

    renderDetails({
      domains: [{ ...domain, dependentMailboxCount: 0 }],
      mailboxes: [],
    });
    await user.click(
      screen.getByRole('button', { name: /^creator-network\.com/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /^Disable domain renewal/ }),
    );

    expect(
      screen.getByText(
        'This cancels renewal at the end of the paid period. The domain remains available until then.',
      ),
    ).toBeVisible();
  });
});

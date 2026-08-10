import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Status } from 'twenty-ui/data-display';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import {
  type ManagedEmailDomain,
  type ManagedEmailMailbox,
} from '~/generated-metadata/graphql';

const MANAGED_EMAIL_ACTION_MODAL_ID = 'managed-email-action-modal';

type ManagedEmailDetailsProps = {
  domains: ManagedEmailDomain[];
  mailboxes: ManagedEmailMailbox[];
  onCancelDomainRenewal: (domainId: string) => void;
  onCancelWarmup: (mailboxId: string) => void;
  onPauseWarmup: (mailboxId: string) => void;
  onResumeWarmup: (mailboxId: string) => void;
  onSetCampaignCap: (mailboxId: string, dailyCap: number | null) => void;
  onStopMailbox: (mailboxId: string) => void;
};

type PendingAction = {
  confirmButtonAccent?: 'brand' | 'danger';
  confirmButtonText: string;
  onConfirm: () => void;
  subtitle: string;
  title: string;
};

const formatDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : null;

const warmupStatus = (state: string) => {
  if (state === 'MAINTENANCE' || state === 'NOT_APPLICABLE') {
    return {
      color: 'green' as const,
      text: state === 'NOT_APPLICABLE' ? 'Prewarmed' : 'Ready',
    };
  }

  if (state === 'CONNECTING' || state === 'WARMING') {
    return { color: 'yellow' as const, text: 'Warming' };
  }

  if (state === 'PAUSED' || state === 'CANCEL_AT_PERIOD_END') {
    return {
      color: 'gray' as const,
      text: state === 'PAUSED' ? 'Paused' : 'Ends after paid period',
    };
  }

  return { color: 'red' as const, text: 'Action required' };
};

export const ManagedEmailDetails = ({
  domains,
  mailboxes,
  onCancelDomainRenewal,
  onCancelWarmup,
  onPauseWarmup,
  onResumeWarmup,
  onSetCampaignCap,
  onStopMailbox,
}: ManagedEmailDetailsProps) => {
  const { t } = useLingui();
  const { openModal } = useModal();
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(
    null,
  );
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [dailyCap, setDailyCap] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const selectedMailbox = mailboxes.find(({ id }) => id === selectedMailboxId);
  const selectedDomain = domains.find(({ id }) => id === selectedDomainId);
  const selectedMailboxWarmupStatus = selectedMailbox
    ? warmupStatus(selectedMailbox.warmupState)
    : null;
  const currentCampaignCap =
    selectedMailbox?.adminDailyCap ?? selectedMailbox?.policySafeDailyCapacity;
  const parsedDailyCap = /^\d+$/.test(dailyCap) ? Number(dailyCap) : null;
  const activeDependentMailboxCount = selectedDomain
    ? mailboxes.filter(
        (mailbox) =>
          mailbox.domainId === selectedDomain.id &&
          !mailbox.infrastructureCancelAtPeriodEnd,
      ).length
    : 0;
  const canPauseWarmup =
    selectedMailbox?.warmupState === 'CONNECTING' ||
    selectedMailbox?.warmupState === 'WARMING' ||
    selectedMailbox?.warmupState === 'MAINTENANCE' ||
    selectedMailbox?.warmupState === 'CANCEL_AT_PERIOD_END';
  const canResumeWarmup =
    selectedMailbox?.warmupState === 'PAUSED' &&
    !selectedMailbox.warmupCancelAtPeriodEnd;
  const canManageWarmupRenewal =
    canPauseWarmup || selectedMailbox?.warmupState === 'PAUSED';

  const requestConfirmation = (action: PendingAction) => {
    setPendingAction(action);
    openModal(MANAGED_EMAIL_ACTION_MODAL_ID);
  };

  const selectMailbox = (mailbox: ManagedEmailMailbox) => {
    setSelectedMailboxId(mailbox.id);
    setSelectedDomainId(null);
    setDailyCap(
      String(mailbox.adminDailyCap ?? mailbox.policySafeDailyCapacity),
    );
  };

  return (
    <>
      <Section>
        <H2Title
          title={t`Managed mailbox details`}
          description={t`Select a mailbox or domain to review its independent service, renewal, and campaign status.`}
        />
        <h3>{t`Mailboxes`}</h3>
        {mailboxes.map((mailbox) => (
          <Button
            key={mailbox.id}
            title={`${mailbox.personaDisplayName} — ${mailbox.address}`}
            variant="secondary"
            onClick={() => selectMailbox(mailbox)}
          />
        ))}
        <h3>{t`Domains`}</h3>
        {domains.map((domain) => (
          <Button
            key={domain.id}
            title={domain.domain}
            variant="secondary"
            onClick={() => {
              setSelectedDomainId(domain.id);
              setSelectedMailboxId(null);
            }}
          />
        ))}
      </Section>

      {selectedMailbox && (
        <Section>
          <H2Title
            title={selectedMailbox.personaDisplayName}
            description={selectedMailbox.address}
          />
          <dl>
            {selectedMailbox.personaRole && (
              <div>
                <dt>{t`Role`}</dt>
                <dd>{selectedMailbox.personaRole}</dd>
              </div>
            )}
            <div>
              <dt>{t`Domain`}</dt>
              <dd>{selectedMailbox.domain}</dd>
            </div>
            <div>
              <dt>{t`Warmup`}</dt>
              <dd>
                {selectedMailboxWarmupStatus && (
                  <Status
                    color={selectedMailboxWarmupStatus.color}
                    text={selectedMailboxWarmupStatus.text}
                  />
                )}
              </dd>
            </div>
            <div>
              <dt>{t`Warmup renewal`}</dt>
              <dd>
                {selectedMailbox.warmupCancelAtPeriodEnd
                  ? t`Ends after paid period`
                  : t`Renews automatically`}
              </dd>
            </div>
            <div>
              <dt>{t`Campaigns`}</dt>
              <dd>
                {selectedMailbox.campaignEligibility === 'ELIGIBLE'
                  ? t`Ready for new threads`
                  : t`New threads are currently blocked.`}
              </dd>
            </div>
            <div>
              <dt>{t`Mailbox service renewal`}</dt>
              <dd>
                {selectedMailbox.infrastructureCancelAtPeriodEnd
                  ? t`Ends after paid period`
                  : t`Renews automatically`}
              </dd>
            </div>
            <div>
              <dt>{t`Daily campaign capacity`}</dt>
              <dd>{t`${selectedMailbox.policySafeDailyCapacity} emails per day`}</dd>
            </div>
            {formatDate(selectedMailbox.servicePaidThrough) && (
              <div>
                <dt>{t`Mailbox service paid through`}</dt>
                <dd>{formatDate(selectedMailbox.servicePaidThrough)}</dd>
              </div>
            )}
            {formatDate(selectedMailbox.warmupPaidThrough) && (
              <div>
                <dt>{t`Warmup paid through`}</dt>
                <dd>{formatDate(selectedMailbox.warmupPaidThrough)}</dd>
              </div>
            )}
          </dl>
          {selectedMailbox.safeFailureCode && (
            <p>{t`This mailbox needs attention. Review the available actions or contact support if the issue continues.`}</p>
          )}
          <SettingsTextInput
            instanceId={`managed-email-campaign-cap-${selectedMailbox.id}`}
            label={t`Daily campaign cap`}
            type="number"
            min={0}
            max={selectedMailbox.policySafeDailyCapacity}
            value={dailyCap}
            onChange={setDailyCap}
          />
          <Button
            title={t`Update campaign cap`}
            variant="secondary"
            disabled={
              parsedDailyCap === null ||
              parsedDailyCap > selectedMailbox.policySafeDailyCapacity ||
              parsedDailyCap === currentCampaignCap
            }
            onClick={() => {
              if (parsedDailyCap !== null) {
                onSetCampaignCap(selectedMailbox.id, parsedDailyCap);
              }
            }}
          />
          {selectedMailbox.adminDailyCap !== null && (
            <Button
              title={t`Use policy capacity`}
              variant="secondary"
              onClick={() => onSetCampaignCap(selectedMailbox.id, null)}
            />
          )}
          {canResumeWarmup && (
            <Button
              title={t`Resume warmup`}
              variant="secondary"
              onClick={() => onResumeWarmup(selectedMailbox.id)}
            />
          )}
          {canPauseWarmup && (
            <Button
              title={t`Pause warmup`}
              variant="secondary"
              onClick={() =>
                requestConfirmation({
                  confirmButtonText: t`Pause warmup`,
                  onConfirm: () => onPauseWarmup(selectedMailbox.id),
                  subtitle: selectedMailbox.warmupCancelAtPeriodEnd
                    ? t`This pauses warmup now. The existing renewal cancellation remains scheduled for the end of the paid period.`
                    : t`This pauses warmup now. It does not cancel your warmup renewal.`,
                  title: t`Pause warmup immediately?`,
                })
              }
            />
          )}
          {canManageWarmupRenewal &&
            !selectedMailbox.warmupCancelAtPeriodEnd && (
              <Button
                title={t`Cancel warmup renewal`}
                variant="secondary"
                onClick={() =>
                  requestConfirmation({
                    confirmButtonText: t`Cancel warmup renewal`,
                    onConfirm: () => onCancelWarmup(selectedMailbox.id),
                    subtitle: t`This cancels warmup renewal at the end of the paid period. It does not pause warmup now.`,
                    title: t`Cancel warmup renewal?`,
                  })
                }
              />
            )}
          {!selectedMailbox.infrastructureCancelAtPeriodEnd &&
            selectedMailbox.warmupState !== 'DELETING' &&
            selectedMailbox.warmupState !== 'DELETED' && (
              <Button
                title={t`Cancel mailbox service renewal`}
                variant="secondary"
                onClick={() =>
                  requestConfirmation({
                    confirmButtonAccent: 'danger',
                    confirmButtonText: t`Cancel mailbox service renewal`,
                    onConfirm: () => onStopMailbox(selectedMailbox.id),
                    subtitle: t`This cancels mailbox service renewal at the end of the paid period. The mailbox remains active until then.`,
                    title: t`Cancel mailbox service renewal?`,
                  })
                }
              />
            )}
        </Section>
      )}

      {selectedDomain && (
        <Section>
          <H2Title
            title={selectedDomain.domain}
            description={t`Managed sending domain`}
          />
          <dl>
            <div>
              <dt>{t`Infrastructure`}</dt>
              <dd>
                <Status
                  color={
                    selectedDomain.infrastructureState === 'ACTIVE'
                      ? 'green'
                      : 'red'
                  }
                  text={
                    selectedDomain.infrastructureState === 'ACTIVE'
                      ? t`Ready`
                      : t`Action required`
                  }
                />
              </dd>
            </div>
            <div>
              <dt>{t`Mailboxes`}</dt>
              <dd>{selectedDomain.dependentMailboxCount}</dd>
            </div>
            <div>
              <dt>{t`Renewal`}</dt>
              <dd>
                {selectedDomain.cancelAtPeriodEnd ||
                !selectedDomain.renewalEnabled
                  ? t`Ends after paid period`
                  : t`Renews automatically`}
              </dd>
            </div>
            {formatDate(selectedDomain.paidThrough) && (
              <div>
                <dt>{t`Paid through`}</dt>
                <dd>{formatDate(selectedDomain.paidThrough)}</dd>
              </div>
            )}
          </dl>
          {selectedDomain.safeFailureCode && (
            <p>{t`This domain needs attention. Review the available actions or contact support if the issue continues.`}</p>
          )}
          {selectedDomain.renewalEnabled &&
            !selectedDomain.cancelAtPeriodEnd &&
            (activeDependentMailboxCount > 0 ? (
              <p>
                {activeDependentMailboxCount === 1
                  ? t`Stop 1 dependent mailbox service before disabling domain renewal.`
                  : t`Stop ${activeDependentMailboxCount} dependent mailbox services before disabling domain renewal.`}
              </p>
            ) : (
              <Button
                title={t`Disable domain renewal`}
                variant="secondary"
                onClick={() =>
                  requestConfirmation({
                    confirmButtonText: t`Disable domain renewal`,
                    onConfirm: () => onCancelDomainRenewal(selectedDomain.id),
                    subtitle: t`This cancels renewal at the end of the paid period. The domain remains available until then.`,
                    title: t`Disable domain renewal?`,
                  })
                }
              />
            ))}
        </Section>
      )}

      {pendingAction && (
        <ConfirmationModal
          modalInstanceId={MANAGED_EMAIL_ACTION_MODAL_ID}
          title={pendingAction.title}
          subtitle={pendingAction.subtitle}
          confirmButtonText={pendingAction.confirmButtonText}
          confirmButtonAccent={pendingAction.confirmButtonAccent}
          onConfirmClick={pendingAction.onConfirm}
        />
      )}
    </>
  );
};

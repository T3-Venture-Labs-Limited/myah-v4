import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useLingui } from '@lingui/react/macro';
import { Info } from 'twenty-ui/feedback';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import {
  type ManagedEmailProposal,
  type ManagedEmailQuote,
} from '~/generated-metadata/graphql';

const CONFIRM_MANAGED_EMAIL_PURCHASE_MODAL_ID =
  'confirm-managed-email-purchase-modal';

type ManagedEmailReviewProps = {
  isConfirming: boolean;
  onBack: () => void;
  onConfirm: () => Promise<void> | void;
  proposal: ManagedEmailProposal;
  quote: ManagedEmailQuote;
};

const formatMoney = (amountCents: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    currency,
    style: 'currency',
  }).format(amountCents / 100);

const productLabel = (productKey: string) => {
  switch (productKey) {
    case 'managed_sending_domain_year':
      return 'Managed sending domain';
    case 'managed_mailbox_month':
      return 'Managed mailbox';
    case 'managed_warmup_month':
      return 'Managed warmup';
    default:
      return 'Managed email service';
  }
};

export const ManagedEmailReview = ({
  isConfirming,
  onBack,
  onConfirm,
  proposal,
  quote,
}: ManagedEmailReviewProps) => {
  const { t } = useLingui();
  const { openModal } = useModal();
  const dueToday = formatMoney(quote.dueTodayCents, quote.currency);

  return (
    <Section>
      <H2Title
        title={t`Review managed mailboxes`}
        description={t`Confirm the proposed identities, service periods, and recurring charges.`}
      />
      {quote.isSandbox && (
        <Info
          accent="blue"
          text={t`Non-production sandbox: this checkout uses test-only services and cannot provision production mailboxes.`}
        />
      )}
      {proposal.domains.map((domain) => (
        <article key={domain.domain}>
          <h3>{domain.domain}</h3>
          <ul>
            {domain.mailboxes.map((mailbox) => (
              <li key={mailbox.address}>
                <strong>{mailbox.displayName}</strong> — {mailbox.address}
                {mailbox.roleTitle ? ` — ${mailbox.roleTitle}` : ''}
              </li>
            ))}
          </ul>
        </article>
      ))}
      <h3>{t`Billing`}</h3>
      <dl>
        {quote.lines.map((line) => (
          <div key={`${line.productKey}-${line.startingAt}`}>
            <dt>
              {productLabel(line.productKey)} —{' '}
              <span>
                {line.billingFrequency === 'ANNUAL' ? t`Annual` : t`Monthly`}
              </span>
            </dt>
            <dd>
              {line.quantity} ×{' '}
              {formatMoney(line.unitPriceCents, quote.currency)} ={' '}
              {formatMoney(line.amountCents, quote.currency)}
            </dd>
            <dd>
              <time dateTime={line.startingAt}>{line.startingAt}</time> –{' '}
              <time dateTime={line.endingBefore}>{line.endingBefore}</time>
            </dd>
          </div>
        ))}
        <div>
          <dt>{t`Due today`}</dt>
          <dd>{dueToday}</dd>
        </div>
      </dl>
      <p>{quote.disclosures.prepaidBalance}</p>
      <p>{quote.disclosures.managedServiceOwnership}</p>
      <p>{quote.disclosures.cancellation}</p>
      <p>
        {t`Before purchase, Stripe may ask you to complete a SetupIntent to save a payment method for the recurring services in this quote.`}
      </p>
      <Button
        title={t`Confirm and pay ${dueToday}`}
        variant="primary"
        disabled={isConfirming}
        onClick={() => openModal(CONFIRM_MANAGED_EMAIL_PURCHASE_MODAL_ID)}
      />
      <Button title={t`Back`} variant="secondary" onClick={onBack} />
      <ConfirmationModal
        modalInstanceId={CONFIRM_MANAGED_EMAIL_PURCHASE_MODAL_ID}
        title={t`Confirm managed email purchase`}
        subtitle={t`You are confirming the due-today amount and the recurring annual and monthly services shown in this quote.`}
        confirmButtonText={t`Confirm purchase`}
        confirmButtonAccent="brand"
        loading={isConfirming}
        onConfirmClick={async () => {
          await onConfirm();
        }}
      />
    </Section>
  );
};

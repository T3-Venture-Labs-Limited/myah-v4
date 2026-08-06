import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useLingui } from '@lingui/react/macro';
import { Status } from 'twenty-ui/data-display';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import { type ManagedEmailOperation } from '~/generated-metadata/graphql';

type ManagedEmailProgressProps = {
  onRetryPayment: () => void;
  operation: ManagedEmailOperation;
};

const paymentPresentation = (paymentStatus: string | null | undefined) => {
  switch (paymentStatus) {
    case 'PAID':
      return { color: 'green' as const, text: 'Payment received' };
    case 'PAYMENT_FAILED':
      return { color: 'red' as const, text: 'Payment failed' };
    default:
      return { color: 'orange' as const, text: 'Payment pending' };
  }
};

export const ManagedEmailProgress = ({
  onRetryPayment,
  operation,
}: ManagedEmailProgressProps) => {
  const { t } = useLingui();
  const { openModal } = useModal();
  const payment = paymentPresentation(operation.paymentStatus);
  const setupText = (() => {
    switch (operation.state) {
      case 'PROVIDER_SUCCEEDED':
        return t`Mailbox setup is complete.`;
      case 'PROVIDER_FAILED':
        return t`Mailbox setup needs attention.`;
      case 'PROVIDER_PARTIAL':
        return t`Mailbox setup partially completed and needs attention.`;
      case 'PROVIDER_INTENT_RECORDED':
      case 'RECONCILIATION_REQUIRED':
        return t`Mailbox setup is being reconciled.`;
      default:
        return operation.paymentStatus === 'PAID'
          ? t`Setup will continue from the saved operation.`
          : t`Setup starts only after payment is confirmed.`;
    }
  })();

  return (
    <Section>
      <H2Title
        title={t`Managed mailbox setup`}
        description={t`This order is saved. You can leave this page and return without losing progress.`}
      />
      <div aria-live="polite">
        <Status color={payment.color} text={payment.text} weight="medium" />
        <ol>
          <li>
            <strong>{t`Order saved`}</strong>
            <p>{t`Your quote and order identity are stored.`}</p>
          </li>
          <li>
            <strong>{t`Payment`}</strong>
            <p>{payment.text}</p>
          </li>
          <li>
            <strong>{t`Mailbox setup`}</strong>
            <p>{setupText}</p>
          </li>
          <li>
            <strong>{t`Warmup`}</strong>
            <p>{t`Readiness will appear here after mailbox setup.`}</p>
          </li>
        </ol>
      </div>
      {operation.paymentStatus === 'PAYMENT_FAILED' && (
        <>
          <Button
            title={t`Retry payment`}
            variant="primary"
            onClick={() => openModal('retry-managed-email-payment-modal')}
          />
          <ConfirmationModal
            modalInstanceId="retry-managed-email-payment-modal"
            title={t`Retry payment?`}
            subtitle={t`This retries the saved payment for this managed mailbox order.`}
            confirmButtonText={t`Retry payment`}
            confirmButtonAccent="brand"
            onConfirmClick={onRetryPayment}
          />
        </>
      )}
    </Section>
  );
};

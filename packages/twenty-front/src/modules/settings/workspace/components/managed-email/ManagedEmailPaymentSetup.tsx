import { useStripeAppearance } from '@/settings/billing/hooks/useStripeAppearance';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { Info } from 'twenty-ui/feedback';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';

export type ManagedEmailPaymentSetup = {
  clientSecret: string;
  publishableKey: string;
  ready: boolean;
  setupIntentId: string;
};

type ManagedEmailPaymentSetupProps = {
  paymentSetup: ManagedEmailPaymentSetup;
  onBack: () => void;
  onComplete: (setupIntentId: string) => Promise<void>;
};

type ManagedEmailPaymentSetupFormProps = Omit<
  ManagedEmailPaymentSetupProps,
  'paymentSetup'
> & {
  clientSecret: string;
  setupIntentId: string;
};

const ManagedEmailPaymentSetupForm = ({
  clientSecret,
  onBack,
  onComplete,
  setupIntentId,
}: ManagedEmailPaymentSetupFormProps) => {
  const { t } = useLingui();
  const { enqueueErrorSnackBar } = useSnackBar();
  const elements = useElements();
  const stripe = useStripe();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmCardSetup = async () => {
    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        enqueueErrorSnackBar({
          message:
            submitError.message ??
            t`Your payment details are incomplete. Please review and retry.`,
        });
        return;
      }

      const { error, setupIntent } = await stripe.confirmSetup({
        clientSecret,
        confirmParams: { return_url: window.location.href },
        elements,
        redirect: 'if_required',
      });
      if (error || setupIntent?.status !== 'succeeded') {
        enqueueErrorSnackBar({
          message:
            error?.message ??
            t`We could not confirm your payment method. Please retry.`,
        });
        return;
      }

      await onComplete(setupIntentId);
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not save your payment method. Please retry.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Section>
      <H2Title
        title={t`Set up payment`}
        description={t`Your card is saved securely by Stripe for this managed mailbox service. Your order will not be submitted until setup is complete.`}
      />
      <PaymentElement />
      <Button
        title={t`Save payment method`}
        variant="primary"
        disabled={!stripe || !elements || isSubmitting}
        isLoading={isSubmitting}
        onClick={() => void confirmCardSetup()}
      />
      <Button title={t`Back`} variant="secondary" onClick={onBack} />
    </Section>
  );
};

export const ManagedEmailPaymentSetup = ({
  paymentSetup,
  onBack,
  onComplete,
}: ManagedEmailPaymentSetupProps) => {
  const { t } = useLingui();
  const appearance = useStripeAppearance();
  const stripePromise = useMemo(
    () => loadStripe(paymentSetup.publishableKey),
    [paymentSetup.publishableKey],
  );

  if (!paymentSetup.clientSecret || !paymentSetup.publishableKey) {
    return (
      <Section>
        <Info
          accent="danger"
          text={t`Card payment is currently unavailable. Please retry or contact your workspace admin.`}
        />
        <Button title={t`Back`} variant="secondary" onClick={onBack} />
      </Section>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{ appearance, clientSecret: paymentSetup.clientSecret }}
    >
      <ManagedEmailPaymentSetupForm
        clientSecret={paymentSetup.clientSecret}
        onBack={onBack}
        onComplete={onComplete}
        setupIntentId={paymentSetup.setupIntentId}
      />
    </Elements>
  );
};

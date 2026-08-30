import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { useStripeAppearance } from '@/settings/billing/hooks/useStripeAppearance';
import { useStripePromise } from '@/settings/billing/hooks/useStripePromise';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { InlineBanner } from 'twenty-ui/feedback';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

import { type WorkspaceBillingSafeSummary } from './SettingsWorkspaceBillingContent';

export type CustomerFundingBillingDetails = {
  city: string;
  country: string;
  line1: string;
  line2: string | null;
  name: string;
  postalCode: string;
  state: string | null;
  taxIdType: string | null;
  taxIdValue: string | null;
};

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;
const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;
const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const PaymentSetupControl = ({
  clientSecret,
  details,
  onComplete,
  setupIntentId,
}: {
  clientSecret: string;
  details: CustomerFundingBillingDetails;
  onComplete: (
    setupIntentId: string | null,
    details: CustomerFundingBillingDetails,
  ) => Promise<void>;
  setupIntentId: string;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { enqueueErrorSnackBar } = useSnackBar();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!isDefined(stripe) || !isDefined(elements)) return;
    setIsSubmitting(true);

    try {
      const { error: submitError } = await elements.submit();
      if (isDefined(submitError)) throw submitError;
      const { error, setupIntent } = await stripe.confirmSetup({
        clientSecret,
        elements,
        redirect: 'if_required',
      });
      if (isDefined(error)) throw error;
      if (setupIntent?.status !== 'succeeded') {
        throw new Error('Stripe SetupIntent was not completed');
      }
      await onComplete(setupIntentId, details);
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : t`Payment details could not be saved.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PaymentElement />
      <Button
        title={t`Save payment details`}
        accent="brand"
        disabled={isSubmitting}
        isLoading={isSubmitting}
        onClick={handleSubmit}
      />
    </>
  );
};

export const ManagedProviderCustomerFundingPaymentForm = ({
  billingSummary,
  clientSecret,
  onCancel,
  onComplete,
  setupIntentId,
}: {
  billingSummary: WorkspaceBillingSafeSummary | null;
  clientSecret: string | null;
  onCancel: () => void;
  onComplete: (
    setupIntentId: string | null,
    details: CustomerFundingBillingDetails,
  ) => Promise<void>;
  setupIntentId: string | null;
}) => {
  const stripePromise = useStripePromise();
  const appearance = useStripeAppearance();
  const [details, setDetails] = useState<CustomerFundingBillingDetails>({
    city: billingSummary?.address.city ?? '',
    country: billingSummary?.address.country ?? '',
    line1: billingSummary?.address.line1 ?? '',
    line2: billingSummary?.address.line2 ?? null,
    name: billingSummary?.name ?? '',
    postalCode: billingSummary?.address.postalCode ?? '',
    state: billingSummary?.address.state ?? null,
    taxIdType: billingSummary?.taxId?.type ?? null,
    taxIdValue: null,
  });
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const set = (field: keyof CustomerFundingBillingDetails, value: string) =>
    setDetails((current) => ({ ...current, [field]: value || null }));
  const canSave =
    details.name.trim() !== '' &&
    details.line1.trim() !== '' &&
    details.city.trim() !== '' &&
    details.postalCode.trim() !== '' &&
    /^[A-Za-z]{2}$/.test(details.country);

  const saveAddressOnly = async () => {
    if (!canSave) return;
    setIsSavingAddress(true);
    try {
      await onComplete(null, details);
    } finally {
      setIsSavingAddress(false);
    }
  };

  return (
    <Section>
      <H2Title
        title={t`Payment & billing details`}
        description={t`Stripe uses this address to calculate applicable tax.`}
      />
      <StyledForm>
        <StyledGrid>
          <SettingsTextInput
            instanceId="managed-ai-billing-name"
            label={t`Billing name`}
            value={details.name}
            onChange={(value) => set('name', value)}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-line-1"
            label={t`Address line 1`}
            value={details.line1}
            onChange={(value) => set('line1', value)}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-line-2"
            label={t`Address line 2 (optional)`}
            value={details.line2 ?? ''}
            onChange={(value) => set('line2', value)}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-city"
            label={t`City`}
            value={details.city}
            onChange={(value) => set('city', value)}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-state"
            label={t`State / region (optional)`}
            value={details.state ?? ''}
            onChange={(value) => set('state', value)}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-postal-code"
            label={t`Postal code`}
            value={details.postalCode}
            onChange={(value) => set('postalCode', value)}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-country"
            label={t`Country code`}
            value={details.country}
            onChange={(value) => set('country', value.toUpperCase())}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-tax-id-type"
            label={t`Tax ID type (optional)`}
            value={details.taxIdType ?? ''}
            onChange={(value) => set('taxIdType', value)}
          />
          <SettingsTextInput
            instanceId="managed-ai-billing-tax-id-value"
            label={t`Tax ID value (optional)`}
            value={details.taxIdValue ?? ''}
            onChange={(value) => set('taxIdValue', value)}
          />
        </StyledGrid>
        {clientSecret !== null && setupIntentId !== null ? (
          isDefined(stripePromise) ? (
            <Elements
              key={clientSecret}
              stripe={stripePromise}
              options={{ appearance, clientSecret }}
            >
              <PaymentSetupControl
                clientSecret={clientSecret}
                details={details}
                onComplete={onComplete}
                setupIntentId={setupIntentId}
              />
            </Elements>
          ) : (
            <InlineBanner
              color="danger"
              message={t`Card payment is currently unavailable.`}
            />
          )
        ) : (
          <Button
            title={t`Save billing details`}
            accent="brand"
            disabled={!canSave || isSavingAddress}
            isLoading={isSavingAddress}
            onClick={saveAddressOnly}
          />
        )}
        <StyledActions>
          <Button title={t`Cancel`} variant="secondary" onClick={onCancel} />
        </StyledActions>
      </StyledForm>
    </Section>
  );
};

const PaymentActionControl = ({
  clientSecret,
  onConfirmed,
}: {
  clientSecret: string;
  onConfirmed: () => Promise<void>;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { enqueueErrorSnackBar } = useSnackBar();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirm = async () => {
    if (!isDefined(stripe) || !isDefined(elements)) return;
    setIsSubmitting(true);
    try {
      const { error: submitError } = await elements.submit();
      if (isDefined(submitError)) throw submitError;
      const { error } = await stripe.confirmPayment({
        clientSecret,
        elements,
        redirect: 'if_required',
      });
      if (isDefined(error)) throw error;
      await onConfirmed();
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : t`Payment authentication could not be completed.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StyledForm>
      <PaymentElement />
      <Button
        title={t`Authenticate payment`}
        accent="brand"
        disabled={isSubmitting}
        isLoading={isSubmitting}
        onClick={confirm}
      />
    </StyledForm>
  );
};

export const ManagedProviderCustomerFundingPaymentActionForm = ({
  clientSecret,
  onCancel,
  onConfirmed,
}: {
  clientSecret: string;
  onCancel: () => void;
  onConfirmed: () => Promise<void>;
}) => {
  const stripePromise = useStripePromise();
  const appearance = useStripeAppearance();

  return (
    <Section>
      <H2Title
        title={t`Authenticate payment`}
        description={t`Complete the additional authentication requested by your payment provider.`}
      />
      {isDefined(stripePromise) ? (
        <Elements
          key={clientSecret}
          stripe={stripePromise}
          options={{ appearance, clientSecret }}
        >
          <PaymentActionControl
            clientSecret={clientSecret}
            onConfirmed={onConfirmed}
          />
        </Elements>
      ) : (
        <InlineBanner
          color="danger"
          message={t`Card payment is currently unavailable.`}
        />
      )}
      <StyledActions>
        <Button title={t`Cancel`} variant="secondary" onClick={onCancel} />
      </StyledActions>
    </Section>
  );
};

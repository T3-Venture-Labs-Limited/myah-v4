import {
  MANAGED_OPENROUTER_EVENT_TYPE,
  MANAGED_OPENROUTER_MODEL_IDS,
  MANAGED_OPENROUTER_PROVIDER_NAME,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

import { type MetronomeUsagePreview } from '../services/metronome-client.service';

export const isApprovedFreeManagedOpenRouterOperation = ({
  providerKey,
  providerConfigurationKey,
  metronomeEventType,
}: {
  providerKey: string;
  providerConfigurationKey: string;
  metronomeEventType: string;
}): boolean =>
  providerKey === MANAGED_OPENROUTER_PROVIDER_NAME &&
  providerConfigurationKey === 'openrouter/google/gemma-4-31b-it:free' &&
  MANAGED_OPENROUTER_MODEL_IDS.includes(
    providerConfigurationKey as (typeof MANAGED_OPENROUTER_MODEL_IDS)[number],
  ) &&
  metronomeEventType === MANAGED_OPENROUTER_EVENT_TYPE;

export const getValidatedMetronomeUsageAmountCents = ({
  contractId,
  customerId,
  expectedProductIds,
  preview,
  allowZeroAmount = false,
}: {
  contractId: string;
  customerId: string;
  expectedProductIds: string[];
  preview: MetronomeUsagePreview;
  allowZeroAmount?: boolean;
}): bigint => {
  if (preview.invoices.length !== 1) {
    throw new Error('Metronome usage preview is ambiguous');
  }

  const invoice = preview.invoices[0];

  if (invoice.customerId !== customerId || invoice.contractId !== contractId) {
    throw new Error('Metronome usage preview does not match the workspace');
  }

  const usageTotals = invoice.lineItems.map((lineItem) => {
    if (
      lineItem.type !== 'usage' ||
      !lineItem.productId ||
      !expectedProductIds.includes(lineItem.productId) ||
      !Number.isSafeInteger(lineItem.total) ||
      lineItem.total < 0
    ) {
      throw new Error('Metronome usage preview is ambiguous');
    }

    return BigInt(lineItem.total);
  });
  if (usageTotals.length === 0) {
    throw new Error('Metronome usage preview is ambiguous');
  }
  const amountCents = usageTotals.reduce(
    (total, lineItemTotal) => total + lineItemTotal,
    BigInt(0),
  );

  if (amountCents <= BigInt(0) && !allowZeroAmount) {
    throw new Error('Metronome usage preview is ambiguous');
  }

  return amountCents;
};

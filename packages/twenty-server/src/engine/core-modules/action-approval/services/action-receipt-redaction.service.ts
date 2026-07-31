import { Injectable } from '@nestjs/common';

import {
  type AcceptedProviderOutcome,
  type ProviderAcceptedOutcomeInput,
  type SafeActionExecutionReceipt,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';

const SAFE_PROVIDER_OUTCOME_CODES: Record<
  AcceptedProviderOutcome['code'],
  true
> = {
  accepted: true,
  queued: true,
};

const isAcceptedProviderOutcomeCode = (
  code: string,
): code is AcceptedProviderOutcome['code'] =>
  Object.prototype.hasOwnProperty.call(SAFE_PROVIDER_OUTCOME_CODES, code);

const isUnsafeProviderIdentifier = (value: string): boolean =>
  value.length === 0 || value.length > 998 || /[\r\n]/.test(value);

@Injectable()
export class ActionReceiptRedactionService {
  toAcceptedProviderOutcome(
    input: ProviderAcceptedOutcomeInput,
  ): AcceptedProviderOutcome {
    if (!isAcceptedProviderOutcomeCode(input.code)) {
      throw new Error('Unsafe provider outcome');
    }

    for (const [name, value] of [
      ['message', input.providerMessageId],
      ['external message', input.providerExternalMessageId],
      ['thread', input.providerThreadExternalId],
    ] as const) {
      if (value !== undefined && isUnsafeProviderIdentifier(value)) {
        throw new Error(`Unsafe provider ${name} id`);
      }
    }

    return {
      code: input.code,
      acceptedAt: input.acceptedAt,
      ...(input.providerMessageId === undefined
        ? {}
        : { providerMessageId: input.providerMessageId }),
      ...(input.providerExternalMessageId === undefined
        ? {}
        : { providerExternalMessageId: input.providerExternalMessageId }),
      ...(input.providerThreadExternalId === undefined
        ? {}
        : { providerThreadExternalId: input.providerThreadExternalId }),
    };
  }

  toSafeReceipt<
    T extends {
      id: string;
      workspaceId: string;
      state: string;
      providerCode: string | null;
      redactedOutcome: string | null;
      updatedAt: Date;
    },
  >(receipt: T): SafeActionExecutionReceipt {
    return {
      id: receipt.id,
      workspaceId: receipt.workspaceId,
      state: receipt.state,
      providerCode: receipt.providerCode,
      outcome: receipt.redactedOutcome,
      occurredAt: receipt.updatedAt,
    };
  }
}

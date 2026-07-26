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

@Injectable()
export class ActionReceiptRedactionService {
  toAcceptedProviderOutcome(
    input: ProviderAcceptedOutcomeInput,
  ): AcceptedProviderOutcome {
    if (!isAcceptedProviderOutcomeCode(input.code)) {
      throw new Error('Unsafe provider outcome');
    }

    if (
      input.providerMessageId !== undefined &&
      (input.providerMessageId.length === 0 ||
        input.providerMessageId.length > 998 ||
        /[\r\n]/.test(input.providerMessageId))
    ) {
      throw new Error('Unsafe provider message id');
    }

    return {
      code: input.code,
      acceptedAt: input.acceptedAt,
      ...(input.providerMessageId === undefined
        ? {}
        : { providerMessageId: input.providerMessageId }),
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

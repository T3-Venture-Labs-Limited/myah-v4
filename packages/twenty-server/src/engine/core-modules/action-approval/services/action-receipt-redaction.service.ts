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

    return {
      code: input.code,
      acceptedAt: input.acceptedAt,
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

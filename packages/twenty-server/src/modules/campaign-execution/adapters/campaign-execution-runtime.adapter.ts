import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';

import {
  type CampaignExecutionIdentityPort,
  type CampaignInitialDueTimePort,
} from 'src/modules/campaign-execution/types/campaign-execution.type';

@Injectable()
export class CampaignExecutionIdentityAdapter implements CampaignExecutionIdentityPort {
  generateActivationId = randomUUID;
  generateEnrollmentId = randomUUID;
  generateOccurrenceId = randomUUID;
}

const localDateTime = (
  date: Temporal.PlainDate,
  localTime: string,
): Temporal.PlainDateTime =>
  date.toPlainDateTime(Temporal.PlainTime.from(localTime));

@Injectable()
export class CampaignInitialDueTimeAdapter implements CampaignInitialDueTimePort {
  adjustInitialDueAt(
    input: Parameters<CampaignInitialDueTimePort['adjustInitialDueAt']>[0],
  ): string {
    if (!Number.isSafeInteger(input.delaySeconds) || input.delaySeconds < 0) {
      throw new Error('Initial due time delay was invalid');
    }

    try {
      const delayed = Temporal.Instant.from(input.anchorAt).add({
        seconds: input.delaySeconds,
      });
      const zoned = delayed.toZonedDateTimeISO(input.window.timeZone);
      const localTime = zoned.toPlainTime();
      const start = Temporal.PlainTime.from(input.window.startLocalTime);
      const end = Temporal.PlainTime.from(input.window.endLocalTime);

      if (Temporal.PlainTime.compare(start, end) >= 0) {
        throw new Error('Initial due time window was invalid');
      }

      if (
        Temporal.PlainTime.compare(localTime, start) >= 0 &&
        Temporal.PlainTime.compare(localTime, end) < 0
      ) {
        return delayed.toString({ smallestUnit: 'millisecond' });
      }

      let date =
        Temporal.PlainTime.compare(localTime, start) < 0
          ? zoned.toPlainDate()
          : zoned.toPlainDate().add({ days: 1 });

      for (let dayOffset = 0; dayOffset < 370; dayOffset += 1) {
        const adjustedZoned = localDateTime(
          date,
          input.window.startLocalTime,
        ).toZonedDateTime(input.window.timeZone, {
          disambiguation: 'compatible',
        });
        const resolvedLocalTime = adjustedZoned.toPlainTime();
        const adjusted = adjustedZoned.toInstant();

        if (
          Temporal.Instant.compare(adjusted, delayed) >= 0 &&
          Temporal.PlainTime.compare(resolvedLocalTime, start) >= 0 &&
          Temporal.PlainTime.compare(resolvedLocalTime, end) < 0
        ) {
          return adjusted.toString({ smallestUnit: 'millisecond' });
        }

        date = date.add({ days: 1 });
      }

      throw new Error('Initial due time window had no usable local interval');
    } catch {
      throw new Error('Initial due time could not be represented');
    }
  }
}

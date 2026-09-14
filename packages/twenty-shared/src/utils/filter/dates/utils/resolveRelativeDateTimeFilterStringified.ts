import { relativeDateFilterStringifiedSchema } from '@/utils/filter/dates/utils/relativeDateFilterStringifiedSchema';
import { resolveRelativeDateTimeFilter } from '@/utils/filter/dates/utils/resolveRelativeDateTimeFilter';
import { isNonEmptyString } from '@sniptt/guards';
import { Temporal } from 'temporal-polyfill';

export const resolveRelativeDateTimeFilterStringified = (
  relativeDateTimeFilterStringified: string | null | undefined,
) => {
  if (!isNonEmptyString(relativeDateTimeFilterStringified)) {
    return null;
  }

  const relativeDateFilterParseResult =
    relativeDateFilterStringifiedSchema.safeParse(
      relativeDateTimeFilterStringified,
    );

  if (relativeDateFilterParseResult.success) {
    const relativeDateFilter = relativeDateFilterParseResult.data;

    const referenceTodayZonedDateTime = Temporal.Now.zonedDateTimeISO(
      relativeDateFilter.timezone ?? undefined,
    );

    const relativeDateFilterWithDateRange = resolveRelativeDateTimeFilter(
      relativeDateFilter,
      referenceTodayZonedDateTime.round({ smallestUnit: 'second' }),
    );

    return relativeDateFilterWithDateRange;
  } else {
    return null;
  }
};

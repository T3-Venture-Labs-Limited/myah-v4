import { z } from 'zod';

export const isCanonicalManagedMailboxId = (
  value: unknown,
): value is string =>
  typeof value === 'string' &&
  value === value.trim() &&
  z.uuid().safeParse(value).success;

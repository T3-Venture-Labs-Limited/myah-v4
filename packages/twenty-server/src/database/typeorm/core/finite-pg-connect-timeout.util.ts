/**
 * Pool checkout must never inherit pg's unlimited (zero) default. Reuse the
 * primary/replica query budget when it is a positive timer-safe integer;
 * missing, zero, negative, fractional, non-finite or oversized values use 10s.
 * TypeORM maps connectTimeoutMS to pg-pool connectionTimeoutMillis at creation.
 */
export const finitePgConnectTimeout = (configured: unknown): number => {
  const value = Number(configured);
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647
    ? value
    : 10_000;
};

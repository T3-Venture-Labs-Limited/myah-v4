const RATE_SCALE = BigInt(1_000_000);
const MICROUSD_PER_CENT = BigInt(10_000);

type RatedUnits = {
  rate: number;
  units: number;
};

export const getManagedOpenRouterChargeCentUnits = ({
  cashPaidMicrousd,
  ratedUnits,
  usableCreditsReceivedMicrousd,
}: {
  cashPaidMicrousd: string;
  ratedUnits: RatedUnits[];
  usableCreditsReceivedMicrousd: string;
}): number => {
  if (
    !/^[1-9]\d*$/.test(cashPaidMicrousd) ||
    !/^[1-9]\d*$/.test(usableCreditsReceivedMicrousd) ||
    ratedUnits.length === 0
  ) {
    throw new Error('Invalid managed OpenRouter tariff evidence');
  }

  const cashPaid = BigInt(cashPaidMicrousd);
  const usableCredits = BigInt(usableCreditsReceivedMicrousd);

  if (cashPaid < usableCredits) {
    throw new Error('Invalid managed OpenRouter tariff evidence');
  }

  const scaledRetailMicrousd = ratedUnits.reduce((total, item) => {
    if (!Number.isSafeInteger(item.units) || item.units < 0) {
      throw new Error('Invalid managed OpenRouter tariff evidence');
    }

    return total + BigInt(item.units) * getScaledRate(item.rate);
  }, BigInt(0));
  const denominator = usableCredits * RATE_SCALE * MICROUSD_PER_CENT;
  const chargeCentUnits = divideCeiling(
    scaledRetailMicrousd * cashPaid,
    denominator,
  );
  const billableChargeCentUnits =
    chargeCentUnits > BigInt(0) ? chargeCentUnits : BigInt(1);

  if (billableChargeCentUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Managed OpenRouter charge exceeds the safe integer range');
  }

  return Number(billableChargeCentUnits);
};

const getScaledRate = (rate: number): bigint => {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('Invalid managed OpenRouter tariff evidence');
  }

  const scaledRate = Math.round(rate * Number(RATE_SCALE));

  if (!Number.isSafeInteger(scaledRate)) {
    throw new Error('Invalid managed OpenRouter tariff evidence');
  }

  return BigInt(scaledRate);
};

const divideCeiling = (numerator: bigint, denominator: bigint): bigint =>
  numerator === BigInt(0)
    ? BigInt(0)
    : (numerator + denominator - BigInt(1)) / denominator;

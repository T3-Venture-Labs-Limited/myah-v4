const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeCampaignCreatorEmail = (
  value: unknown,
): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 && EMAIL_PATTERN.test(normalized)
    ? normalized
    : null;
};

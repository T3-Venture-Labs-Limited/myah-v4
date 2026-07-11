const BRAND_WORK_KEYWORD_PATTERNS = [
  /\bads?\b/i,
  /\baffiliate\b/i,
  /\baffiliates\b/i,
  /\bangles?\b/i,
  /\bbrief\b/i,
  /\bcampaigns?\b/i,
  /\bclaims?\b/i,
  /\bcommission\b/i,
  /\bmarker\b/i,
  /\bcontent\s+guidelines?\b/i,
  /\bcopy\b/i,
  /\bcreator\b/i,
  /\bemail\s+copy\b/i,
  /\binfluencer\b/i,
  /\blanding\s+page\b/i,
  /\boffer\b/i,
  /\boutreach\b/i,
  /\bpositioning\b/i,
  /\bproduct\s+page\b/i,
  /\bsocial\b/i,
  /\bsms\b/i,
  /\btiktok\b/i,
];

const MISSING_BRAND_WORK_PATTERNS = [
  /\bads?\b/i,
  /\bad\s+copy\b/i,
  /\baffiliate\b/i,
  /\baffiliate\s+campaign\b/i,
  /\bbrief\b/i,
  /\bcampaigns?\b/i,
  /\bclaims?\b/i,
  /\bcommission\b/i,
  /\bmarker\b/i,
  /\bcontent\s+guidelines?\b/i,
  /\bcopy\b/i,
  /\bcreator\b/i,
  /\bcreator\s+outreach\b/i,
  /\bemail\s+copy\b/i,
  /\binfluencer\b/i,
  /\blanding\s+page\b/i,
  /\boffer\b/i,
  /\boutreach\b/i,
  /\bpositioning\b/i,
  /\bproduct\s+page\b/i,
];

const GENERIC_EXPLANATION_PATTERNS = [
  /\bexplain\b/i,
  /\bwhat\s+is\b/i,
  /\bdefine\b/i,
  /\bhow\s+does\b/i,
];

const GENERIC_BRAND_CANDIDATES = new Set([
  'affiliate marketing',
  'content marketing',
  'creator marketing',
  'influencer marketing',
  'social media marketing',
]);

const NON_BRAND_CANDIDATES = new Set([
  'accounting team',
  'affiliates',
  'note',
  'record',
  'sarah',
  'team',
  'this record',
]);

export const extractBrandNameForBrandWork = (
  message: string,
): string | null => {
  if (!hasBrandWorkKeyword(message)) {
    return null;
  }

  return extractBrandNameCandidate(message);
};

export const isBrandSpecificTask = (message: string): boolean => {
  if (!hasBrandWorkKeyword(message)) {
    return false;
  }

  if (extractBrandNameCandidate(message)) {
    return true;
  }

  const explicitlyGeneric = GENERIC_EXPLANATION_PATTERNS.some((pattern) =>
    pattern.test(message),
  );

  if (explicitlyGeneric) {
    return false;
  }

  return MISSING_BRAND_WORK_PATTERNS.some((pattern) => pattern.test(message));
};

export const slugifyBrandName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const escapeXmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const extractBrandNameCandidate = (message: string): string | null => {
  const normalized = message.replace(/\s+/g, ' ').trim();

  const exactQuotedCandidate = extractExactQuotedBrand(normalized);

  if (exactQuotedCandidate) {
    return exactQuotedCandidate;
  }

  const questionCandidate = extractBrandFromQuestion(normalized);

  if (questionCandidate) {
    return questionCandidate;
  }

  const titleCaseCandidate = extractTitleCaseBrandBeforeWorkKeyword(normalized);

  if (titleCaseCandidate) {
    return titleCaseCandidate;
  }

  const patterns = [
    /\bfor\s+(.+?)(?=\s+(?:if|include|use|using|with|based|from|without|and)\b|[.!?;,]|$)/i,
    /\babout\s+(.+?)(?=\s+(?:if|include|use|using|with|based|from|without|and)\b|[.!?;,]|$)/i,
    /\bbrand\s+(.+?)(?=\s+(?:if|include|use|using|with|based|from|without|and)\b|[.!?;,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1] ? cleanBrandCandidate(match[1]) : '';

    if (isUsableBrandCandidate(candidate)) {
      return candidate;
    }
  }

  return null;
};

const cleanBrandCandidate = (candidate: string): string =>
  candidate
    .replace(/^the\s+/i, '')
    .replace(/^brand\s+/i, '')
    .replace(/^client\s+/i, '')
    .replace(/^company\s+/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/(?:'s|’s)$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[,:;!?]+$/g, '')
    .replace(/\.$/, '')
    .trim();

const hasBrandWorkKeyword = (message: string): boolean =>
  BRAND_WORK_KEYWORD_PATTERNS.some((pattern) => pattern.test(message));

const extractExactQuotedBrand = (normalizedMessage: string): string | null => {
  const match = normalizedMessage.match(
    /\b(?:for\s+(?:exactly\s+|brand\s+slug\s+|brand\s+)?|exactly\s+|brand\s+(?:slug\s+)?)['"“”‘’]([^'"“”‘’]+)['"“”‘’]/i,
  );
  const candidate = match?.[1] ? cleanBrandCandidate(match[1]) : '';

  return isUsableBrandCandidate(candidate) ? candidate : null;
};

const extractBrandFromQuestion = (normalizedMessage: string): string | null => {
  const match = normalizedMessage.match(
    /\b(?:what\s+is|explain|summarize|review)\s+(.+?)(?:'s|’s)?\s+(?:positioning|creator\s+offer|content\s+guidelines?|offer|audience|products?|product\s+page|social\s+channels?)\b/i,
  );
  const candidate = match?.[1] ? cleanBrandCandidate(match[1]) : '';

  return isUsableBrandCandidate(candidate) ? candidate : null;
};

const extractTitleCaseBrandBeforeWorkKeyword = (
  normalizedMessage: string,
): string | null => {
  const match = normalizedMessage.match(
    /(?:^|[:.!?]\s+)(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:create|draft|generate|make|plan|prepare|produce|write)\s+(.+?)\s+(?:ads?|affiliate|angles?|brief|campaigns?|claims?|content\s+guidelines?|copy|creator|email\s+copy|influencer|offer|outreach|positioning|social|sms|tiktok)\b/i,
  );
  const candidate = match?.[1] ? cleanBrandCandidate(match[1]) : '';

  return isUsableBrandCandidate(candidate) &&
    looksLikeSpecificBrandName(candidate)
    ? candidate
    : null;
};

const isUsableBrandCandidate = (candidate: string): boolean => {
  if (!candidate) {
    return false;
  }

  const normalizedCandidate = candidate.toLowerCase();

  if (
    GENERIC_BRAND_CANDIDATES.has(normalizedCandidate) ||
    NON_BRAND_CANDIDATES.has(normalizedCandidate)
  ) {
    return false;
  }

  return looksLikeSpecificBrandName(candidate);
};

const looksLikeSpecificBrandName = (candidate: string): boolean =>
  /[A-Z0-9]/.test(candidate) || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(candidate);

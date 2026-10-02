export const extractInReplyToTokens = (value?: string | null): string[] =>
  value?.match(/<[^<>\s]+>/g) ?? [];

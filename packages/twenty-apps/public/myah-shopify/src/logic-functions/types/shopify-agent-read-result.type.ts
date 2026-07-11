export type ShopifyAgentReadResult = {
  success: boolean;
  connected: boolean;
  error?: string;
  data?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  scopes?: string[];
};

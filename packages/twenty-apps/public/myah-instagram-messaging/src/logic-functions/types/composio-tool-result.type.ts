export type ComposioToolError = {
  message?: string;
  code?: number;
  error_subcode?: number;
};

export type ComposioToolResponse = {
  data?: unknown;
  error?: ComposioToolError | string;
  message?: string;
  successful?: boolean;
  successfull?: boolean;
  status_code?: number;
  mercury_last_http_status_code?: number;
};

export type ComposioExecutionResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: number;
  errorSubcode?: number;
  retryable?: boolean;
  status?: number;
};

export type SanitizedPaging = {
  cursors?: {
    after?: string;
    before?: string;
  };
};

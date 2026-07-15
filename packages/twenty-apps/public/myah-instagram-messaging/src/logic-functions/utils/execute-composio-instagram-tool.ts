import {
  COMPOSIO_API_BASE_URL,
  type InstagramToolSlug,
} from 'src/logic-functions/constants/composio-instagram.constants';
import {
  type ComposioExecutionResult,
  type ComposioToolError,
  type ComposioToolResponse,
} from 'src/logic-functions/types/composio-tool-result.type';

const getComposioApiKey = (): string | undefined => {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();

  return apiKey === '' ? undefined : apiKey;
};

const getComposioUserId = (): string | undefined => {
  const resolvedUserId = process.env.MYAH_COMPOSIO_USER_ID?.trim();

  return resolvedUserId === '' ? undefined : resolvedUserId;
};

const redactExternalErrorMessage = (message: string): string =>
  message
    .replace(/https?:\/\/\S+/g, '[redacted-url]')
    .replace(/\baccess_token=[^\s&]+/gi, 'access_token=[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/\bx-api-key\b\s*[:=]\s*[^\s,;]+/gi, 'x-api-key=[redacted]');

const parseEmbeddedGraphApiError = (
  message?: string,
): ComposioToolError | undefined => {
  if (!message) {
    return undefined;
  }

  const jsonStart = message.indexOf('{');

  if (jsonStart === -1) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as {
      error?: ComposioToolError;
    };

    return parsed.error;
  } catch {
    return undefined;
  }
};

const resolveNestedStatus = (
  body: ComposioToolResponse,
): number | undefined => {
  const data = body.data as { status_code?: number } | undefined;

  return (
    body.mercury_last_http_status_code ?? body.status_code ?? data?.status_code
  );
};

const isFailedComposioExecution = (body: ComposioToolResponse): boolean =>
  body.successful === false || body.successfull === false;

const extractError = (
  body: ComposioToolResponse,
): Required<Pick<ComposioExecutionResult, 'error'>> &
  Pick<ComposioExecutionResult, 'errorCode' | 'errorSubcode'> => {
  const error = body.error;
  const errorMessage = typeof error === 'string' ? error : error?.message;
  const embeddedGraphApiError = parseEmbeddedGraphApiError(
    errorMessage ?? body.message,
  );

  return {
    error: redactExternalErrorMessage(
      embeddedGraphApiError?.message ??
        errorMessage ??
        body.message ??
        'Composio tool execution failed.',
    ),
    errorCode:
      embeddedGraphApiError?.code ??
      (typeof error === 'string' ? undefined : error?.code),
    errorSubcode:
      embeddedGraphApiError?.error_subcode ??
      (typeof error === 'string' ? undefined : error?.error_subcode),
  };
};

const isRetryable = ({ status }: { status: number }) =>
  status === 429 || status >= 500;

export const executeComposioInstagramTool = async ({
  toolSlug,
  connectedAccountId,
  arguments: toolArguments,
}: {
  toolSlug: InstagramToolSlug;
  connectedAccountId: string;
  arguments: Record<string, unknown>;
}): Promise<ComposioExecutionResult> => {
  const apiKey = getComposioApiKey();

  if (!apiKey) {
    return {
      success: false,
      error: 'COMPOSIO_API_KEY is required to read Instagram data.',
    };
  }

  let response: Response;

  try {
    response = await fetch(
      `${COMPOSIO_API_BASE_URL}/tools/execute/${toolSlug}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          connected_account_id: connectedAccountId,
          ...(getComposioUserId() ? { user_id: getComposioUserId() } : {}),
          arguments: toolArguments,
        }),
      },
    );
  } catch (error) {
    return {
      success: false,
      error: redactExternalErrorMessage(
        `Composio request failed: ${(error as Error).message}`,
      ),
      retryable: true,
    };
  }

  let body: ComposioToolResponse;

  try {
    body = (await response.json()) as ComposioToolResponse;
  } catch (error) {
    return {
      success: false,
      error: redactExternalErrorMessage(
        `Composio returned a non-JSON response: ${(error as Error).message}`,
      ),
      retryable: response.status >= 500,
      status: response.status,
    };
  }

  if (!response.ok || body.error || isFailedComposioExecution(body)) {
    const parsedError = extractError(body);
    const effectiveStatus = resolveNestedStatus(body) ?? response.status;

    return {
      success: false,
      ...parsedError,
      retryable: isRetryable({ status: effectiveStatus }),
      status: effectiveStatus,
    };
  }

  return {
    success: true,
    data: body.data ?? body,
    status: response.status,
  };
};

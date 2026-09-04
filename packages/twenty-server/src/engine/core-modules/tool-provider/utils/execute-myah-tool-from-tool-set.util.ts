import { HttpException, HttpStatus } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { type ToolCategory } from 'twenty-shared/ai';

import { executeToolFromToolSet } from 'src/engine/core-modules/tool-provider/utils/execute-tool-from-tool-set.util';
import {
  type ToolOutcomeCategory,
  type ToolOutput,
} from 'src/engine/core-modules/tool/types/tool-output.type';

const failureMessageByCategory: Record<
  Exclude<ToolOutcomeCategory, 'SUCCESS'>,
  string
> = {
  NOT_FOUND: 'The requested Myah record was not found.',
  PERMISSION_DENIED: 'You do not have permission to perform this Myah action.',
  VALIDATION_FAILED: 'The requested Myah action was invalid.',
  CONFLICT: 'The Myah record changed before this action completed.',
  ALREADY_EXISTS: 'The requested Myah relationship already exists.',
  NOT_READY: 'The requested Myah action is not ready.',
  PENDING: 'The requested Myah action is still pending.',
  FAILED: 'The requested Myah action could not be completed.',
  UNKNOWN: 'The requested Myah action has an unknown outcome.',
};

const isToolOutput = (value: unknown): value is ToolOutput =>
  typeof value === 'object' &&
  value !== null &&
  'success' in value &&
  typeof value.success === 'boolean' &&
  'message' in value &&
  typeof value.message === 'string';

const categoryFromDomainStatus = (
  status: unknown,
): Exclude<ToolOutcomeCategory, 'SUCCESS'> | null => {
  if (typeof status !== 'string') return null;

  switch (status) {
    case 'CONFLICT':
    case 'STALE':
      return 'CONFLICT';
    case 'ALREADY_EXISTS':
      return 'ALREADY_EXISTS';
    case 'NOT_READY':
    case 'THREAD_UNAVAILABLE':
    case 'SENDER_UNAVAILABLE':
    case 'RECIPIENT_UNAVAILABLE':
    case 'RECONNECT_REQUIRED':
    case 'MAILBOX_INELIGIBLE':
      return 'NOT_READY';
    case 'PENDING':
    case 'SENDING':
    case 'OUTCOME_PENDING':
      return 'PENDING';
    case 'FAILED':
      return 'FAILED';
    case 'UNKNOWN':
    case 'OUTCOME_UNKNOWN':
      return 'UNKNOWN';
    default:
      return null;
  }
};

const categoryFromError = (
  error: unknown,
): Exclude<ToolOutcomeCategory, 'SUCCESS'> => {
  if (error instanceof HttpException) {
    switch (error.getStatus()) {
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.UNAUTHORIZED:
      case HttpStatus.FORBIDDEN:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_FAILED';
    }
  }

  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : '';
  const message =
    error instanceof Error ? error.message.toLocaleLowerCase() : '';

  if (message.includes('not found') || message.includes('inaccessible')) {
    return 'NOT_FOUND';
  }
  if (message.includes('not ready') || message.includes('unavailable')) {
    return 'NOT_READY';
  }
  if (message.includes('conflict') || message.includes('stale')) {
    return 'CONFLICT';
  }

  if (code.includes('NOT_FOUND')) return 'NOT_FOUND';
  if (code.includes('FORBIDDEN')) return 'NOT_FOUND';
  if (code.includes('PERMISSION') || code.includes('AUTH')) {
    return 'PERMISSION_DENIED';
  }
  if (code.includes('CONFLICT') || code.includes('STALE')) return 'CONFLICT';
  if (code.includes('ALREADY_EXISTS')) return 'ALREADY_EXISTS';
  if (code.includes('NOT_READY') || code.includes('UNAVAILABLE'))
    return 'NOT_READY';
  if (code.includes('PENDING')) return 'PENDING';
  if (code.includes('UNKNOWN')) return 'UNKNOWN';
  if (
    code.includes('VALIDATION') ||
    code.includes('INVALID') ||
    code.includes('BAD_REQUEST') ||
    code.includes('TOO_MANY')
  )
    return 'VALIDATION_FAILED';

  return 'FAILED';
};

export const executeMyahToolFromToolSet = async (
  toolSet: ToolSet,
  toolName: string,
  args: Record<string, unknown>,
  category: ToolCategory,
): Promise<ToolOutput> => {
  try {
    const result = (await executeToolFromToolSet(
      toolSet,
      toolName,
      args,
      category,
    )) as unknown;

    if (isToolOutput(result)) {
      const nestedResult =
        result.result && typeof result.result === 'object'
          ? result.result
          : undefined;
      const nestedFailureCategory = categoryFromDomainStatus(
        nestedResult && 'status' in nestedResult
          ? nestedResult.status
          : nestedResult && 'outcome' in nestedResult
            ? nestedResult.outcome
            : undefined,
      );

      if (nestedFailureCategory) {
        return {
          success: false,
          category: nestedFailureCategory,
          message: failureMessageByCategory[nestedFailureCategory],
          error: nestedFailureCategory,
          result: nestedResult,
        };
      }

      if (result.success) {
        return { ...result, category: result.category ?? 'SUCCESS' };
      }

      const failureCategory =
        !result.category || result.category === 'SUCCESS'
          ? 'FAILED'
          : result.category;

      return {
        success: false,
        category: failureCategory,
        message: failureMessageByCategory[failureCategory],
        error: failureCategory,
        ...(nestedResult ? { result: nestedResult } : {}),
      };
    }

    return {
      success: true,
      category: 'SUCCESS',
      message: 'Myah action completed',
      result: result as object,
    };
  } catch (error) {
    const failureCategory = categoryFromError(error);

    return {
      success: false,
      category: failureCategory,
      message: failureMessageByCategory[failureCategory],
      error: failureCategory,
    };
  }
};

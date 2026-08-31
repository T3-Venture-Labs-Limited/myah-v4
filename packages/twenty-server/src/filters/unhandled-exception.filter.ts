import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';

import { captureException } from '@sentry/nestjs';

import { type Response } from 'express';
import { shouldCaptureException } from 'src/engine/utils/global-exception-handler.util';

@Catch()
export class UnhandledExceptionFilter implements ExceptionFilter {
  // oxlint-disable-next-line typescript/no-explicit-any
  catch(exception: any, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    if (
      host.getType() === 'http' &&
      shouldCaptureException(exception, status)
    ) {
      captureException(exception);
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (!response.header || response.headersSent) {
      return;
    }

    response.status(status).json(exception.response ?? exception.message);
  }
}

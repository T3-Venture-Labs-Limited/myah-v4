import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';

import { SentryExceptionCaptured } from '@sentry/nestjs';

import { type Response } from 'express';

@Catch()
export class UnhandledExceptionFilter implements ExceptionFilter {
  // oxlint-disable-next-line typescript/no-explicit-any
  @SentryExceptionCaptured()
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (!response.header || response.headersSent) {
      return;
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    response.status(status).json(exception.response ?? exception.message);
  }
}

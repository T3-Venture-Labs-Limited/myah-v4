import { BadRequestException, HttpStatus } from '@nestjs/common';

import { type ErrorRequestHandler } from 'express';

// Register after the body parsers, before Nest maps SyntaxError and loses its type.
export const redactJsonParserErrorMiddleware: ErrorRequestHandler = (
  error: unknown,
  _request,
  _response,
  next,
) => {
  if (
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed' &&
    'status' in error &&
    error.status === HttpStatus.BAD_REQUEST
  ) {
    next(new BadRequestException('Invalid JSON body'));

    return;
  }

  next(error);
};

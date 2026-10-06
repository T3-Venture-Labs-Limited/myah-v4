import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
  type Type,
} from '@nestjs/common';

import { plainToInstance } from 'class-transformer';
import { type ValidationError, validate } from 'class-validator';

import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

const safeClassValidatorValidateWrapper = async (
  object: object,
): Promise<ValidationError[]> => {
  try {
    return await validate(object);
  } catch {
    return [];
  }
};

@Injectable()
export class ResolverValidationPipe implements PipeTransform {
  constructor(
    private readonly exceptionHandlerService: ExceptionHandlerService,
  ) {}

  async transform(value: unknown, metadata: ArgumentMetadata) {
    const { metatype } = metadata;

    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await safeClassValidatorValidateWrapper(object);

    if (errors.length === 0) {
      // TODO shouldn't we return the object here ? As transpilation could bring mutations
      return value;
    }

    const error = new UserInputError(this.formatErrorMessage(errors));

    // Resolver arguments come from our own app, so a rejected argument is
    // usually a client bug. BAD_USER_INPUT is otherwise never sent to Sentry.
    this.exceptionHandlerService.captureExceptions([error]);

    throw error;
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  private toValidate(metatype: Type<any>): boolean {
    const types: unknown[] = [String, Boolean, Number, Array, Object];

    return !types.includes(metatype);
  }

  private formatErrorMessage(errors: ValidationError[]): string {
    const messages = errors.flatMap((error) => {
      if (error.constraints) {
        return Object.values(error.constraints);
      }

      if (error.children) {
        return this.formatErrorMessage(error.children);
      }

      return [];
    });

    return messages.join(', ');
  }
}

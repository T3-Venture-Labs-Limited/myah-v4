import { registerDecorator, type ValidationOptions } from 'class-validator';

import { getUtf8ByteLength } from 'twenty-shared/utils';

type DecoratorTarget = { constructor: Function };

const isWithinMaxUtf8ByteLength = (value: unknown, maxBytes: number): boolean =>
  typeof value === 'string' && getUtf8ByteLength(value.trim()) <= maxBytes;

export const MaxUtf8ByteLength =
  (maxBytes: number, validationOptions?: ValidationOptions) =>
  (object: DecoratorTarget, propertyName: string) => {
    registerDecorator({
      name: 'maxUtf8ByteLength',
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          isWithinMaxUtf8ByteLength(value, maxBytes),
        defaultMessage: () =>
          `${propertyName} must be at most ${maxBytes} UTF-8 bytes`,
      },
    });
  };

import { registerDecorator, type ValidationOptions } from 'class-validator';

type DecoratorTarget = { constructor: Function };

const SAFE_UNIPILE_API_BASE_URLS = new Set([
  'https://api49.unipile.com:17981/api/v1/',
  'https://api46.unipile.com:17699/api/v1/',
]);

export const isUnipileApiBaseUrlSafe = (value: unknown): boolean =>
  typeof value === 'string' && SAFE_UNIPILE_API_BASE_URLS.has(value);

export const IsUnipileApiBaseUrlSafe =
  (validationOptions?: ValidationOptions) =>
  (object: DecoratorTarget, propertyName: string) => {
    registerDecorator({
      name: 'isUnipileApiBaseUrlSafe',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: { validate: isUnipileApiBaseUrlSafe },
    });
  };

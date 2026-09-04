import { registerDecorator, type ValidationOptions } from 'class-validator';

const UNIPILE_API_HOST = 'api49.unipile.com';
const UNIPILE_API_PORT = '17981';
const UNIPILE_API_PATH = '/api/v1/';

export const isUnipileApiBaseUrlSafe = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === UNIPILE_API_HOST &&
      url.port === UNIPILE_API_PORT &&
      url.pathname === UNIPILE_API_PATH &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};

export const IsUnipileApiBaseUrlSafe =
  (validationOptions?: ValidationOptions) =>
  (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isUnipileApiBaseUrlSafe',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: { validate: isUnipileApiBaseUrlSafe },
    });
  };

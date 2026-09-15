import { isIP } from 'node:net';

import { registerDecorator, type ValidationOptions } from 'class-validator';

type DecoratorTarget = { constructor: Function };

const LOCAL_HOSTNAMES = new Set(['localhost', 'local', 'localdomain']);
const LOCAL_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home',
  '.test',
];

const isPublicHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase();

  return (
    isIP(normalizedHostname.replace(/^\[|\]$/g, '')) === 0 &&
    normalizedHostname.includes('.') &&
    !LOCAL_HOSTNAMES.has(normalizedHostname) &&
    !LOCAL_HOST_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix))
  );
};

export const isUnipileInstagramCallbackBaseUrlSafe = (
  value: unknown,
): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      isPublicHostname(url.hostname) &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      (value === url.origin || value === `${url.origin}/`)
    );
  } catch {
    return false;
  }
};

export const IsUnipileInstagramCallbackBaseUrlSafe =
  (validationOptions?: ValidationOptions) =>
  (object: DecoratorTarget, propertyName: string) => {
    registerDecorator({
      name: 'isUnipileInstagramCallbackBaseUrlSafe',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: { validate: isUnipileInstagramCallbackBaseUrlSafe },
    });
  };

import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';

type ManagedEmailBillingEnvironment = 'PRODUCTION' | 'SANDBOX';

type ManagedEmailRuntimeConfig = {
  MANAGED_EMAIL_ENABLED?: boolean;
  MANAGED_EMAIL_EXECUTION_MODE?: ManagedEmailBillingEnvironment;
  MANAGED_EMAIL_METRONOME_ENVIRONMENT?: ManagedEmailBillingEnvironment;
  METRONOME_BASE_URL_ENVIRONMENT?: ManagedEmailBillingEnvironment;
  NODE_ENV?: NodeEnvironment;
};

const isLoopback = (hostname: string): boolean =>
  hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';

const APPROVED_SANDBOX_PROVIDER_ORIGINS: Record<
  string,
  Record<string, boolean>
> = {
  ICEMAIL_API_BASE_URL: {
    'http://127.0.0.1:18081': true,
    'http://localhost:18081': true,
    'http://[::1]:18081': true,
  },
  WARMUP_INBOX_API_BASE_URL: {
    'http://127.0.0.1:18082': true,
    'http://localhost:18082': true,
    'http://[::1]:18082': true,
  },
};

const STRIPE_KEY_PREFIXES = {
  publishable: {
    PRODUCTION: ['pk_live_'],
    SANDBOX: ['pk_test_'],
  },
  secret: {
    PRODUCTION: ['rk_live_', 'sk_live_'],
    SANDBOX: ['rk_test_', 'sk_test_'],
  },
} as const;

type ManagedEmailStripeKeyKind = keyof typeof STRIPE_KEY_PREFIXES;

export const IsManagedEmailExecutionModeSafe =
  (validationOptions?: ValidationOptions) =>
  (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isManagedEmailExecutionModeSafe',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const config = args.object as ManagedEmailRuntimeConfig;

          return (
            config.MANAGED_EMAIL_ENABLED !== true ||
            value !== 'SANDBOX' ||
            config.NODE_ENV !== NodeEnvironment.PRODUCTION
          );
        },
      },
    });
  };

export const IsManagedEmailProviderUrlSafe =
  (validationOptions?: ValidationOptions) =>
  (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isManagedEmailProviderUrlSafe',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const config = args.object as ManagedEmailRuntimeConfig;

          if (
            config.MANAGED_EMAIL_ENABLED !== true ||
            typeof value !== 'string'
          ) {
            return true;
          }

          let url: URL;

          try {
            url = new URL(value);
          } catch {
            return false;
          }

          if (config.MANAGED_EMAIL_EXECUTION_MODE === 'SANDBOX') {
            return (
              APPROVED_SANDBOX_PROVIDER_ORIGINS[propertyName]?.[url.origin] ===
              true
            );
          }

          return url.protocol === 'https:' && !isLoopback(url.hostname);
        },
      },
    });
  };

export const IsManagedEmailMetronomeEnvironmentSafe =
  (validationOptions?: ValidationOptions) =>
  (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isManagedEmailMetronomeEnvironmentSafe',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const config = args.object as ManagedEmailRuntimeConfig;

          if (
            config.MANAGED_EMAIL_ENABLED !== true ||
            typeof value !== 'string'
          ) {
            return true;
          }

          const baseUrlEnvironment = config.METRONOME_BASE_URL_ENVIRONMENT;
          if (baseUrlEnvironment === undefined) {
            return false;
          }

          if (
            config.MANAGED_EMAIL_ENABLED === true &&
            (config.MANAGED_EMAIL_METRONOME_ENVIRONMENT !==
              baseUrlEnvironment ||
              config.MANAGED_EMAIL_EXECUTION_MODE !== baseUrlEnvironment)
          ) {
            return false;
          }

          return true;
        },
      },
    });
  };

export const IsManagedEmailStripeKeySafe =
  (keyKind: ManagedEmailStripeKeyKind, validationOptions?: ValidationOptions) =>
  (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isManagedEmailStripeKeySafe',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const config = args.object as ManagedEmailRuntimeConfig;

          if (
            config.MANAGED_EMAIL_ENABLED !== true ||
            typeof value !== 'string'
          ) {
            return true;
          }

          const environment = config.MANAGED_EMAIL_EXECUTION_MODE;

          if (environment === undefined) {
            return true;
          }

          return STRIPE_KEY_PREFIXES[keyKind][environment].some((prefix) =>
            value.startsWith(prefix),
          );
        },
      },
    });
  };

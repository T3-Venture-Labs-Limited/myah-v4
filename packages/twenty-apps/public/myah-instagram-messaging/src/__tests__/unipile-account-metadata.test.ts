import { FieldType } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import applicationConfig from '../application.config';
import instagramAccount from '../objects/instagram-account.object';

const INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER =
  '2d357469-831a-4629-ad4b-47335900e883';
const INSTAGRAM_ACCOUNT_CONNECTED_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER =
  '05136556-a14d-48f8-aa7d-a9ca1cf7b152';
const INSTAGRAM_ACCOUNT_COMPOSIO_USER_ID_FIELD_UNIVERSAL_IDENTIFIER =
  'b2df75c7-24ef-4728-8ea9-acbc9f3365bf';
const INSTAGRAM_ACCOUNT_AUTH_CONFIG_ID_FIELD_UNIVERSAL_IDENTIFIER =
  'beba840b-2f16-4634-b151-15e555e1cd68';
const INSTAGRAM_ACCOUNT_IG_USER_ID_FIELD_UNIVERSAL_IDENTIFIER =
  'a1068123-eb00-45e7-aee3-71308dfc7fda';
const INSTAGRAM_ACCOUNT_UNIPILE_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER =
  '0f0e5c9e-aec8-491a-9613-26405ed2ee11';
const INSTAGRAM_ACCOUNT_STATUS_CONNECTING_OPTION_IDENTIFIER =
  'b14dcff4-87a7-47b4-ad0b-507f825620cb';

const field = (name: string) =>
  instagramAccount.config.fields.find((candidate) => candidate.name === name);

describe('Unipile workspace account metadata', () => {
  it('preserves the established Instagram account object and provider fields', () => {
    expect(instagramAccount.config.universalIdentifier).toBe(
      INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(field('igUserId')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_ACCOUNT_IG_USER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'igUserId',
      type: FieldType.TEXT,
      isUnique: true,
    });
    expect(field('connectedAccountId')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_ACCOUNT_CONNECTED_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'connectedAccountId',
      type: FieldType.TEXT,
    });
    expect(field('composioUserId')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_ACCOUNT_COMPOSIO_USER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'composioUserId',
      type: FieldType.TEXT,
    });
    expect(field('authConfigId')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_ACCOUNT_AUTH_CONFIG_ID_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'authConfigId',
      type: FieldType.TEXT,
    });
  });

  it('stores a unique nullable Unipile account id alongside the stable Instagram owner id', () => {
    expect(field('unipileAccountId')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_ACCOUNT_UNIPILE_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'unipileAccountId',
      type: FieldType.TEXT,
      isNullable: true,
      isUnique: true,
    });
  });

  it('declares CONNECTING as an account status', () => {
    expect(field('status')).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({
          id: INSTAGRAM_ACCOUNT_STATUS_CONNECTING_OPTION_IDENTIFIER,
          value: 'CONNECTING',
          label: 'Connecting',
        }),
      ]),
    });
  });

  it('does not introduce Unipile transport configuration to the application manifest', () => {
    expect(applicationConfig.config.serverVariables).not.toHaveProperty(
      'UNIPILE_API_KEY',
    );
    expect(applicationConfig.config.serverVariables).not.toHaveProperty(
      'UNIPILE_WEBHOOK_SECRET',
    );
  });
});

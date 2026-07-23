import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Bundle } from 'zapier-platform-core';

import { type InputData } from 'src/utils/data.types';

const ADMIN_TEST_TOKEN_PAYLOAD = {
  sub: '20202020-e6b5-4680-8a32-b8209737156b',
  userId: '20202020-e6b5-4680-8a32-b8209737156b',
  workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea419',
  workspaceMemberId: '20202020-463f-435b-828c-107e007a2711',
  userWorkspaceId: '20202020-1e7c-43d9-a5db-685b50369d81',
  type: 'ACCESS',
  authProvider: 'password',
  iat: 1751281704,
  exp: 2066857704,
};
const ADMIN_TEST_TOKEN_HEADER = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
).toString('base64url');
const ADMIN_TEST_TOKEN_BODY = Buffer.from(
  JSON.stringify(ADMIN_TEST_TOKEN_PAYLOAD),
).toString('base64url');
const ADMIN_TEST_TOKEN_SIGNING_INPUT = `${ADMIN_TEST_TOKEN_HEADER}.${ADMIN_TEST_TOKEN_BODY}`;
const appSecret = readFileSync(
  join(process.cwd(), '..', 'twenty-server', '.env'),
  'utf8',
)
  .split('\n')
  .find((line) => line.startsWith('APP_SECRET='))
  ?.slice('APP_SECRET='.length)
  .trim();
if (appSecret === undefined) {
  throw new Error('Missing APP_SECRET in the test server environment.');
}
const ADMIN_TEST_TOKEN = `${ADMIN_TEST_TOKEN_SIGNING_INPUT}.${createHmac(
  'sha256',
  createHash('sha256')
    .update(
      `${appSecret}${ADMIN_TEST_TOKEN_PAYLOAD.workspaceId}${ADMIN_TEST_TOKEN_PAYLOAD.type}`,
    )
    .digest('hex'),
)
  .update(ADMIN_TEST_TOKEN_SIGNING_INPUT)
  .digest('base64url')}`;
const TEST_URL = 'http://localhost:3000';

export const getBundleForTest = (inputData?: InputData): Bundle => {
  return {
    authData: {
      apiKey: ADMIN_TEST_TOKEN,
      apiUrl: TEST_URL,
    },
    inputData: inputData || {},
    cleanedRequest: {},
    inputDataRaw: {},
    meta: {
      isBulkRead: false,
      isFillingDynamicDropdown: false,
      isLoadingSample: false,
      isPopulatingDedupe: false,
      isTestingAuth: false,
      limit: 1,
      page: 1,
      timezone: null,
      inputFields: {},
    },
  };
};

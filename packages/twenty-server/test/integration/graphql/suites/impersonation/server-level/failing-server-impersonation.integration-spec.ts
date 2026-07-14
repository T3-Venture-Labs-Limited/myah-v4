import { expectOneNotInternalServerErrorSnapshot } from 'test/integration/graphql/utils/expect-one-not-internal-server-error-snapshot.util';
import { getAccessTokenForCredentials } from 'test/integration/graphql/utils/get-access-token-for-credentials.util';
import { impersonate } from 'test/integration/graphql/utils/impersonate.util';

import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';

// Jony has the legacy server-level canImpersonate capability but no configured
// Myah Team identity or current-workspace IMPERSONATE permission. The preflight
// policy must deny this cross-workspace attempt before target lookup or 2FA.
const IMPERSONATOR_WITHOUT_2FA_ACCESS_TOKEN = APPLE_JONY_MEMBER_ACCESS_TOKEN;

describe('Server-level impersonation - authorization denials (integration)', () => {
  it('rejects a non-Team legacy server impersonator before target lookup', async () => {
    const { errors } = await impersonate({
      userId: USER_DATA_SEED_IDS.TIM,
      workspaceId: SEED_YCOMBINATOR_WORKSPACE_ID,
      accessToken: IMPERSONATOR_WITHOUT_2FA_ACCESS_TOKEN,
      expectToFail: true,
    });

    expectOneNotInternalServerErrorSnapshot({ errors });
  });

  it('rejects a non-admin with only the workspace impersonate permission from impersonating across workspaces', async () => {
    const scottAccessToken = await getAccessTokenForCredentials({
      email: 'scott.forstall@apple.dev',
    });

    const { errors } = await impersonate({
      userId: USER_DATA_SEED_IDS.JONY,
      workspaceId: SEED_YCOMBINATOR_WORKSPACE_ID,
      accessToken: scottAccessToken,
      expectToFail: true,
    });

    expectOneNotInternalServerErrorSnapshot({ errors });
  });
});

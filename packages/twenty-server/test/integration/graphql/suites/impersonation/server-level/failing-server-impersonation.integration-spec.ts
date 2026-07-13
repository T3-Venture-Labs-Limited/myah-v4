import { expectOneNotInternalServerErrorSnapshot } from 'test/integration/graphql/utils/expect-one-not-internal-server-error-snapshot.util';
import { getAccessTokenForCredentials } from 'test/integration/graphql/utils/get-access-token-for-credentials.util';
import { impersonate } from 'test/integration/graphql/utils/impersonate.util';

import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';

// Jony has the legacy server-level canImpersonate capability but is not a
// configured Myah Team user and has no verified 2FA. The Team policy must deny
// this cross-workspace attempt before evaluating the 2FA condition.
const IMPERSONATOR_WITHOUT_2FA_ACCESS_TOKEN = APPLE_JONY_MEMBER_ACCESS_TOKEN;

describe('Server-level impersonation - authorization denials (integration)', () => {
  it('rejects a non-Team legacy server impersonator before evaluating 2FA', async () => {
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

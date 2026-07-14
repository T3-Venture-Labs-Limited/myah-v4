# Phase A release runbook

## Candidate selection

- Select the exact merge SHA that will first be deployed to staging.
- Record the currently running staging and production server/worker deployment IDs and image digests.
- Do not select a SHA that lacks the required passing pull-request checks.

## Manual staging deployment

- Use a clean worktree checked out at the candidate SHA.
- Deploy `twenty-server` and `twenty-worker` to Railway `staging` with explicit project, environment, and service selectors.
- Wait for both terminal-success deployments and record their deployment IDs/digests.
- Verify `https://twenty-server-staging-74ce.up.railway.app/healthz` succeeds.
- Run the controlled beta smoke against a disposable staging workspace: sign in, create one campaign and CreatorDeal, create and approve one email draft, record one non-sending receipt/timeline event, and verify the workspace boundary.

```bash
test -z "$(git status --porcelain)"
CANDIDATE_SHA="$(git rev-parse HEAD)"
railway up --project f7dbb9af-1bca-4843-81e9-b37f28940442 --environment staging --service twenty-server --ci --message "Release ${CANDIDATE_SHA}"
railway up --project f7dbb9af-1bca-4843-81e9-b37f28940442 --environment staging --service twenty-worker --ci --message "Release ${CANDIDATE_SHA}"
```

Run the commands only from the clean candidate worktree. The candidate is the
SHA that `git rev-parse HEAD` prints; record it in the release issue.

## Production decision

- One founder records the candidate SHA, staging evidence, current production digest, migration assessment, and rollback digest in the release issue.
- Do not release if staging health, smoke evidence, tenant isolation, or the rollback path is absent.

## Manual production deployment

- Deploy the same verified candidate SHA to both production application services with explicit selectors.
- Wait for a terminal-success Railway deployment and record each deployment ID/digest.

```bash
test -z "$(git status --porcelain)"
CANDIDATE_SHA="$(git rev-parse HEAD)"
railway up --project f7dbb9af-1bca-4843-81e9-b37f28940442 --environment production --service twenty-server --ci --message "Release ${CANDIDATE_SHA}"
railway up --project f7dbb9af-1bca-4843-81e9-b37f28940442 --environment production --service twenty-worker --ci --message "Release ${CANDIDATE_SHA}"
```

Run the commands only from the clean, staging-verified candidate worktree.

## Post-deploy verification

- Verify `https://twenty-server-production-b4a3.up.railway.app/healthz` succeeds.
- Run only a non-destructive authenticated smoke in an approved production beta workspace.
- Monitor the release window and record the final deployed server/worker digests.

## Rollback

- If application behavior regresses before an irreversible migration, redeploy the prior known-good server and worker candidate SHA and verify health.
- Do not treat database rollback as routine. For an irreversible migration, execute its documented forward repair path.

## Migration policy

1. Add compatible schema.
2. Deploy code compatible with old and new schema.
3. Backfill and verify.
4. Remove old schema only in a later release.

## Phase B boundary

Phase A prevents automatic production deployment by preventing automatic application deployment in both environments. It promotes source SHA rather than a build-once image digest. Do not represent staging/production artifact parity as complete. Phase B begins only after the team selects a private image registry, an external secret manager that supports GitHub Actions workload identity/OIDC, and an environment-specific staging-deployment mechanism that cannot trigger production deployment.

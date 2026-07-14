# Environment isolation audit

**Audit date:** 2026-07-13

## Scope

This audit records the resource boundary required for the Myah paid beta. It intentionally excludes secret values, connection strings, OAuth tokens, mailbox credentials, access keys, and Stripe credentials.

## Railway project

- Project: `myah-v3`
- Project ID: `f7dbb9af-1bca-4843-81e9-b37f28940442`

## Staging

- Environment ID: `3520008b-aedf-4d8f-9f19-18b6f90ce8a4`
- Server service: `twenty-server` (`19686ecb-d075-4fbf-a644-0e064e8bb871`)
- Worker service: `twenty-worker` (`e048265e-8865-4bcb-b28a-52f4cc176c6b`)
- PostgreSQL service: `Postgres` (`abb9c4c5-2cdb-4f22-ad05-75b151202507`)
- Redis service: `Redis` (`34996331-35f8-4230-a90c-1543118d203b`)
- Server domain: `https://twenty-server-staging-74ce.up.railway.app`
- Server health endpoint: `https://twenty-server-staging-74ce.up.railway.app/healthz`
- Source before detachment: `main`; source after detachment: no repository source.
- Current server health check: `/healthz`

### Deployment evidence

All application services have no repository or image source after detachment.

| Service | Deployment ID | Source commit | Image digest | Health check |
| --- | --- | --- | --- | --- |
| `twenty-server` | `1a024ba0-c262-42a2-a22e-554d6d05b4bd` | Not recorded by Railway for this manual deployment | `sha256:bb84a9e2832f5bb785d4689c0899661d64736aeef5c8d5b15dbeb1eb75c3b9c0` | `/healthz` |
| `twenty-worker` | `e9c5b60c-8492-4a19-a87f-1397ded9ff5d` | `ad6785bfe80b6c59c6fd3ca30f2f868ab7eacadb` | `sha256:17ee23cec9706672626ea1d18c3eaf2520abbfdf69168f81cc74a7ceab78d803` | None |

### State volumes

- Redis: `redis-volume` mounted at `/data`.
- PostgreSQL: `postgres-volume` mounted at `/var/lib/postgresql/data`.

## Production

- Environment ID: `4899d72e-ac81-4a23-84c0-4f5dcf46bae0`
- Server service: `twenty-server` (`19686ecb-d075-4fbf-a644-0e064e8bb871`)
- Worker service: `twenty-worker` (`e048265e-8865-4bcb-b28a-52f4cc176c6b`)
- PostgreSQL service: `Postgres-rWX3` (`88851bf8-edd7-4b1a-ab2a-ff23189b202a`)
- Redis service: `Redis-N1Ie` (`47a4f9d7-0d2d-4177-ae66-9fd9d62d5d92`)
- Server domain: `https://twenty-server-production-b4a3.up.railway.app`
- Server health endpoint: `https://twenty-server-production-b4a3.up.railway.app/healthz`
- Server health check: `/healthz`

### Deployment evidence

All application services have no repository or image source after detachment.

| Service | Deployment ID | Source commit | Image digest | Health check |
| --- | --- | --- | --- | --- |
| `twenty-server` | `9b78db59-eff3-4b78-9b49-97ee12351d36` | `ad6785bfe80b6c59c6fd3ca30f2f868ab7eacadb` | `sha256:2b24669a80f6af88730583583bf7507133fa335b1504abcf7d784b4528b72b64` | `/healthz` |
| `twenty-worker` | `aa007356-44d1-4586-9c78-3143325a7fe0` | `ad6785bfe80b6c59c6fd3ca30f2f868ab7eacadb` | `sha256:03d87c91c412902f8bf8729cd029d02688dd0848303af6c0b3fb4cb7673762d2` | None |

### State volumes

- Redis: `redis-volume-Jcup` mounted at `/data`.
- PostgreSQL: `postgres-volume--Pqo` mounted at `/var/lib/postgresql/data`.

## Required boundary

Staging and production must retain separate server/worker deployments, PostgreSQL, Redis, volumes, domains, provider registrations/credentials, shared mailbox connections, Stripe modes/webhooks, and object-storage access. Production customer data is not staging test input.

## Railway source-scope finding

Railway sources are configured at the shared service level, not per environment. The explicit production-environment `railway service source disconnect` commands removed the source for the same `twenty-server` and `twenty-worker` services in both staging and production.

Both existing deployments continued running. At 2026-07-13 verification, staging and production health endpoints returned `{"status":"ok"}`. The safe immediate state is therefore manual selected-SHA releases to both environments. Reconnecting the source to restore automatic staging deployment would also restore automatic production deployment; do not do so.

The staged automatic-deploy target requires a deployment mechanism independent of Railway's shared GitHub source connection. Phase B must select and verify that mechanism before staging automation returns.

## Verification record

- [x] Production server source detached without changing the running deployment.
- [x] Production worker source detached without changing the running deployment.
- [x] Production health endpoint verified after detachment.
- [x] Staging source also detached because Railway configures the source at the shared service level.
- [ ] Variable, provider, mailbox, Stripe, storage, and webhook wiring reviewed by name/reference only; no secret values recorded.

## Phase B boundary

Phase A prevents automatic production deployment by preventing automatic application deployment in both environments. It promotes source SHA rather than a build-once image digest. Do not represent staging/production artifact parity as complete. Phase B begins only after the team selects a private image registry, an external secret manager that supports GitHub Actions workload identity/OIDC, and an environment-specific staging-deployment mechanism that cannot trigger production deployment.

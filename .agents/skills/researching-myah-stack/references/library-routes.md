# Documentation routes

Verified 2026-09-18 with `ctx7` 0.5.11: resolve each library, then retrieve a focused documentation answer. The 28 tested IDs below cover 25 technologies. Retrieval means relevant snippets/source links were returned, **not** that every API or installed version is covered. No production service was called.

Use these as candidates for the resolve-then-query workflow in `../SKILL.md`. Recheck the actual dependency/API/server version. Context7's `versions: []` means no explicit version options were returned, not universal version support. `__branch__...` labels are branch indexes, not semantic versions. An ID can still return mixed-version or mixed-language material.

## Frameworks, data access, and build tools

| Technology | Retrieval-tested Context7 ID | Official source / fallback | Scope and caveat |
| --- | --- | --- | --- |
| React | `/reactjs/react.dev` | [React documentation source](https://github.com/reactjs/react.dev/blob/main/src/content/reference/react/useEffect.md) | Effect cleanup retrieved. Resolver listed `__branch__v18`; main retrieval is not exact React 19 evidence. |
| Apollo Client | `/apollographql/apollo-client/_apollo_client_4_0_5` | [Client 4.0.5 query docs](https://github.com/apollographql/apollo-client/blob/@apollo/client@4.0.5/docs/source/data/queries.mdx) | React `useQuery` retrieved for 4.0.5. Do not default other installed patches to this snapshot. Client is distinct from Apollo Server/GraphOS. |
| Jotai | `/pmndrs/jotai` | [Jotai useAtom docs](https://github.com/pmndrs/jotai/blob/main/docs/core/use-atom.mdx) | Atom/useAtom retrieved from main; listed `v1_13_1` is historical, not proof of installed 2.x compatibility. Some snippets illustrate internals. |
| Linaria | `/callstack/linaria` | [Linaria API](https://github.com/callstack/linaria/blob/master/docs/API.md) | Dynamic styled props retrieved; distinguish `@linaria/react` from core and build-time extraction. No explicit version options. |
| NestJS | `/nestjs/docs.nestjs.com` | [Nest module docs](https://github.com/nestjs/docs.nestjs.com/blob/master/content/modules.md) | Module/provider docs retrieved; no explicit version options. Check installed Nest major and adapter, not merely the framework name. |
| TypeORM | `/typeorm/typeorm` | [TypeORM DataSource docs](https://github.com/typeorm/typeorm/blob/master/docs/docs/data-source/1-data-source.md) | Main retrieval mixed 0.3-style DataSource examples and 1.0 release material; resolver listed 0.2.45. For Myah's patched dependency, use matching source/types plus local patches and Twenty ORM contracts. |
| BullMQ | `/taskforcesh/bullmq` | [BullMQ worker docs](https://github.com/taskforcesh/bullmq/blob/master/docs/gitbook/guide/workers.md) | Queue/Worker docs retrieved; mixed-language snippets appeared. Select TypeScript; distinguish BullMQ from Bull and Nest adapters. No explicit version options. |
| AI SDK | `/websites/ai-sdk_dev` | [AI SDK text generation](https://ai-sdk.dev/docs/ai-sdk-core/generating-text) | Vercel TypeScript `ai`, not a model vendor SDK. Older migration guidance appeared; unversioned retrieval is not exact SDK 6 evidence. |
| Nx | `/websites/nx_dev` | [Nx configuration](https://nx.dev/docs/reference/nx-json) | Target caching docs retrieved; older cache migration examples also appeared. Match installed executor/Nx version. |
| Yarn | `/yarnpkg/berry` | [Modern Yarn docs source](https://github.com/yarnpkg/berry/blob/master/packages/docusaurus/docs/getting-started/migrating/pnp.mdx) | Modern Yarn/Berry, not Classic. `nodeLinker` docs retrieved alongside historical 2.x/3.x material; verify actual Yarn 4 configuration. |
| Vite | `/vitejs/vite` | [Vite configuration](https://github.com/vitejs/vite/blob/main/docs/config/index.md) | Config/alias docs retrieved. Resolver offered several 5.x/7.x/8.x snapshots; main is not automatically the project's major. Avoid copying Vite's own test setup as application configuration. |
| Lingui | `/lingui/js-lingui` | [Lingui React tutorial](https://github.com/lingui/js-lingui/blob/main/website/docs/tutorials/react.md) | Locale activation/provider docs retrieved. Returned content referenced Lingui 6; check installed major and core-versus-React APIs. |
| TypeScript | `/microsoft/typescript-website` | [Official handbook source](https://github.com/microsoft/TypeScript-Website/blob/v2/packages/documentation/copy/en/handbook-v2/Narrowing.md) | Union narrowing retrieved. Handbook route, not compiler implementation or the native compiler port; keep the repo's `tsgo` command policy. |

## Verification tools

| Technology | Retrieval-tested Context7 ID | Official source / fallback | Scope and caveat |
| --- | --- | --- | --- |
| Jest | `/jestjs/jest` | [Mock function API](https://github.com/jestjs/jest/blob/main/docs/MockFunctionAPI.md) | Async mocking retrieved from main; resolver offered `v29.7.0`, but that snapshot was not separately queried. |
| Playwright | `/microsoft/playwright` | [Playwright Test docs](https://github.com/microsoft/playwright/blob/main/docs/src/writing-tests-js.md) | Node/TypeScript locators/assertions, not Python or a browser-agent integration. Resolver offered 1.51.0, 1.58.2, and 1.61.0; match the installed version. |
| Vitest | `/vitest-dev/vitest` | [Mock API](https://github.com/vitest-dev/vitest/blob/main/docs/api/mock.md) | `vi.fn` mocking retrieved from main; resolver offered 3.2.4, 4.0.7, and 4.1.6. Do not substitute Vitest for the repository's Jest targets. |

## External services and infrastructure

| Technology / surface | Retrieval-tested Context7 ID | Official source / fallback | Scope and caveat |
| --- | --- | --- | --- |
| Unipile API | `/websites/developer_unipile` | [Instagram](https://developer.unipile.com/docs/instagram), [hosted auth](https://developer.unipile.com/docs/hosted-auth) | Account connection/webhooks retrieved. API docs are distinct from the Unipile Node SDK and third-party SDK forks. No explicit version options. |
| Metronome API | `/websites/metronome` | [Usage ingestion](https://docs.metronome.com/api-reference/usage/ingest-events) | Usage/idempotency docs retrieved. Distinguish REST API versions, contracts, and SDK method signatures. No explicit version options. |
| Metronome Node SDK | `/metronome-industries/metronome-node` | [SDK source docs](https://github.com/metronome-industries/metronome-node/blob/main/_autodocs/README.md) | TypeScript usage ingestion/retry examples retrieved. Match the installed `@metronome/sdk` release; no explicit version options. |
| Stripe API | `/websites/stripe` | [Webhooks](https://docs.stripe.com/webhooks) | Webhook/versioning docs retrieved. Confirm endpoint/account API version separately from the Node SDK package version. |
| Stripe Node SDK | `/stripe/stripe-node` | [Webhook implementation](https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts) | Signature verification retrieved. Resolver listed `v19.1.0`, not the inspected project's 20.x release. Use matching official source tag/types for version-sensitive work. |
| Railway | `/railwayapp/docs` | [Build/start commands source](https://github.com/railwayapp/docs/blob/main/content/docs/builds/build-and-start-commands.md) | Dockerfile/service start docs retrieved; some framework-specific examples also appeared. Docs do not establish live services, variables, or deployment permissions. |
| Sentry JavaScript SDKs | `/getsentry/sentry-javascript` | [NestJS SDK](https://github.com/getsentry/sentry-javascript/blob/develop/packages/nestjs/README.md) | Initialization docs retrieved, with some neighboring-framework content. Select the actual React/NestJS SDK and installed major. `develop` examples may be ahead of a release. |
| PostgreSQL 16 | `/websites/postgresql_16` | [ALTER TABLE, v16](https://www.postgresql.org/docs/16/sql-altertable.html) | Type conversion docs retrieved from the major-specific index. Determine the actual target server major; do not infer it from the client package. |
| PostgreSQL 18 | `/websites/postgresql_18` | [ALTER TABLE, v18](https://www.postgresql.org/docs/18/sql-altertable.html) | Same major-selection rule. This is not a recommendation to upgrade a database; resolve other majors separately. |
| Redis server | `/redis/docs` | [Redis documentation source](https://github.com/redis/docs) | Transaction/multi-key material retrieved, with unrelated examples too. This is server documentation, not the `ioredis` client; resolve client questions independently. |
| ClickHouse | `/websites/clickhouse` | [JavaScript integration](https://clickhouse.com/docs/integrations/javascript) | JSONEachRow insertion docs retrieved. Distinguish server settings from `@clickhouse/client` APIs and versions. |
| Docker | `/docker/docs` | [Multi-stage builds](https://github.com/docker/docs/blob/main/content/manuals/build/building/multi-stage.md) | Multi-stage COPY/build docs retrieved. The returned `__branch__main` option is not an engine version; Compose and CLI may need separate resolution. |

## Outside this table

This list is deliberately non-exhaustive. For example, Storybook, Oxlint/Oxfmt, GraphQL tooling, `ioredis`, new SDKs, and future infrastructure must use the discovery/fallback procedure in `SKILL.md`, not a guessed ID. Absence here is neither missing project support nor missing Context7 coverage.

For a source/version gap, derive the official website/repository from package metadata or vendor documentation, inspect the matching tag/types/API reference, and report the limitation. Do not record a new route until its identity and retrieval have actually been checked. Keep this file a routing index; do not accumulate copied documentation or task-specific transcripts.

# Myah v4 First-Party Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Myah's published SDK-app delivery path with source-controlled standard metadata, server-native Brand Brain tools, and the retained first-party Instagram connection flow.

**Architecture:** Standard-application flat maps become the only provisioning source for Brand Brain and Creator Ops. New workspaces receive that metadata through existing initialization; existing workspaces receive it through one versioned workspace command. Brand Brain's pure fixture behavior moves into an injected Nest tool provider, while the existing Myah Composio REST/UI connection flow remains unchanged. After verified replacement, remove only the obsolete SDK publication, promotion, and backfill path.

**Tech Stack:** TypeScript ESM, NestJS, Twenty flat metadata/workspace migration APIs, Jest/Nx, React/Apollo settings UI, Composio REST integration, GitHub Actions, Railway production deployment.

## Global Constraints

- Start from a clean worktree based on `origin/main`; never modify the root `main` checkout for feature work.
- Use Node `24.16.0` and Yarn `4.13.0`; use `npx nx run` targets rather than npm.
- Preserve every existing Myah metadata universal identifier from the Brand Brain and Creator Ops source packages.
- New metadata belongs to `TWENTY_STANDARD_APPLICATION.universalIdentifier`; do not create a second application, registry, installer, queue, cron, startup seeder, or direct-SQL metadata path.
- Existing-workspace migration must be idempotent, support dry-run, preserve data and ownership by immutable universal identifier, and fail visibly on validation failure.
- Brand Brain must retain exactly four existing tool contracts and reject destructive writes; seed/fill-missing behavior must not overwrite a non-empty page body.
- Retain the existing workspace-scoped Instagram REST/UI flow and its no-polling, no-background-send, no-bulk-message, no-auto-reply, and no-cold-DM boundaries.
- The approved environment policy is production only. Do not restore Railway's shared source-based auto-deployment.
- Never publish this plan, the design specification, operational audits, or other internal documentation to a public repository. Keep commits local until an approved private destination is supplied.

---

## File structure and ownership

| Area | Files | Responsibility |
| --- | --- | --- |
| Standard metadata | `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/**` | Build one source-controlled map for every Myah object, field, relation, index, search field, view, role, layout, navigation item, agent, skill, and command item. |
| Existing workspaces | `packages/twenty-server/src/database/commands/upgrade-version-command/2-21/` | Safely apply the standard-metadata change once per active/suspended workspace. |
| Brand Brain runtime | `packages/twenty-server/src/modules/myah-brand-brain/**` | Server-side domain rules, workspace data adapter, named tools, Nest registration, and tests. |
| Runtime composition | `packages/twenty-server/src/modules/modules.module.ts` and established AI tool-provider composition | Make the new module available through the existing provider token. |
| Retained Instagram flow | `packages/twenty-server/src/modules/myah-composio/**`, `packages/twenty-front/src/pages/settings/accounts/SettingsAccountsInstagram.tsx` | Preserve connection/account-listing behavior; do not widen messaging capabilities. |
| Legacy removal | `packages/twenty-apps/{fixtures/brand-brain-record-wiki-mvp,internal/myah-creator-ops,public/myah-instagram-messaging}`, `packages/twenty-server/src/modules/myah-standard-apps`, `.github/workflows/deploy-myah-standard-apps.yaml`, `.github/actions/deploy-twenty-app/action.yml` | Remove only after replacement verification and installed-app preflight. |
| Operations | `docs/operations/environment-isolation-audit.md` | Replace the superseded staging mandate with the approved production-only policy after production evidence exists. |

### Task 1: Lock the standard-metadata contract in a failing map test

**Files:**
- Create: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts`
- Read as canonical inputs: `packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp/src/{objects,fields,indexes,views,navigation-menu-items,page-layouts,roles,logic-functions}/**`
- Read as canonical inputs: `packages/twenty-apps/internal/myah-creator-ops/src/{objects,views,navigation-menu-items,default-role.ts,constants}/**`
- Read pattern: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-calendar-event-standard-metadata.spec.ts`
- Read pattern: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-call-recording-standard-metadata.spec.ts`

**Interfaces:**
- Consumes: `computeTwentyStandardApplicationAllFlatEntityMaps({ now, workspaceId, twentyStandardApplicationId })`.
- Produces: a fixed contract test for the Myah universal identifiers and cross-map references consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing contract test with fixed IDs and time**

```ts
const result = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-07-14T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
});

expect(result.allFlatEntityMaps.flatObjectMetadataMaps
  .idByUniversalIdentifier['6a8289d7-8034-4f70-b3fa-47bc0e52828f'])
  .toBeDefined();
expect(result.allFlatEntityMaps.flatObjectMetadataMaps
  .idByUniversalIdentifier['f99ff6bc-3b56-4600-beb3-cfc2c23364f6'])
  .toBeDefined();
```

Add assertions generated from the two source packages for every Myah object,
field, relation field, index, search field, view, view field/group/filter,
role, navigation item, layout/tab/widget, agent, skill, and command item. For
Brand Brain, assert the page and link object IDs above, the page fields
`title`, `slug`, `canonicalPath`, `idPath`, `pageType`, `status`, `body`,
`summary`, `tags`, `sortOrder`, and `aliases`, all page/link relation fields,
and the `canonicalPath` index. For Creator Ops, assert all ten declared
objects, their relations, the three views, and the three navigation entries.

- [ ] **Step 2: Run the test and confirm it fails because Myah metadata is absent**

Run:

```sh
npx nx run twenty-server:test --runTestsByPath \
  packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts \
  --coverage=false
```

Expected: failure at the first missing Brand Brain or Creator Ops universal
identifier. Do not weaken the assertions to make the missing metadata pass.

- [ ] **Step 3: Commit the failing contract test separately**

```sh
git add packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts
git commit -m "test(myah): Define standard metadata contract"
```

### Task 2: Port declarative Brand Brain and Creator Ops metadata into standard maps

**Files:**
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/object-metadata/build-standard-flat-object-metadata-maps.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/build-standard-flat-field-metadata-maps.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/index/build-standard-flat-index-metadata-maps.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/search-field-metadata/build-standard-flat-search-field-metadata-maps.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view/build-standard-flat-view-metadata-maps.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view-{field,field-group,filter,group}/build-standard-flat-*.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/{role-metadata,agent-metadata,skill-metadata,navigation-menu-item,page-layout,page-layout-tab,page-layout-widget,command-menu-item}/build-standard-flat-*.util.ts`
- Modify if source definitions require shared identifiers: the smallest focused constants/types file beside the existing standard-map builder that consumes it.
- Test: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts`

**Interfaces:**
- Consumes: the source manifests and Task 1's universal-identifier assertions.
- Produces: maps from `computeTwentyStandardApplicationAllFlatEntityMaps()` that have the same immutable Myah metadata contract as the source manifests and are owned by its `twentyStandardApplicationId` argument.

- [ ] **Step 1: Add only the source declarations required by the failing test**

Use each existing category builder, not a Myah-specific dispatcher. Preserve
the composition dependencies already established by the central function:

```ts
const flatObjectMetadataMaps = buildStandardFlatObjectMetadataMaps(/* objects */);
const flatFieldMetadataMaps = buildStandardFlatFieldMetadataMaps({
  dependencyFlatEntityMaps: { flatObjectMetadataMaps },
  /* existing arguments */
});
const flatIndexMaps = buildStandardFlatIndexMetadataMaps({
  dependencyFlatEntityMaps: { flatFieldMetadataMaps, flatObjectMetadataMaps },
  /* existing arguments */
});
```

Define Brand Brain Page, Link, and Update Proposal plus all fields and
relations from the fixture. Define Creator, Creator List, Creator List Member,
Campaign, Campaign Creator, Offer, Promoted Asset, Outreach Sequence, Outreach
Step, and Outreach Action using the Creator Ops identifiers and field/relationship
contracts. Reference every existing source universal identifier exactly; do not
generate replacement UUIDs.

Then add their indexes/search fields, views and view children, role/agent/skill
records, layouts/tabs/widgets, navigation, and command-menu entries to the
matching established builder input. Keep `twentyStandardApplicationId` as the
application ownership argument for each flat entity.

- [ ] **Step 2: Run the focused map test and make every metadata category pass**

Run the Task 1 command.

Expected: PASS, including the relation target IDs, view references, navigation
view IDs, role references, and layout object IDs. A passing object-only test is
not sufficient.

- [ ] **Step 3: Run the existing workspace initialization contract**

Run:

```sh
npx nx run twenty-server:test --runTestsByPath \
  packages/twenty-server/src/engine/workspace-manager/workspace-manager.service.spec.ts \
  --coverage=false
```

Expected: PASS; its existing expectation that initialization invokes standard
application synchronization remains unchanged.

- [ ] **Step 4: Commit the complete declarative metadata port**

```sh
git add packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils
git commit -m "feat(myah): Add standard Brand Brain and Creator Ops metadata"
```

### Task 3: Add the safe existing-workspace standard-metadata migration command

**Files:**
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-21/2-21-workspace-command-1825100000000-synchronize-myah-standard-metadata.command.ts`
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-21/__tests__/2-21-workspace-command-1825100000000-synchronize-myah-standard-metadata.command.spec.ts`
- Read pattern: `packages/twenty-server/src/database/commands/upgrade-version-command/1-21/1-21-workspace-command-1775500001000-add-compose-email-command-menu-item.command.ts`
- Read registration: `packages/twenty-server/src/engine/core-modules/upgrade/services/upgrade-command-registry.service.ts`
- Read full synchronization behavior: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service.ts`

**Interfaces:**
- Consumes: Task 2's standard map and the workspace command framework.
- Produces: a `@RegisteredWorkspaceCommand(version, timestamp)` command that
  extends `ActiveOrSuspendedWorkspaceCommandRunner` and returns no mutation in
  dry-run mode.

- [ ] **Step 1: Write failing tests for four observable outcomes**

```ts
expect(await runner.execute({ dryRun: true })).toEqual(
  expect.objectContaining({ success: true }),
);
expect(workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromTo)
  .not.toHaveBeenCalled();

expect(await runForWorkspaceWithoutMyahMetadata()).toEqual(
  expect.objectContaining({ success: true }),
);
expect(await runForWorkspaceWithAlreadyOwnedMetadata()).toEqual(
  expect.objectContaining({ success: true }),
);
expect(await runForWorkspaceWithLegacyInstallation()).toEqual(
  expect.objectContaining({ success: true }),
);
```

For the legacy-installation fixture, make the test assert that records with
matching immutable universal identifiers are ownership-transferred before a
create action can run. Add a failure fixture where the transfer/migration
validation reports failure and assert the command throws rather than skipping
that workspace.

- [ ] **Step 2: Run the new command test and confirm it fails before the command exists**

Run:

```sh
npx nx run twenty-server:test --runTestsByPath \
  packages/twenty-server/src/database/commands/upgrade-version-command/2-21/__tests__/2-21-workspace-command-1825100000000-synchronize-myah-standard-metadata.command.spec.ts \
  --coverage=false
```

Expected: failure because the command module cannot be resolved.

- [ ] **Step 3: Implement the smallest registered workspace command**

Use the current command pattern directly:

```ts
@RegisteredWorkspaceCommand('2.21.0', 1825100000000)
@Command({ name: 'upgrade:2-21:synchronize-myah-standard-metadata' })
export class SynchronizeMyahStandardMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  async runOnWorkspace({ workspaceId, options }: RunOnWorkspaceArgs) {
    if (options.dryRun) return success({ workspaceId, dryRun: true });
    // Preflight ownership by universal identifier; build and validate only
    // the Myah subset migration; throw when validation reports failure.
  }
}
```

Do not invoke a partial full-map synchronization if it uses
`inferDeletionFromMissingEntities`; build the explicit Myah metadata `from` and
`to` subsets with the existing workspace migration builder so unrelated
standard metadata is outside the migration. Use the existing standard
application ID, cache lookup, system-build migration mode, and command runner
return/error conventions.

- [ ] **Step 4: Run command and registry tests**

Run the Task 3 focused command test, then:

```sh
npx nx run twenty-server:test --runTestsByPath \
  packages/twenty-server/src/engine/core-modules/upgrade/services/__tests__/upgrade-command-registry.service.spec.ts \
  --coverage=false
```

Expected: both PASS; the new decorator is discoverable by the existing registry.

- [ ] **Step 5: Commit the existing-workspace migration slice**

```sh
git add packages/twenty-server/src/database/commands/upgrade-version-command/2-21
git commit -m "feat(myah): Synchronize standard metadata for existing workspaces"
```

### Task 4: Port Brand Brain's pure domain behavior with fixture-equivalent tests

**Files:**
- Create: `packages/twenty-server/src/modules/myah-brand-brain/utils/brand-brain-record-wiki.util.ts`
- Create: `packages/twenty-server/src/modules/myah-brand-brain/utils/brand-brain-agent-memory.util.ts`
- Create: `packages/twenty-server/src/modules/myah-brand-brain/utils/brand-brain-agent-executor.util.ts`
- Create: `packages/twenty-server/src/modules/myah-brand-brain/utils/__tests__/{brand-brain-record-wiki,brand-brain-agent-memory,brand-brain-agent-executor}.util.spec.ts`
- Read/port source: `packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp/src/utils/{brand-brain-record-wiki,brand-brain-agent-memory,brand-brain-agent-executor}.util.ts`
- Read/port contract tests: matching fixture `src/utils/__tests__/*.spec.ts`

**Interfaces:**
- Consumes: standard metadata IDs from Task 2; no SDK token or Core API client.
- Produces: pure types and functions used by the server store/tool layer:
  `BrandBrainPageRecord`, `resolveCanonicalPath`, hierarchy validation,
  deterministic plan application, context/log formatting, and non-destructive
  update decisions.

- [ ] **Step 1: Copy the fixture-equivalent tests first, changing only import paths**

Keep the source cases intact for normalized slug/path creation, ancestor-cycle
rejection, duplicate sibling slug/path/alias rejection, stable sorting,
non-destructive seed behavior, link idempotency, rich-text serialization, and
log formatting. Do not mock persistence in these pure tests.

- [ ] **Step 2: Run the pure test files and confirm the imports fail**

Run:

```sh
npx nx run twenty-server:test --runTestsByPath \
  packages/twenty-server/src/modules/myah-brand-brain/utils/__tests__/brand-brain-record-wiki.util.spec.ts \
  packages/twenty-server/src/modules/myah-brand-brain/utils/__tests__/brand-brain-agent-memory.util.spec.ts \
  packages/twenty-server/src/modules/myah-brand-brain/utils/__tests__/brand-brain-agent-executor.util.spec.ts \
  --coverage=false
```

Expected: failure because the server utility modules do not exist.

- [ ] **Step 3: Port only pure deterministic logic**

```ts
export const shouldReplacePageBody = ({ existingBody, operation }: Args) =>
  operation === 'update-page-content' || isEmpty(existingBody);
```

Keep all fixture limits and enums, including `DRAFT`, `APPROVED`, `STALE`, and
`ARCHIVED` page status; `BRAND_ROOT`, `FOLDER`, `PAGE`, `INDEX`, `LOG`,
`SOURCE`, `PROMPT`, and `PLAYBOOK` page types; and the existing conflict
semantics. Exclude `CoreApiClientLike`, access tokens, HTTP transport, and SDK
runtime registration from these files.

- [ ] **Step 4: Run the pure suite and commit**

Run the Task 4 test command. Expected: PASS.

```sh
git add packages/twenty-server/src/modules/myah-brand-brain/utils
git commit -m "feat(myah): Port Brand Brain domain behavior"
```

### Task 5: Implement the injected Brand Brain store, four tools, and Nest registration

**Files:**
- Create: `packages/twenty-server/src/modules/myah-brand-brain/myah-brand-brain.module.ts`
- Create: `packages/twenty-server/src/modules/myah-brand-brain/services/myah-brand-brain.workspace-service.ts`
- Create: `packages/twenty-server/src/modules/myah-brand-brain/services/myah-brand-brain-store.service.ts`
- Create: `packages/twenty-server/src/modules/myah-brand-brain/tools/{brand-brain-get-context,brand-brain-search-or-read,brand-brain-seed-or-update-from-brief,brand-brain-update-page-content}.tool.ts`
- Create: `packages/twenty-server/src/modules/myah-brand-brain/{types,schemas,__tests__}/**`
- Modify: `packages/twenty-server/src/modules/modules.module.ts`
- Read pattern: `packages/twenty-server/src/modules/dashboard/tools/dashboard-tools.module.ts`
- Read pattern: `packages/twenty-server/src/modules/dashboard/tools/services/dashboard-tool.workspace-service.ts`
- Read source adapter/tests: `packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp/src/utils/{brand-brain-core-api-store,brand-brain-agent-tools,brand-brain-runtime-store}.util.ts` and `src/utils/__tests__/*`

**Interfaces:**
- Consumes: Task 4 pure functions and server workspace persistence/metadata services.
- Produces: `generateBrandBrainTools(workspaceId, rolePermissionConfig): ToolSet`, with the four source-compatible named tool descriptors/executors.

- [ ] **Step 1: Write failing provider/store tests for the tool boundary**

```ts
const tools = service.generateBrandBrainTools(workspaceId, rolePermissionConfig);
expect(Object.keys(tools)).toEqual([
  'brand-brain-get-context',
  'brand-brain-search-or-read',
  'brand-brain-seed-or-update-from-brief',
  'brand-brain-update-page-content',
]);

await expect(tools['brand-brain-update-page-content'].execute(destructiveInput))
  .rejects.toThrow('destructive');
```

Port fixture tests for page/link pagination (first 500), context cap 12,000
characters, maximum 40 pages/links in context, search maximum 10 results,
link idempotency, existing-body preservation during seed, and no proposal
creation. Use a workspace-scoped fake repository/data-source adapter rather
than an SDK Core API mock.

- [ ] **Step 2: Run provider tests and confirm they fail before module creation**

Run:

```sh
npx nx run twenty-server:test --runTestsByPath \
  packages/twenty-server/src/modules/myah-brand-brain/__tests__/myah-brand-brain.workspace-service.spec.ts \
  packages/twenty-server/src/modules/myah-brand-brain/__tests__/myah-brand-brain-store.service.spec.ts \
  --coverage=false
```

Expected: failure because the module/services are absent.

- [ ] **Step 3: Implement the server-only persistence adapter and tool service**

```ts
@Injectable()
export class MyahBrandBrainWorkspaceService {
  generateBrandBrainTools(
    workspaceId: string,
    rolePermissionConfig: RolePermissionConfig,
  ): ToolSet {
    return {
      'brand-brain-get-context': createBrandBrainGetContextTool(/* injected store */),
      'brand-brain-search-or-read': createBrandBrainSearchOrReadTool(/* injected store */),
      'brand-brain-seed-or-update-from-brief': createBrandBrainSeedOrUpdateFromBriefTool(/* injected store */),
      'brand-brain-update-page-content': createBrandBrainUpdatePageContentTool(/* injected store */),
    };
  }
}
```

The store service must query and mutate only the current workspace through
injected server infrastructure; it must never accept
`TWENTY_APP_ACCESS_TOKEN`, an arbitrary API URL, or credentials in tool input.
Register the workspace service through the established `TOOL_PROVIDERS` token
using `useExisting`, mirroring `DashboardToolsModule`, and import the module in
`ModulesModule`.

- [ ] **Step 4: Add and run one integration journey**

Create an integration spec using existing server workspace test helpers. The
journey must create a workspace, synchronize its standard application, seed a
brief, fetch context, append a non-destructive update, and assert Brand Brain
page/link/log records. It must assert the prior page body is unchanged by seed
and no proposal record is created.

Run the new integration spec using the repository's serial server integration
target with `NODE_ENV=test` and its required `.env.test` setup. Expected: PASS.

- [ ] **Step 5: Commit the runtime module**

```sh
git add packages/twenty-server/src/modules/myah-brand-brain packages/twenty-server/src/modules/modules.module.ts
git commit -m "feat(myah): Add server-native Brand Brain tools"
```

### Task 6: Verify retained Instagram behavior and authorize legacy removal

**Files:**
- Test: `packages/twenty-server/src/modules/myah-composio/services/__tests__/myah-composio.service.spec.ts`
- Test: `packages/twenty-front/src/pages/settings/accounts/SettingsAccountsInstagram.tsx` adjacent existing test location, or create the smallest matching frontend test file if none exists.
- Read: `packages/twenty-apps/public/myah-instagram-messaging/src/{application.config.ts,logic-functions/**,handlers/**,objects/**,constants/universal-identifiers.ts}`
- Read: `.github/workflows/deploy-myah-standard-apps.yaml`

**Interfaces:**
- Consumes: the existing REST contract: `GET /rest/myah/instagram/accounts` and `POST /rest/myah/instagram/oauth-link`.
- Produces: a signed capability inventory proving that no product caller depends on the legacy public app's connect/list/send functions before Task 7 deletes it.

- [ ] **Step 1: Write or strengthen a failing server test for workspace isolation and account selection**

```ts
await service.createInstagramAuthorizationLink(workspaceA.id);
const accountsA = await service.listInstagramAccounts(workspaceA.id);
const accountsB = await service.listInstagramAccounts(workspaceB.id);

expect(accountsA).toEqual(expect.arrayContaining([expect.objectContaining({ id: accountA.id })]));
expect(accountsB).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: accountA.id })]));
```

Assert active-only filtering, canonical latest-account selection, the exact
workspace-derived Composio user identity, and agent-visible account upsert.
Do not add any send endpoint or background process.

- [ ] **Step 2: Run the server test and the relevant Settings UI test**

Run the existing Myah Composio service spec with the narrow `twenty-server:test`
target. Run the adjacent frontend test target used by the Settings Accounts
feature. Expected: the strengthened server test fails before its assertion
change, then both pass after the existing behavior is correctly covered.

- [ ] **Step 3: Record the local capability inventory and preserve the production gate**

Use repository search tooling to scan every tracked source, workflow, and test
outside `packages/twenty-apps/public/myah-instagram-messaging/` for these four
logic-function names and their universal identifiers:

```ts
const retiredLogicFunctions = [
  'myah-connect-instagram',
  'myah-list-instagram-conversations',
  'myah-list-instagram-messages',
  'myah-send-instagram-text-message',
];
```

Record the zero-reference result in the task report. This scan proves only the
repository state; it is not a test and must not authorize deletion by itself.
Task 7 must separately inspect installed production applications by universal
identifier. If an installed legacy application exists and users rely on one of
its functions, stop this removal path and create a new, separately approved
first-party capability spec; do not silently recreate DM send behavior in this
migration.

- [ ] **Step 4: Commit the verification evidence**

```sh
git add packages/twenty-server/src/modules/myah-composio packages/twenty-front/src/pages/settings/accounts
git commit -m "test(myah): Verify retained Instagram connection boundary"
```

### Task 7: Remove the obsolete delivery path after production preflight

**Files:**
- Delete: `packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp/`
- Delete: `packages/twenty-apps/internal/myah-creator-ops/`
- Delete only after Task 6's no-caller/installed-app preflight: `packages/twenty-apps/public/myah-instagram-messaging/`
- Delete: `packages/twenty-server/src/modules/myah-standard-apps/`
- Modify: `packages/twenty-server/src/modules/modules.module.ts`
- Delete: `.github/workflows/deploy-myah-standard-apps.yaml`
- Delete: `.github/actions/deploy-twenty-app/action.yml` only after confirming the removed workflow is its sole caller.
- Modify: `docs/operations/environment-isolation-audit.md`
- Test: relevant package, server module, workflow-reference, and production smoke checks.

**Interfaces:**
- Consumes: passing Tasks 1–6, successful production dry-run evidence, and an
  installed-app preflight that finds no required legacy Instagram capability.
- Produces: no source, module, workflow, secret reference, or running product
  dependency on Myah SDK app publication/promotion.

- [ ] **Step 1: Run the required production preflight; do not delete before it succeeds**

1. Deploy the normal server release to the single production environment.
2. Run the new workspace command with `dryRun: true` and retain its result.
3. Confirm a representative legacy Brand Brain/Creator Ops installation either
   does not exist or is ownership-transferable by universal identifier.
4. Confirm the Instagram public app has no required installed-product
   capability beyond the retained Settings connection behavior.
5. Exercise a permissioned production user flow: open Settings → Accounts →
   Instagram; list accounts; request an OAuth link; verify the link is non-empty
   and the account list is workspace-scoped.

Expected: all five checks succeed. If any check fails, stop and fix the
corresponding prior task; do not perform deletions.

- [ ] **Step 2: Delete sources and composition only after preflight success**

Remove the three app packages only under the stated Instagram gate. Remove the
Myah standard-app module import from `ModulesModule` and delete its controller,
service, guard, allowlist, queue wiring, and unit tests. Delete the workflow
and then verify `deploy-twenty-app` has no remaining caller before deleting its
composite action. Do not modify Twenty's generic marketplace code or generic
example-app workflows.

- [ ] **Step 3: Add a failing absence check, then make it pass by completing removal**

Run:

```sh
grep -R -n -E 'deploy-myah-standard-apps|MYAH_STANDARD_APPS_DEPLOYMENT_TOKEN|MYAH_STANDARD_APPS_OWNER_WORKSPACE_ID|myah-standard-apps' \
  .github packages docs
```

Expected before removal: references remain. Expected after removal: no
references other than an explicitly retained data-migration history comment,
if one exists and documents the completed legacy ownership transfer.

Also run the narrow server/frontend tests from Tasks 1–6. Expected: PASS
without the deleted source packages or module.

- [ ] **Step 4: Remove only unused Myah publisher configuration and update the operational policy**

After the reference check is clean, remove only publisher/deployment variables
and secrets with no code or workflow references. Retain normal server URL and
Composio configuration. Update `docs/operations/environment-isolation-audit.md`
to replace the staging mandate with the approved production-only policy and to
state that source-based shared auto-deployment remains disabled.

- [ ] **Step 5: Commit the removal and policy cutover locally**

```sh
git add -A
git commit -m "ref(myah): Remove legacy standard app delivery path"
```

Do not push this commit or create a public PR containing the internal
specification, plan, audit, or production evidence. Obtain an approved private
destination before publication.

## Final verification checklist

- [ ] The focused standard-map test proves every Myah entity category and
  universal-identifier reference is in the built-in standard application.
- [ ] New-workspace initialization still synchronizes standard metadata.
- [ ] The registered existing-workspace command passes dry-run, idempotency,
  ownership-transfer, and failure-propagation tests.
- [ ] Brand Brain pure/domain, provider/store, and integration journeys pass;
  destructive writes are rejected and seed does not overwrite existing bodies.
- [ ] The retained Instagram connection flow passes workspace-isolation and
  Settings contract checks without adding messaging automation.
- [ ] The production dry-run and representative live migration succeed before
  deletion.
- [ ] The retired package, promotion module, workflow, action, and configuration
  references are gone; generic Twenty marketplace support remains.
- [ ] `docs/operations/environment-isolation-audit.md` agrees with the approved
  production-only policy.

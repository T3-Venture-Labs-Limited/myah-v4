# Myah v4 first-party recovery design

**Date:** 2026-07-14  
**Status:** Approved for implementation planning  
**Scope:** Replace Myah's SDK-app publication and promotion path with source-controlled first-party product behavior.

## Decision

Myah is a product built on Twenty CRM, not a marketplace of independently
published customer applications. Brand Brain and Creator Ops must therefore be
part of Twenty's source-controlled standard application. Brand Brain runtime
behavior must be normal Myah server behavior. Instagram account connection
must continue through the existing Myah Composio REST and Settings UI path.

The legacy app registry, publisher workspace, package publication, promotion
endpoint, deployment token, and installation-backfill queue are temporary
delivery mechanisms to remove after their first-party replacements are proven.

Myah's Creator, Campaign, and Brand Brain Page objects replace Twenty's
operator-facing Person, Opportunity, and Company abstractions. Myah workspaces
must not contain the `person`, `opportunity`, or `company` object metadata.
Tasks and Notes remain standard Twenty objects, but their target relations must
point to Creator, Campaign, and Brand Brain Page instead of the removed CRM
objects.

The approved rollout policy is **production only**. This supersedes the current
separate staging-and-production requirement recorded in
`docs/operations/environment-isolation-audit.md`; the implementation must
update that audit so the repository has one unambiguous operational policy.

## Goals

1. Automatically provision Brand Brain and Creator Ops metadata for every new
   eligible Myah workspace through the existing standard-application sync.
2. Safely synchronize the same metadata into existing eligible workspaces
   without duplicates, preserving Myah-owned data and removing replaced Person,
   Company, and Opportunity metadata only for verified legacy Myah installations.
3. Keep standard Tasks and Notes and make Creator, Campaign, and Brand Brain
   Page their supported Myah targets.
4. Make Brand Brain's four existing agent-tool contracts server-native while
   retaining their deterministic and non-destructive behavior.
5. Preserve the existing workspace-scoped Instagram OAuth/account-listing
   behavior and its current safety limits.
6. Remove the obsolete Myah SDK app publication, promotion, and backfill path
   only after its replacements meet their observable contracts.

## Non-goals

- Reimplementing Instagram OAuth, changing Composio ownership derivation, or
  enabling send, polling, bulk messaging, auto-replies, or cold DMs.
- Changing Twenty's generic application marketplace or third-party app support.
- Adding a Myah-specific registry, installer, queue, cron job, startup seeder,
  metadata synchronizer, or direct-SQL metadata creation path.
- Adding a new release environment or restoring Railway's shared source-based
  auto-deployment.
- Deleting unrelated workspace data as a shortcut for handling a migration
  conflict. Person, Company, and Opportunity metadata may be removed only after
  a positive legacy Myah application preflight; ordinary CRM workspaces retain it.

## Architecture

### Standard metadata is the single provisioning path

`computeTwentyStandardApplicationAllFlatEntityMaps()` is the composition point
for source-owned metadata. It already creates maps in dependency order:
objects; fields, indexes, and search fields; views; roles, agents, and skills;
then layouts, navigation, and command-menu items.

Brand Brain and Creator Ops definitions must be expressed through the existing
`buildStandardFlat*Maps` inputs and owned by
`TWENTY_STANDARD_APPLICATION.universalIdentifier`. Their current SDK manifests
are a one-time source checklist only; they are not retained as runtime product
applications after the cutover.

New workspaces need no new provisioning mechanism. `WorkspaceManagerService`
already creates and synchronizes the standard application during initialization.

### Myah replaces the default CRM object model

The source-controlled Myah standard-application result must exclude the
`person`, `company`, and `opportunity` objects and all metadata owned by or
dependent on them: fields, indexes, search fields, views, view children, page
layouts, navigation items, and command-menu items. Retained metadata must not
contain a relation or universal-identifier reference to any removed object.

Twenty's shared object constants remain framework source definitions; this
cutover changes the desired metadata graph for Myah workspaces rather than
deleting generic Twenty capabilities from the codebase.

The standard `task`, `taskTarget`, `note`, and `noteTarget` objects remain.
Their Person, Company, and Opportunity morph targets are replaced with Creator,
Campaign, and Brand Brain Page targets. Each replacement relation and inverse
relation uses a fixed universal identifier registered in
`MYAH_STANDARD_OBJECTS`, so fresh synchronization and existing-workspace
migration converge on the same metadata.

### Existing workspaces use the versioned command framework

A versioned command extending `ActiveOrSuspendedWorkspaceCommandRunner` is the
only new rollout mechanism. It must use the registered-workspace-command and
upgrade registry already used by database upgrade commands. The command must:

- support dry-run and be idempotent;
- preflight legacy Brand Brain and Creator Ops installations by immutable
  universal identifier;
- preserve metadata ownership and workspace records before synchronization;
- fail visibly when migration validation fails; and
- avoid applying a partial call to the full synchronizer when its
  `inferDeletionFromMissingEntities` behavior could remove unrelated standard
  metadata.

The implementation must select the smallest safe migration shape after
inspecting the desired and existing flat-map subsets. It must not assume that a
full standard-application replacement is safe for an incremental command.

### Brand Brain is a normal Nest module and tool provider

Create a focused `myah-brand-brain` server module using the established Nest
module/tool-provider registration pattern. It exposes exactly these existing
contracts:

- `brand-brain-get-context`;
- `brand-brain-search-or-read`;
- `brand-brain-seed-or-update-from-brief`; and
- `brand-brain-update-page-content`.

Port pure behavior from the fixture: normalized paths and slugs, hierarchy and
cycle validation, duplicate/path conflict detection, context and search
limits, deterministic planning, rich-text handling, link idempotency, and log
append behavior. Replace only the fixture's Core API SDK store integration with
injected server-side workspace data access. No credential may be accepted from
a request or a tool input.

The service must reject destructive writes. Seeding and fill-missing behavior
must not replace an existing page body. Existing proposal-free behavior remains
unchanged.

### Instagram remains first-party and scoped

Retain `MyahComposioService`, its REST controller, and
`SettingsAccountsInstagram`. The connection path remains:

`SettingsAccountsInstagram` -> `/rest/myah/instagram/*` -> Myah Composio
service -> Composio.

The following behavior is invariant:

- workspace-specific Instagram identity;
- active-account filtering and canonical account selection;
- agent-visible account-record upsert;
- permission-protected Settings access; and
- no polling, background sends, bulk messaging, auto-replies, or cold DMs.

The public Instagram SDK app contains additional conversation, message, and
send logic. Before deletion, the implementation must inventory all callers and
capabilities. It may be removed only when each required capability is absent or
has a verified first-party replacement; preserving the Settings connection flow
alone is not sufficient proof.

### Removal is the final cutover step

After standard metadata, existing-workspace migration, Brand Brain runtime, and
Instagram capability inventory/replacements pass their contracts, remove:

- the Brand Brain and Creator Ops SDK packages;
- the Instagram SDK package only if its full capability inventory permits it;
- the Myah standard-app promotion module, controller, guard, allowlist, queue
  wiring, and tests;
- the Myah-only deployment workflow and its sole-purpose composite action; and
- only the Myah-specific publisher/deployment configuration variables and
  secrets that have no remaining reference.

Retain general Twenty marketplace support and required Composio configuration.

## Data and compatibility rules

- Universal identifiers are immutable migration keys. Existing metadata and
  records must be reassigned or synchronized by those identifiers, never
  recreated with new identities.
- Legacy installation presence is a mandatory preflight condition, not an
  exceptional best-effort path.
- No duplicate object metadata, relation metadata, views, navigation entries,
  roles, layouts, or workspace records may result from the cutover.
- Person, Company, and Opportunity records and metadata are removed only for a
  workspace with a verified legacy Myah installation. They are retained for all
  other workspaces.
- Creator, Campaign, Brand Brain Page, Task, and Note records are preserved.
  Their replacement target relations use immutable universal identifiers and
  must not duplicate on rerun.
- Compatibility redirects may remain only while active route references need
  them; remove them in the same change once no references remain.

## Error handling

- Metadata validation or ownership-transfer failures stop the per-workspace
  migration and report failure; they do not silently skip a workspace.
- Dry-run reports intended changes without mutation.
- Brand Brain invalid hierarchy, destructive operation, or conflict input is
  rejected before persistence.
- Missing or invalid Instagram configuration remains an explicit server/UI
  error; the recovery migration must not introduce a fallback provider.

## Verification requirements

### Standard metadata and workspace migration

- Add focused standard-map tests that assert the full Brand Brain and Creator
  Ops metadata surface: object and field universal identifiers, relations,
  indexes, views, navigation, roles, layouts, commands, agents, and skills.
- Build those expectations through a test-only source-derived contract fixture.
  The fixture must classify each canonical manifest declaration by its actual
  flat-map category and relation endpoints; it must not duplicate hundreds of
  universal identifiers by hand. Until the legacy packages are deleted, the
  fixture may read their declarations as the migration source of truth. Before
  deletion, replace the fixture's legacy imports with an equivalent static
  contract generated from the verified source-owned definitions.
- Confirm new-workspace initialization synchronizes the standard application.
- Add a focused versioned-command test for dry-run, idempotency, successful
  migration, runtime registration in the next dispatchable version, permission
  reconciliation, no-installation CRM retention, and failed-migration ownership
  safety.
- Test against a disposable workspace to prove metadata owner, records, and
  navigation entries are correct without an application installation.
- Assert that the desired flat maps contain no Person, Company, or Opportunity
  object or dependent metadata and no retained relation targets their universal
  identifiers.
- Assert that Tasks and Notes can target Creator, Campaign, and Brand Brain Page
  through paired morph and inverse relations.
- Exercise the existing-workspace cutover against a disposable workspace with a
  verified legacy Myah installation and legacy CRM records; prove those records
  and objects are removed while Creator, Campaign, Brand Brain Page, Task, and
  Note data remain. Prove a workspace without that installation retains CRM data.

### Brand Brain runtime

- Port focused behavioral tests for paths, hierarchy, conflicts, memory/log
  formatting, plan application, idempotency, context/search limits, and data
  adapter pagination.
- Add an integration journey that creates a workspace, synchronizes metadata,
  seeds a brief, reads context, appends a non-destructive update, and verifies
  page/link/log records while proving existing page bodies and proposal state
  are preserved.

### Instagram and final removal

- Exercise the permissioned Settings connection path and validate that each
  request uses only the current workspace's account identity.
- Complete the Instagram SDK-app capability inventory before approving deletion.
- Run a repository reference scan after removal to prove the retired Myah
  publication/promotion path and its configuration references are gone.
- Deploy the ordinary server release to production, run the workspace command
  in dry-run then live mode, and record successful user-visible checks.

## Operational rollout

1. Complete all focused tests before production deployment.
2. Deploy the normal server release to the single production environment.
3. Run the versioned workspace migration with dry-run evidence, then live. The
   dry-run must report CRM deletion only for workspaces that pass the legacy
   Myah installation preflight.
4. Verify a new workspace, an upgraded existing workspace, Task/Note targets,
   Brand Brain runtime, and the Instagram Settings flow.
5. Remove the old application delivery path and unused Myah-only configuration.
6. Update `docs/operations/environment-isolation-audit.md` to state the
   approved production-only policy and remove the superseded staging mandate.

## Acceptance criteria

The migration is complete only when every eligible new workspace receives the
Myah metadata through standard synchronization; Person, Company, and
Opportunity objects are absent only from verified legacy Myah workspaces; Tasks
and Notes target Creator, Campaign, and Brand Brain Page; existing workspaces
are migrated without duplicate metadata and without unrelated CRM deletion; all
contracts run server-side; the retained Instagram flow behaves exactly as
before; no Myah feature depends on SDK app publication or promotion; and the
repository's operational documentation states the same production-only policy
as the implemented rollout.

# Myah Standard Apps Design

## Goal

Install approved first-party Myah applications into every current and future Myah workspace without users manually publishing or installing product data models.

## Scope

The initial Myah Standard Apps allowlist contains stable application universal identifiers for:

- Brand Brain Record Wiki MVP: `2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991`.
- Myah Creator Ops: the stable identifier exported by its `APPLICATION_UNIVERSAL_IDENTIFIER` constant.

Display names are not allowlist keys. Renaming an application must not create another registration or another installation.

## Architecture

Applications remain Twenty SDK applications. A release provisioning workflow builds and privately publishes their tarballs to the Myah Twenty server registry. The server applies an explicit first-party allowlist during registration: an allowlisted app is marked `isPreInstalled: true`, and its installation backfill is queued idempotently for existing Myah workspaces. The existing `PreInstalledAppsService.installOnWorkspace()` hook installs these registrations for every newly created workspace.

The registry is self-hosted by the target Myah/Twenty server. Private uploads use `POST /metadata` and `uploadAppTarball`; registration metadata is persisted by the server and the tarball is written through the deployment's configured file-storage backend. It is not a TwentyHQ-hosted registry.

## Authority model

Customer workspace admins and their API keys retain authority only inside their own workspace. They must not promote a package to a first-party Myah default or backfill it into other workspaces.

The existing `AdminPanelGuard` is the human platform-operator boundary: it authorizes the explicit Myah team email/domain configuration, independently of workspace roles. The permanent release path adds two separate, scoped non-human identities:

- A publisher identity may upload only approved Myah application artifacts to the private registry.
- A platform provisioning identity may validate the stable-ID allowlist, set `isPreInstalled` on an already-published registration, and queue idempotent installation backfills. “First-party” is the allowlist classification; it is not a new persisted registration field.

Neither identity may access arbitrary customer CRM data. Do not add a generic all-powerful API key or make application installation a web-server-startup side effect. The provisioning identity executes a one-shot deployment job that logs per-app and per-workspace results.

## Constraints

- Only explicit first-party Myah app identifiers may become preinstalled. Tenant-specific and experimental applications must remain opt-in.
- Publication must use a dedicated deployment credential stored as a secret; no personal user API key is committed, logged, or used as permanent CI infrastructure.
- The release path must explicitly target the configured Myah server URL, never localhost or production by default.
- Publishing an already-registered version and installing an already-installed app must be idempotent.
- Existing workspaces must receive a queued backfill; new workspaces rely on the existing workspace-creation install hook.
- Per-app and per-workspace failures must be observable and must not prevent unrelated approved apps from installing.
- Verify the real staging workspace metadata and UI after provisioning: Brand Brain objects and Creator Ops objects, including Creators, must appear.

## Non-goals

- Do not auto-install every arbitrary SDK package in the repository.
- Do not translate SDK manifests into one-off database migrations.
- Do not make web-server startup publish or install application packages.
- Do not use TwentyHQ infrastructure for Myah private application storage.

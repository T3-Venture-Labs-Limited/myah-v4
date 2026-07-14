# Standard app installation design

**Date:** 2026-07-13  
**Status:** Approved

## Problem

The `Deploy Myah Standard Apps` workflow publishes each app package and promotes
its registration to the marketplace, but does not install it into the selected
workspace. The existing staging workspace therefore exposes only the standard
objects even though Brand Brain and Creator Ops are available in the app
marketplace.

## Goal

Each explicit staging or production dispatch must leave its selected workspace
with the currently promoted Brand Brain and Creator Ops schemas installed or
upgraded.

## Non-goals

- No automatic deployment or installation trigger on pushes or merges.
- No change to Railway source-detachment or release promotion rules.
- No new secret, credential value, or workspace identifier in source control.
- No custom-object substitute for either app schema.

## Design

Extend `.github/actions/install-twenty-app` and
`.github/workflows/deploy-myah-standard-apps.yaml`; do not change server
installation semantics.

For each app, retain the existing ordered steps:

1. Publish the app tarball using the selected environment API URL and app
   publisher key.
2. Promote the exact application universal identifier to the standard-app
   marketplace using the selected environment deployment token.
3. Invoke the existing `.github/actions/install-twenty-app` composite action
   with the same selected API URL, app publisher key, source app path,
   `workspace-path: .`, and `allow-existing-installation: true`.

The workflow installs these applications in order:

| App | Universal identifier | Source path |
| --- | --- | --- |
| Brand Brain Record Wiki MVP | `2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991` | `packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp` |
| Myah Creator Ops | `72f2fd16-880c-4c63-852f-dbf63f51c152` | `packages/twenty-apps/internal/myah-creator-ops` |

## Installer behavior

The core service intentionally rejects an equal installed version with
`APP_ALREADY_INSTALLED` and rejects a lower version with
`CANNOT_DOWNGRADE_APPLICATION`. The composite action will add an opt-in
`allow-existing-installation` input. When true, it treats only the server's
exact equal-version message, `This version of the application is already
installed in this workspace.`, as a successful no-op. It preserves the
non-zero result for downgrades and every other install failure.

The action will also add a `workspace-path` input, defaulting to the repository
root. This supplies the root `.nvmrc` and `yarn.lock` for app paths that do not
contain those files.

The deploy workflow opts into this behavior only for the two standard apps.
Its second dispatch also requires PR #15's publish retry handling for an
already-published private version. With that prerequisite merged, repeated
explicit dispatches converge the target workspace without duplicate schemas.

## Credential and environment boundary

The existing `Select staging credentials` and `Select production credentials`
steps remain the sole credential selection point. The added installer steps
consume only `MYAH_API_URL` and `MYAH_APP_PUBLISHER_KEY` that those steps export.
The workflow remains `workflow_dispatch`-only: a production installation needs
an operator to explicitly select `production` and satisfy GitHub environment
protection.

## Failure handling

A failed installation fails the dispatch after promotion and before the next
app proceeds. It does not send email, create customer campaign data, or deploy
the application server. The operator investigates the selected workspace key,
app manifest, or installer output; they do not replace the missing schemas with
custom objects.

## Verification

1. Validate the changed workflow syntax locally.
2. Dispatch the workflow to `staging`; require both installer steps to succeed.
3. In the authenticated staging workspace, verify both apps appear under
   **Settings → Workspace → Apps → Installed** and their objects appear under
   **Settings → Workspace → Data model**.
4. Dispatch staging a second time to prove the installer upgrades or remains
   idempotent without duplicate app schemas.
5. Run the non-sending release smoke only after the expected campaign, deal,
   approval, and receipt/timeline objects exist.

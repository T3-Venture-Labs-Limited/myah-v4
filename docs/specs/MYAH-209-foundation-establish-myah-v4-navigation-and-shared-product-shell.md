# MYAH-209 — Myah v4 navigation and shared product shell

**Status:** Design approved 2026-07-20  
**Linear:** [MYAH-209](https://linear.app/t3labs/issue/MYAH-209/foundation-establish-myah-v4-navigation-and-shared-product-shell)  
**Scope:** Core MVP foundation; no feature-page implementation, migration, provider action, deployment, merge, or production mutation.

## Goal

Establish the shared Myah v4 product shell so the Core MVP workstreams build one connected creator-operations application rather than separate feature surfaces. The shell owns the primary sidebar, stable page-entry routes, visual conventions, and worktree integration boundary. Each feature workstream owns only the content behind its assigned route.

## Product decisions

- Myah is a human-in-the-loop creator-operations application for experienced campaign operators.
- The main navigation must use the approved two-level Myah hierarchy. Today and Inbox remain one click away.
- The Myah sidebar **replaces** Twenty's generic workspace and favorites sections as the primary product navigation.
- Existing Myah/Twenty pages, records, views, side panels, permissions, and direct URLs remain available. Each future page may adapt an existing Twenty surface, render a Myah-specific body, or combine both, based on the operator UX for that page; the shell must not pre-decide that choice.
- Do not add `Settings` to the Myah sidebar. The existing settings access mechanism remains unchanged.
- Do not show duplicate primary surfaces for the same operator job: `Today`, not `Dashboards`; `Automations`, not a separate visible `Workflows` page.
- `Soon` means a planned information-architecture placement, not available product functionality. A `Soon` item must not navigate or respond to keyboard activation.

## Deviation rationale: direct frontend-core ownership

Twenty metadata/app navigation cannot enforce the approved product hierarchy while removing the generic workspace/favorites drawer, pinning Today and Inbox, providing a single selected-state model, and reserving feature-entry routes consistently. A separate `/myah/*` mini-app would duplicate routing and shell behavior, producing the disconnected experience this issue exists to prevent.

MYAH-209 therefore changes the Twenty frontend drawer directly, while reusing Twenty's existing routes, record views, permissions, side panels, visual tokens, responsive drawer, and metadata-driven object pages. This is the smallest custom layer that satisfies the approved IA.

## Page-body strategy: route contract, not page implementation mandate

MYAH-209 standardizes where an operator enters a product area and how shared shell behavior works. It deliberately does not prescribe every page body.

- Reuse an existing Twenty metadata/object/view page when its table, records, filters, saved views, side panels, and permissions provide the best operator UX.
- Build a Myah-specific page body when an existing Twenty page cannot express the operator job clearly enough.
- Use a hybrid page when an existing Twenty surface remains valuable but needs Myah-specific context, actions, or composed panels.
- The owning feature workstream makes this decision page by page and documents why a custom page is needed before creating one.

The navigation registry is stable across all three choices: a future change from an adapter to a hybrid or Myah-specific body does not rename the route, move the sidebar item, or require a parallel shell.

## Information architecture

```text
Today
Inbox

Creator CRM
  Creators
  Creator Lists
  Creator Discovery                  Soon

Campaign Operations
  Campaigns
  Deliverables                       Soon
  Creator Briefs                     Soon
  Creator Videos                     Soon
  Analytics                          Soon

Outreach
  Automations
  Automation runs
  Automation versions
  Tasks

Brand & Workspace
  Brand Brain
```

Deferred route contracts not rendered in the MYAH-209 sidebar: Segments, Approvals, Connected Channels.

### Navigation rules

1. Today and Inbox are pinned above all groups.
2. Group labels organise direct child pages; they are not destinations.
3. The global sidebar has two levels only: group and direct child route.
4. A group containing the current route is expanded. Operators may collapse inactive groups.
5. The current route has one subtle, accessible selected treatment; non-current routes do not simulate selection.
6. `Soon` items are muted, labelled `Soon`, excluded from link semantics, and non-interactive.
   - The current `NavigationDrawerItem` `soon` modifier alone is insufficient when a `to` prop is present because it remains link-shaped. A `Soon` renderer must omit `to`, expose disabled semantics, and prevent pointer and keyboard activation; extend the shared primitive only if its existing API cannot meet those requirements.
7. Nested group children reuse Twenty's existing `getNavigationSubItemLeftAdornment` treatment, including its continuous connector and last-child termination. Myah must not recreate that visual grammar with custom connector CSS.
8. `Soon` items use an existing semantic `twenty-ui` icon rather than a generic circle.
9. Record-level tabs are permitted because they are views of a single record; they do not create third-level global navigation.
10. The mobile drawer renders the same registry and behavior as desktop. It must not introduce a second navigation hierarchy.

## Stable route contract

MYAH-209 creates and owns stable Myah entry paths. A route may initially render an adapter to an existing Twenty page or a minimal shell owned by its future workstream, but its pathname and page identifier do not change when that content is implemented.

| Page ID | Visible label | Primary path | Initial owner | Initial behavior |
| --- | --- | --- | --- | --- |
| `today` | Today | `/myah/today` | MYAH-215 | Adapts the existing Dashboards capability into the operator attention and outcome surface. |
| `inbox` | Inbox | `/myah/inbox` | MYAH-212 | Stable entry route for the human-operated communication workspace. |
| `creators` | Creators | `/myah/creators` | MYAH-210 | Stable entry route for the Creator-primary CRM. |
| `creator-lists` | Creator Lists | `/myah/creator-lists` | MYAH-210 | Adapts the existing Creator Lists metadata/object page. |
| `segments` | Segments | `/myah/segments` | MYAH-210 | Deferred route contract; it is not navigable until MYAH-210 supplies a real native adapter or page body. |
| `campaigns` | Campaigns | `/myah/campaigns` | MYAH-211 | Adapts the existing Campaigns metadata/object page. |
| `automations` | Automations | `/myah/automations` | MYAH-213 | Adapts the existing Workflows capability with Myah outreach terminology. |
| `automation-runs` | Automation runs | `/myah/automation-runs` | MYAH-213 | Adapts Twenty's native Workflow Run object list. |
| `automation-versions` | Automation versions | `/myah/automation-versions` | MYAH-213 | Adapts Twenty's native Workflow Version object list. |
| `tasks` | Tasks | `/myah/tasks` | MYAH-215 | Stable entry route for assigned and due work. |
| `approvals` | Approvals | `/myah/approvals` | MYAH-215 | Deferred route contract; it is not navigable until MYAH-215 supplies a real native adapter or page body. |
| `brand-brain` | Brand Brain | `/myah/brand-brain` | MYAH-214 | Resolves the installed Brand Brain Page metadata object by stable universal identifier and adapts its native object page when present and readable; otherwise uses Twenty's established unavailable/permission behavior. |
| `connected-channels` | Connected Channels | `/myah/connected-channels` | MYAH-212 | Deferred route contract; it is not navigable until MYAH-212 supplies a real native adapter or page body. |

The following route IDs are reserved as non-interactive `Soon` placements: `creator-discovery`, `deliverables`, `creator-briefs`, `creator-videos`, and `analytics`. They intentionally have no active path until their owning workstream defines a useful product surface.

`segments`, `approvals`, and `connected-channels` are a distinct `deferred` state during the MYAH-209 foundation. They retain stable IDs and paths for their owners but do not render a sidebar destination or a placeholder page until the owner registers a real Twenty-native adapter, Myah-specific body, or hybrid body. `deferred` is distinct from the priority-2 `Soon` presentation above.

### Route adapter requirements

- Use one typed registry as the source of truth for page ID, label, icon, group, availability, and destination.
- Register the `/myah/*` route family in `useCreateWorkspaceAppRouter` inside the authenticated `DefaultLayout` and `MainAppLayoutWithSidePanel` branch, before `AppPath.NotFoundWildcard`, so direct Myah URLs retain the primary shell and do not resolve as not found.
- Once the authenticated workspace and Today resolver are `ready` or `forbidden`, the root/default-home redirect resolves to the `today` entry path rather than the first generic navigation-menu or metadata object. Preserve the current metadata-readiness wait and keep the root at `AppPath.Index` while Today is `pending` or `missing`, so bootstrap cannot redirect to a broken Myah route.
- Descriptors identify core objects by typed core object name and app objects by stable object `universalIdentifier`; they never store a workspace-local object metadata ID or page-layout ID. After metadata, views, last-visited-view state, object permissions, and any page-layout metadata are ready, resolve the identity to `pending`, `ready`, `missing`, or `forbidden`, then build native paths with Twenty helpers. A `deferred` descriptor has no destination resolution until its owning workstream registers one.
- Every available descriptor declares an `entryPath` and a matcher over the current location plus its resolved destination identity. Object adapters match the Myah entry path, every query/hash variant of the resolved object-index pathname, and record-show paths for the resolved object's singular name; standalone-page adapters match their resolved page path. Matchers return false for unresolved destinations, and precedence guarantees at most one selected Myah item.
- Initial Twenty-native adapters redirect with `replace` to the resolved native `AppPath` route. Embedding `RecordIndexPage`, `RecordShowPage`, or `StandalonePageLayoutPage` at a `/myah/*` location is allowed only when the adapter supplies their route parameters and context and extends `MainContextStoreProvider` route recognition.
- The Automation entries adapt the typed core objects `Workflow`, `WorkflowRun`, and `WorkflowVersion`; they do not create a parallel workflow or execution data model.
- The `/myah` dispatcher resolves only `ready` registry entries. Unknown and `Soon` IDs render `NotFound`; `missing` and `forbidden` entries use Twenty's established unavailable/permission behavior without fallback navigation.

## Shared shell conventions

### Page shell

A Twenty-native adapter renders its native Twenty page shell unchanged. A Myah-specific or hybrid page uses the following outer structure when it owns the page header:

1. A concrete page title.
2. A short operator-oriented description only when it adds necessary context.
3. A page-owned primary action when one exists.
4. Its Twenty-native, Myah-specific, or hybrid body.

No strategy adds a second header, nested product chrome, second sidebar, or page-specific global navigation.

### Shared language

Use these labels consistently across Core MVP pages:

- Primary nouns: **Creator**, **Campaign**, **Sequence**, **Task**, **Approval**.
- Channels: **Email** and **Instagram** remain distinct.
- Attention/status language: **Attention needed**, **Follow-up due**, **Awaiting approval**, **Paused after reply**, **Delivery failed**.

Feature workstreams may add domain-specific states, but must not rename these shared concepts for the same meaning.

### Visual and interaction conventions

- Reuse Twenty UI components, theme tokens, tables, filters, saved views, drawers, side panels, loading skeletons, error surfaces, and empty-state patterns.
- Keep the existing compact, readable Twenty visual language: light neutral surfaces, restrained borders/shadows, semantic status treatment, accessible contrast, and visible keyboard focus.
- The global shell contains no hard-coded colors, spacing, or parallel component system.
- Loading, empty, and error behavior belongs to the page body and uses existing Twenty conventions; the navigation shell remains stable while the route resolves.

## Worktree integration contract

### MYAH-209 owns

- The typed navigation and route registry.
- The primary drawer composition, pinned links, grouped child rendering, selected state, collapse behavior, mobile behavior, semantic `Soon` icons, existing Twenty nested-child connector treatment, and `Soon` treatment.
- Replace only the navigation-menu content seam: bypass generic opened/favorites/workspace content in `MainNavigationDrawerNavigationContent` and `MainNavigationDrawerScrollableItems`, while retaining `MainNavigationDrawer`, its header and AI tabbed content, `NavigationDrawer`, `AppNavigationDrawer` settings switching, and `NavigationDrawerItem` navigation behavior.
- Own group expansion in `isNavigationSectionOpenFamilyState`, keyed by stable registry group ID. Effective state is `storedOpen || isActiveGroup`; an active group cannot be collapsed. Desktop and mobile consume this same state.
- Stable Myah route names and adapters to existing destinations.
- Shared page-header and state-convention documentation.
- Shell-level tests and desktop UI smoke evidence.

### Feature workstreams own

- Their assigned page body, data requirements, business actions, page-specific loading/empty/error states, and feature tests.
- Selecting the appropriate page-body strategy—Twenty-native, Myah-specific, or hybrid—for their operator job, while documenting any choice that adds custom UI over an existing Twenty primitive.
- Implementing content behind the route MYAH-209 reserves for them.
- Adding feature-specific record tabs only within their own record surfaces.

### Feature workstreams must not

- Redefine the global sidebar, route registry, group labels, shared status vocabulary, or `Soon` semantics.
- Reintroduce generic workspace/favorites sections as a visible product-navigation fallback.
- Create a second product shell or duplicate a mapped legacy capability under its old global label.

A shell-contract change requires an explicit MYAH-209 update before downstream branches adopt it.

## Scope boundaries

### Included

- Core frontend drawer replacement and associated route registry.
- Stable Myah entry routes and adapters for existing pages.
- Reuse of Twenty responsive navigation, accessibility, visual tokens, records, permissions, views, and side panels.
- The two-level sidebar and documented shared page-shell conventions.
- Route, selected-state, legacy-page-access, and desktop smoke verification.

### Excluded

- Inbox, CRM, Campaigns, Automations, Automation runs, Automation versions, Tasks, Approvals, Brand Brain, or Connected Channels feature internals beyond the minimum route adapter/shell necessary to establish the contract.
- New metadata objects, fields, migrations, provider integrations, external sends, provider mutations, or database writes.
- A separate Myah mini-app, duplicated generic workflows page, generic dashboard primary page, or custom UI component system.
- Production deployment, merge, provider mutation, or settings navigation changes.

## Acceptance criteria

1. The rendered MYAH-209 sidebar tree is exactly the non-deferred items above, with Today and Inbox pinned and no visible generic Twenty workspace/favorites section. Segments, Approvals, and Connected Channels retain stable paths but are absent until their owning workstreams register real bodies.
2. Settings is not present in the Myah sidebar; existing settings access still works.
3. The sidebar has at most two global levels and accurately reflects expanded, collapsed, and selected states.
4. Existing Brand Brain, Creator Lists, Campaigns, Dashboards, Workflows, Workflow Runs, and Workflow Versions capabilities have one explicit Myah-visible destination without duplicate primary surfaces.
5. The shell supports a Twenty-native page, a Myah-specific page, or a hybrid page body without changing the route registry or global navigation contract.
6. Every Core MVP workstream has a stable, documented entry route; every `available` route has a coherent page shell, while each `deferred` route remains non-navigable until its owner provides a real body.
7. `Soon` entries use semantic icons, are visually distinct, and are provably non-interactive.
8. Existing record/view/direct URLs, permissions, side panels, and mobile drawer behavior are preserved.
9. Shared shell conventions and worktree boundaries are documented in a private MYAH-209 Linear handoff for MYAH-210 through MYAH-215; no repository documentation is added for that purpose.
10. Targeted tests cover registry discriminants; direct loading of every available `/myah/*` path; unknown and `Soon` paths; root staying at `/` until metadata/navigation readiness then resolving to `/myah/today`; query-insensitive index and mapped record-route selection; active-group expansion precedence; missing/forbidden metadata; replace-history back/forward behavior; semantic `Soon` icons; the shared nested-child connector states; and pointer/keyboard `Soon` behavior.
11. A desktop and mobile browser smoke covers mapped and legacy URLs, settings round-trip, an object record side panel, one restricted-role destination, back/forward, and mobile navigation that closes the drawer then reopens with the same selected hierarchy.

## Verification strategy

1. Start with focused failing tests for the typed registry, sidebar rendering, native Automation object resolution, shared nested-child connector rendering, semantic `Soon` icons, route selection, and `Soon` non-interaction.
2. Run the focused frontend test files after each shell slice.
3. Run `yarn nx typecheck twenty-front` after the route and drawer change.
4. Run `yarn nx lint:diff-with-main twenty-front` after the diff is committed or use targeted frontend lint/format checks while changes remain uncommitted.
5. Launch the frontend against the local Myah/Twenty runtime and perform the desktop browser smoke:
   - navigate to Today and Inbox;
   - open each group and verify one selected child state;
   - verify a `Soon` item cannot navigate;
   - open mapped Brand Brain, Creator Lists, Campaigns, Automations, Automation runs, and Automation versions destinations;
   - verify legacy direct URLs still resolve;
   - verify the mobile drawer presents the same hierarchy.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A hard-coded object route drifts when workspace metadata changes. | Resolve existing metadata-backed destinations through Twenty path helpers and object metadata. |
| Redirect adapters make navigation selected state or browser history confusing. | Test deep links, back/forward behavior, and selected state for every existing-page adapter. |
| Downstream worktrees modify the drawer independently. | Keep the registry and shell ownership in MYAH-209; document the contract and reject competing navigation edits. |
| A `Soon` entry implies feature availability. | Render it as a disabled non-link with explicit `Soon` text and regression-test pointer/keyboard behavior. |
| Generic Twenty pages become inaccessible. | Preserve direct URLs and provide explicit mapped Myah destinations for approved Core MVP capabilities. |

## References

- Linear: MYAH-209, MYAH-176, MYAH-205, MYAH-153.
- `hermesWiki/queries/myah-v4-initial-sidebar-information-architecture-2026-07-19.md`.
- `hermesWiki/concepts/myah-v4-approved-feature-priorities-2026-07-19.md`.
- `hermesWiki/queries/myah-v4-core-mvp-claude-design-prompt-2026-07-19.md`.

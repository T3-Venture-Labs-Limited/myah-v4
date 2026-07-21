# MYAH-209 Myah v4 Navigation and Shared Product Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Twenty's visible generic workspace/favorites navigation with the approved Myah two-level shell, providing runtime-safe adapters and stable Core MVP entry paths without pre-choosing each page body's implementation strategy.

**Architecture:** A typed registry defines the Myah information architecture and a runtime resolver converts metadata-backed identities into permission-aware native Twenty destinations. The existing drawer frame, AI tabbed content, settings drawer, record pages, side panels, and mobile-close behavior remain Twenty-owned; only the generic navigation-menu content seam is replaced. Native-object adapters redirect with `replace` to their normal Twenty routes, while future Myah-specific and hybrid page bodies plug into the same stable registry paths.

**Tech Stack:** React 19, React Router, TypeScript, Jotai, Linaria, Twenty UI, Twenty metadata store, Jest/React Testing Library, Nx/Yarn 4.

## Global Constraints

- Work only in `.worktrees/zeno-myah-209-foundation-establish-myah-v4-navigation-and-shared-product` on branch `zeno/myah-209-foundation-establish-myah-v4-navigation-and-shared-product`.
- Use Node `24.5.0` and Yarn 4; do not use npm or pnpm.
- The Myah sidebar replaces visible generic workspace/favorites navigation. Preserve `MainNavigationDrawer`, AI tabbed content, `AppNavigationDrawer` settings switching, direct Twenty URLs, record views, side panels, permissions, and mobile-drawer behavior.
- Do not put Settings in the Myah sidebar.
- Use a typed registry as the sole source of page ID, label, icon, group, availability, identity, destination, and active matching.
- Page bodies remain page-by-page choices: Twenty-native, Myah-specific, or hybrid. Do not create a second shell or invent placeholder feature pages.
- Resolve app objects by stable `universalIdentifier`, never workspace-local metadata IDs. Resolve navigability only after metadata, views, last-visited view state, and object permissions are ready.
- `Soon` items are non-links with disabled pointer and keyboard semantics. The existing `NavigationDrawerItem` `soon` modifier alone is insufficient when `to` is supplied.
- Use Twenty components and theme tokens; no custom global UI system, hard-coded colors, or hard-coded spacing.
- No migration, provider action, database write, deployment, merge, or production mutation.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/twenty-front/src/modules/myah/navigation/myah-navigation-registry.ts` | Static typed Myah IA, stable paths, destination identities, and availability. |
| `packages/twenty-front/src/modules/myah/navigation/types/MyahNavigationRoute.ts` | Registry, resolved-route, destination, and group types. |
| `packages/twenty-front/src/modules/myah/navigation/hooks/useResolvedMyahNavigationRoutes.ts` | Permission- and metadata-aware runtime destination resolver. |
| `packages/twenty-front/src/modules/myah/navigation/utils/isMyahNavigationRouteActive.ts` | Semantic active matching for Myah paths, native object index paths, and object record paths. |
| `packages/twenty-front/src/modules/myah/navigation/states/isNavigationSectionOpenFamilyState.ts` | Persistent group expansion keyed by stable Myah group ID. |
| `packages/twenty-front/src/modules/myah/navigation/components/MyahNavigationDrawerSection.tsx` | Pinned links, groups, disabled Soon entries, and active-group behavior. |
| `packages/twenty-front/src/modules/myah/navigation/components/MyahNavigationRouteDispatcher.tsx` | `/myah/:pageId` dispatcher; `replace` redirects to ready native destinations and returns established unavailable/not-found surfaces otherwise. |
| `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx` | Replace generic opened/favorites/workspace content with the Myah drawer section. |
| `packages/twenty-front/src/modules/app/hooks/useCreateWorkspaceAppRouter.tsx` | Register the authenticated `/myah/:pageId` route before the wildcard. |
| `packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts` | Preserve readiness guards, then route the Myah workspace default home to `/myah/today`. |
| `packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/NavigationDrawerItem.tsx` | Add accessible disabled-item semantics only if the Myah renderer cannot produce the required disabled button/link behavior through its current API. |
| `packages/twenty-front/src/modules/**/__tests__/*myah*` | Focused registry, resolver, active-state, drawer, route, and default-home regression coverage. |

## Task 1: Define and resolve the typed route contract

**Files:**
- Create: `packages/twenty-front/src/modules/myah/navigation/types/MyahNavigationRoute.ts`
- Create: `packages/twenty-front/src/modules/myah/navigation/myah-navigation-registry.ts`
- Create: `packages/twenty-front/src/modules/myah/navigation/hooks/useResolvedMyahNavigationRoutes.ts`
- Create: `packages/twenty-front/src/modules/myah/navigation/utils/isMyahNavigationRouteActive.ts`
- Test: `packages/twenty-front/src/modules/myah/navigation/__tests__/myah-navigation-registry.test.ts`
- Test: `packages/twenty-front/src/modules/myah/navigation/hooks/__tests__/useResolvedMyahNavigationRoutes.test.tsx`
- Test: `packages/twenty-front/src/modules/myah/navigation/utils/__tests__/isMyahNavigationRouteActive.test.ts`

**Interfaces:**

```ts
export type MyahNavigationPageId =
  | 'today'
  | 'inbox'
  | 'creators'
  | 'creator-lists'
  | 'segments'
  | 'creator-discovery'
  | 'campaigns'
  | 'deliverables'
  | 'creator-briefs'
  | 'creator-videos'
  | 'analytics'
  | 'sequences'
  | 'tasks'
  | 'approvals'
  | 'brand-brain'
  | 'connected-channels';

export type MyahNavigationAvailability =
  | 'available'
  | 'deferred'
  | 'soon';

export type MyahNavigationObjectIdentity =
  | {
      kind: 'core-object';
      nameSingular: CoreObjectNameSingular;
    }
  | {
      kind: 'app-object';
      universalIdentifier: string;
    };

export type MyahNavigationDestination =
  | { kind: 'native-object'; object: MyahNavigationObjectIdentity }
  | { kind: 'native-page-layout'; pageLayoutUniversalIdentifier: string }
  | { kind: 'myah-page'; Component: MyahNavigationPageComponent };

export type ResolvedMyahNavigationRoute =
  | { status: 'pending'; route: MyahNavigationRoute }
  | {
      status: 'ready';
      route: MyahNavigationRoute;
      destination:
        | { kind: 'native'; path: string; objectNameSingular?: string }
        | { kind: 'myah-page'; Component: MyahNavigationPageComponent };
    }
  | {
      status: 'forbidden';
      route: MyahNavigationRoute;
      destination: { kind: 'native'; path: string; objectNameSingular?: string };
    }
  | { status: 'deferred' | 'missing' | 'soon'; route: MyahNavigationRoute };
```

**Produces:** `MYAH_NAVIGATION_ROUTES`, `getMyahEntryPath(pageId)`, `useResolvedMyahNavigationRoutes()`, and `isMyahNavigationRouteActive()` for Tasks 2 and 3.

- [x] **Step 1: Write the failing registry and matching tests**

Cover the approved hierarchy exactly: Today and Inbox pinned; grouped direct children; no Settings; Priority 2 IDs `creator-discovery`, `deliverables`, `creator-briefs`, `creator-videos`, and `analytics` are `soon`; Segments, Approvals, and Connected Channels are stable but non-rendered `deferred` routes; every other available Core MVP ID has `/myah/<id>` as its entry path. Write a per-ID destination inventory before implementation: Today→core Dashboard, Inbox→core MessageThread, Creators→Creator app object, Creator Lists→Creator List app object, Campaigns→Campaign app object, Sequences→core Workflow, Tasks→core Task, and Brand Brain→Brand Brain Page app object. A descriptor without a real native target or page component is invalid and must be `deferred`, never `available`. Assert no duplicate ID, label, or entry path and one selected match at most.

```ts
expect(MYAH_NAVIGATION_ROUTES.filter(({ group }) => group === null)).toEqual([
  expect.objectContaining({ id: 'today', entryPath: '/myah/today' }),
  expect.objectContaining({ id: 'inbox', entryPath: '/myah/inbox' }),
]);
expect(getMyahEntryPath('creator-briefs')).toBe('/myah/creator-briefs');
expect(getMyahNavigationRoute('creator-briefs').availability).toBe('soon');
expect(isMyahNavigationRouteActive({
  route: resolvedCampaignRoute,
  pathname: '/object/campaign/campaign-id',
  search: '',
  hash: '',
})).toBe(true);
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx jest packages/twenty-front/src/modules/myah/navigation/__tests__/myah-navigation-registry.test.ts packages/twenty-front/src/modules/myah/navigation/hooks/__tests__/useResolvedMyahNavigationRoutes.test.tsx packages/twenty-front/src/modules/myah/navigation/utils/__tests__/isMyahNavigationRouteActive.test.ts --config=packages/twenty-front/jest.config.mjs
```

Expected: FAIL because the registry, resolver, and matcher do not exist.

- [x] **Step 3: Implement the minimal registry and resolver**

Create one readonly registry. Use group IDs `creator-crm`, `campaign-operations`, `outreach`, and `brand-workspace`; store icons as `IconComponent`; reserve `null` group only for Today and Inbox. Identify core objects with `CoreObjectNameSingular` and app objects with their stable `universalIdentifier`, including `BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER`. Never store a workspace-local metadata ID or page-layout ID.

The resolver returns `pending` until every source required by the descriptor is loaded: object metadata, fields, views, view fields, permissions, last-visited-view data, and, for page-layout descriptors, `pageLayouts`, `pageLayoutTabs`, and `pageLayoutWidgets`. `pending` is distinct from `missing`; only a fully loaded source may produce `missing`.

Resolve destinations exhaustively:

```ts
switch (route.destination.kind) {
  case 'native-object':
    // Resolve core-object by nameSingular, app-object by universalIdentifier.
    // Build AppPath.RecordIndexPage from the resolved namePlural.
    // Return forbidden with the native path when canReadObjectRecords is false.
    break;
  case 'native-page-layout':
    // Resolve pageLayoutsWithRelationsSelector by universalIdentifier.
    // Build AppPath.PageLayoutPage from the resolved workspace-local pageLayout.id.
    break;
  case 'myah-page':
    // Return ready only with the descriptor's real Component.
    break;
}
```

Use existing Twenty navigation/path helpers and last-visited-view logic for native object destinations. The active matcher must match the Myah entry path, every query/hash variant of a resolved object-index pathname, resolved object record-show paths, and the resolved standalone page-layout pathname. It returns `false` for `pending`, `deferred`, `missing`, `forbidden`, and `soon` states.

- [x] **Step 4: Run the focused tests to verify they pass**

Run the Step 2 command.

Expected: PASS. The resolver distinguishes `pending`, `ready`, `deferred`, `missing`, `forbidden`, and `soon`; record links and saved-view URLs retain the correct Myah selection.

- [x] **Step 5: Preserve the verified slice for review**

Do not stage, commit, push, or open a pull request without explicit maintainer approval. Leave the verified Task 1 changes in the isolated worktree for the next review checkpoint.

## Task 2: Render the Myah-only drawer with accessible groups and Soon items

**Files:**
- Create: `packages/twenty-front/src/modules/myah/navigation/states/isNavigationSectionOpenFamilyState.ts`
- Create: `packages/twenty-front/src/modules/myah/navigation/components/MyahNavigationDrawerSection.tsx`
- Create: `packages/twenty-front/src/modules/myah/navigation/components/MyahNavigationDrawerGroup.tsx`
- Modify: `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx`
- Modify: `packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/NavigationDrawerItem.tsx` only if needed for disabled semantics
- Test: `packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationDrawerSection.test.tsx`
- Test: `packages/twenty-front/src/modules/navigation/components/__tests__/MainNavigationDrawerScrollableItems.test.tsx`

**Interfaces:**

```ts
export const isNavigationSectionOpenFamilyState = createAtomFamilyState<
  boolean,
  MyahNavigationGroupId
>({
  key: 'isNavigationSectionOpenFamilyState',
  defaultValue: true,
});
```

`MyahNavigationDrawerSection` consumes `useResolvedMyahNavigationRoutes()` and `isMyahNavigationRouteActive()`. It produces the complete visible Myah tree for the existing main drawer.

- [x] **Step 1: Write the failing drawer tests**

Test the user-visible contract:

```ts
expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute(
  'href',
  '/myah/today',
);
expect(screen.getByText('Creator CRM')).not.toHaveAttribute('href');
expect(screen.getByText('Campaigns').closest('[aria-selected="true"]')).toBeVisible();
expect(screen.getByText('Creator Briefs')).toHaveTextContent('Soon');
const creatorBriefsControl = screen.getByRole('button', {
  name: /Creator Briefs.*Soon/i,
});
expect(creatorBriefsControl).toHaveAttribute('aria-disabled', 'true');
expect(creatorBriefsControl).toHaveAttribute('tabindex', '-1');
```

Add keyboard assertions that a group toggle responds to Enter/Space, a `Soon` item cannot receive activation, and an active group remains expanded even when its stored preference is closed. Assert `MainNavigationDrawerScrollableItems` no longer renders Favorites, Workspace, or the generic opened section.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx jest packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationDrawerSection.test.tsx packages/twenty-front/src/modules/navigation/components/__tests__/MainNavigationDrawerScrollableItems.test.tsx --config=packages/twenty-front/jest.config.mjs
```

Expected: FAIL because the Myah section and group state do not exist and generic sections still render.

- [x] **Step 3: Implement the drawer seam replacement**

Keep `MainNavigationDrawer`, `MainNavigationDrawerTabsRow`, `NavigationDrawerTabbedContent`, `NavigationDrawer`, and `AppNavigationDrawer` unchanged. Replace only `MainNavigationDrawerScrollableItems` content with `MyahNavigationDrawerSection`; remove its lazy Favorites and Workspace dispatchers and `NavigationDrawerOpenedSection` from the rendered tree.

Render group headings as actual buttons with `aria-expanded`, not as links. The effective group state is:

```ts
const isExpanded = storedIsOpen || hasActiveChild;
```

Do not allow the active group to collapse. Available `ready` entries use `NavigationDrawerItem` with their Myah entry path. Filter `deferred` entries from the sidebar entirely. `soon`, `missing`, and `forbidden` entries do not receive a `to` prop. Render `Soon` as an explicitly disabled control with `aria-disabled="true"`, no navigation handler, and no keyboard activation. If the current `NavigationDrawerItem` cannot render a real disabled button without link semantics, add a narrowly scoped `disabled?: boolean` prop that removes `to`/`href`, suppresses `useMouseDownNavigation`, sets `disabled`, `aria-disabled`, and `tabIndex={-1}`, while retaining current mobile-close behavior for enabled items.

- [x] **Step 4: Run focused tests to verify they pass**

Run the Step 2 command.

Expected: PASS. The main drawer exposes only the approved Myah hierarchy, preserves keyboard/mobile behavior for enabled links, and gives no link or activatable control to Soon entries.

- [x] **Step 5: Preserve the verified slice for review**

Do not stage, commit, push, or open a pull request without explicit maintainer approval. Leave the verified Task 2 changes in the isolated worktree for the next review checkpoint.

## Task 3: Register stable Myah routes and safe native adapters

**Files:**
- Create: `packages/twenty-front/src/modules/myah/navigation/components/MyahNavigationRouteDispatcher.tsx`
- Modify: `packages/twenty-front/src/modules/app/hooks/useCreateWorkspaceAppRouter.tsx`
- Modify: `packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts`
- Test: `packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationRouteDispatcher.test.tsx`
- Test: `packages/twenty-front/src/modules/app/hooks/__tests__/useCreateWorkspaceAppRouter.test.tsx`
- Modify: `packages/twenty-front/src/modules/navigation/hooks/__tests__/useDefaultHomePagePath.test.ts`

**Interfaces:**

```tsx
export const MyahNavigationRouteDispatcher = () => {
  const { pageId } = useParams<{ pageId: MyahNavigationPageId }>();
  const resolvedRoute = useResolvedMyahNavigationRoutes().find(
    ({ route }) => route.id === pageId,
  );

  if (
    !resolvedRoute ||
    resolvedRoute.status === 'deferred' ||
    resolvedRoute.status === 'soon'
  ) {
    return <NotFound />;
  }

  if (resolvedRoute.status === 'pending') {
    return <Loader />;
  }

  if (resolvedRoute.status === 'missing') {
    return <NotFound />;
  }

  if (resolvedRoute.destination.kind === 'myah-page') {
    return <resolvedRoute.destination.Component />;
  }

  return <Navigate replace to={resolvedRoute.destination.path} />;
};
```

- [x] **Step 1: Write failing router and default-home tests**

Assert that `/myah/:pageId` is declared after authenticated layouts and before `AppPath.NotFoundWildcard`; each available descriptor resolves through its declared destination kind; deferred entries do not render in the sidebar and their direct paths reach NotFound; a direct ready native route uses `Navigate` with `replace`; a direct real Myah page body renders its component; `pending` shows the shared loading surface without a NotFound flash; unknown, missing, and Soon IDs reach NotFound only after resolution; a forbidden object route redirects with `replace` to its native index route so Twenty renders `RecordIndexEmptyStateNotShared`; and native object/page-layout routes are never mounted under `/myah/*` without extending `MainContextStoreProvider`.

Update default-home tests for transient `AppPath.Index`, loaded zero-readable-object metadata, readable-object metadata, missing Dashboard metadata, and forbidden Dashboard permission. A ready workspace selects the Today entry only after the Today resolver is `ready` or `forbidden`; temporary loading and a missing Dashboard retain `AppPath.Index`, never produce `/myah/today`, and never flash NotFound.

```ts
expect(result.current.defaultHomePagePath).toBe(AppPath.Index);
// after Today resolves ready or forbidden
expect(result.current.defaultHomePagePath).toBe('/myah/today');
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx jest packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationRouteDispatcher.test.tsx packages/twenty-front/src/modules/app/hooks/__tests__/useCreateWorkspaceAppRouter.test.tsx packages/twenty-front/src/modules/navigation/hooks/__tests__/useDefaultHomePagePath.test.ts --config=packages/twenty-front/jest.config.mjs
```

Expected: FAIL because `/myah/:pageId` is not registered, the dispatcher does not exist, and default-home still chooses generic navigation.

- [x] **Step 3: Implement routing and default-home cutover**

Add the dispatcher route inside the `MinimalMetadataGate` → `DefaultLayout` → `MainAppLayoutWithSidePanel` branch in `useCreateWorkspaceAppRouter`, immediately before the wildcard route:

```tsx
<Route path="/myah/:pageId" element={<MyahNavigationRouteDispatcher />} />
<Route path={AppPath.NotFoundWildcard} element={<LazyRoute><NotFound /></LazyRoute>} />
```

The dispatcher must redirect a resolved native destination with `replace`. It must not mount `RecordIndexPage`, `RecordShowPage`, or `StandalonePageLayoutPage` directly at `/myah/*`; those pages depend on native route recognition in `MainContextStoreProvider`. Preserve legacy direct URLs and browser history semantics.

In `useDefaultHomePagePath`, retain only the signed-out and genuinely transient readiness branches. Replace the loaded-zero-readable-object `/settings/profile` fallback and ready generic navigation-menu/object fallbacks with `getMyahEntryPath('today')` only when Today is `ready` or `forbidden`. Keep `AppPath.Index` when Today is `pending` or `missing`. A direct missing `/myah/today` still renders NotFound, but root navigation must never create that URL.

- [x] **Step 4: Run focused tests to verify they pass**

Run the Step 2 command.

Expected: PASS. Direct Myah URLs resolve through the authenticated shell, adapters use replace navigation, and the root redirects to Today only after readiness.

- [x] **Step 5: Preserve the verified slice for review**

Do not stage, commit, push, or open a pull request without explicit maintainer approval. Leave the verified Task 3 changes in the isolated worktree for the next review checkpoint.

## Task 4: Verify preserved Twenty integration boundaries

**Files:**

- Tests: `packages/twenty-front/src/modules/myah/navigation/**/__tests__/*`
- Test: `packages/twenty-front/src/modules/app/effect-components/__tests__/PageChangeEffect.test.tsx`

**Interfaces:**

The focused suites consume the route registry, resolver, active matcher, drawer section, group state, dispatcher, and page-change redirect effect. Together they prove the shell contract preserves Twenty navigation behavior without adding an integration-only shell abstraction.

- [x] **Step 1: Write focused boundary tests**

Cover the observable contract at its owning seam:

- registry descriptors have stable identities, intended destination classes, and semantic icons;
- resolver fixtures cover ready, pending, missing, and forbidden metadata/page-layout states;
- drawer tests cover selected state, group behavior, disabled Soon entries, and disabled non-ready destinations;
- dispatcher tests cover replace-only native redirects, pending loading, missing NotFound, and forbidden native permission-empty behavior;
- page-change tests cover the default-home redirect transition without duplicate navigation.

- [x] **Step 2: Run focused verification**

Run:

```bash
npx jest packages/twenty-front/src/modules/myah/navigation packages/twenty-front/src/modules/app/effect-components/__tests__/PageChangeEffect.test.tsx --config=packages/twenty-front/jest.config.mjs
corepack yarn nx lint:diff-with-main twenty-front
corepack yarn nx typecheck twenty-front
```

Observed: 7 suites / 34 tests passed; frontend diff lint and typecheck passed.

- [x] **Step 3: Browser smoke the real shell**

An authenticated local-browser UAT verified available native adapters, replace-history back/forward behavior, selected and expanded state, disabled Soon behavior, direct legacy URLs, native record side panels, Settings access, and responsive drawer close/reopen behavior. Automated resolver and dispatcher tests cover pending, missing, and forbidden state boundaries that the standard Twenty workspace cannot provision.

- [x] **Step 4: Publish the implementation handoff**

Post a concise MYAH-209 Linear update containing the registry source path, destination identity contract, ownership boundary for MYAH-210 through MYAH-215, verified commands, browser-smoke evidence, and draft PR link.

- [x] **Step 5: Open the approved draft PR**

Open the MYAH-209 draft PR only after focused verification, browser UAT, current-main compatibility review, and a fresh-context audit are complete.

## Task 5: Refine Outreach navigation and reuse existing drawer visual grammar

**Files:**

- Modify: `packages/twenty-front/src/modules/myah/navigation/myah-navigation-registry.ts`
- Modify: `packages/twenty-front/src/modules/myah/navigation/components/MyahNavigationDrawerGroup.tsx`
- Modify: `packages/twenty-front/src/modules/myah/navigation/__tests__/myah-navigation-registry.test.ts`
- Modify: `packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationDrawerSection.test.tsx`
- Modify: `packages/twenty-front/src/modules/myah/navigation/hooks/__tests__/useResolvedMyahNavigationRoutes.test.tsx`
- Modify: `packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationRouteDispatcher.test.tsx`

**Step 1: Write focused failing regressions**

Update the registry tests to assert the clean cutover from `sequences` to `automations`, exactly these three ready Outreach workflow routes and core-object identities:

```ts
expect(getMyahEntryPath('automations')).toBe('/myah/automations');
expect(getMyahEntryPath('automation-runs')).toBe('/myah/automation-runs');
expect(getMyahEntryPath('automation-versions')).toBe(
  '/myah/automation-versions',
);
```

Assert `Workflow`, `WorkflowRun`, and `WorkflowVersion` identities respectively; assert neither the sidebar fixture nor the registry contains `Sequences`. Assert semantic `Soon` icons are `IconSearch`, `IconBox`, `IconFileText`, `IconVideo`, and `IconChartBar` for Creator Discovery, Deliverables, Creator Briefs, Creator Videos, and Analytics respectively.

Extend the drawer fixture with all three Automation entries. Mock or inspect `NavigationDrawerItem` props so each grouped child receives the exact state from `getNavigationSubItemLeftAdornment({ arrayLength, index, selectedIndex })`; cover the first, middle, selected, and last child cases. Retain the existing disabled-pointer/keyboard assertions for Soon items.

Extend resolver and dispatcher tests to prove every new direct Myah entry redirects with `replace` to its matching native object list and becomes selected for native index and record-show paths.

- [x] **Step 2: Run the focused tests to verify failure**

Run:

```bash
npx jest packages/twenty-front/src/modules/myah/navigation/__tests__/myah-navigation-registry.test.ts packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationDrawerSection.test.tsx packages/twenty-front/src/modules/myah/navigation/hooks/__tests__/useResolvedMyahNavigationRoutes.test.tsx packages/twenty-front/src/modules/myah/navigation/components/__tests__/MyahNavigationRouteDispatcher.test.tsx --config=packages/twenty-front/jest.config.mjs
```

Expected: FAIL because the old `sequences` registry item remains, Workflow Run/Version are absent, Soon icons are generic circles, and grouped Myah children do not receive the shared connector state.

**Step 3: Implement the smallest registry and rendering changes**

In `myah-navigation-registry.ts`:

1. Replace the `sequences` descriptor with `automations`, label it `Automations`, retain the native `Workflow` identity, and use `IconSettingsAutomation`.
2. Add adjacent `automation-runs` and `automation-versions` descriptors targeting `CoreObjectNameSingular.WorkflowRun` and `CoreObjectNameSingular.WorkflowVersion`, with `IconHistory` and `IconVersions`.
3. Replace only the five generic `IconCircle` placeholders for visible Soon routes with `IconSearch`, `IconBox`, `IconFileText`, `IconVideo`, and `IconChartBar`. Keep their IDs, paths, availability, and disabled behavior unchanged.

In `MyahNavigationDrawerGroup.tsx`, import `getNavigationSubItemLeftAdornment` and calculate the active child index once from the already-resolved group routes and the existing `isMyahNavigationRouteActive` helper. Pass the returned `subItemState` to each `NavigationDrawerItem`. Remove no responsive, expansion, accessibility, or disabled-Soon logic. Do not create a Myah-specific connector component or custom connector CSS.

- [x] **Step 4: Run the focused tests to verify they pass**

Re-run the Step 2 command.

Expected: PASS. The drawer has only `Automations`, `Automation runs`, `Automation versions`, and `Tasks` under Outreach; all three paths resolve to one native Twenty object surface each; the existing connector utility controls every grouped child; Soon entries remain semantic disabled controls.

- [x] **Step 5: Run the affected frontend typecheck**

Run:

```bash
yarn nx typecheck twenty-front
```

Expected: PASS. The expanded discriminated route union, typed core-object descriptors, icon imports, drawer props, and tests remain type-safe.

- [x] **Step 6: Browser smoke the approved visual and route behavior**

Using the isolated local runtime:

1. Sign in and expand Outreach.
2. Verify the list order, labels, semantic Soon icons, and continuous Settings-style nested connector with a terminated final child.
3. Open each Automation route and verify it replaces into its native Twenty Workflow, Workflow Run, or Workflow Version list.
4. Open a native Workflow Run/Version record and verify the corresponding Myah route remains selected.
5. Verify a Soon item has no link, cannot be clicked, and cannot be activated from the keyboard.
6. Repeat the Outreach expand/select flow in the mobile drawer.

- [x] **Step 7: Preserve the verified refinement for review**

The verified refinement is now in draft PR #46 after explicit maintainer approval, with all required checks and fresh-context audit findings tracked in Linear.

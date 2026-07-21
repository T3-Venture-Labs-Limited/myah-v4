# MYAH-150 Workspace Billing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Twenty seat/subscription Billing page with the approved workspace-admin Myah prepaid balance, usage history, and funding history presentation while preserving the existing Settings shell, route, and workspace permission guard.

**Architecture:** Keep `SettingsPath.Billing` and its existing `SettingsProtectedRouteWrapper(PermissionFlagType.WORKSPACE)` route unchanged. Make the existing Workspace sidebar Billing item independent of Twenty subscription-billing configuration and move it immediately after General. Keep `SettingsBilling` as a thin page that supplies an honest not-connected default to one presentational Billing content component. The component consumes a discriminated view model whose money values are integer cents, owns only tab/period presentation state, and uses existing Twenty cards, banners, buttons, tabs, skeletons, tables, status, layout, and theme tokens. Storybook owns all populated fixtures; production owns none.

**Tech Stack:** React, TypeScript, Lingui, Jotai component state through the existing `TabList`, Linaria, Twenty UI/Settings primitives, Jest, Storybook/Vitest browser tests, Nx, Oxlint, oxfmt.

## Global constraints

- Frontend only: no server resolver/controller, Metronome read, generated GraphQL change, database migration, Stripe action, checkout, portal session, webhook, or payment state.
- Preserve the existing route identity: `SettingsPath.Billing === 'billing'` and the existing `SettingsRoutes.tsx` route inside the `PermissionFlagType.WORKSPACE` protected block.
- Do not add another Billing route, Settings section, Settings shell, feature flag, global atom, service layer, or shared package.
- Do not render Twenty subscription credits, plans, seats, trials, or resource-credit data as Myah prepaid funds.
- Production financial values must be unavailable (`—`) until a later read API exists; realistic money and history exist only in `SettingsBilling.stories.tsx`.
- All view-model monetary values are integer cents. Format USD locally with `Intl.NumberFormat`; do not calculate with floating-point dollars.
- Customer rows may show only approved friendly activity, member, customer status, and charge. Never show provider cost, margin, model/token data, raw operation IDs, credentials, prompts, responses, or reconciliation details.
- Reuse existing responsive and theme behavior. Do not alter sidebar collapse, mobile navigation, or unrelated Settings items.
- Run every command with the repository-pinned Node `v24.16.0` on the approved Linux host. In this worktree, ensure `/tmp/myah-node24/node_modules/.bin` precedes the host Node path so Nx child processes inherit Node 24.

## Integration points and deliberate non-changes

- **Modify:** `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx`
  - Move the existing Billing item directly after General.
  - Remove its dependency on `billingState` / `billing.isBillingEnabled`.
  - Retain `isHidden: !permissionMap[PermissionFlagType.WORKSPACE]`.
- **Verify unchanged:** `packages/twenty-shared/src/types/SettingsPath.ts`
  - `Billing = 'billing'` remains authoritative; no enum member is added.
- **Verify unchanged:** `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx`
  - `<Route path={SettingsPath.Billing} element={<SettingsBilling />} />` remains inside the existing `SettingsProtectedRouteWrapper` for `PermissionFlagType.WORKSPACE`.
- **Modify content only:** `packages/twenty-front/src/pages/settings/billing/SettingsBilling.tsx`
  - Continue serving the existing route; use `SettingsPageLayout` and `SettingsPageContainer` directly instead of subscription-specific `SettingsBillingPageLayout` redirection.
- **Leave intact:** old Twenty subscription-billing components and the plans/usage routes. They may still be consumed elsewhere; this issue does not delete or refactor them.

---

### Task 1: Make the existing Billing destination visible and correctly ordered for workspace admins

**Files:**
- Modify: `packages/twenty-front/src/modules/settings/hooks/__tests__/useSettingsNavigationItems.test.tsx:1-180`
- Modify: `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx:1-175`
- Verify unchanged: `packages/twenty-shared/src/types/SettingsPath.ts:1-20`
- Verify unchanged: `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx:749-783`

**Behavioral contract:**
- `PermissionFlagType.WORKSPACE: true` makes Billing visible whether `billingState` is disabled or `null`.
- `PermissionFlagType.WORKSPACE: false` keeps Billing hidden.
- The visible Workspace order begins `General`, `Billing`, `Data model`, `Layout`, `Members`.
- Billing continues to link to `SettingsPath.Billing`.
- The existing protected route remains the URL-level access guard.

- [ ] **Step 1: Replace the obsolete feature-config assertions with failing visibility and order tests**

  In `useSettingsNavigationItems.test.tsx`, retain the existing no-permission test. Replace both tests named `should hide billing navigation when billing is disabled` and `should hide billing navigation until billing config is loaded` with explicit positive contracts. Use the real hook result rather than mocking the returned navigation structure.

  ```ts
  it('shows Billing for workspace admins when Twenty billing is disabled', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );
    const billingItem = workspaceSection?.items.find(
      (item) => item.label === 'Billing',
    );

    expect(billingItem?.isHidden).toBe(false);
    expect(billingItem?.path).toBe(SettingsPath.Billing);
  });

  it('shows Billing for workspace admins before billing config is loaded', () => {
    jotaiStore.set(billingState.atom, null);
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const billingItem = result.current
      .find((section) => section.label === 'Workspace')
      ?.items.find((item) => item.label === 'Billing');

    expect(billingItem?.isHidden).toBe(false);
  });

  it('places Billing immediately after General', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const labels = result.current
      .find((section) => section.label === 'Workspace')
      ?.items.map((item) => item.label);

    expect(labels?.slice(0, 5)).toStrictEqual([
      'General',
      'Billing',
      'Data model',
      'Layout',
      'Members',
    ]);
  });
  ```

  Keep a direct Billing assertion under no permissions if the existing aggregate `every(item.isHidden)` assertion becomes too indirect:

  ```ts
  expect(
    workspaceSection?.items.find((item) => item.label === 'Billing')?.isHidden,
  ).toBe(true);
  ```

- [ ] **Step 2: Run the focused navigation test and verify RED**

  From the worktree root:

  ```bash
  env PATH=/tmp/myah-node24/node_modules/.bin:$PATH \
    /tmp/myah-node24/node_modules/.bin/node \
    .yarn/releases/yarn-4.13.0.cjs \
    nx test twenty-front \
    --runTestsByPath \
    packages/twenty-front/src/modules/settings/hooks/__tests__/useSettingsNavigationItems.test.tsx \
    --runInBand
  ```

  Expected: the two visibility tests fail because current code hides Billing when `isBillingEnabled` is false or billing config is null; the order test fails because Billing currently follows Members.

  If Nx again stalls before Jest in `packages/twenty-shared/scripts/generateBarrels.ts`, do not call that a test failure. Record the prerequisite hang, build the smallest supported `twenty-shared` prerequisite once, and rerun the exact focused test. Do not weaken or bypass the test.

- [ ] **Step 3: Remove only the native-billing gate and move the existing navigation item**

  In `useSettingsNavigationItems.tsx`:

  - remove the `billingState` import;
  - remove `const billing = useAtomStateValue(billingState);`;
  - remove `const isBillingEnabled = billing?.isBillingEnabled ?? false;`;
  - move the existing Billing item from after Members to immediately after General;
  - set its guard to only the existing permission:

  ```tsx
  {
    label: t`General`,
    path: SettingsPath.General,
    Icon: IconSettings,
    isHidden: !permissionMap[PermissionFlagType.WORKSPACE],
  },
  {
    label: t`Billing`,
    path: SettingsPath.Billing,
    Icon: IconCurrencyDollar,
    isHidden: !permissionMap[PermissionFlagType.WORKSPACE],
  },
  {
    label: t`Data model`,
    path: SettingsPath.Objects,
    Icon: IconHierarchy2,
    isHidden: !permissionMap[PermissionFlagType.DATA_MODEL],
  },
  ```

  Do not alter any other item, icon, path, label, indentation, feature gate, or permission.

- [ ] **Step 4: Run the focused navigation test and verify GREEN**

  Run the same focused Jest command from Step 2.

  Expected: PASS; both disabled and null subscription config leave Billing visible for workspace admins, Billing remains hidden without permission, and the first five Workspace labels have the approved order.

- [ ] **Step 5: Re-check route identity without editing route files**

  Use LSP references for `SettingsPath.Billing` and inspect the existing route. Confirm:

  ```tsx
  <Route
    element={
      <SettingsProtectedRouteWrapper
        settingsPermission={PermissionFlagType.WORKSPACE}
      />
    }
  >
    {/* ... */}
    <Route path={SettingsPath.Billing} element={<SettingsBilling />} />
  </Route>
  ```

  No `SettingsPath.ts` or `SettingsRoutes.tsx` edit is expected. A surprising difference must be investigated before continuing; do not add a second route.

- [ ] **Step 6: Commit the focused navigation cutover**

  ```bash
  git add \
    packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx \
    packages/twenty-front/src/modules/settings/hooks/__tests__/useSettingsNavigationItems.test.tsx
  git commit -m "feat(settings): expose workspace billing navigation"
  ```

---

### Task 2: Define the Billing presentation boundary and implement honest not-connected/loading states

**Files:**
- Create: `packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx`
- Modify: `packages/twenty-front/src/pages/settings/billing/SettingsBilling.tsx`
- Modify: `packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx`
- Reuse unchanged: `packages/twenty-front/src/modules/settings/components/SettingsPageContainer.tsx`
- Reuse unchanged: `packages/twenty-front/src/modules/settings/components/SettingsSectionSkeletonLoader.tsx`
- Reuse unchanged: `packages/twenty-ui/src/feedback/InlineBanner/InlineBanner.tsx`

**Interfaces:**

Keep the types exported from `SettingsWorkspaceBillingContent.tsx`, close to their only production consumer:

```ts
export type WorkspaceBillingUsageStatus =
  | 'settled'
  | 'processing'
  | 'notCharged'
  | 'underReview';

export type WorkspaceBillingUsageEntry = {
  id: string;
  occurredAt: string;
  activity: string;
  member: string;
  status: WorkspaceBillingUsageStatus;
  chargeCents: number | null;
};

export type WorkspaceBillingHistoryEntry = {
  id: string;
  occurredAt: string;
  description: string;
  type: 'purchasedTopUp' | 'sponsoredGrant' | 'refund' | 'adjustment';
  amountCents: number;
  document?: {
    label: string;
    url: string;
  };
};

type WorkspaceBillingReadyViewModel = {
  state: 'ready';
  balanceStatus: 'healthy' | 'low' | 'empty';
  availableBalanceCents: number;
  sponsoredBalanceCents: number | null;
  purchasedBalanceCents: number | null;
  monthToDateSpendCents: number;
  settledOperationCount: number;
  monthToDateRangeLabel: string;
  usageHistory: WorkspaceBillingUsageEntry[];
  billingHistory: WorkspaceBillingHistoryEntry[];
};

export type WorkspaceBillingViewModel =
  | { state: 'loading' }
  | {
      state: 'unavailable';
      reason: 'notConnected' | 'loadFailed';
    }
  | WorkspaceBillingReadyViewModel;
```

`SettingsBilling` exposes only the later integration seam:

```ts
export type SettingsBillingProps = {
  viewModel?: WorkspaceBillingViewModel;
};
```

The default is a module-local constant:

```ts
const NOT_CONNECTED_BILLING_VIEW_MODEL: WorkspaceBillingViewModel = {
  state: 'unavailable',
  reason: 'notConnected',
};
```

No fixture values belong in this page or component module.

- [ ] **Step 1: Replace the thin Billing story with failing production-state stories**

  In `SettingsBilling.stories.tsx`, define:

  ```ts
  type SettingsBillingStoryArgs = PageDecoratorArgs & SettingsBillingProps;

  const meta: Meta<SettingsBillingStoryArgs> = {
    title: 'Pages/Settings/SettingsBilling',
    component: SettingsBilling,
    decorators: [WorkspaceDecorator, PageDecorator],
    args: {
      routePath: '/settings/billing',
      routeParams: {},
    },
    parameters: { msw: graphqlMocks },
    render: ({ viewModel }) => <SettingsBilling viewModel={viewModel} />,
  };
  ```

  Add stories for the production default, loading, and future load failure:

  ```ts
  export const ProductionNotConnected: Story = {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(
        canvas.findByText('Live billing information has not been connected yet.'),
      ).resolves.toBeVisible();
      expect(canvas.queryByText('$0.00')).not.toBeInTheDocument();
      await expect(canvas.findAllByText('—')).resolves.not.toHaveLength(0);
      await expect(canvas.findByRole('button', { name: 'Add funds' }))
        .resolves.toBeDisabled();
      await expect(canvas.findByText('Online top-ups coming soon'))
        .resolves.toBeVisible();
    },
  };

  export const Loading: Story = {
    args: { viewModel: { state: 'loading' } },
  };

  export const Unavailable: Story = {
    args: {
      viewModel: { state: 'unavailable', reason: 'loadFailed' },
    },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(
        canvas.findByText('Billing information is temporarily unavailable.'),
      ).resolves.toBeVisible();
      expect(canvas.queryByText('$0.00')).not.toBeInTheDocument();
    },
  };
  ```

  Use the repository’s actual `@storybook/test` import form (`expect`, `userEvent`, `within`) already used by nearby stories. Do not query the period selector as `role="combobox"`; the Twenty `Select` trigger is a styled div, not a native select.

- [ ] **Step 2: Run the focused Storybook file and verify RED**

  From `packages/twenty-front`:

  ```bash
  env PATH=/tmp/myah-node24/node_modules/.bin:$PATH \
    STORYBOOK_SCOPE=pages \
    /tmp/myah-node24/node_modules/.bin/node \
    ../../.yarn/releases/yarn-4.13.0.cjs \
    vitest run \
    src/pages/settings/__stories__/SettingsBilling.stories.tsx \
    --project=storybook
  ```

  Expected: the story fails to compile or its assertions fail because `SettingsBilling` has no view-model prop and still renders the subscription-specific layout.

- [ ] **Step 3: Create the view-model component with unavailable and loading rendering**

  Create `SettingsWorkspaceBillingContent.tsx` with the discriminated union above and these responsibilities:

  - `loading`: render existing `SettingsSectionSkeletonLoader` blocks inside the normal content width; never render `$0.00`.
  - `unavailable/notConnected`: render a blue `InlineBanner` with the exact not-connected copy; render summary labels with `—`; keep Add funds disabled and keep “Online top-ups coming soon” adjacent; render explanatory empty ledger copy.
  - `unavailable/loadFailed`: render a blue `InlineBanner` with “Billing information is temporarily unavailable.” and the same unknown-value behavior; do not add Retry before a request exists.

  Reuse:

  ```tsx
  import { SettingsSectionSkeletonLoader } from '@/settings/components/SettingsSectionSkeletonLoader';
  import { Button } from 'twenty-ui/input';
  import { InlineBanner } from 'twenty-ui/feedback';
  import { Section } from 'twenty-ui/layout';
  import { H2Title } from 'twenty-ui/typography';
  ```

  The disabled control must have no click handler:

  ```tsx
  <Button title={t`Add funds`} variant="secondary" disabled />
  <StyledComingSoonText>{t`Online top-ups coming soon`}</StyledComingSoonText>
  ```

  Use a true em dash (`EM_DASH` from `twenty-shared/constants` if available; otherwise a local `const EM_DASH = '—'`) for unknown values, never a numeric zero.

- [ ] **Step 4: Replace only the existing Billing route content**

  Rewrite `SettingsBilling.tsx` as a thin page that:

  - imports `SettingsPath` and `getSettingsPath`;
  - renders `SettingsPageLayout` with title `Billing`;
  - preserves `Workspace / Billing` breadcrumbs;
  - renders `SettingsPageContainer` and `SettingsWorkspaceBillingContent`;
  - accepts the optional view model and defaults to `NOT_CONNECTED_BILLING_VIEW_MODEL`;
  - makes no Apollo/REST request and imports no fixture.

  Shape:

  ```tsx
  export const SettingsBilling = ({
    viewModel = NOT_CONNECTED_BILLING_VIEW_MODEL,
  }: SettingsBillingProps) => {
    const { t } = useLingui();

    return (
      <SettingsPageLayout
        title={t`Billing`}
        links={[
          {
            children: <Trans>Workspace</Trans>,
            href: getSettingsPath(SettingsPath.General),
          },
          {
            children: <Trans>Billing</Trans>,
            href: getSettingsPath(SettingsPath.Billing),
          },
        ]}
      >
        <SettingsPageContainer>
          <SettingsWorkspaceBillingContent viewModel={viewModel} />
        </SettingsPageContainer>
      </SettingsPageLayout>
    );
  };
  ```

  Confirm the actual `SettingsPageLayout` link prop shape from an existing page and adapt syntax only if required; do not create another layout.

- [ ] **Step 5: Run the focused Storybook file and verify GREEN for these states**

  Run the exact command from Step 2.

  Expected: production not-connected copy appears, unknown values are em dashes with no `$0.00`, Add funds is disabled with adjacent text, Loading renders skeletons, and Unavailable renders explicit copy without fabricated values.

- [ ] **Step 6: Commit the page boundary and honest initial states**

  ```bash
  git add \
    packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx \
    packages/twenty-front/src/pages/settings/billing/SettingsBilling.tsx \
    packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx
  git commit -m "feat(billing): add workspace billing page states"
  ```

---

### Task 3: Implement the funded summary and customer-facing Usage history ledger

**Files:**
- Modify: `packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx`
- Modify: `packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx`
- Reuse unchanged: `packages/twenty-front/src/modules/settings/billing/components/internal/SettingsBillingCard.tsx`
- Reuse unchanged: `packages/twenty-front/src/modules/settings/billing/components/SubscriptionInfoContainer.tsx`
- Modify: `packages/twenty-front/src/modules/ui/layout/tab-list/components/TabList.tsx`
- Modify: `packages/twenty-front/src/modules/ui/layout/tab-list/types/TabListProps.ts`
- Modify: `packages/twenty-ui/src/input/TabButton/TabButton.tsx`
- Reuse unchanged: `packages/twenty-front/src/modules/ui/input/components/Select.tsx`
- Modify: `packages/twenty-front/src/modules/ui/layout/table/components/TableRow.tsx`
- Reuse unchanged: `packages/twenty-front/src/modules/ui/layout/table/components/{Table,TableHeader,TableCell}.tsx`

**Ready-state UI contract:**
- Two cards stay above local tabs.
- Available balance is primary; sponsored and purchased values are one balance breakdown.
- Month-to-date includes only settled customer spend and shows count/range supplied by the view model.
- Usage is active by default.
- Usage fields: Date, Activity, Member, Status, Amount only.
- Period values: `7d | 30d | 90d`; initial `30d`; state change only, no production network/filter simulation.
- Customer status mapping:
  - `settled` → `Settled`, final USD amount.
  - `processing` → `Processing`, `Pending`.
  - `notCharged` → `Not charged`, `$0.00`.
  - `underReview` → `Under review`, `Pending`.
- Both ledgers expose `table`, `row`, `columnheader`, and `cell` semantics with a specific accessible table name.
- In local non-link mode, the tab container exposes `tablist`; each control exposes `tab` and `aria-selected`, while link-style tab lists retain their existing semantics and local controls retain native keyboard activation.

- [ ] **Step 1: Add failing healthy/mixed-funding Storybook contracts**

  Keep fixture objects inside `SettingsBilling.stories.tsx`. Use invented values and names, including:

  ```ts
  const healthyWorkspaceViewModel: WorkspaceBillingViewModel = {
    state: 'ready',
    balanceStatus: 'healthy',
    availableBalanceCents: 4280,
    sponsoredBalanceCents: 2500,
    purchasedBalanceCents: 1780,
    monthToDateSpendCents: 1720,
    settledOperationCount: 128,
    monthToDateRangeLabel: 'July 1–21, 2026',
    usageHistory: [
      {
        id: 'usage-1',
        occurredAt: '2026-07-21T08:16:00.000Z',
        activity: 'AI chat',
        member: 'Jordan Lee',
        status: 'settled',
        chargeCents: 18,
      },
      {
        id: 'usage-2',
        occurredAt: '2026-07-21T07:42:00.000Z',
        activity: 'Creator research',
        member: 'Amelia Stone',
        status: 'processing',
        chargeCents: null,
      },
      {
        id: 'usage-3',
        occurredAt: '2026-07-20T18:09:00.000Z',
        activity: 'AI chat',
        member: 'Jordan Lee',
        status: 'notCharged',
        chargeCents: 0,
      },
      {
        id: 'usage-4',
        occurredAt: '2026-07-20T17:32:00.000Z',
        activity: 'Audience analysis',
        member: 'Amelia Stone',
        status: 'underReview',
        chargeCents: null,
      },
    ],
    billingHistory: [],
  };
  ```

  Add `HealthyFundedWorkspace` and `MixedSponsoredAndPurchasedFunds`. The healthy play function must assert observable ledger and summary behavior, not just control existence:

  ```ts
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.findByText('$42.80')).resolves.toBeVisible();
    await expect(canvas.findByText('$25.00 sponsored')).resolves.toBeVisible();
    await expect(canvas.findByText('$17.80 purchased')).resolves.toBeVisible();
    await expect(canvas.findByText('$17.20')).resolves.toBeVisible();
    await expect(canvas.findByText('128 managed operations')).resolves.toBeVisible();
    await expect(canvas.findByText('AI chat')).resolves.toBeVisible();
    await expect(canvas.findByText('Settled')).resolves.toBeVisible();
    await expect(canvas.findByText('Processing')).resolves.toBeVisible();
    await expect(canvas.findByText('Not charged')).resolves.toBeVisible();
    await expect(canvas.findByText('Under review')).resolves.toBeVisible();
    await expect(canvas.findByText('Pending')).resolves.toBeVisible();
    await expect(canvas.findByText('Last 30 days')).resolves.toBeVisible();
    const usageTab = await canvas.findByRole('tab', {
      name: 'Usage history',
    });
    await expect(usageTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.findByRole('tablist', { name: 'Billing records' }),
    ).resolves.toBeVisible();
    const usageTable = await canvas.findByRole('table', {
      name: 'Usage history',
    });
    await expect(
      within(usageTable).findByRole('columnheader', { name: 'Activity' }),
    ).resolves.toBeVisible();
    await expect(
      within(usageTable).findByRole('cell', { name: 'AI chat' }),
    ).resolves.toBeVisible();
    expect(within(usageTable).getAllByRole('row').length).toBeGreaterThan(1);
  },
  ```

  Use `findAllByText` where repeated values/statuses make a singular query ambiguous.

- [ ] **Step 2: Add a failing period-control interaction**

  In the healthy story’s play function:

  ```ts
  const periodTrigger = await canvas.findByText('Last 30 days');
  await userEvent.click(periodTrigger);
  const sevenDaysOption = await within(document.body).findByText('Last 7 days');
  await userEvent.click(sevenDaysOption);
  await expect(canvas.findByText('Last 7 days')).resolves.toBeVisible();
  ```

  Do not use `findByRole('combobox')`: Twenty `Select` currently renders a styled div in a `Dropdown`. If duplicate option text appears in both trigger and menu, scope the query to the dropdown/menu container or select the last visible match rather than adding a false ARIA role to the test.

- [ ] **Step 3: Run the focused Storybook file and verify RED**

  Run the Task 2 focused Storybook command.

  Expected: ready-state stories fail because the component does not yet render funded summaries, tabs, period control, or usage rows.

- [ ] **Step 4: Implement integer-cent formatting and persistent summary cards**

  In `SettingsWorkspaceBillingContent.tsx`, add one local formatter:

  ```ts
  const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  const formatUsdCents = (amountCents: number): string =>
    usdFormatter.format(amountCents / 100);
  ```

  The integer cents are the view-model contract. Division happens only at display formatting; no business arithmetic is performed in floating-point dollars.

  Reuse `StyledSettingsBillingCard`, `StyledSettingsBillingCardHeader`, `SubscriptionInfoContainer`, and `SettingsBillingLabelValueItem` where they fit. Add only page-local styles for:

  - a two-column summary grid that collapses to one column at the established mobile/content breakpoint;
  - the primary balance typography;
  - card body spacing;
  - Add funds and adjacent coming-soon text.

  Render known sponsored/purchased details only when non-null. Keep the balance as one number, not two wallet cards.

- [ ] **Step 5: Implement local tabs and the Usage ledger**
  First, make the minimal shared accessibility corrections discovered during planning:
  - in `TabList.tsx`, when and only when `behaveAsLinks={false}`, render the existing `StyledContainer` with `role="tablist"` and `aria-label={ariaLabel}` from a new optional `ariaLabel` prop on `TabListProps`; link/hash navigation mode keeps both attributes undefined;
  - in `TabButton.tsx`, add optional `role` and `ariaSelected` props and forward them as `role` and `aria-selected` on `StyledTabButton`; `TabList` supplies `role="tab"` and the active boolean only in non-link mode. Keep native button/link behavior, disabled behavior, measurement/overflow behavior, and styling unchanged.

  Pass `ariaLabel={t`Billing records`}` from the Billing component. The healthy story must fail before these attributes exist and pass afterward.

  Define stable IDs near the component:

  ```ts
  const WORKSPACE_BILLING_TAB_LIST_ID = 'settings-workspace-billing-tabs';
  const WORKSPACE_BILLING_TAB_IDS = {
    USAGE: 'usage',
    BILLING_HISTORY: 'billing-history',
  } as const;
  ```

  Use the existing component state:

  ```tsx
  const activeTabId = useAtomComponentStateValue(
    activeTabIdComponentState,
    WORKSPACE_BILLING_TAB_LIST_ID,
  );
  const displayedTabId =
    activeTabId ?? WORKSPACE_BILLING_TAB_IDS.USAGE;

  <TabList
    ariaLabel={t`Billing records`}
    componentInstanceId={WORKSPACE_BILLING_TAB_LIST_ID}
    behaveAsLinks={false}
    tabs={[
      { id: WORKSPACE_BILLING_TAB_IDS.USAGE, title: t`Usage history` },
      {
        id: WORKSPACE_BILLING_TAB_IDS.BILLING_HISTORY,
        title: t`Billing history`,
      },
    ]}
  />
  ```

  Keep period state local:

  ```ts
  type UsagePeriod = '7d' | '30d' | '90d';
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>('30d');
  ```

  Render the `Select` with a visible label such as `Usage period`, `dropdownId="workspace-billing-usage-period"`, and option labels `Last 7 days`, `Last 30 days`, `Last 90 days`. Changing it only updates local selected state in production.

  Before rendering rows, make the smallest shared accessibility correction in `TableRow.tsx`: add `role?: React.AriaRole` to `TableRowProps`, accept it in the component, and forward it to `StyledTableRow`. Do not change styling or default behavior.
  Apply explicit ARIA table semantics in the Billing component:
  ```tsx
  <Table role="table" aria-label={t`Usage history`}>
    <TableRow role="row" gridTemplateColumns={usageColumns}>
      <TableHeader role="columnheader">{t`Date`}</TableHeader>
      <TableHeader role="columnheader">{t`Activity`}</TableHeader>
      <TableHeader role="columnheader">{t`Member`}</TableHeader>
      <TableHeader role="columnheader">{t`Status`}</TableHeader>
      <TableHeader role="columnheader" align="right">
        {t`Amount`}
      </TableHeader>
    </TableRow>
    <TableRow role="row" gridTemplateColumns={usageColumns}>
      <TableCell role="cell">{/* date */}</TableCell>
      <TableCell role="cell">{/* activity */}</TableCell>
      <TableCell role="cell">{/* member */}</TableCell>
      <TableCell role="cell">{/* status */}</TableCell>
      <TableCell role="cell" align="right">{/* amount */}</TableCell>
    </TableRow>
  </Table>
  ```
  `Table` and the styled `TableHeader`/`TableCell` already accept intrinsic div ARIA props. `TableRow` is the only primitive that currently drops them. This change supplies a complete ARIA table hierarchy without replacing the established responsive grid.
  Render the usage ledger with existing `Table`, `TableRow`, `TableHeader`, and `TableCell`. Desktop columns:

  ```tsx
  gridTemplateColumns="minmax(132px, 0.9fr) minmax(180px, 1.5fr) minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(96px, 0.7fr)"
  ```

  Adjust exact values if browser inspection shows clipping, but always retain Date, Activity, and Amount. On narrow widths, use the existing responsive seam (`mobileGridAutoColumns` or a page-local media style) so Member/Status can stack into secondary text without hiding Activity or Amount.

  Status rendering must always include text. Use `Status` with supported colors where useful, but never rely on color alone. Map statuses in a local exhaustive record or function; do not expose raw union values.

  Format dates with the workspace member’s local timezone and the project’s existing date utilities if one directly fits. Do not add a date library. Fixture assertions should target stable activity/status/amount copy rather than locale-sensitive full timestamps.

- [ ] **Step 6: Run the focused Storybook file and verify GREEN for funded Usage**

  Run the same focused Storybook command.

  Expected: the loaded balance renders `$42.80`, breakdown values and month-to-date values render, Usage is the initial tab, all four customer status mappings are visible, 30 days is selected initially, and clicking the visible 7-day option updates the visible selected text without navigation or network requests.

- [ ] **Step 7: Commit the summary and Usage ledger**

  ```bash
  git add \
    packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx \
    packages/twenty-front/src/modules/ui/layout/tab-list/components/TabList.tsx \
    packages/twenty-front/src/modules/ui/layout/tab-list/types/TabListProps.ts \
    packages/twenty-front/src/modules/ui/layout/table/components/TableRow.tsx \
    packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx \
    packages/twenty-ui/src/input/TabButton/TabButton.tsx
  git commit -m "feat(billing): present balance and usage history"
  ```

---

### Task 4: Add funding-only Billing history and all remaining page states

**Files:**
- Modify: `packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx`
- Modify: `packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx`

**Billing history contract:**
- Funding events only: purchased top-up, sponsored grant, refund, adjustment/reversal.
- No usage charge appears in this tab.
- Signed USD amount describes the event’s effect on available balance.
- Optional document links have specific accessible names including record type and date.

**State contract:**
- `healthy`: no alert.
- `low`: a compact orange warning banner appears above the summary cards with copy that services may pause soon; content remains available.
- `empty`: danger `InlineBanner`, explicit loaded `$0.00`, services-paused copy, Add funds still disabled.
- no usage: summary persists and Usage tab has explanatory empty copy.
- no billing history: summary persists and Billing history has independent empty copy.
- `unavailable`: blue information banner, unknown values as `—`, never `$0.00`.

- [ ] **Step 1: Add failing Billing-history interaction and row assertions**

  Add invented `billingHistory` rows to the healthy fixture, for example:

  ```ts
  billingHistory: [
    {
      id: 'funding-1',
      occurredAt: '2026-07-01T14:00:00.000Z',
      description: 'Purchased funds',
      type: 'purchasedTopUp',
      amountCents: 2500,
      document: {
        label: 'View receipt from July 1, 2026',
        url: '#receipt-july-1-2026',
      },
    },
    {
      id: 'funding-2',
      occurredAt: '2026-06-20T12:00:00.000Z',
      description: 'Sponsored funds from Myah',
      type: 'sponsoredGrant',
      amountCents: 2500,
    },
    {
      id: 'funding-3',
      occurredAt: '2026-06-18T11:00:00.000Z',
      description: 'Refund',
      type: 'refund',
      amountCents: -500,
      document: {
        label: 'View refund receipt from June 18, 2026',
        url: '#refund-june-18-2026',
      },
    },
  ],
  ```

  Extend the healthy play function:

  ```ts
  await userEvent.click(
    await canvas.findByRole('tab', { name: 'Billing history' }),
  );
  await expect(canvas.findByText('Purchased funds')).resolves.toBeVisible();
  await expect(
    canvas.findByText('Sponsored funds from Myah'),
  ).resolves.toBeVisible();
  await expect(canvas.findByText('+$25.00')).resolves.toBeVisible();
  await expect(canvas.findByText('-$5.00')).resolves.toBeVisible();
  await expect(
    canvas.findByRole('link', {
      name: 'View receipt from July 1, 2026',
    }),
  ).resolves.toBeVisible();
  expect(canvas.queryByText('AI chat')).not.toBeInTheDocument();
  ```

  The shared Task 3 tab semantics make the `findByRole('tab')` query authoritative. After clicking Billing history, assert its `aria-selected` becomes `true` and Usage history becomes `false`.

- [ ] **Step 2: Add failing stories for low, empty, no-usage, and no-history branches**

  Add these stories by deriving new objects from the healthy fixture inside the story file only:

  - `LowBalance`: `balanceStatus: 'low'`, low amount, asserts both `Low balance` and “Managed services may pause soon.” while a normal usage row remains visible.
  - `EmptyBlockedBalance`: `balanceStatus: 'empty'`, all loaded balances zero, asserts `$0.00`, “Managed services are paused”, disabled Add funds, and danger copy.
  - `NoUsage`: `usageHistory: []`, asserts `No usage yet` and verifies `$42.80` summary still exists.
  - `NoBillingHistory`: `billingHistory: []`; play switches to Billing history, asserts `No billing events yet`, and verifies summary still exists.

  The low-balance treatment must be a real compact banner above the summary cards and remain semantically distinct from blue unavailable and red danger states. Implement a Billing-local banner container using `themeCssVariables.snackBar.warning.backgroundColor` / `.color`, an existing orange `Status`, and explicit warning text. Do not misuse a blue informational banner and do not reduce the warning to an uncontained status row.

  Each state story must assert its observable copy. Do not rely on screenshots alone to prove branch coverage.

- [ ] **Step 3: Run the focused Storybook file and verify RED**

  Run the Task 2 focused Storybook command.

  Expected: Billing tab/rows and low/empty/empty-ledger assertions fail because those branches are not implemented yet.

- [ ] **Step 4: Implement the funding-event ledger**

  When Billing history is active:

  - render columns for Date, Event, Type, Document, Amount;
  - derive customer labels from `WorkspaceBillingHistoryEntry['type']` with an exhaustive local mapping;
  - render positive amounts with `+`, negative amounts with `-`, and zero without implying a charge;
  - use the supplied document label as the link accessible name;
  - include `target`/`rel` only if the repository’s existing external-document pattern requires it;
  - render no Usage rows in this tab.
  - render `<Table role="table" aria-label={t`Billing history`}>`, `TableRow role="row"`, `TableHeader role="columnheader"`, and `TableCell role="cell"` exactly as for Usage history;
  - extend the story to assert the accessible Billing-history table name, the `Event` column header, the `Purchased funds` data cell, and more than one row.

  Keep document URL values opaque: the component renders the supplied customer-safe URL but never constructs Stripe/Metronome identifiers.

- [ ] **Step 5: Implement warnings, blocking, and independent empty states**

  - `low`: render a compact Billing-local warning banner above the summary cards. Style its container with `themeCssVariables.snackBar.warning.backgroundColor` and `.color`; include `<Status color="orange" text={t`Low balance`} />` plus visible “Managed services may pause soon” copy. Do not calculate a threshold.
  - `empty`: render `<InlineBanner color="danger" message={t`Your balance is empty. Managed services are paused until funds are added.`} />`.
  - `healthy`: render neither treatment.
  - Empty usage array: render a native/simple Settings empty container with `No usage yet` and explanatory copy; keep cards and other tab available.
  - Empty billing array: render `No billing events yet` and explanatory copy; keep cards and Usage available.

  Do not build a generic empty-state framework. A small component local to this file is sufficient because the content and layout are Billing-specific.

- [ ] **Step 6: Run the focused Storybook file and verify GREEN for every approved branch**

  Run the focused Storybook command.

  Expected all story play functions pass, including observable assertions for:

  - normal funded ledger;
  - low-balance orange warning copy;
  - empty/blocked danger copy and loaded `$0.00`;
  - unavailable/not-connected blue copy with no `$0.00`;
  - no usage;
  - no billing events;
  - funding rows and document link;
  - no duplicated usage charges in Billing history.

- [ ] **Step 7: Commit complete Billing presentation states**

  ```bash
  git add \
    packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx \
    packages/twenty-front/src/modules/ui/layout/table/components/TableRow.tsx \
    packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx
  git commit -m "feat(billing): add funding history and balance states"
  ```

---

### Task 5: Verify the real Settings route, accessibility, themes, and responsive behavior

**Files:**
- Modify only if verification finds a real defect:
  - `packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx`
  - `packages/twenty-front/src/pages/settings/billing/SettingsBilling.tsx`
  - `packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx`
  - `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx`
  - `packages/twenty-front/src/modules/settings/hooks/__tests__/useSettingsNavigationItems.test.tsx`
  - `packages/twenty-front/src/modules/ui/layout/table/components/TableRow.tsx`
  - `packages/twenty-front/src/modules/ui/layout/tab-list/components/TabList.tsx`
  - `packages/twenty-front/src/modules/ui/layout/tab-list/types/TabListProps.ts`
  - `packages/twenty-ui/src/input/TabButton/TabButton.tsx`
- Verify unchanged:
  - `packages/twenty-shared/src/types/SettingsPath.ts`
  - `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx`

- [ ] **Step 1: Format only changed TypeScript files**

  From the worktree root, pass the explicit changed files to the repository-pinned formatter. Do not format all `src/` and do not include unrelated generated files.

  ```bash
  env PATH=/tmp/myah-node24/node_modules/.bin:$PATH \
    /tmp/myah-node24/node_modules/.bin/node \
    .yarn/releases/yarn-4.13.0.cjs \
    oxfmt \
    packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx \
    packages/twenty-front/src/modules/settings/hooks/__tests__/useSettingsNavigationItems.test.tsx \
    packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx \
    packages/twenty-front/src/modules/ui/layout/table/components/TableRow.tsx \
    packages/twenty-front/src/modules/ui/layout/tab-list/components/TabList.tsx \
    packages/twenty-front/src/modules/ui/layout/tab-list/types/TabListProps.ts \
    packages/twenty-front/src/pages/settings/billing/SettingsBilling.tsx \
    packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx \
    packages/twenty-ui/src/input/TabButton/TabButton.tsx
  ```

  Expected: formatter completes without touching unrelated files.

- [ ] **Step 2: Run focused automated behavior checks**

  Rerun:

  1. the focused navigation Jest command from Task 1;
  2. the focused Storybook/Vitest command from Task 2.

  Expected: both pass. If either test command fails before reaching its test due to a generated dependency prerequisite, report and repair the narrow prerequisite; do not classify an orchestration failure as a source failure or a pass.

- [ ] **Step 3: Run changed-file lint and frontend typecheck**

  ```bash
  env PATH=/tmp/myah-node24/node_modules/.bin:$PATH \
    /tmp/myah-node24/node_modules/.bin/node \
    .yarn/releases/yarn-4.13.0.cjs \
    nx lint:diff-with-main twenty-front
  ```

  ```bash
  env PATH=/tmp/myah-node24/node_modules/.bin:$PATH \
    /tmp/myah-node24/node_modules/.bin/node \
    .yarn/releases/yarn-4.13.0.cjs \
    nx typecheck twenty-front
  ```

  Expected: zero lint errors, changed files formatted, and TypeScript passes. Report pre-existing unrelated warnings separately; do not call a timed-out or prerequisite-failed command a pass.

- [ ] **Step 4: Start Storybook and verify all visual states in a real browser**

  Start the page-scoped Storybook service under the harness process manager, not a foreground shell watcher:

  ```bash
  env STORYBOOK_SCOPE=pages yarn nx storybook:serve:dev twenty-front --configuration=pages
  ```

  Use the browser tool to inspect these stories:

  - ProductionNotConnected
  - Loading
  - Unavailable
  - HealthyFundedWorkspace
  - MixedSponsoredAndPurchasedFunds
  - LowBalance
  - EmptyBlockedBalance
  - NoUsage
  - NoBillingHistory

  For each relevant state, verify at desktop and at least one narrow viewport:

  - no overflow or clipped money;
  - Activity and Amount remain visible;
  - summary cards stack cleanly;
  - Member/Status remain understandable;
  - tabs are keyboard reachable and selected state is visible;
  - period trigger and options are keyboard/click operable;
  - disabled Add funds has adjacent text;
  - status meaning is written, not color-only;
  - unknown and loading states never display `$0.00`;
  - blocked loaded zero does display `$0.00`;
  - document links have record/date-specific accessible names.

  Toggle or load both dark and light theme variants using the existing Storybook/theme mechanism; do not add a page-specific theme implementation.

  Capture browser screenshots or recorded artifact paths for healthy, low, blocked, not-connected, and narrow responsive states.

- [ ] **Step 5: Smoke the actual `/settings/billing` route in the unchanged Settings shell**

  Start the normal frontend/app environment using the repository’s existing supported development flow and authenticate as a workspace administrator through the normal UI. In the real browser:

  1. open Settings;
  2. confirm Workspace sidebar begins `General`, `Billing`, `Data model`, `Layout`, `Members`;
  3. click Billing and confirm the browser reaches `/settings/billing`;
  4. directly load `/settings/billing` and confirm the same page renders;
  5. confirm the existing sidebar, header/close treatment, and `Workspace / Billing` breadcrumbs remain unchanged;
  6. confirm production displays the not-connected state, em dashes, disabled Add funds, and no fixture amounts/history;
  7. repeat permission verification with a member lacking `PermissionFlagType.WORKSPACE` if the existing test environment exposes such a user; otherwise rely on the focused hook test plus existing protected-route contract and record that browser limitation explicitly.

  This step proves reachability beyond Storybook. Do not add a new route or test-only route to make the smoke pass.

- [ ] **Step 6: Re-run checks invalidated by any browser correction**

  If browser inspection required code changes:

  - add or strengthen the relevant Storybook/Jest assertion first and watch it fail;
  - make the smallest correction;
  - rerun focused Storybook/Jest, format, lint:diff, typecheck, and the affected browser scenario.

  Do not run the full E2E suite or add `run-merge-queue`; this page does not change shared E2E infrastructure and the approved issue scope explicitly calls for focused browser verification.

- [ ] **Step 7: Commit verification-driven corrections, if any**

  ```bash
  git add \
    packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx \
    packages/twenty-front/src/modules/settings/hooks/__tests__/useSettingsNavigationItems.test.tsx \
    packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx \
    packages/twenty-front/src/modules/ui/layout/table/components/TableRow.tsx \
    packages/twenty-front/src/modules/ui/layout/tab-list/components/TabList.tsx \
    packages/twenty-front/src/modules/ui/layout/tab-list/types/TabListProps.ts \
    packages/twenty-front/src/pages/settings/billing/SettingsBilling.tsx \
    packages/twenty-front/src/pages/settings/__stories__/SettingsBilling.stories.tsx \
    packages/twenty-ui/src/input/TabButton/TabButton.tsx
  git commit -m "fix(billing): refine workspace billing presentation"
  ```

  Skip this commit if no correction was needed; do not create an empty commit.

---

### Task 6: Final review, delivery evidence, and explicit deferrals

**Files:**
- Review: all changed files relative to the branch base.
- Update only if required by actual final behavior: `docs/superpowers/specs/2026-07-21-myah-150-workspace-billing-page-design.md`
- Do not add a changelog or README unless repository policy or the user explicitly requires one.

- [ ] **Step 1: Review the final diff against every acceptance criterion**

  Confirm:

  - existing path and protected route are unchanged;
  - Billing is directly after General and visible independent of Twenty billing config;
  - no-permission behavior remains hidden/protected;
  - production has no fixture financial values;
  - money values are typed as cents and formatted as USD;
  - ready statuses cover healthy, low, empty;
  - unavailable reasons cover not connected and load failure;
  - loading and empty ledgers are distinct;
  - Usage contains no provider internals;
  - Billing history contains no usage charges;
  - Add funds has no handler and remains disabled;
  - no Stripe, Metronome read, GraphQL, database, global state, or new route work slipped in;
  - old Twenty subscription components remain untouched unless a direct compile correction was required.

- [ ] **Step 2: Request a focused correctness and scope review**

  Use the code-review workflow on the final diff. Ask the reviewer to check:

  - financial-data honesty (unknown versus zero);
  - permission and route preservation;
  - integer-cent formatting;
  - state exhaustiveness;
  - Storybook fixture isolation;
  - responsive/accessibility behavior;
  - accidental provider/Stripe/internal-data exposure;
  - over-engineering or unnecessary abstractions.

  Resolve every valid finding with test-first corrections and rerun invalidated checks.

- [ ] **Step 3: Record exact verification evidence**

  In the final delivery/PR/Linear update, record:

  - execution host: approved Linux host;
  - runtime: Node `v24.16.0`;
  - exact focused navigation command and result;
  - exact focused Storybook command and result;
  - exact `lint:diff-with-main` command and result;
  - exact `typecheck twenty-front` command and result;
  - browser URL(s), viewport(s), theme(s), scenarios, and screenshot/artifact paths;
  - actual `/settings/billing` route/sidebar smoke result;
  - any prerequisite or unrelated limitation without overstating it.

- [ ] **Step 4: Record deferred scope explicitly**

  Delivery notes must say that MYAH-150 intentionally does **not** implement:

  - live workspace billing read APIs;
  - Metronome balance/funding history reads;
  - managed-provider operation-history reads;
  - server pagination/authorization for those APIs;
  - Stripe checkout/top-ups/payment confirmation;
  - real receipts, invoices, refunds, or document links;
  - low-balance threshold calculation/alerts/automatic recharge;
  - data-backed period filtering, search, export, or custom date ranges.

  Those require separate Linear issues. Do not create speculative follow-ups or links unless they are unambiguously present and applicable.

- [ ] **Step 5: Finalize branch state**

  Ensure the implementation commits are coherent, the plan/spec commits remain present, and no ignored Storybook/browser artifacts or dependency caches are force-added. Then follow the finishing-development-branch workflow for the user’s chosen PR/merge path.

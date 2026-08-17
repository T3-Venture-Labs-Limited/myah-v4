# Campaign Influencers native-surface correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the embedded Campaign Influencers native table so it hides implementation-only scope UI, has a relevant empty state, admits Creators without mailbox assignment, and does not horizontally overflow the Campaign tab.

**Architecture:** Keep `CampaignInfluencerIndex` as an isolated `RecordIndexSurface` with its Campaign relation enforced through query-only filters. Add a narrowly named native-surface presentation policy rather than DOM/CSS suppression, and make Creator-to-Campaign membership independent of managed mailbox data. Preserve the standard Record Index and Creator List behaviors.

**Tech Stack:** React, TypeScript, Linaria, Jotai, Apollo, Twenty `RecordIndexSurface`, Jest, existing isolated Compose UAT.

## Global Constraints

- The Campaign Influencers view remains the source-controlled `campaignCreator` `TABLE_WIDGET` identified by `b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b`.
- `CampaignCreator` remains the unique operating row and Direct-add intent remains the only new-membership mutation.
- Initial query-only Campaign filters must continue to constrain the query and are never user-removable in the embedded Campaign surface.
- The generic full-page Record Index retains its existing filter bar, empty-state text, and scrolling behavior.
- No custom table, generated-class selector, migration, metadata-source-provenance change, dependency, mailbox provisioning, email send, deployment, or production data mutation.
- Preserve the Campaign tab order and Campaign information layout.
- Write tests before behavior changes. Use existing focused Jest conventions and run authenticated browser UAT after targeted tests pass.

---

### Task 1: Add explicit embedded-surface presentation policy

**Files:**
- Modify: `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexSurface.tsx`
- Modify: `packages/twenty-front/src/modules/object-record/record-index/components/__tests__/RecordIndexSurface.test.tsx`
- Modify: `packages/twenty-front/src/modules/myah/creator-crm/components/CampaignInfluencerIndex.tsx`
- Modify: `packages/twenty-front/src/modules/myah/creator-crm/__tests__/CampaignInfluencerIndex.test.tsx`

**Interfaces:**
- Produces a `RecordIndexSurfaceProps` presentation option that suppresses query-only scope controls without changing `initialQueryOnlyRecordFilters` state or the default surface behavior.
- `CampaignInfluencerIndex` consumes that option and passes its Campaign filter unchanged.

- [ ] **Step 1: Add failing surface-level assertions**

Extend the `RecordIndexViewBar` mock in `RecordIndexSurface.test.tsx` to capture a new boolean prop. Render one isolated surface with a query-only relation filter and the option enabled, then assert the view bar receives the prop while `RecordIndexContainer` still receives the same filter. Render the existing isolated surface without the option and assert the prop is false/undefined.

```tsx
expect(mockRecordIndexViewBar).toHaveBeenLastCalledWith(
  [listAFilter],
  expect.objectContaining({ hideQueryOnlyRecordFilters: true }),
);
expect(mockRecordIndexContainer).toHaveBeenLastCalledWith(
  [listAFilter],
  expect.any(String),
  ViewType.TABLE,
);
```

Extend `CampaignInfluencerIndex.test.tsx` to assert that the `RecordIndexSurface` call includes `hideQueryOnlyRecordFilters: true` and retains the relation filter with `value: 'campaign-a'`.

- [ ] **Step 2: Run the focused frontend RED tests**

```bash
npx jest \
  packages/twenty-front/src/modules/object-record/record-index/components/__tests__/RecordIndexSurface.test.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/CampaignInfluencerIndex.test.tsx \
  --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: the new prop assertions fail because the surface has no presentation option.

- [ ] **Step 3: Implement and wire the policy**

Add `hideQueryOnlyRecordFilters?: boolean` to `RecordIndexSurfaceProps`; thread it through `RecordIndexSurface` and `RecordIndexSurfaceInstance`; pass it to `RecordIndexViewBar`. Add the corresponding optional prop to `RecordIndexViewBar` and have its query-only-filter rendering omit only those chips and their adjacent add-filter affordance when true. Do not change the atoms, `useEffectiveRecordFilters`, or the table query.

Set `hideQueryOnlyRecordFilters` on the `CampaignInfluencerIndex` surface. Keep `initialQueryOnlyRecordFilters={[campaignFilter]}` exactly as-is.

- [ ] **Step 4: Run focused GREEN tests**

Re-run the command from Step 2.

Expected: PASS; Campaign data remains scoped, while the generic surface retains its existing filter UI.

- [ ] **Step 5: Commit the independently testable slice**

```bash
git add \
  packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexSurface.tsx \
  packages/twenty-front/src/modules/object-record/record-index/components/__tests__/RecordIndexSurface.test.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/components/CampaignInfluencerIndex.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/CampaignInfluencerIndex.test.tsx
git commit -m "fix(campaign): hide embedded influencer scope filter"
```

### Task 2: Remove mailbox assignment from Campaign Creator admission

**Files:**
- Modify: `packages/twenty-front/src/modules/myah/creator-crm/components/CreatorBulkRelationshipDialog.tsx`
- Modify: `packages/twenty-front/src/modules/myah/creator-crm/hooks/useApplyCreatorBulkRelationship.ts`
- Modify: `packages/twenty-front/src/modules/myah/creator-crm/__tests__/CreatorBulkRelationshipDialog.test.tsx`
- Modify: `packages/twenty-front/src/modules/myah/creator-crm/__tests__/useApplyCreatorBulkRelationship.test.tsx`

**Interfaces:**
- `CreatorBulkRelationshipDialog` consumes a Campaign target and selected Creator IDs; it submits only `creatorIdsToAdd` to the Direct-add operation.
- `useApplyCreatorBulkRelationship` continues to support Creator List membership and Direct Campaign membership but no longer accepts or sends managed-mailbox arguments on this admission path.

- [ ] **Step 1: Replace mailbox-specific tests with behavior tests**

In `CreatorBulkRelationshipDialog.test.tsx`, render an add-to-Campaign action with a ready preview and assert:

```tsx
expect(screen.queryByText('Sending mailbox')).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: 'Clear mailbox assignment' })).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Add to campaign' })).toBeEnabled();
```

Confirm an empty selection and an unavailable preview remain disabled. Confirm a repeat selection with no new Creator renders the existing no-change state rather than mutating.

In `useApplyCreatorBulkRelationship.test.tsx`, assert direct Campaign admission sends precisely:

```ts
expect(mockAddDirectCampaignCreators).toHaveBeenCalledWith({
  variables: {
    input: { campaignId: 'campaign-1', creatorIds: ['creator-1', 'creator-2'] },
  },
});
```

and has no `assignedManagedMailboxId` property.

- [ ] **Step 2: Run focused RED tests**

```bash
npx jest \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/CreatorBulkRelationshipDialog.test.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/useApplyCreatorBulkRelationship.test.tsx \
  --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: FAIL because the Campaign branch loads and requires a mailbox.

- [ ] **Step 3: Remove the unrelated state and mutation parameter**

Delete the managed-email query/import/type, selected-mailbox state, mailbox chooser, and `requiresManagedMailbox` branch from `CreatorBulkRelationshipDialog`. For an add-to-Campaign action, calculate `actionableCount` from `preview.unlinkedCreatorIds.length`; confirmation depends only on preview readiness, apply state, selection, and actionable count.

Delete `assignedManagedMailboxId` and `campaignCreatorIdsToUpdate` from `useApplyCreatorBulkRelationship` and submit the Direct-add intent with only `campaignId` and `creatorIds`. Retain existing creator-list mutations, cache invalidation, snackbar error reporting, and idempotent behavior.

- [ ] **Step 4: Run focused GREEN tests**

Re-run the command from Step 2.

Expected: PASS; Campaign addition is ready immediately after a valid selection and has no mailbox UI.

- [ ] **Step 5: Commit the independently testable slice**

```bash
git add \
  packages/twenty-front/src/modules/myah/creator-crm/components/CreatorBulkRelationshipDialog.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/hooks/useApplyCreatorBulkRelationship.ts \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/CreatorBulkRelationshipDialog.test.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/useApplyCreatorBulkRelationship.test.tsx
git commit -m "fix(campaign): admit creators without mailbox assignment"
```

### Task 3: Make the Campaign Influencers native view fit its embedded width

**Files:**
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view-field/compute-myah-view-fields.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts`
- Update: affected snapshot under `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/__snapshots__/`

**Interfaces:**
- Produces the source-controlled Campaign Influencers column set: `creator`, `stage`, `isDirectlyAdded`, and retained List-source provenance only when each column fits the Campaign tab’s operating purpose.
- The generic full-page Creators view is not consumed or changed.

- [ ] **Step 1: Add a failing metadata assertion for the embedded table columns**

In `compute-myah-standard-metadata.spec.ts`, locate the existing Campaign Influencers view-field assertions. Assert the resulting view fields are the minimum approved operating set and in this order: `creator`, `stage`, `isDirectlyAdded`, `campaignCreatorListSources`. Assert no inherited/non-approved `campaignCreator` field appears in the view.

- [ ] **Step 2: Run metadata RED only if the source-controlled set differs**

```bash
npx jest \
  packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts \
  --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: the assertion fails only if the current metadata contains an extra width-consuming column. If it already passes, record that metadata is not the scrollbar source and move the width correction to the existing table/container seam identified by browser inspection; do not make a no-op metadata change.

- [ ] **Step 3: Apply the proven width correction**

If metadata exposes an extra Campaign Influencers column, remove only that field from `campaignInfluencersFields` in `compute-myah-view-fields.util.ts` and update the generated snapshot. Otherwise, add a scoped `min-width: 0; width: 100%;` containment rule at the existing embedded `RecordIndexSurface` or Campaign page-content boundary that prevents its flex child from exceeding the parent; do not hide overflow or clip table content.

- [ ] **Step 4: Run metadata/frontend GREEN checks**

Run the metadata command from Step 2 and the Task 1 RecordIndexSurface suite. Expected: PASS; the embedded table has no artificial horizontal overflow and retains readable columns.

- [ ] **Step 5: Commit the independently testable slice**

```bash
git add \
  packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view-field/compute-myah-view-fields.util.ts \
  packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts \
  packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/__snapshots__
git commit -m "fix(campaign): fit influencers table in embedded tab"
```

If the proven correction is frontend containment rather than metadata, replace the staged server paths above with only the modified frontend source and its test.

### Task 4: Verify the visible Campaign workflow end-to-end

**Files:**
- Modify: only regression tests required by a failure from Tasks 1–3.
- Update: `docs/superpowers/specs/2026-08-17-campaign-influencers-native-surface-correction-design.md` only if implementation evidence changes a stated invariant.

**Interfaces:**
- Proves the Campaign scoped native surface, Direct-add operation, empty state, and responsive layout as one behavior.

- [ ] **Step 1: Run all relevant automated coverage**

```bash
npx jest \
  packages/twenty-front/src/modules/object-record/record-index/components/__tests__/RecordIndexSurface.test.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/CampaignInfluencerIndex.test.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/CreatorBulkRelationshipDialog.test.tsx \
  packages/twenty-front/src/modules/myah/creator-crm/__tests__/useApplyCreatorBulkRelationship.test.tsx \
  --config=packages/twenty-front/jest.config.mjs --runInBand

npx jest \
  packages/twenty-server/src/modules/myah-campaign/services/__tests__/campaign-influencer.service.spec.ts \
  packages/twenty-server/src/modules/myah-campaign/resolvers/__tests__/campaign-influencer.resolver.spec.ts \
  --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run authenticated browser UAT against the isolated runtime**

1. Open the named browser session at the isolated Apple workspace Campaign.
2. Visit **Influencers** with zero rows: confirm no API subtitle, no Campaign JSON chip, and no add-filter control.
3. Add at least two disposable Creators through **Add Influencers**: confirm the picker enables after selection and membership persists after the modal closes.
4. From Creators bulk action, add a selected Creator to the Campaign: confirm the review dialog has no Sending mailbox or clear-assignment control and that `Add to campaign` is enabled when the preview has additions.
5. Confirm the Influencers table has no horizontal scrollbar at the reported desktop viewport and table rows remain readable.
6. Close the exact named browser session.

- [ ] **Step 3: Record evidence and commit only intended changes**

Add focused verification evidence to the MYAH-259 handoff and Hermes Wiki. Inspect the diff; stage only correction files and tests. Do not stage unrelated pre-existing worktree changes.

```bash
git commit -m "fix(campaign): polish native influencers workflow"
```

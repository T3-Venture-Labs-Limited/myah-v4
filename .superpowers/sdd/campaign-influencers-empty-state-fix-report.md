# Campaign Influencers Empty-State Correction

## RED

Command not run: the requested production behavior was already present in committed work `7f05d1eec` before this assignment (`hideEmptyStateSubtitle` flows from `CampaignInfluencerIndex` through `RecordIndexSurface` and `RecordIndexContext` to the no-record empty state). Reverting that committed implementation merely to manufacture a failure would have modified unrelated established work. The new focused regression tests therefore ran against the existing implementation and passed.

## GREEN

```sh
npx jest packages/twenty-front/src/modules/object-record/record-table/empty-state/components/__tests__/RecordTableEmptyStateNoGroupNoRecordAtAll.test.tsx packages/twenty-front/src/modules/myah/creator-crm/__tests__/CampaignInfluencerIndex.test.tsx --config=packages/twenty-front/jest.config.mjs
```

Result: `2 passed, 2 total` suites; `11 passed, 11 total` tests.

## Files

- `packages/twenty-front/src/modules/myah/creator-crm/__tests__/CampaignInfluencerIndex.test.tsx` — asserts the Campaign embedded surface explicitly opts into subtitle suppression.
- `packages/twenty-front/src/modules/object-record/record-table/empty-state/components/__tests__/RecordTableEmptyStateNoGroupNoRecordAtAll.test.tsx` — verifies an opt-in preserves the native title/illustration while suppressing the subtitle and non-opt-in surfaces retain the subtitle.

The existing production implementation is in commit `7f05d1eec`:

- `CampaignInfluencerIndex.tsx`
- `RecordIndexSurface.tsx`
- `RecordIndexContext.ts`
- `RecordTableEmptyStateNoGroupNoRecordAtAll.tsx`
- `RecordTableEmptyStateDisplay.tsx`

## Commit

`test(campaign): cover empty-state subtitle policy`

## Self-review

- The opt-in remains explicit and presentation-only.
- The Campaign assertion covers the intended embedded call site.
- The default path is covered without changing generic Record Index behavior.
- The asserted native empty-state title and `noRecord` placeholder remain intact.

## Concerns

No functional concerns. A genuine RED result was unavailable because the narrow production correction was already committed before the assignment; this report records that fact rather than manufacturing a failure by reverting it.

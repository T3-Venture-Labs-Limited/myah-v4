# Campaign Influencers native-surface correction

## Goal

Make the Campaign Influencers tab read and behave as a compact, campaign-scoped use of Twenty's native Creators table. Remove the Campaign-only chrome, hidden-scope leakage, narrow-width overflow, misplaced table boundary, and nested selector dialog.

## Scope

- Remove the bespoke Campaign Influencers page header and its menu.
- Render `Add Influencers` in the native Record Index toolbar immediately before Filter, Sort, and Options.
- Keep the Campaign relation query active, but never render its serialized current-record filter chip or remove control.
- Preserve native table columns and interaction while fitting the Campaign tab without a horizontal scrollbar at supported narrow widths.
- Use the normal Creators table footer boundary: after the last row and above Calculate; omit Add New in this embedded Campaign surface.
- Replace the outer `Add Influencers` modal plus nested picker with one dialog that owns selection and submission.

## Non-goals

- No custom Campaign table, API redesign, migration, Creator List behavior change, or changes to the normal Creators index.
- No query-state mutation, CSS-only hiding of still-interactive controls, or modal z-index workaround.

## Design

`CampaignInfluencerIndex` remains the Campaign-specific integration point. It provides an explicit presentation/action configuration to `RecordIndexSurface` rather than owning a parallel header or table.

`RecordIndexSurface` exposes a narrow optional toolbar action slot, rendered in the existing table toolbar before the native Filter, Sort, and Options controls. The Campaign integration supplies Add Influencers to this slot. No generic caller changes presentation.

The Campaign presentation policy continues to initialize the active current-record relationship filter, but the view bar excludes it from chips and removal affordances. Normal user-created filters remain visible and editable.

The Campaign add action opens one stateful dialog. That dialog directly hosts the multi-record selector and confirmation button. Selecting Creators must not open another modal. Selection success applies the existing campaign relationship mutation and closes the dialog; failures retain selection and display the existing error state.

The embedded table receives a Campaign-only layout policy based on the native Creators table structure. It disables Add New, uses intrinsic/flexible columns without an overflow-x scroll wrapper, and retains exactly one separator above Calculate.

## Verification

Focused tests cover: the toolbar action placement/configuration; scope-chip omission while the query remains configured; default generic behavior remains unchanged; no Add New; Campaign table/footer layout contract; a single modal through picker selection and add confirmation; successful and failed add behavior.

Browser UAT exercises the exact cmux Campaign route at desktop and narrow viewport widths. It verifies no serialized chip, no horizontal scroller, no below-Calculate separator, Add Influencers positioned left of Filter/Sort/Options, and one visible dialog while selecting and adding a Creator.

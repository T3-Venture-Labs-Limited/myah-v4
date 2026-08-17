# Campaign Influencers native-surface correction

## Goal

Make the Campaign **Influencers** tab behave as a clean Campaign-scoped operating table:

- remove the inherited empty-state API subtitle;
- hide internal Campaign scope-filter controls;
- add selected Creators to a Campaign without any managed-mailbox assignment; and
- eliminate horizontal overflow at the Campaign tab’s desktop widths.

This is a correction to the existing MYAH-259 native `RecordIndexSurface` implementation. It does not change Creator List source provenance, Campaign Creator uniqueness, permissions, or broader Record Index behavior.

## Decision

Keep the existing native `RecordIndexSurface`. Extend its public configuration only where it can express a generic native concern, then set the Campaign Influencers instance’s local policy. Do not replace the table, scrape framework DOM, or add CSS selectors tied to generated class names.

## Scope

### Empty state

The Campaign Influencers surface retains its native empty illustration and title. It must not render the inherited subtitle `Use our API or add your first Campaign Creator`, because Campaign membership is intentionally added through the Campaign-specific action.

### Immutable Campaign scope

The Campaign relation filter is an implementation detail that bounds the embedded index to its parent Campaign. The surface must apply it to the query but must not render the filter chip, its remove affordance, or `Add filter`.

The standard full-page index must remain unchanged: user-created filters continue to render and remain editable there.

### Creator-to-Campaign admission

Creator-to-Campaign admission creates or preserves `CampaignCreator` operating records through the existing Direct-add intent. It is independent of managed sending-mailbox assignment.

The confirmation dialog for Campaign admission must:

- show target, selected, changed, and unchanged counts;
- enable `Add to campaign` when at least one Creator will be added and the preview is ready;
- omit `Sending mailbox`, every mailbox option, and `Clear mailbox assignment`; and
- call the existing Direct-add mutation without `assignedManagedMailboxId`.

Mailbox assignment remains available only in its existing dedicated workflow, if any. This correction does not redefine that workflow.

### Layout

The Campaign Influencers view exposes only the narrow operating columns required by MYAH-259. Its native table must use the available Campaign tab width without an unnecessary horizontal scrollbar. The normal full-page Creators table remains unchanged.

## Implementation seams

1. `RecordIndexSurface` / its native empty, filter-bar, and table configuration: add the smallest explicit options required to distinguish an embedded immutable scope from an ordinary editable index.
2. `CampaignInfluencerIndex`: set those options locally; retain the Campaign relation filter and current header action.
3. `CreatorBulkRelationshipDialog` and the shared apply hook: remove managed-mailbox state/query/arguments from the Creator-to-Campaign admission path, while retaining Creator List behavior and existing failure handling.
4. Campaign Influencers view metadata/configuration: verify the source-controlled column set fits the embedded width. Remove or narrow only columns that are not part of the approved operating contract.

## Error handling and invariants

- Missing metadata, view, or read permission retains the current bounded native-compatible state.
- Admission preview failure keeps confirmation disabled with its existing feedback.
- Selecting no Creators keeps confirmation disabled.
- Repeating an admission remains idempotent: existing Campaign Creators are counted as unchanged and no duplicate operating row is created.
- Campaign filtering remains enforced server-side and in the index query even though its UI is hidden.

## Verification

Add focused regression coverage before each behavior change:

1. Campaign Influencers passes an immutable/hidden scope configuration; standard record indexes keep filter controls.
2. Campaign empty state excludes the API subtitle while preserving the title.
3. Campaign admission confirmation has no mailbox controls and submits Direct-add with no mailbox argument.
4. Ready preview with newly selectable Creators enables confirmation; no-selection and unavailable-preview cases remain disabled.
5. Influencers’ configured columns fit the embedded Campaign layout without horizontal overflow at the affected desktop viewport.
6. Run the existing MYAH-259 frontend and server focused suites, then authenticated browser UAT: create/select Creators, add them to the Campaign without mailbox selection, confirm the visible rows and no scope chip/subtitle/scrollbar.

## Non-goals

- No custom Campaign table or dialog.
- No migration, metadata source-provenance, list synchronization, or API redesign.
- No changes to general Creators page columns or filters.
- No automatic outreach, mailbox provisioning, email send, deployment, or production mutation.

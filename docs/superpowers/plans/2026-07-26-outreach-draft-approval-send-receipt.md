# Outreach Draft → Approval → Send → Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one approval-gated Creator Ops email action that drafts for one Campaign Creator, sends exactly once through one workspace-owned mailbox, preserves sender/thread identity, and records one durable receipt plus one linked timeline event.

**Architecture:** `OutreachAction` is the durable business draft and lifecycle record. A new `send_outreach_email` action definition plugs into the existing action-approval binding/receipt system, while new prepare/send tools reuse `EmailComposerService` and the existing connected-account outbound drivers. Provider submission and workspace projection are separate idempotent steps joined by the action execution receipt ID; reconciliation may repeat projection but never provider submission.

**Tech Stack:** TypeScript, NestJS, TypeORM, Twenty workspace repositories, Zod, Jest, Vitest, Nx, Google/Microsoft/IMAP outbound messaging drivers.

**Approved specification:** `docs/superpowers/specs/2026-07-26-outreach-draft-approval-send-receipt-design.md`

**Scope stop:** Do not implement mailbox purchasing, Icemail, warmup, Metronome email subscriptions, managed-email settings UI, credential storage, inbound reply handling, bulk send, social send, or automatic send.

---

## File structure and ownership

### Canonical metadata

- `packages/twenty-apps/internal/myah-creator-ops/src/constants/universal-identifiers.ts` — Creator Ops application field identifiers.
- `packages/twenty-apps/internal/myah-creator-ops/src/objects/outreach-action.object.ts` — typed Outreach Action declaration.
- `packages/twenty-apps/internal/myah-creator-ops/src/__tests__/workflow-surface.unit.test.ts` — internal application contract.
- `packages/twenty-shared/src/metadata/constants/myah-standard-objects.constant.ts` — built-in standard metadata identifier registry.
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/myah-standard-object-field-builders.util.ts` — built-in typed field builders.
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts` — built-in metadata consistency contract.

### Generic approval and receipt safety

- `packages/twenty-server/src/engine/core-modules/action-approval/types/action-approval.type.ts` — discriminated Instagram/outreach binding union and internal accepted-provider identifier.
- `packages/twenty-server/src/engine/core-modules/action-approval/utils/action-binding-digest.util.ts` — action-kind-specific logical keys.
- `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.ts` — generic binding reconstruction/matching and durable provider identifier storage.
- `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-redaction.service.ts` — validates the safe internal header message ID while keeping it out of public receipts.
- `packages/twenty-server/src/engine/core-modules/action-approval/entities/action-approval-binding.entity.ts` — nullable generic action-context fingerprint; existing Instagram rows remain valid.
- `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785085300000-add-action-approval-context-fingerprint.ts` — generated and then LSP-renamed fast command that adds the nullable column.
- `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/__tests__/add-action-approval-context-fingerprint.instance-command.spec.ts` — fresh/existing schema and idempotency proof.
- Existing action-approval specs — prove Instagram behavior remains unchanged and outreach bindings are immutable/idempotent.

### Provider draft and failure semantics

- `packages/twenty-server/src/modules/messaging/message-outbound-manager/types/create-draft-result.type.ts` — safe provider draft identity.
- `packages/twenty-server/src/modules/messaging/message-outbound-manager/types/message-outbound-error-outcome.type.ts` — `REJECTED` versus `UNKNOWN` classification.
- `packages/twenty-server/src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util.ts` — structural HTTP/SMTP rejection classifier.
- `packages/twenty-server/src/modules/messaging/message-outbound-manager/interfaces/message-outbound-driver.interface.ts` — `createDraft` returns `CreateDraftResult`.
- `packages/twenty-server/src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service.ts` — forwards typed draft results.
- Google, Microsoft, and IMAP outbound driver services/specs — return portable draft IDs and preserve existing send behavior.

### Outreach runtime

- `packages/twenty-server/src/engine/core-modules/outreach-email/outreach-email.module.ts` — focused runtime module; no resolver/controller.
- `packages/twenty-server/src/engine/core-modules/outreach-email/types/outreach-email.type.ts` — canonical workspace record and mailbox-selection types.
- `packages/twenty-server/src/engine/core-modules/outreach-email/services/outreach-email-draft.service.ts` — validates the Campaign Creator graph and persists the provider/local draft snapshot.
- `packages/twenty-server/src/engine/core-modules/action-approval/definitions/outreach-email-action.definition.ts` — derives approval preview/binding and rebuilds execution authority.
- `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/prepare-outreach-email-draft-tool.ts` — composes Brand-Brain-informed text already supplied by the agent into one durable draft; does not retrieve or persist KB content.
- `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/send-outreach-email-tool.ts` — approval-binding-only execution boundary.
- `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/outreach-email-tool.schema.ts` — strict tool schemas.

### Approval dispatch, projection, and registration

- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool.ts` — strict two-action registered approval dispatch.
- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/services/chat-execution.service.ts` — injects both registered action definitions.
- `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-projector.service.ts` — passes internal action kind/provider identifier to projection.
- `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service.ts` — dispatches Instagram versus outreach projection and inserts the outreach timeline event with database idempotency.
- `packages/twenty-server/src/engine/core-modules/action-approval/action-approval.module.ts`, `packages/twenty-server/src/engine/core-modules/tool/tool.module.ts`, `packages/twenty-server/src/engine/core-modules/tool-provider/providers/action-tool.provider.ts`, and `packages/twenty-server/src/engine/core-modules/tool-provider/constants/action-tool-label.constant.ts` — DI and tool registration.
- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const.ts` — instructs the agent to use Brand Brain context when writing, then prepare → request approval → send; it adds no KB data to the binding.

---

### Task 1: Extend canonical Outreach Action metadata

**Files:**
- Modify: `packages/twenty-apps/internal/myah-creator-ops/src/constants/universal-identifiers.ts`
- Modify: `packages/twenty-apps/internal/myah-creator-ops/src/objects/outreach-action.object.ts`
- Modify: `packages/twenty-apps/internal/myah-creator-ops/src/__tests__/workflow-surface.unit.test.ts`
- Modify: `packages/twenty-shared/src/metadata/constants/myah-standard-objects.constant.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/myah-standard-object-field-builders.util.ts`
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts`

- [ ] **Step 1: Add failing internal-app and built-in metadata assertions**

Assert this exact ordered field contract after the existing fields:

```ts
[
  'name',
  'campaignCreator',
  'outreachStep',
  'channel',
  'status',
  'scheduledAt',
  'completedAt',
  'resultSummary',
  'subject',
  'body',
  'contentDigest',
  'recipientEmail',
  'connectedAccountId',
  'messageChannelId',
  'senderEmail',
  'senderDisplayName',
  'approvalBindingId',
  'executionReceiptId',
  'providerDraftExternalId',
  'sentHeaderMessageId',
  'providerMessageExternalId',
  'providerThreadExternalId',
  'messageId',
  'messageThreadId',
  'inReplyTo',
]
```

Also assert each internal application field universal identifier equals `MYAH_STANDARD_OBJECTS.outreachAction.fields[fieldName].universalIdentifier`.

- [ ] **Step 2: Run metadata tests and observe RED**

```bash
yarn --cwd packages/twenty-apps/internal/myah-creator-ops test:unit
yarn nx jest twenty-server --runInBand src/engine/workspace-manager/twenty-standard-application/utils/__tests__/compute-myah-standard-metadata.spec.ts
```

Expected: FAIL because the new fields do not exist.

- [ ] **Step 3: Add stable field identifiers to both canonical registries**

Use these exact UUIDv5 values in `OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS` and `MYAH_STANDARD_OBJECTS.outreachAction.fields`:

```ts
subject: 'a3ecbb51-442c-589d-b944-4bf5f6ddc93d',
body: 'fe19e40a-8f51-54df-b631-390b33a72359',
contentDigest: 'ed7d3f38-2ebf-556a-bc7d-7507def97dab',
recipientEmail: '21598e0a-077c-519b-b8d4-1a1a95966d90',
connectedAccountId: 'df2e43ca-b6b4-50ea-a0db-6edbb46ab391',
messageChannelId: 'a0b2e292-21e4-5226-aa88-e732345383e5',
senderEmail: 'b9b351b6-7e75-52be-9eaa-21cd6f722c12',
senderDisplayName: 'ec41fcc7-25d9-58b6-88a1-6749306e6947',
approvalBindingId: '8b5bd6ca-b61f-5a0c-b225-37f515d649ba',
executionReceiptId: '81731a47-27a7-5227-869c-284087244fa7',
providerDraftExternalId: '63285ab2-bd0c-537e-999b-4e67119b3bcc',
sentHeaderMessageId: '31e80297-1638-53b3-a607-3125905a63aa',
providerMessageExternalId: '3835066d-3e92-5781-a926-54b01b73d3a2',
providerThreadExternalId: 'f9dea5b1-f7a2-5c30-a5fe-8fbf082c87ad',
messageId: '9cca420c-78b7-52b9-ac79-c1f797e47846',
messageThreadId: '0a05accb-b4ca-5673-87be-41ea7d50c50b',
inReplyTo: '8b2b7357-3662-54e7-8433-31b73899051b',
```

- [ ] **Step 4: Add nullable text fields to both typed declarations**

Use `FieldType.TEXT` for all new fields. `subject`, `body`, `contentDigest`, `recipientEmail`, `connectedAccountId`, `messageChannelId`, `senderEmail`, and `providerDraftExternalId` are required after draft preparation; define them as nullable at metadata level so existing rows migrate safely, then enforce lifecycle completeness in the service. All remaining fields are nullable.

Use the existing `createMyahStandardFieldFlatMetadata` builder in the built-in metadata path. Do not add a second registry or manually modify metadata snapshots.

- [ ] **Step 5: Run metadata tests GREEN**

Run the two commands from Step 2.

Expected: PASS with identifier parity and the new field contract.

- [ ] **Step 6: Commit**

```bash
git add packages/twenty-apps/internal/myah-creator-ops/src packages/twenty-shared/src/metadata/constants/myah-standard-objects.constant.ts packages/twenty-server/src/engine/workspace-manager/twenty-standard-application
git commit -m "feat(myah): add durable outreach action fields"
```

---

### Task 2: Generalize action approval for outreach without changing Instagram behavior

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/types/action-approval.type.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/utils/action-binding-digest.util.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-redaction.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-binding-digest.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-redaction.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/entities/action-approval-binding.entity.ts`
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785085300000-add-action-approval-context-fingerprint.ts`
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/__tests__/add-action-approval-context-fingerprint.instance-command.spec.ts`
- Generated update: `packages/twenty-server/src/database/commands/upgrade-version-command/instance-commands.constant.ts`

- [ ] **Step 1: Add failing union and idempotency tests**

Define test fixtures for:

```ts
const outreachBinding = {
  workspaceId,
  actionName: 'send_outreach_email' as const,
  actionVersion: 1 as const,
  draftId: outreachActionId,
  contentDigest: 'a'.repeat(64),
  recipientFingerprint: 'b'.repeat(64),
  sendingAccountFingerprint: 'c'.repeat(64),
  actionContextFingerprint: 'd'.repeat(64),
  threadId: agentChatThreadId,
  initiatorUserWorkspaceId,
  evidenceLinks,
};
```

Tests must prove:

1. `createPendingBinding` stores the outreach context fingerprint and null Instagram-only columns.
2. `getApprovedBinding` reconstructs outreach without requiring inbound Instagram fields.
3. `reserveExecutionForBinding` accepts the exact outreach binding once and returns the existing receipt on the second call.
4. Changing content, recipient, sender, existing email-thread context, chat thread, workspace, or evidence rejects execution.
5. Existing Instagram digest vectors and service tests remain byte-for-byte unchanged with `actionContextFingerprint: null`.
6. `recordProviderAccepted` stores a valid header message ID internally but `toSafeReceipt` does not expose it.
7. A header ID containing CR/LF or longer than 998 characters is rejected before persistence.
8. The nullable context-fingerprint command upgrades an existing action-approval table, succeeds on a fresh-compatible table, and is idempotent on a second run.

- [ ] **Step 2: Run focused approval tests RED**

```bash
yarn nx jest twenty-server --runInBand \
  src/engine/core-modules/action-approval/services/action-approval.service.spec.ts \
  src/engine/core-modules/action-approval/__tests__/action-binding-digest.spec.ts \
  src/engine/core-modules/action-approval/__tests__/action-receipt-redaction.service.spec.ts \
  src/database/commands/upgrade-version-command/2-19/__tests__/add-action-approval-context-fingerprint.instance-command.spec.ts
```

Expected: FAIL because only `send_instagram_reply` is representable and accepted outcomes discard the provider message ID.

- [ ] **Step 3: Introduce a discriminated binding union**

Use this shape:

```ts
type ActionBindingBase = {
  actionVersion: 1;
  draftId: string;
  contentDigest: string;
  recipientFingerprint: string;
  sendingAccountFingerprint: string;
  threadId: string; // authenticated agent chat thread
  initiatorUserWorkspaceId: string;
  evidenceLinks: readonly ActionEvidenceLinkInput[];
};

export type InstagramReplyExpectedActionBinding = ActionBindingBase & {
  actionName: 'send_instagram_reply';
  actionContextFingerprint: null;
  inboundMessageId: string;
  inboundSenderIgsid: string;
  inboundDirection: 'INBOUND';
  inboundReceivedAt: Date;
};

export type OutreachEmailExpectedActionBinding = ActionBindingBase & {
  actionName: 'send_outreach_email';
  actionContextFingerprint: string;
};

export type ExpectedActionBinding =
  | InstagramReplyExpectedActionBinding
  | OutreachEmailExpectedActionBinding;
```

`ExpectedActionBindingWithWorkspace` remains the union intersected with `{ workspaceId: string }`.

- [ ] **Step 4: Preserve the v1 Instagram logical key and add an email key**

Use an exhaustive `switch (input.actionName)`. Keep the existing Instagram JSON array exactly unchanged. For outreach use:

```ts
[
  'v1',
  input.workspaceId,
  input.actionName,
  input.actionVersion,
  input.draftId,
  input.contentDigest,
  input.recipientFingerprint,
  input.sendingAccountFingerprint,
  input.actionContextFingerprint,
]
```

- [ ] **Step 5: Add and migrate the nullable generic context fingerprint**

Add `actionContextFingerprint: string | null` to `ActionApprovalBindingEntity`. Write the focused command test first, then update the entity and run:

```bash
yarn nx database:migrate:generate twenty-server -- --name add-action-approval-context-fingerprint --type fast --version 2.19.0
```

Use LSP `rename_file` to move the generated command to `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785085300000-add-action-approval-context-fingerprint.ts`; update its decorator timestamp to `1785085300000`. The LSP rename must update the generated registry import—do not hand-edit `instance-commands.constant.ts`. The command adds a nullable `varchar(64)` column with `IF NOT EXISTS`; no backfill is needed.

- [ ] **Step 6: Make binding persistence/reconstruction/matching action-aware**

In `createPendingBinding`, persist `actionContextFingerprint` for both variants and persist Instagram-only columns as null for outreach. In `getApprovedBinding`, validate common authorization first, then switch on `binding.actionName`:

- for `send_instagram_reply`, require and return all inbound fields exactly as today and require `actionContextFingerprint === null`;
- for `send_outreach_email`, require `actionVersion === 1`, non-null fingerprints, a 64-character context fingerprint, and no inbound Instagram values;
- reject unknown actions.

In `assertBindingMatches`, compare the context fingerprint with common fields/evidence, then compare inbound fields only for Instagram. Do not weaken the binding-ID, workspace, initiator, chat-thread, expiry, or consumed-state checks.

- [ ] **Step 7: Persist only a safe internal header message ID**

Extend `ProviderAcceptedOutcomeInput`/`AcceptedProviderOutcome` with `providerMessageId?: string`. Validate it as a non-empty, CR/LF-free string of at most 998 characters in `ActionReceiptRedactionService`. Store it in the existing `ActionExecutionReceiptEntity.providerMessageId` column. For `send_outreach_email`, this column means the RFC header Message-ID used to recover the workspace Message; for other action kinds it remains a provider-local identifier or null. No code may interpret it without first dispatching on `actionName`. Keep `SafeActionExecutionReceipt` unchanged.

- [ ] **Step 8: Run focused approval and migration tests GREEN**

Run the command from Step 2.

Expected: PASS, including unchanged Instagram vectors.

- [ ] **Step 9: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/action-approval packages/twenty-server/src/database/commands/upgrade-version-command/2-19 packages/twenty-server/src/database/commands/upgrade-version-command/instance-commands.constant.ts
git commit -m "feat(myah): bind approved outreach email actions"
```

---

### Task 3: Return provider draft identities and classify send failures safely

**Files:**
- Create: `packages/twenty-server/src/modules/messaging/message-outbound-manager/types/create-draft-result.type.ts`
- Create: `packages/twenty-server/src/modules/messaging/message-outbound-manager/types/message-outbound-error-outcome.type.ts`
- Create: `packages/twenty-server/src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util.ts`
- Create: `packages/twenty-server/src/modules/messaging/message-outbound-manager/utils/__tests__/classify-message-outbound-error.util.spec.ts`
- Modify: `packages/twenty-server/src/modules/messaging/message-outbound-manager/interfaces/message-outbound-driver.interface.ts`
- Modify: `packages/twenty-server/src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service.ts`
- Modify: `packages/twenty-server/src/modules/messaging/message-outbound-manager/drivers/gmail/services/gmail-message-outbound.service.ts`
- Modify: `packages/twenty-server/src/modules/messaging/message-outbound-manager/drivers/gmail/services/__tests__/gmail-message-outbound.service.spec.ts`
- Modify: `packages/twenty-server/src/modules/messaging/message-outbound-manager/drivers/microsoft/services/microsoft-message-outbound.service.ts`
- Create: `packages/twenty-server/src/modules/messaging/message-outbound-manager/drivers/microsoft/services/__tests__/microsoft-message-outbound.service.spec.ts`
- Modify: `packages/twenty-server/src/modules/messaging/message-outbound-manager/drivers/imap/services/imap-smtp-message-outbound.service.ts`
- Create: `packages/twenty-server/src/modules/messaging/message-outbound-manager/drivers/imap/services/__tests__/imap-smtp-message-outbound.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool/tools/email-tool/draft-email-tool.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool/tools/email-tool/__tests__/draft-email-tool.spec.ts`

- [ ] **Step 1: Add failing draft-result tests**

Use this contract:

```ts
export type CreateDraftResult = {
  headerMessageId: string;
  draftExternalId: string;
  threadExternalId?: string;
};
```

Tests must prove:

- Gmail returns the compiled RFC header message ID, created draft message ID, and optional thread ID.
- Microsoft returns `internetMessageId`, draft message ID, and optional conversation ID.
- IMAP returns the compiled RFC header ID and `${draftFolderPath}:${uid}` from the append response.
- Missing Google/Microsoft IDs or missing IMAP UID throws instead of creating an unaddressable draft.
- `MessagingMessageOutboundService.deleteDraft` dispatches cleanup to the same selected provider/account; each driver deletes only the supplied draft identity.
- Existing `DraftEmailTool` still succeeds while ignoring the new result.

- [ ] **Step 2: Add failing error-classifier tests**

Use this output:

```ts
export type MessageOutboundErrorOutcome =
  | { kind: 'rejected'; code: 'provider_rejected' }
  | { kind: 'unknown'; code: 'unknown' };
```

Assert:

- `response.status` or `statusCode` in 400–599 → `rejected`;
- SMTP `responseCode` in 400–599 → `rejected`;
- timeout, socket reset, missing response, or an unknown thrown value → `unknown`.

Do not log or return raw provider errors.

- [ ] **Step 3: Run focused messaging tests RED**

```bash
yarn nx jest twenty-server --runInBand \
  src/modules/messaging/message-outbound-manager/utils/__tests__/classify-message-outbound-error.util.spec.ts \
  src/modules/messaging/message-outbound-manager/drivers/gmail/services/__tests__/gmail-message-outbound.service.spec.ts \
  src/modules/messaging/message-outbound-manager/drivers/microsoft/services/__tests__/microsoft-message-outbound.service.spec.ts \
  src/modules/messaging/message-outbound-manager/drivers/imap/services/__tests__/imap-smtp-message-outbound.service.spec.ts \
  src/engine/core-modules/tool/tools/email-tool/__tests__/draft-email-tool.spec.ts
```

Expected: FAIL because `createDraft` returns void and the classifier is absent.

- [ ] **Step 4: Implement portable draft results**

Change the driver interface and dispatcher to `Promise<CreateDraftResult>`. Use existing provider responses; do not issue extra provider calls. For IMAP, build the external ID from the already-known drafts folder path and append UID using the same `<folder>:<uid>` format consumed by `parseMessageId`.

Add `deleteDraft(draftExternalId, connectedAccount): Promise<void>` to the driver interface and dispatcher by exposing the deletion logic each driver already uses after send. Preparation uses it only to compensate when provider-draft creation succeeded but local Outreach Action persistence failed.

`sendDraft` must continue rebuilding the outgoing message from caller-supplied content and only use `draftExternalId` for provider-draft deletion. Add a regression assertion that provider-stored draft content is never used as the send body.

- [ ] **Step 5: Implement structural rejection classification**

Inspect only numeric response fields on an object-shaped error. A definitive provider response is `rejected`; everything else is `unknown`. Do not introduce SDK-specific dependencies.

- [ ] **Step 6: Run focused messaging tests GREEN**

Run the command from Step 3.

Expected: PASS for all three providers and the classifier.

- [ ] **Step 7: Commit**

```bash
git add packages/twenty-server/src/modules/messaging/message-outbound-manager packages/twenty-server/src/engine/core-modules/tool/tools/email-tool/draft-email-tool.ts
git commit -m "feat(messaging): return durable draft identities"
```

---

### Task 4: Prepare one workspace-isolated outreach draft

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/outreach-email/types/outreach-email.type.ts`
- Create: `packages/twenty-server/src/engine/core-modules/outreach-email/services/outreach-email-draft.service.ts`
- Create: `packages/twenty-server/src/engine/core-modules/outreach-email/services/outreach-email-draft.service.spec.ts`
- Create: `packages/twenty-server/src/engine/core-modules/outreach-email/outreach-email.module.ts`
- Create: `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/outreach-email-tool.schema.ts`
- Create: `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/prepare-outreach-email-draft-tool.ts`
- Create: `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/__tests__/prepare-outreach-email-draft-tool.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool/tool.module.ts`

- [ ] **Step 1: Define the narrow mailbox-selection contract**

```ts
export type OutreachMailboxSelection = {
  workspaceId: string;
  outreachActionId: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
};
```

This type contains identifiers and display identity only—never tokens, passwords, connection parameters, or provider payloads.

- [ ] **Step 2: Add failing draft-service tests**

Given one `campaignCreatorId`, sanitized subject/body, and a composed email, assert the service:

1. loads Campaign Creator, Creator, and Campaign through `GlobalWorkspaceOrmManager` for the supplied workspace;
2. requires both relations and `selectedContactMethod === 'EMAIL'` case-insensitively;
3. requires the Creator's valid email to exactly equal the sole `to` recipient;
4. rejects CC, BCC, attachments, a second recipient, another workspace's records/account/channel, archived account, unsupported `EMAIL_GROUP`, or a channel whose handle differs from the connected account handle;
5. when `inReplyTo` is supplied, requires the parent Message and its channel association to belong to the selected message channel and sender account;
6. snapshots the parent `messageThreadId` and association `messageThreadExternalId` before approval, and leaves both null for a first-contact draft;
7. creates one provider draft from the composed snapshot;
8. creates one Outreach Action with `channel: 'EMAIL'`, `status: 'DRAFT'`, the immutable snapshot, sender selection, provider draft ID, optional `inReplyTo`, and the pre-approved thread identities;
9. removes the provider draft if Outreach Action persistence fails; and
10. returns only safe IDs/labels/content—no connected-account credentials or connection parameters.

- [ ] **Step 3: Run draft-service test RED**

```bash
yarn nx jest twenty-server --runInBand src/engine/core-modules/outreach-email/services/outreach-email-draft.service.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 4: Implement workspace record types and preparation**

Use `ObjectRecord` intersections for `outreachAction`, `campaignCreator`, `creator`, and `campaign`. Run all workspace record access inside `GlobalWorkspaceOrmManager.executeInWorkspaceContext` with `buildSystemAuthContext(workspaceId)` and repositories resolved for that workspace.

Expose two service phases: `resolvePreparationAuthority({ workspaceId, campaignCreatorId, connectedAccountId, inReplyTo })` returns only the canonical recipient and safe mailbox/thread identity; `persistPreparedDraft({ authority, composedEmail })` revalidates that authority, computes the content digest, creates the provider draft, and writes Outreach Action. This prevents the tool from composing to a caller-supplied recipient.

Compute `contentDigest` from a canonical JSON array of `[sanitizedSubject, plainTextBody]` using `computeActionContentDigest`. Persist no Brand KB source text; the durable draft snapshot is the authorization source.

- [ ] **Step 5: Add the strict prepare tool**

Input schema:

```ts
z.object({
  campaignCreatorId: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  inReplyTo: z.string().trim().min(1).optional(),
}).strict();
```

The tool requires `context.userWorkspaceId` and `context.threadId`, calls `resolvePreparationAuthority` first, passes exactly its canonical Creator email to `EmailComposerService.composeEmail`, then calls `persistPreparedDraft`. To prevent arbitrary recipient injection, the tool input contains no recipient field.

- [ ] **Step 6: Run draft-service and tool tests GREEN**

```bash
yarn nx jest twenty-server --runInBand \
  src/engine/core-modules/outreach-email/services/outreach-email-draft.service.spec.ts \
  src/engine/core-modules/tool/tools/outreach-email-tool/__tests__/prepare-outreach-email-draft-tool.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/outreach-email packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool packages/twenty-server/src/engine/core-modules/tool/tool.module.ts
git commit -m "feat(myah): prepare one outreach email draft"
```

---

### Task 5: Define immutable outreach approval authority

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/action-approval/definitions/outreach-email-action.definition.ts`
- Create: `packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/outreach-email-action.definition.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/action-approval.module.ts`

- [ ] **Step 1: Add failing proposal/rebuild tests**

Test `propose`, `getProposal`, and `rebuildExecutionAuthority` against a canonical workspace graph. Assert:

- preview shows the exact subject/body, Creator label/email, and sender email;
- binding `draftId` is the Outreach Action ID;
- `contentDigest` matches `[subject, body]`;
- `recipientFingerprint` hashes `[recipientEmail]`;
- `sendingAccountFingerprint` hashes `[connectedAccountId, messageChannelId, senderEmail]`;
- `actionContextFingerprint` hashes `[inReplyTo ?? null, messageThreadId ?? null, providerThreadExternalId ?? null]`;
- evidence links include Outreach Action (`draft`), Campaign Creator (`campaign_creator`), Creator (`recipient`), Campaign (`campaign`), and parent Message (`thread_parent`) only when replying;
- changing any content, recipient, sender, parent message, workspace thread, provider thread, or relation causes `rebuildExecutionAuthority` to fail;
- another workspace's metadata/records cannot satisfy evidence; and
- an existing thread rejects a different connected account, channel, or sender.

- [ ] **Step 2: Run action-definition test RED**

```bash
yarn nx jest twenty-server --runInBand src/engine/core-modules/action-approval/definitions/__tests__/outreach-email-action.definition.spec.ts
```

Expected: FAIL because the definition does not exist.

- [ ] **Step 3: Implement the definition**

Mirror `InstagramReplyActionDefinition`'s three public methods and workspace/auth-context construction, but keep email-specific types local. Resolve evidence object metadata IDs by the shared Myah universal identifiers and standard Message universal identifier. Reject incomplete lifecycle rows before building a binding.

For execution authority, return the exact persisted subject/body and validated connected-account/message-channel/sender graph. Never accept subject, body, recipient, or account from the send tool input.

- [ ] **Step 4: Run definition tests GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/action-approval
git commit -m "feat(myah): define outreach email approval authority"
```

---

### Task 6: Register outreach in the existing human-approval flow

**Files:**
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool.ts`
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/tools/__tests__/request-approval.tool.spec.ts`
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/services/chat-execution.service.ts`
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/services/__tests__/agent-chat.service.approval.spec.ts`

- [ ] **Step 1: Add failing strict dispatch tests**

Registered inputs are exactly:

```ts
z.discriminatedUnion('toolName', [
  z.object({
    toolName: z.literal('send_instagram_reply'),
    actionInput: z.object({ draftId: z.string().uuid() }).strict(),
  }).strict(),
  z.object({
    toolName: z.literal('send_outreach_email'),
    actionInput: z.object({ outreachActionId: z.string().uuid() }).strict(),
  }).strict(),
]);
```

Assert each tool name dispatches to only its definition, persists that proposal's binding, and returns only `{ status: 'pending', actionApprovalBindingId }`. Unknown tools, mixed fields, caller-supplied preview/content/sender, or absent authenticated chat context are rejected.

- [ ] **Step 2: Run request-approval tests RED**

```bash
yarn nx jest twenty-server --runInBand \
  src/engine/metadata-modules/ai/ai-chat/tools/__tests__/request-approval.tool.spec.ts \
  src/engine/metadata-modules/ai/ai-chat/services/__tests__/agent-chat.service.approval.spec.ts
```

Expected: FAIL because registered approval supports only Instagram.

- [ ] **Step 3: Replace the single hard-coded definition with a two-entry map**

Use a small object keyed by the two tool names. Do not add a plugin framework or runtime discovery. Each map entry exposes `proposalInputSchema` and `propose`. Keep the existing generic manual approval request unchanged.

- [ ] **Step 4: Run request-approval tests GREEN**

Run the command from Step 2.

Expected: PASS for generic manual approval, Instagram, and outreach.

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-server/src/engine/metadata-modules/ai/ai-chat
git commit -m "feat(myah): request outreach email approval"
```

---

### Task 7: Send once and persist accepted/rejected/unknown outcomes

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/send-outreach-email-tool.ts`
- Create: `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/__tests__/send-outreach-email-tool.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/outreach-email-tool.schema.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool/tool.module.ts`

- [ ] **Step 1: Add failing execution-state tests**

The send schema contains only:

```ts
z.object({ actionApprovalBindingId: z.string().uuid() }).strict();
```

Assert the tool:

1. requires authenticated `userWorkspaceId` and agent `threadId`;
2. loads the approved binding and rebuilds canonical authority before reservation;
3. reserves through `reserveExecutionForBinding` before any provider call;
4. rebuilds `SendMessageInput` only from the persisted Outreach Action snapshot;
5. calls `MessagingMessageOutboundService.sendDraft` once with the stored provider draft ID and selected workspace-owned connected account;
6. records provider acceptance with `headerMessageId` in the internal receipt;
7. maps explicit HTTP/SMTP rejection to `FAILED`;
8. maps timeout/socket/unrecognized errors to `UNKNOWN`;
9. never retries `PROCESSING`, `BLOCKED`, `FAILED`, or `UNKNOWN` receipts;
10. returns success for existing `PROVIDER_ACCEPTED` after projection repair and existing `SENT` without provider submission; and
11. cannot send edited provider-draft content because the driver receives the persisted local subject/body.

- [ ] **Step 2: Run send-tool test RED**

```bash
yarn nx jest twenty-server --runInBand src/engine/core-modules/tool/tools/outreach-email-tool/__tests__/send-outreach-email-tool.spec.ts
```

Expected: FAIL because the tool does not exist.

- [ ] **Step 3: Implement minimal send orchestration**

Follow the existing `SendInstagramReplyTool` control flow. After acceptance:

```ts
await actionApprovalService.recordProviderAccepted(receipt.id, {
  code: 'accepted',
  acceptedAt: new Date(),
  providerMessageId: sendResult.headerMessageId,
});
```

Then attempt workspace sent-message persistence and receipt projection. Projection failure is swallowed only after provider acceptance because reconciliation replays it without sending. Do not log thrown provider objects or email content.

- [ ] **Step 4: Run send-tool test GREEN**

Run the command from Step 2.

Expected: PASS, including one provider call across repeated/concurrent execution requests.

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool packages/twenty-server/src/engine/core-modules/tool/tool.module.ts
git commit -m "feat(myah): send approved outreach email once"
```

---

### Task 8: Project one Outreach Action receipt and one timeline event idempotently

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/types/action-approval.type.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-projector.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval-reconciliation.service.spec.ts`

- [ ] **Step 1: Add failing outreach projection tests**

Assert projection receives internal `{ actionName, providerMessageId }` in addition to the existing safe fields, while those values remain absent from public receipts.

For `send_outreach_email`, assert one projection transaction:

1. locks the Outreach Action row;
2. verifies the current subject/body digest and bound execution receipt;
3. finds the sent workspace Message by `headerMessageId` and selected message-channel association;
4. if the Message has not been imported/persisted yet, throws so the accepted receipt remains retryable;
5. updates the action to `SENT`, sets completion/message/thread/provider identifiers, and keeps the original sender selection;
6. inserts a timeline activity targeted to Campaign Creator with `id = executionReceiptId` and safe properties containing only action/creator/campaign/message IDs and `status: 'SENT'`;
7. uses query-builder conflict protection on the timeline primary key; and
8. leaves exactly one timeline row across sequential and concurrent projection attempts.

Do not mutate Campaign Creator stage or contact summary; the approved contract requires a linked timeline event, not an extra campaign-state transition.

Also assert Instagram projection behavior remains unchanged.

- [ ] **Step 2: Run projection/reconciliation tests RED**

```bash
yarn nx jest twenty-server --runInBand \
  src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts \
  src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts \
  src/engine/core-modules/action-approval/services/action-approval-reconciliation.service.spec.ts
```

Expected: FAIL because the writer dispatches only to Instagram and does not receive the internal provider message ID.

- [ ] **Step 3: Generalize only the projection input**

Extend `ActionReceiptProjectionWriter.project` with:

```ts
{
  receiptId: string;
  workspaceId: string;
  actionName: 'send_instagram_reply' | 'send_outreach_email';
  draftId: string;
  contentDigest: string;
  providerMessageId: string | null;
}
```

`ActionReceiptProjectorService` reads these internal fields from the receipt/binding. Keep its public result `{ projected: boolean }` unchanged.

- [ ] **Step 4: Dispatch to focused private projection methods**

Keep existing Instagram SQL in `projectInstagramReply`. Add `projectOutreachEmail` using `GlobalWorkspaceOrmManager` repositories inside one workspace transaction. Use `buildTimelineActivityRelatedMorphFieldMetadataName('campaignCreator')` for the target relation field.

Insert the timeline activity with the execution receipt UUID as `id` via query builder and `orIgnore()`/`ON CONFLICT DO NOTHING`. Do not rely on a preceding lookup or the timeline repository's ten-minute merge window.

- [ ] **Step 5: Preserve recovery ordering**

Only transition the core receipt from `PROVIDER_ACCEPTED` to `SENT` after the workspace transaction completes. If the Message is not yet available or projection fails, leave the receipt accepted; the existing reconciliation cron retries projection without provider submission.

- [ ] **Step 6: Run projection/reconciliation tests GREEN**

Run the command from Step 2.

Expected: PASS, including concurrent exactly-one timeline projection and existing Instagram recovery.

- [ ] **Step 7: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/action-approval
git commit -m "feat(myah): project outreach send receipts idempotently"
```

---

### Task 9: Register tools and teach the agent the approval sequence

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/tool-provider/providers/action-tool.provider.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool-provider/constants/action-tool-label.constant.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool-provider/services/external-write-policy.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool-provider/services/__tests__/external-write-policy.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool/tool.module.ts`
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const.ts`
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/utils/approval-tool-availability.util.ts`
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/utils/__tests__/approval-tool-availability.util.spec.ts`
- Modify: `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/services/__tests__/agent-chat.service.approval.spec.ts`

- [ ] **Step 1: Add failing registration and policy tests**

Assert both tools are registered and labelled:

```ts
prepare_outreach_email_draft: 'Prepare Outreach Email Draft'
send_outreach_email: 'Send Outreach Email'
```

Both require the existing send-email permission. `send_outreach_email` is an external write and requires `request_approval`; `prepare_outreach_email_draft` creates a provider draft but never sends and remains available only under the same email permission.

- [ ] **Step 2: Add failing system-prompt contract**

Assert the prompt states this exact sequence in plain language:

1. read the selected Campaign Creator, Creator, Campaign, and available Brand Brain context;
2. call `prepare_outreach_email_draft` with IDs, subject, body, and optional parent header ID;
3. call `request_approval` in a separate step with only `toolName: 'send_outreach_email'` and `actionInput: { outreachActionId }`;
4. stop and wait;
5. after approval, call `send_outreach_email` with only `actionApprovalBindingId`.

The prompt must explicitly forbid automatic send, bulk send, recipient/account substitution, approval bypass, and inclusion of credentials.

- [ ] **Step 3: Run registration tests RED**

```bash
yarn nx jest twenty-server --runInBand \
  src/engine/core-modules/tool-provider/services/__tests__/external-write-policy.service.spec.ts \
  src/engine/metadata-modules/ai/ai-chat/utils/__tests__/approval-tool-availability.util.spec.ts \
  src/engine/metadata-modules/ai/ai-chat/services/__tests__/agent-chat.service.approval.spec.ts
```

Expected: FAIL because the tools and prompt contract are absent.

- [ ] **Step 4: Register tools with existing permission and approval gates**

Add the tools to `ToolModule` providers/exports and `ActionToolProvider` descriptors. Reuse `PermissionFlagType.SEND_EMAIL_TOOL`; do not add a new permission, resolver, feature flag, or configuration surface.

- [ ] **Step 5: Add the scoped prompt guidance**

Brand Brain is drafting context only. Do not put KB records, prompts, or source text in Outreach Action or action-approval receipts. Approval is over the finished durable subject/body snapshot.

- [ ] **Step 6: Run registration tests GREEN**

Run the command from Step 3.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/tool packages/twenty-server/src/engine/core-modules/tool-provider packages/twenty-server/src/engine/metadata-modules/ai/ai-chat
git commit -m "feat(myah): expose approval-gated outreach tools"
```

---

### Task 10: End-to-end service smoke, Linux verification, independent review, and Linear handoff

**Files:**
- Create: `packages/twenty-server/test/integration/action-approval/outreach-email-workflow.integration-spec.ts`
- Modify only if verification/review finds a real defect: files already owned by Tasks 1–9.

- [ ] **Step 1: Add the focused workflow integration test and observe RED**

Use real action-approval entities and workspace repository wiring with an isolated test workspace schema; replace only the provider boundary with a fake that records submissions. Exercise:

1. create an existing workspace before syncing the changed standard application, apply the metadata migration, and assert all new Outreach Action fields exist without data loss;
2. create Campaign, Creator, Campaign Creator, and one connected email channel in workspace A;
3. prepare one outreach draft;
4. prove send before approval fails with zero submissions;
5. approve the exact binding;
6. send once and project;
7. invoke send again and run reconciliation again;
8. assert one provider submission, one core execution receipt, one sent Outreach Action, one workspace Message, and one timeline activity whose ID equals the receipt ID;
9. change sender/content/thread identity and prove the old binding fails;
10. attempt workspace B IDs and prove zero additional submissions; and
11. simulate provider acceptance followed by workspace-message persistence failure, then add/import the Message and prove reconciliation completes without resending.

- [ ] **Step 2: Run the integration test RED, then implement only missing wiring and run GREEN**

```bash
yarn nx jest twenty-server --config ./jest-integration.config.ts --runInBand test/integration/action-approval/outreach-email-workflow.integration-spec.ts
```

Expected before final wiring: FAIL at the missing end-to-end behavior. Expected after corrections: PASS with one submission and one timeline row.

- [ ] **Step 3: Run focused Linux verification**

Execution host: current approved Linux workstation `/home/superdao/myah-v4/.worktrees/daryll/myah-168-implement-outreach-draft-approval-send-receipt-workflow`.

```bash
yarn --cwd packages/twenty-apps/internal/myah-creator-ops test:unit
yarn nx jest twenty-server --runInBand \
  src/engine/core-modules/action-approval \
  src/engine/core-modules/outreach-email \
  src/engine/core-modules/tool/tools/outreach-email-tool \
  src/engine/metadata-modules/ai/ai-chat/tools/__tests__/request-approval.tool.spec.ts \
  src/modules/messaging/message-outbound-manager \
  src/database/commands/upgrade-version-command/2-19/__tests__/add-action-approval-context-fingerprint.instance-command.spec.ts
yarn nx jest twenty-server --config ./jest-integration.config.ts --runInBand test/integration/action-approval/outreach-email-workflow.integration-spec.ts
yarn nx typecheck twenty-server
yarn nx lint twenty-server
yarn nx build twenty-server
```

Expected: all commands exit 0. Report any unrelated pre-existing warning separately; do not call it a pass if a command fails.

- [ ] **Step 4: Smoke the built runtime path**

Use the integration test's real workspace repositories plus fake provider as the repeatable smoke because external credentials are intentionally outside MYAH-168. Record the fake provider call count and receipt/timeline IDs. Expected: one approved action → one submission → one receipt → one timeline event across repeated invocation/reconciliation.

- [ ] **Step 5: Obtain independent review**

Dispatch an independent reviewer with the approved spec, plan, complete diff, and verification evidence. Require review of:

- workspace isolation and caller-controlled IDs;
- approval-binding immutability;
- sender/thread preservation;
- provider acceptance crash recovery;
- `FAILED` versus `UNKNOWN` classification;
- concurrent execution/projection idempotency;
- credential/PII leakage in outputs/logs/fixtures; and
- forbidden MYAH-184/MYAH-237 scope.

Resolve all Critical and Important findings. For each correction, add/adjust the failing regression first, rerun affected focused checks, and request follow-up review on invalidated areas.

- [ ] **Step 6: Create the final coherent implementation commit**

After review corrections and verification:

```bash
git add packages/twenty-apps/internal/myah-creator-ops packages/twenty-shared/src/metadata packages/twenty-server/src
git commit -m "feat(myah): complete approved outreach email workflow"
```

If Tasks 1–9 already produced coherent commits and no uncommitted correction remains, do not create an empty commit. Preserve the documentation design commit and the task commits as the auditable series.

- [ ] **Step 7: Document the MYAH-237 Task 13 consumer contract in Linear**

Add a comment to MYAH-237 containing:

```markdown
## MYAH-168 campaign mailbox consumer contract

MYAH-168 owns draft, approval, execution, retry safety, receipts, and timeline projection.

MYAH-237 Task 13 may provide only an eligible mailbox selection:

- workspaceId
- outreachActionId
- connectedAccountId
- messageChannelId
- senderEmail
- senderDisplayName

Guarantees and requirements:

1. The selected connected account and message channel must already belong to the same workspace and support outbound email.
2. MYAH-237 never supplies credentials or provider configuration through this contract.
3. MYAH-168 snapshots account, channel, and sender identity before approval; changing any of them invalidates approval.
4. Existing threads must keep their stored account, channel, and sender identity.
5. MYAH-237 may determine managed-mailbox eligibility, but it may not create/approve/send/retry/project outreach actions or bypass MYAH-168.
6. UNKNOWN provider outcomes require reconciliation and are never automatically resent.

Verified consumer seam: `OutreachMailboxSelection` in `packages/twenty-server/src/engine/core-modules/outreach-email/types/outreach-email.type.ts`.
```

Append exact Linux commands/outcomes, implementation commit IDs, and independent-review verdict. Also comment on MYAH-168 with the implementation handoff and verification evidence.

- [ ] **Step 8: Confirm completion state**

Verify MYAH-168 is still assigned to project `myah` and its Stage 3 milestone. Move it to the repository's review-ready Linear state only after the final commit, verification, and independent review are complete. Do not alter MYAH-237 implementation status from this worktree.

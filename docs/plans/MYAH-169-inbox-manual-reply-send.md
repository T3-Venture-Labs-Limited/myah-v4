# Inbox Manual Reply Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one provider-neutral, exactly-once **Send** action to the Myah Inbox reply composer, with the user's single click serving as approval for the exact saved draft revision.

**Architecture:** Add an Inbox-specific `send_inbox_reply` action definition behind the existing core action-binding and receipt seam. The server derives sender, recipient, subject, thread headers, account, and provider context from the native MessageThread, creates an approved immutable binding from the explicit click, reserves one receipt, calls the existing provider-neutral `sendMessage`, and projects one native outbound Message before clearing the approved draft. The frontend keeps the composer as the review surface and adds a direct rightmost **Send** button with no modal or second confirmation.

**Tech Stack:** NestJS, TypeORM, GraphQL, Zod/class-validator, React 19, Apollo Client, Jotai, TipTap, Lingui, Jest, Nx, Twenty native messaging and action-approval modules.

## Global Constraints

- Support every eligible native email configuration; Icemail is provisioning only and gets no special Inbox path.
- The bottom actions are exactly **Generate Reply**, then primary/rightmost **Send** in DOM and visual order.
- The editable composer is the review surface. Never render a review modal, duplicate From/To/subject preview, **Approve & send**, pending-review state, or second click.
- The browser submits only MessageThread ID and confirmed draft revision; sender, recipient, subject, body, account, provider, and headers remain server-derived.
- Action name/version is exactly `send_inbox_reply` / `1`.
- Keep the provider call behind `MessagingMessageOutboundService.sendMessage`; do not add a driver, provider draft, queue, or dependency.
- Reuse action bindings, logical idempotency, receipts, reconciliation, and `SentMessagePersistenceService`.
- No new database table, workspace metadata object/field, versioned migration, sender picker, CC/BCC, attachments, subject editing, recipient editing, triage mutation, Campaign/Creator/OutreachAction write, Task creation, or timeline write.
- Send the saved body as reviewed. Do not append or rewrite signatures or business content at send time.
- No agent tool, automatic send, bulk send, automatic reply, or automatic follow-up.
- Remove the visible **Shared reply draft** field label but retain accessible name **Shared reply draft** on the contenteditable editor.
- Keep React components under roughly 300 lines and services under roughly 500 lines; split authority from execution rather than growing existing oversized Inbox services.
- Regenerate GraphQL and Lingui outputs; do not hand-edit generated files.
- Run repository commands with Node 24.16.0 and bundled Yarn 4.13.0:
  Prefix Jest/Nx commands exactly as shown in every task with `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec`.

---

### Task 1: Extend Core Action Approval for Direct Inbox Send

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/types/action-approval.type.ts:7-38`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/utils/action-binding-digest.util.ts:16-53`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-binding-digest.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.ts:55-105,233-334,352-475`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts`

**Interfaces:**
- Produces: `MyahInboxReplyExpectedActionBinding` with `actionName: 'send_inbox_reply'`, `actionVersion: 1`, and non-null `actionContextFingerprint`.
- Produces: `ActionApprovalService.createApprovedInboxReplyBinding(input)` restricted to Task 1's Inbox binding type.
- Produces: `ActionApprovalService.invalidateApprovedInboxReplyBinding(input)` to unlock a stale direct-send binding only when no receipt exists.
- Produces: `ActionApprovalService.findExecutionReceipt({ workspaceId, receiptId, actionName, draftId, initiatorUserWorkspaceId })` for actor/thread-scoped Inbox status polling.
- Produces: `ActionApprovalService.isDraftExecutionLocked({ workspaceId, actionName, draftId })` for CAS draft writes.
- Consumes: existing `ExpectedActionBindingWithWorkspace`, evidence-link persistence, `reserveExecution`, receipt redaction, and logical-key uniqueness.

- [ ] **Step 1: Add failing type/digest tests for `send_inbox_reply`**

Add this binding fixture and assertions to `action-binding-digest.spec.ts`:

```ts
const inboxReplyBinding = {
  workspaceId: base.workspaceId,
  actionName: 'send_inbox_reply' as const,
  actionVersion: 1 as const,
  draftId: '20202020-0b5c-4178-bed7-d371f6411eaf',
  contentDigest: 'a'.repeat(64),
  recipientFingerprint: 'b'.repeat(64),
  sendingAccountFingerprint: 'c'.repeat(64),
  actionContextFingerprint: 'd'.repeat(64),
  threadId: '20202020-0b5c-4178-bed7-d371f6411eaf',
  initiatorUserWorkspaceId: base.initiatorUserWorkspaceId,
  evidenceLinks: [],
};

it('keeps identical Inbox reply sends on one logical key', () => {
  expect(computeLogicalActionKey(inboxReplyBinding)).toBe(
    computeLogicalActionKey({ ...inboxReplyBinding }),
  );
});

it('changes the Inbox reply key when the saved revision context changes', () => {
  expect(computeLogicalActionKey(inboxReplyBinding)).not.toBe(
    computeLogicalActionKey({
      ...inboxReplyBinding,
      actionContextFingerprint: 'e'.repeat(64),
    }),
  );
});
```

- [ ] **Step 2: Run the digest test and confirm red**

Run:

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-binding-digest.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: TypeScript/Jest fails because `send_inbox_reply` is not part of `ExpectedActionBinding` and the digest switch rejects it.

- [ ] **Step 3: Add the binding type and logical-key branch**

In `action-approval.type.ts`, add:

```ts
export type MyahInboxReplyExpectedActionBinding = ActionBindingBase & {
  actionName: 'send_inbox_reply';
  actionContextFingerprint: string;
};

export type ExpectedActionBinding =
  | InstagramReplyExpectedActionBinding
  | OutreachEmailExpectedActionBinding
  | MyahInboxReplyExpectedActionBinding;
```

In `computeLogicalActionKey`, share the fingerprint-based branch without changing Instagram semantics:

```ts
case 'send_outreach_email':
case 'send_inbox_reply':
  return sha256(
    JSON.stringify([
      'v1',
      input.workspaceId,
      input.actionName,
      input.actionVersion,
      input.draftId,
      input.contentDigest,
      input.recipientFingerprint,
      input.sendingAccountFingerprint,
      input.actionContextFingerprint,
    ]),
  );
```

- [ ] **Step 4: Add failing approval-service tests for direct approval, receipt lookup, and draft locking**

Add tests proving:

```ts
it('creates a direct Inbox binding already approved by the Send click', async () => {
  const result = await service.createApprovedInboxReplyBinding(inboxReplyBinding);
  const saved = await bindingRepository.findOneByOrFail({ id: result.id });

  expect(saved).toMatchObject({
    actionName: 'send_inbox_reply',
    state: ActionApprovalBindingState.APPROVED,
    threadId: inboxReplyBinding.threadId,
    draftId: inboxReplyBinding.draftId,
    decidedAt: expect.any(Date),
  });
});

it.each([
  ActionExecutionReceiptState.PROCESSING,
  ActionExecutionReceiptState.PROVIDER_ACCEPTED,
  ActionExecutionReceiptState.UNKNOWN,
])('locks the approved draft for %s', async (state) => {
  await seedInboxBindingAndReceipt(state);
  await expect(
    service.isDraftExecutionLocked({
      workspaceId,
      actionName: 'send_inbox_reply',
      draftId: messageThreadId,
    }),
  ).resolves.toBe(true);
});

it.each([
  ActionExecutionReceiptState.FAILED,
  ActionExecutionReceiptState.SENT,
])('does not lock the draft for terminal %s', async (state) => {
  await seedInboxBindingAndReceipt(state);
  await expect(
    service.isDraftExecutionLocked({
      workspaceId,
      actionName: 'send_inbox_reply',
      draftId: messageThreadId,
    }),
  ).resolves.toBe(false);
});
Also prove an approved binding with no receipt locks, a pending/rejected/expired binding does not lock, and `findExecutionReceipt` returns `null` for a foreign workspace, different initiator, different action, or different MessageThread.
Also prove `invalidateApprovedInboxReplyBinding` changes only the exact actor/thread's `APPROVED` Inbox binding to `CHANGES_REQUESTED`, refuses a consumed/foreign/different-action binding, and refuses any binding that already has a receipt.


- [ ] **Step 5: Run the service test and confirm red**

Run:

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL because the three new methods do not exist and `getApprovedBinding` does not reconstruct `send_inbox_reply`.

- [ ] **Step 6: Implement the minimal core methods**

Implement `createApprovedInboxReplyBinding` beside `createPendingBinding`; accept only `MyahInboxReplyExpectedActionBinding & { workspaceId: string }`, persist the same common fields/evidence, and use `APPROVED` plus one shared timestamp:

```ts
async createApprovedInboxReplyBinding(
  input: MyahInboxReplyExpectedActionBinding & { workspaceId: string },
): Promise<{ id: string }> {
  return this.dataSource.transaction(async (manager) => {
    const decidedAt = new Date();
    const binding = await manager.save(
      ActionApprovalBindingEntity,
      manager.create(ActionApprovalBindingEntity, {
        workspaceId: input.workspaceId,
        initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
        actionName: input.actionName,
        actionVersion: input.actionVersion,
        draftId: input.draftId,
        contentDigest: input.contentDigest,
        recipientFingerprint: input.recipientFingerprint,
        sendingAccountFingerprint: input.sendingAccountFingerprint,
        actionContextFingerprint: input.actionContextFingerprint ?? null,
        inboundMessageId: null,
        inboundSenderIgsid: null,
        inboundDirection: null,
        inboundReceivedAt: null,
        threadId: input.threadId,
        state: ActionApprovalBindingState.APPROVED,
        expiresAt: new Date(decidedAt.getTime() + ACTION_APPROVAL_TTL_MS),
        decidedAt,
      }),
    );

    await manager.save(
      ActionApprovalBindingEvidenceLinkEntity,
      input.evidenceLinks.map((evidence) =>
        manager.create(ActionApprovalBindingEvidenceLinkEntity, {
          actionApprovalBindingId: binding.id,
          ...evidence,
        }),
      ),
    );

    return { id: binding.id };
  });
}
```

Implement `invalidateApprovedInboxReplyBinding` in one pessimistic transaction: lock the exact workspace/binding row, require `actionName === 'send_inbox_reply'`, matching initiator and draft IDs, state `APPROVED`, and no `ActionExecutionReceiptEntity`; then set `CHANGES_REQUESTED` and `decidedAt` to the current time. Never invalidate a binding after receipt reservation.

Add the `send_inbox_reply` case to `getApprovedBinding` using the same non-null fingerprint validation as outreach email, with all Instagram-only fields null.

Implement `findExecutionReceipt` as a workspace-scoped receipt lookup returning `SafeActionExecutionReceipt | null`.

Implement `isDraftExecutionLocked` by loading approved/consumed bindings for the exact workspace/action/draft and their receipts, then returning true only for:

```ts
const lockingReceiptStates = new Set([
  ActionExecutionReceiptState.PROCESSING,
  ActionExecutionReceiptState.PROVIDER_ACCEPTED,
  ActionExecutionReceiptState.UNKNOWN,
]);

return bindings.some((binding) =>
  binding.state === ActionApprovalBindingState.APPROVED
    ? binding.expiresAt > new Date() && binding.receipts.length === 0
    : binding.state === ActionApprovalBindingState.CONSUMED &&
      binding.receipts.some((receipt) => lockingReceiptStates.has(receipt.state)),
);
```

- [ ] **Step 7: Run core approval tests**

Run the digest and service test commands from Steps 2 and 5.

Expected: both suites pass; existing Instagram and outreach cases remain unchanged.

- [ ] **Step 8: Commit Task 1**

```bash
git add packages/twenty-server/src/engine/core-modules/action-approval
git commit -m "feat(myah): support direct Inbox send bindings"
```

---

### Task 2: Resolve Provider-Neutral Inbox Reply Authority

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition.ts`
- Create: `packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts`
- Create: `packages/twenty-server/src/engine/core-modules/action-approval/utils/resolve-myah-inbox-reply-recipient.util.ts`
- Create: `packages/twenty-server/src/engine/core-modules/action-approval/utils/__tests__/resolve-myah-inbox-reply-recipient.util.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/action-approval.module.ts:28-68`
- Modify: `packages/twenty-server/src/engine/core-modules/managed-email/services/managed-email-campaign-eligibility.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/managed-email/services/__tests__/managed-email-campaign-eligibility.service.spec.ts`

**Interfaces:**
- Produces: `MyahInboxReplyActionDefinition.buildAuthority(input)`, `rebuildExecutionAuthority(input)`, and provider-free `rebuildProjectionAuthority(input)`.
- Produces: `CanonicalMyahInboxReplyGraph` with exact draft, sender, recipient, subject, account/channel, parent Message, and provider-thread data.
- Produces: `MyahInboxReplyUnavailableCode` for safe readiness mapping.
- Produces: `ManagedEmailCampaignEligibilityService.assertConnectedIdentityEligibleForFollowUp(input)` returning the matched managed mailbox or `null` for an ordinary account.
- Consumes: Task 1's `MyahInboxReplyExpectedActionBinding` and existing permission-aware workspace repositories.
- [ ] **Step 1: Write pure recipient-resolution tests**

Cover incoming, outgoing follow-up, aliases, invalid email, and ambiguity:

```ts
it('uses the one external FROM participant for an incoming message', () => {
  expect(
    resolveMyahInboxReplyRecipient({
      direction: 'INCOMING',
      participants: [
        { role: 'FROM', handle: 'creator@example.com', displayName: 'Creator' },
        { role: 'TO', handle: 'team@brand.com', displayName: 'Brand' },
      ],
      senderHandles: new Set(['team@brand.com']),
    }),
  ).toEqual({ email: 'creator@example.com', label: 'Creator' });
});

it('refuses multiple external TO recipients for an outgoing parent', () => {
  expect(() =>
    resolveMyahInboxReplyRecipient({
      direction: 'OUTGOING',
      participants: [
        { role: 'FROM', handle: 'team@brand.com', displayName: 'Brand' },
        { role: 'TO', handle: 'one@example.com', displayName: 'One' },
        { role: 'TO', handle: 'two@example.com', displayName: 'Two' },
      ],
      senderHandles: new Set(['team@brand.com']),
    }),
  ).toThrow('RECIPIENT_UNAVAILABLE');
});
```

- [ ] **Step 2: Run the pure test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/utils/__tests__/resolve-myah-inbox-reply-recipient.util.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL because the utility is absent.

- [ ] **Step 3: Implement deterministic recipient resolution**

Implement one exported function with no database access:

```ts
export const resolveMyahInboxReplyRecipient = ({
  direction,
  participants,
  senderHandles,
}: ResolveMyahInboxReplyRecipientInput): MyahInboxReplyRecipient => {
  const role = direction === 'INCOMING' ? 'FROM' : 'TO';
  const candidates = participants
    .filter((participant) => participant.role === role)
    .flatMap((participant) => {
      const parsed = emailSchema.safeParse(participant.handle?.trim());
      if (!parsed.success || senderHandles.has(parsed.data.toLowerCase())) {
        return [];
      }
      return [{
        email: parsed.data.toLowerCase(),
        label: participant.displayName?.trim() || parsed.data,
      }];
    });

  const unique = [...new Map(candidates.map((item) => [item.email, item])).values()];
  if (unique.length !== 1) {
    throw new Error('RECIPIENT_UNAVAILABLE');
  }
  return unique[0];
};
```

Run the Step 2 command; expect PASS.

- [ ] **Step 4: Write managed-identity matching tests**

Add tests proving:

```ts
await expect(
  service.assertConnectedIdentityEligibleForFollowUp({
    workspaceId,
    connectedAccountId,
    messageChannelId,
  }),
).resolves.toBeNull(); // ordinary account, no managed rows
```

Also prove one exact managed match calls `assertEligible(..., isFollowUp: true)`, while partial account-only, channel-only, duplicate, blocked, or mismatched records reject.

- [ ] **Step 5: Run managed eligibility tests and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/managed-email/services/__tests__/managed-email-campaign-eligibility.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL because `assertConnectedIdentityEligibleForFollowUp` does not exist.

- [ ] **Step 6: Implement managed identity matching without Icemail branching**

Query managed mailboxes by workspace where either identity matches. Return `null` for zero rows. Require exactly one row whose account and channel both match, then delegate:

```ts
return this.assertEligible({
  workspaceId: input.workspaceId,
  managedMailboxId: mailbox.id,
  connectedAccountId: input.connectedAccountId,
  messageChannelId: input.messageChannelId,
  isFollowUp: true,
});
```

Do not inspect Icemail provider fields in this method.

- [ ] **Step 7: Write failing canonical-authority tests**

Build permission-aware repository fakes and cover these observable contracts:

```ts
const authority = await definition.buildAuthority({
  workspaceId,
  initiatorUserWorkspaceId,
  messageThreadId,
  expectedDraftRevision: 4,
});

expect(authority.canonicalGraph).toMatchObject({
  messageThreadId,
  draftRevision: 4,
  draftBody: { markdown: 'Thanks for the update', blocknote: null },
  connectedAccountId,
  messageChannelId,
  senderEmail: 'team@brand.com',
  recipientEmail: 'creator@example.com',
  subject: 'Re: Partnership',
  inReplyTo: '<incoming@example.com>',
  parentMessageId,
});
expect(authority.expectedActionBinding).toMatchObject({
  actionName: 'send_inbox_reply',
  actionVersion: 1,
  draftId: messageThreadId,
  threadId: messageThreadId,
  initiatorUserWorkspaceId,
});
```

Also prove:

- `SHARE_EVERYTHING` permits workspace-shared sending;
- a private channel permits only its owning `userWorkspaceId`;
- `METADATA`/`SUBJECT` access to another user cannot send;
- account archived, channel sync disabled/not `ACTIVE`, unsupported channel type, invalid/missing parent header, ambiguous association, ambiguous recipient, blank draft, or stale revision returns the exact safe code;
- no first-workspace-account fallback occurs;
- subject keeps `Re: ` or prefixes it once;
- evidence contains exactly MessageThread `draft` and parent Message `thread_parent`;
- rebuild after any body/revision/recipient/account/channel/header change rejects.

- [ ] **Step 8: Run the authority test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL because the action definition is absent.

- [ ] **Step 9: Implement `MyahInboxReplyActionDefinition`**

Use this public interface:

```ts
export type CanonicalMyahInboxReplyGraph = {
  messageThreadId: string;
  draftRevision: number;
  draftBody: { markdown: string; blocknote: string | null };
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
  recipientEmail: string;
  recipientLabel: string;
  subject: string;
  inReplyTo: string;
  parentMessageId: string;
  providerMessageExternalId: string | null;
  providerThreadExternalId: string | null;
  managedMailboxId: string | null;
  connectedAccount: ConnectedAccountEntity;
};

async buildAuthority(input: {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  messageThreadId: string;
  expectedDraftRevision: number;
}): Promise<MyahInboxReplyActionAuthority>;

async rebuildExecutionAuthority(input: {
  workspaceId: string;
  binding: MyahInboxReplyExpectedActionBinding & { workspaceId: string };
}): Promise<MyahInboxReplyActionAuthority>;

async rebuildProjectionAuthority(input: {
  workspaceId: string;
  binding: MyahInboxReplyExpectedActionBinding & { workspaceId: string };
}): Promise<MyahInboxReplyActionAuthority>;

Inside `buildAuthority`:

1. build the initiating user's auth context exactly as `OutreachEmailActionDefinition` does;
2. load the policy-readable MessageThread draft and exact revision;
3. load the latest non-draft Message ordered `receivedAt DESC, id DESC` with participants and channel associations;
4. load only same-workspace email channels/accounts for those associations;
5. filter by account ownership or `SHARE_EVERYTHING`, active sync, non-archived account, and supported provider;
6. require one candidate;
7. resolve one external recipient with the pure utility;
8. run managed follow-up eligibility;
9. resolve MessageThread/Message object metadata IDs using `STANDARD_OBJECTS` universal identifiers;
10. compute all four fingerprints, including draft revision in `actionContextFingerprint`;
11. return the canonical graph and binding.

Use raw saved Markdown as `SendMessageInput.body` later and `escapeHtml(markdown)` as the safe HTML representation; do not introduce a second body normalization module.

Use `rebuildExecutionAuthority` immediately before provider I/O and re-run mutable account/channel/managed-mailbox eligibility. Use `rebuildProjectionAuthority` only after provider acceptance; it validates the immutable workspace/thread/draft revision, fingerprints, evidence, account/channel identities, and provider-thread context under system projection authority but must not block native Message persistence because permissions, sync health, paid state, or managed eligibility changed after the provider accepted the email.

- [ ] **Step 10: Run Task 2 tests**

Run the three commands from Steps 2, 5, and 8.

Expected: all pass, with no provider call in authority tests.

- [ ] **Step 11: Commit Task 2**

```bash
git add packages/twenty-server/src/engine/core-modules/action-approval packages/twenty-server/src/engine/core-modules/managed-email
git commit -m "feat(myah): resolve Inbox reply send authority"
```

---

### Task 3: Add the Direct Send and Status GraphQL Interface

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send.dto.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/send-myah-inbox-reply.input.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send-status.input.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/myah-inbox-reply-send.resolver.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/myah-inbox/myah-inbox.module.ts:18-45`
- Modify: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service.ts:158-243`
- Modify: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 approval/receipt methods and Task 2 authority definition.
- Produces: `myahInboxReplySendReadiness(threadId)`.
- Produces: `sendMyahInboxReply({ threadId, expectedDraftRevision })`.
- Produces: `myahInboxReplySendStatus({ threadId, receiptId })`.
- Produces public readiness/outcome enums exactly as specified.

- [ ] **Step 1: Write resolver registration and permission tests**

Prove the resolver uses all required guards and forwards only server-safe inputs:

```ts
await resolver.sendMyahInboxReply(
  { threadId, expectedDraftRevision: 4 },
  workspace,
  userWorkspaceId,
  workspaceMemberId,
);

expect(sendService.send).toHaveBeenCalledWith({
  threadId,
  expectedDraftRevision: 4,
  authContext,
  workspace,
  userWorkspaceId,
  workspaceMemberId,
  user: authContext.user,
});
```

Inspect reflected guards and require `WorkspaceAuthGuard`, `UserAuthGuard`, `CustomPermissionGuard`, and `SettingsPermissionGuard(PermissionFlagType.SEND_EMAIL_TOOL)`. Prove mismatched authenticated context is forbidden.

- [ ] **Step 2: Run the resolver test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL because the resolver/DTOs are absent.

- [ ] **Step 3: Define exact GraphQL DTOs and enums**

Use:

```ts
export enum MyahInboxReplySendReadinessStatus {
  READY = 'READY',
  THREAD_UNAVAILABLE = 'THREAD_UNAVAILABLE',
  SENDER_UNAVAILABLE = 'SENDER_UNAVAILABLE',
  RECIPIENT_UNAVAILABLE = 'RECIPIENT_UNAVAILABLE',
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  MAILBOX_INELIGIBLE = 'MAILBOX_INELIGIBLE',
  OUTCOME_PENDING = 'OUTCOME_PENDING',
  OUTCOME_UNKNOWN = 'OUTCOME_UNKNOWN',
}

export enum MyahInboxReplySendOutcome {
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  STALE = 'STALE',
}

@InputType()
export class SendMyahInboxReplyInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  expectedDraftRevision: number;
}

@InputType()
export class MyahInboxReplySendStatusInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  receiptId: string;
}
```

The send result includes `outcome`, nullable `receiptId`, `revision`, and nullable rich-text `body`. Readiness includes only status and safe reason; no provider or credential fields.

- [ ] **Step 4: Write failing direct-send service tests**

Cover one success, duplicate click, stale initial revision, authority change after binding creation, definitive rejection, ambiguous failure, prior receipt, and status read-back. The post-binding authority-change case must call `invalidateApprovedInboxReplyBinding`, return `STALE`, leave the draft writable, and perform no provider I/O. The successful contract:

```ts
const result = await service.send(request);

expect(createApprovedInboxReplyBinding).toHaveBeenCalledWith(
  authority.expectedActionBinding,
);
expect(reserveExecution).toHaveBeenCalledWith(
  authority.expectedActionBinding,
);
expect(sendMessage).toHaveBeenCalledTimes(1);
expect(sendMessage).toHaveBeenCalledWith(
  {
    to: ['creator@example.com'],
    subject: 'Re: Partnership',
    body: 'Thanks for the update',
    html: 'Thanks for the update',
    attachments: [],
    inReplyTo: '<incoming@example.com>',
    threadExternalId: 'provider-thread-id',
  },
  authority.canonicalGraph.connectedAccount,
);
expect(recordProviderAccepted).toHaveBeenCalled();
expect(projectReceipt).toHaveBeenCalled();
expect(result.outcome).toBe(MyahInboxReplySendOutcome.SENT);
```

For `classifyMessageOutboundError(error).kind === 'rejected'`, assert `FAILED`, body preserved, revision advanced once, and no automatic second provider call. For ambiguous provider error assert `UNKNOWN`, no revision advance, and draft lock remains. If recording provider acceptance fails after `sendMessage` returns, assert `UNKNOWN` and no second send. If only projection fails after `PROVIDER_ACCEPTED`, assert accepted-pending status, no failure classification, no revision advance, and provider-free reconciliation ownership. For `reserveExecution.created === false`, assert no provider call and return the existing safe receipt state.

- [ ] **Step 5: Run the send-service test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL because the service is absent.

- [ ] **Step 6: Implement direct send orchestration**

The service must follow this exact shape:

```ts
async send(input: MyahInboxReplySendRequest): Promise<MyahInboxReplySendResult> {
  const authority = await this.actionDefinition.buildAuthority({
    workspaceId: input.workspace.id,
    initiatorUserWorkspaceId: input.userWorkspaceId,
    messageThreadId: input.threadId,
    expectedDraftRevision: input.expectedDraftRevision,
  });

  const binding =
    await this.actionApprovalService.createApprovedInboxReplyBinding(
      authority.expectedActionBinding,
    );

  let rebuilt: MyahInboxReplyActionAuthority;
  try {
    rebuilt = await this.actionDefinition.rebuildExecutionAuthority({
      workspaceId: input.workspace.id,
      binding: authority.expectedActionBinding,
    });
  } catch {
    await this.actionApprovalService.invalidateApprovedInboxReplyBinding({
      workspaceId: input.workspace.id,
      approvalBindingId: binding.id,
      initiatorUserWorkspaceId: input.userWorkspaceId,
      draftId: input.threadId,
    });
    return this.toStaleOutcome(input);
  }

  const reservation = await this.actionApprovalService.reserveExecution(
    rebuilt.expectedActionBinding,
  );

  if (!reservation.created) {
    return this.toExistingOutcome(input, reservation.receipt);
  }

  const graph = rebuilt.canonicalGraph;
  let sent: SendMessageResult;
  try {
    sent = await this.messageOutboundService.sendMessage(
      {
        to: [graph.recipientEmail],
        subject: graph.subject,
        body: graph.draftBody.markdown,
        html: escapeHtml(graph.draftBody.markdown),
        attachments: [],
        inReplyTo: graph.inReplyTo,
        threadExternalId: graph.providerThreadExternalId ?? undefined,
      },
      graph.connectedAccount,
    );
  } catch (error) {
    return this.recordProviderFailure(
      input,
      rebuilt,
      reservation.receipt.id,
      error,
    );
  }

  try {
    await this.actionApprovalService.recordProviderAccepted(
      reservation.receipt.id,
      {
        code: 'accepted',
        acceptedAt: new Date(),
        providerMessageId: sent.headerMessageId,
        providerExternalMessageId: sent.messageExternalId,
        providerThreadExternalId: sent.threadExternalId,
      },
    );
  } catch {
    return this.toUnknownOutcome(input, reservation.receipt.id);
  }

  try {
    await this.projector.projectReceipt(reservation.receipt.id);
  } catch {
    // Provider-free reconciliation retries projection; never classify this as
    // a provider rejection or issue another send.
  }

  return this.readStatus(input, reservation.receipt.id);
}
```

Map authority errors to safe readiness/outcome enums. Never return raw errors. `readStatus` validates workspace, initiating member, MessageThread evidence, and receipt before returning it.

For a definitive provider rejection, update MessageThread with a CAS on the failed revision: keep the same body and increment revision once. For an ambiguous provider error or failure to persist the accepted result, call `recordProviderTerminalState({ receiptId, state: ActionExecutionReceiptState.UNKNOWN, code: 'unknown' })` when the receipt store is available, return `UNKNOWN` regardless, and never mutate the draft or issue another provider call.

- [ ] **Step 7: Add draft-lock enforcement to autosave**

Before the CAS update in `saveMyahInboxDraft`, call:

```ts
if (
  await this.actionApprovalService.isDraftExecutionLocked({
    workspaceId: input.workspace.id,
    actionName: 'send_inbox_reply',
    draftId: input.threadId,
  })
) {
  throw new ConflictException(
    'Inbox reply draft is locked while delivery is being confirmed',
  );
}
```

Add mutation-service tests for approved-without-receipt, processing, provider-accepted, unknown, failed, sent, foreign thread, and ordinary autosave.

- [ ] **Step 8: Implement and register the resolver/module**

Create a separate `MyahInboxReplySendResolver` so the existing resolver does not gain send permission at class scope. Import `ActionApprovalModule` and `MessagingSendManagerModule` in `MyahInboxModule`; register the new service/resolver. Decorate the send resolver with all four guards, inject both `@AuthUserWorkspaceId()` and `@AuthWorkspaceMemberId()`, and reject any mismatch with the stored user auth context.

- [ ] **Step 9: Run Task 3 server tests**

Run:

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: all suites pass; tests prove the resolver never accepts sender/recipient/body/provider input.

- [ ] **Step 10: Commit Task 3**

```bash
git add packages/twenty-server/src/engine/core-modules/myah-inbox
git commit -m "feat(myah): add direct Inbox reply send API"
```

---

### Task 4: Project One Native Sent Message and Clear the Approved Draft

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/types/action-approval.type.ts:78-92`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-projector.service.ts:26-65`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service.ts:44-555`
- Modify: `packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 authority reconstruction and Task 3 provider receipt.
- Produces: idempotent `send_inbox_reply` receipt projection.
- Extends `ActionReceiptProjectionWriter.project` input with `actionVersion`, `threadId`, and `initiatorUserWorkspaceId` so reconciliation can rebuild Inbox authority.

- [ ] **Step 1: Write failing projector forwarding test**

Extend the receipt fixture to `send_inbox_reply` and assert:

```ts
expect(writer.project).toHaveBeenCalledWith(
  expect.objectContaining({
    actionName: 'send_inbox_reply',
    actionVersion: 1,
    draftId: messageThreadId,
    threadId: messageThreadId,
    initiatorUserWorkspaceId,
    providerMessageId: '<sent@example.com>',
  }),
);
```

- [ ] **Step 2: Run projector test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL because the action cast/input lacks Inbox and the extra binding fields.

- [ ] **Step 3: Extend projection input without changing existing writers**

Add these required fields:

```ts
actionVersion: 1;
threadId: string;
initiatorUserWorkspaceId: string;
```

Forward them from `receipt.actionApprovalBinding`, and cast `actionName` to `ExpectedActionBinding['actionName']` rather than a handwritten two-action union.

- [ ] **Step 4: Write failing Inbox projection tests**

Cover:

```ts
await writer.project(inboxProjectionInput);

expect(persistSentMessage).toHaveBeenCalledTimes(1);
expect(persistSentMessage).toHaveBeenCalledWith(
  expect.objectContaining({
    subject: 'Re: Partnership',
    body: 'Thanks for the update',
    recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
    messageChannelId,
    inReplyTo: '<incoming@example.com>',
    parentThreadExternalId: 'provider-thread-id',
    workspaceId,
  }),
);
expect(messageThreadUpdate).toHaveBeenCalledWith(
  { id: messageThreadId, myahReplyDraftRevision: 4 },
  {
    myahReplyDraftBody: null,
    myahReplyDraftRevision: expect.any(Function),
  },
  expect.anything(),
);
```

Also prove:

- existing provider-imported Message is reused;
- duplicate projection performs zero new persistence and zero second revision increment;
- wrong content/sender/recipient/context/evidence fails;
- changed revision never clears a newer draft;
- projection requires one matching native Message in the same thread/channel;
- Instagram and outreach projection tests remain unchanged.

- [ ] **Step 5: Run projection-writer tests and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: FAIL with unsupported action receipt projection.

- [ ] **Step 6: Implement `projectInboxReply`**

Dispatch before the unsupported error:

```ts
if (input.actionName === 'send_inbox_reply') {
  await this.projectInboxReply(input, schemaName);
  return;
}
```

The method must:

1. take `pg_advisory_xact_lock(hashtext(CONCAT('myah-inbox-reply-projection:', workspaceId, ':', draftId)))`;
2. search by receipt provider header/external identity across the workspace and require at most one candidate Message associated with the approved native MessageThread;
3. if that exact Message already exists and the approved draft revision is already cleared/incremented, validate its subject/body/participants/channel against the binding fingerprints and return success without rebuilding from an absent draft;
4. otherwise rebuild the still-present immutable draft graph through `MyahInboxReplyActionDefinition.rebuildProjectionAuthority` without re-running mutable pre-send eligibility;
5. verify the receipt provider header ID is non-empty;
6. reuse the already-imported exact Message or call `SentMessagePersistenceService.persistSentMessage` once;
7. require the persisted/found MessageThread ID equals the approved native thread;
8. CAS-clear only `{ id, myahReplyDraftRevision: approvedRevision }` and increment once;
9. throw on a newer/different non-null draft rather than deleting it.

- [ ] **Step 7: Run all projection tests**

Run the commands from Steps 2 and 5 plus:

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: all pass; one provider-accepted receipt reaches `SENT` only after native Message/draft projection.

- [ ] **Step 8: Re-run the direct send service test with the real projector contract**

Run Task 3 Step 9.

Expected: all pass.

- [ ] **Step 9: Commit Task 4**

```bash
git add packages/twenty-server/src/engine/core-modules/action-approval
git commit -m "feat(myah): project sent Inbox replies"
```

---

### Task 5: Add Frontend Send Operations, Autosave Handoff, and Accessible Editor Label

**Files:**
- Modify: `packages/twenty-front/src/modules/myah/inbox/graphql/operations.ts:82-106`
- Create: `packages/twenty-front/src/modules/myah/inbox/hooks/useMyahInboxReplySend.ts`
- Create: `packages/twenty-front/src/modules/myah/inbox/hooks/__tests__/useMyahInboxReplySend.test.tsx`
- Modify: `packages/twenty-front/src/modules/myah/inbox/hooks/useMyahInboxDraftAutosaveController.tsx:44-52,223-455`
- Modify: `packages/twenty-front/src/modules/myah/inbox/hooks/__tests__/useMyahInboxDraftAutosaveController.test.tsx`
- Modify: `packages/twenty-front/src/modules/advanced-text-editor/hooks/useAdvancedTextEditor.ts:28-53,112-132`
- Modify: `packages/twenty-front/src/modules/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput.tsx:71-105,115-149`
- Modify: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxDraftEditor.tsx:44-116`
- Modify: `packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxDraftEditor.test.tsx`
- Generated: `packages/twenty-front/src/generated/graphql.ts`

**Interfaces:**
- Consumes: Task 3 GraphQL interface.
- Produces: `useMyahInboxReplySend` with readiness, send, and bounded status refresh.
- Changes autosave `flush(key)` to return the final `MyahInboxDraftAutosaveEntry`, giving Send the confirmed revision.
- Adds optional `ariaLabel` through the existing rich-text editor stack.

- [ ] **Step 1: Write failing autosave flush-result test**

Add:

```ts
const flushed = await result.current.flush(key);

expect(flushed).toMatchObject({
  confirmedRevision: 3,
  dirty: false,
  status: 'saved',
});
```

Prove error/conflict returns the final error/conflict entry rather than a stale pre-flush snapshot.

- [ ] **Step 2: Run autosave test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-front/src/modules/myah/inbox/hooks/__tests__/useMyahInboxDraftAutosaveController.test.tsx --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: FAIL because `flush` resolves `void`.

- [ ] **Step 3: Return the final entry from `flush`**

Change the controller interface to:

```ts
flush: (
  key: MyahInboxDraftAutosaveKey,
) => Promise<MyahInboxDraftAutosaveEntry>;
```

After the existing save/no-op path, return `store.get(atom)` and throw only if the atom is unexpectedly absent. Do not change CAS, retry, debounce, proposal-application, or workspace flush behavior.

- [ ] **Step 4: Write failing accessible-name test**

In `MyahInboxDraftEditor.test.tsx`, assert:

```ts
expect(screen.queryByText('Shared reply draft')).not.toBeInTheDocument();
expect(
  screen.getByRole('textbox', { name: 'Shared reply draft' }),
).toBeInTheDocument();
```

- [ ] **Step 5: Run DraftEditor test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxDraftEditor.test.tsx --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: FAIL because the visible label still renders and the contenteditable lacks that accessible name.

- [ ] **Step 6: Add `ariaLabel` without a second editor abstraction**

Add `ariaLabel?: string` to `UseAdvancedTextEditorProps` and set:

```ts
editorProps: {
  attributes: ariaLabel ? { 'aria-label': ariaLabel } : {},
  scrollThreshold: 60,
  scrollMargin: 60,
},
```

Pass `ariaLabel` through `FormAdvancedTextFieldInput`. In `MyahInboxDraftEditor`, remove `label="Shared reply draft"` and add `ariaLabel="Shared reply draft"`. Keep the section heading and helper untouched.

- [ ] **Step 7: Add GraphQL operations and generate types**

Append exact documents:

```graphql
query MyahInboxReplySendReadiness($threadId: UUID!) {
  myahInboxReplySendReadiness(threadId: $threadId) {
    status
    reason
  }
}

mutation SendMyahInboxReply($input: SendMyahInboxReplyInput!) {
  sendMyahInboxReply(input: $input) {
    outcome
    receiptId
    revision
    body { markdown blocknote }
  }
}

query MyahInboxReplySendStatus($input: MyahInboxReplySendStatusInput!) {
  myahInboxReplySendStatus(input: $input) {
    outcome
    receiptId
    revision
    body { markdown blocknote }
  }
}
```

Run:

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx run twenty-front:graphql:generate --skip-nx-cache
```

Expected: generated core GraphQL types include all three operations and enums.

- [ ] **Step 8: Write failing send-hook tests**

Mock Apollo and timers. Prove:

```ts
const result = await hook.current.send({
  threadId,
  expectedDraftRevision: 4,
});

expect(sendMutation).toHaveBeenCalledWith({
  variables: { input: { threadId, expectedDraftRevision: 4 } },
});
expect(result.outcome).toBe('SENT');
```

Also prove readiness mapping, `PROCESSING`/accepted-pending bounded status polling by returned `receiptId`, immediate stop on `SENT`/`FAILED`/`UNKNOWN`/`STALE`, no idle polling, and safe GraphQL failure copy.

- [ ] **Step 9: Run hook test and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-front/src/modules/myah/inbox/hooks/__tests__/useMyahInboxReplySend.test.tsx --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: FAIL because the hook is absent.

- [ ] **Step 10: Implement the hook**

Use the core Apollo client. Export:

```ts
export const useMyahInboxReplySend = (threadId: string) => ({
  readiness,
  readinessLoading,
  send,
  sending,
});
```

`send` calls only the direct mutation. If the result is still pending, poll `myahInboxReplySendStatus({ threadId, receiptId })` at one-second intervals for at most 15 attempts. Stop timers on unmount and on every terminal outcome. Return the last safe outcome; do not call the provider or generic `sendEmail` mutation.

- [ ] **Step 11: Run Task 5 frontend tests**

Run the commands from Steps 2, 5, and 9.

Expected: all pass.

- [ ] **Step 12: Commit Task 5**

```bash
git add packages/twenty-front/src/modules/advanced-text-editor packages/twenty-front/src/modules/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput.tsx packages/twenty-front/src/modules/myah/inbox packages/twenty-front/src/generated/graphql.ts
git commit -m "feat(myah): add Inbox send client contract"
```

---

### Task 6: Render Direct Rightmost Send and Reconcile Outcomes

**Files:**
- Create: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxReplySendAction.tsx`
- Create: `packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplySendAction.test.tsx`
- Modify: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxDraftEditor.tsx:18-24,44-116`
- Modify: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxReplyWorkspace.tsx:63-139`
- Modify: `packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplyWorkspace.test.tsx`
- Modify: `packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxDraftEditor.test.tsx`
- Generated: `packages/twenty-front/src/locales/*.po`
- Generated: `packages/twenty-front/src/locales/generated/*.ts`

**Interfaces:**
- Consumes: Task 5 hook and autosave flush result.
- Produces: one small primary **Send** button rendered after **Generate Reply**.
- Produces: safe inline/ snack-bar outcomes and server revision reconciliation.

- [ ] **Step 1: Write failing button/order tests**

In `MyahInboxReplyWorkspace.test.tsx` assert:

```ts
const buttons = screen.getAllByRole('button');
expect(buttons.map((button) => button.textContent)).toEqual([
  'Generate Reply',
  'Send',
]);
expect(buttons[0]).toHaveAttribute('data-variant', 'secondary');
expect(buttons[1]).toHaveAttribute('data-variant', 'primary');
expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
expect(screen.queryByText('Approve & send')).not.toBeInTheDocument();
```

Use the real action container or a test double that preserves variant props; do not test Linaria source text.

- [ ] **Step 2: Write failing Send-state tests**

In the new component test, cover:

```ts
it.each([
  ['empty', emptyEntry],
  ['dirty', dirtyEntry],
  ['saving', savingEntry],
  ['error', errorEntry],
  ['conflict', conflictEntry],
])('disables Send for %s draft state', (_name, entry) => {
  renderAction({ entry, readiness: 'READY' });
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});
```

Also prove reconnect/ineligible/pending/unknown readiness disables, exactly one click flushes then sends with the returned confirmed revision, double click while sending calls once, and no modal/second action appears.

- [ ] **Step 3: Run component tests and confirm red**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplySendAction.test.tsx packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplyWorkspace.test.tsx --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: FAIL because **Send** is absent.

- [ ] **Step 4: Replace the pass-through `proposalAction` prop with one action region**

Change `MyahInboxDraftEditorProps`:

```ts
type MyahInboxDraftEditorProps = {
  entry: MyahInboxDraftAutosaveEntry;
  onDraftChange: (body: MyahInboxRichText) => void;
  onRetry: () => void;
  onReloadConflict: () => void;
  actions: ReactNode;
};
```

Render `{actions}` once inside the existing right-aligned `StyledActions`. Do not create another toolbar or nested action row.

- [ ] **Step 5: Implement `MyahInboxReplySendAction`**

Use this prop interface:

```ts
export type MyahInboxReplySendActionProps = {
  draftKey: MyahInboxDraftAutosaveKey;
  entry: MyahInboxDraftAutosaveEntry;
  onDraftReconciled: (thread: MyahInboxDraftAutosaveThread) => void;
  onSendingChange: (sending: boolean) => void;
};
```

The click handler must be:

```ts
const handleSend = async () => {
  setIsSending(true);
  onSendingChange(true);
  try {
    const flushed = await autosaveController.flush(draftKey);
    if (
      flushed.dirty ||
      flushed.status === 'error' ||
      flushed.status === 'conflict' ||
      !flushed.confirmedBody?.markdown.trim()
    ) {
      return;
    }

    const result = await replySend.send({
      threadId: draftKey.threadId,
      expectedDraftRevision: flushed.confirmedRevision,
    });
    onDraftReconciled({
      key: draftKey,
      revision: result.revision,
      body: result.body ?? null,
    });
    handleOutcome(result.outcome);
  } finally {
    setIsSending(false);
    onSendingChange(false);
  }
};
```

Render:

```tsx
<Button
  title="Send"
  variant="primary"
  size="small"
  disabled={!canSend}
  onClick={handleSend}
/>
```

Use `useSnackBar` with Lingui messages:

- `SENT`: `Email sent`
- `STALE`: `Draft changed. Review and send again.`
- `FAILED`: `Email was not sent. Your draft is still available.`
- pending timeout: `Email accepted. Confirming delivery record…`
- `UNKNOWN`: `Delivery outcome is unknown. This draft is locked to prevent a duplicate send.`

Unknown must remain visible as an inline `role="alert"` state after the snack bar disappears.

- [ ] **Step 6: Compose the exact action order in `MyahInboxReplyWorkspace`**

Track only shared execution disable state in the parent. Pass this fragment as `actions`:

```tsx
<>
  {generateAction}
  <MyahInboxReplySendAction
    draftKey={draftKey}
    entry={draftEntry}
    onDraftReconciled={draftAutosaveController.reconcile}
    onSendingChange={setIsSending}
  />
</>
```

Include `isSending` in the existing Generate Reply disabled expression. The **Send** component comes after `generateAction`, making it rightmost without CSS order overrides.

After `SENT`, refetch `MyahInboxThreads`, `FindManyMessages`, `FindManyMessageParticipants`, and `FindManyMessageChannelMessageAssociations` through the core Apollo client, following `useSendEmail`'s native refresh pattern.

- [ ] **Step 7: Run focused Inbox component tests**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplySendAction.test.tsx packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplyWorkspace.test.tsx packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxDraftEditor.test.tsx packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxProposalPreview.test.tsx --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: all pass; exact button order and no modal are observable assertions.

- [ ] **Step 8: Regenerate Lingui catalogs**

Run:

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx run twenty-front:lingui:extract --skip-nx-cache
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx run twenty-front:lingui:compile --skip-nx-cache
```

Expected: source and generated catalogs contain the new Send outcome strings; no raw Lingui IDs render in tests.

- [ ] **Step 9: Commit Task 6**

```bash
git add packages/twenty-front/src/modules/myah/inbox packages/twenty-front/src/locales
git commit -m "feat(myah): render direct Inbox Send action"
```

---

### Task 7: Full Contract Verification and Controlled UAT

**Files:**
- Modify only if a check exposes a real defect: files already owned by Tasks 1-6
- Update after verification: `docs/specs/MYAH-169-inbox-manual-reply-send.md` only when observed behavior requires a spec correction
- Durable handoff: `/home/zachary/obsidian/hermesWiki/myah-v4-myah-169-inbox-manual-reply-send-2026-08-31.md`

**Interfaces:**
- Consumes: complete server and frontend feature.
- Produces: repository proof, authenticated browser proof, one separately authorized external test send, and Linear/wiki evidence.

- [ ] **Step 1: Run the complete focused server regression set**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest \
  packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-binding-digest.spec.ts \
  packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts \
  packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts \
  packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts \
  packages/twenty-server/src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service.spec.ts \
  packages/twenty-server/src/engine/core-modules/managed-email/services/__tests__/managed-email-campaign-eligibility.service.spec.ts \
  packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts \
  packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts \
  packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts \
  packages/twenty-server/src/engine/core-modules/tool/tools/outreach-email-tool/__tests__/send-outreach-email-tool.spec.ts \
  --config=packages/twenty-server/jest.config.mjs --runInBand
```

Expected: all suites pass; no existing outreach or Instagram regression.

- [ ] **Step 2: Run the complete focused frontend regression set**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest \
  packages/twenty-front/src/modules/myah/inbox/hooks/__tests__/useMyahInboxDraftAutosaveController.test.tsx \
  packages/twenty-front/src/modules/myah/inbox/hooks/__tests__/useMyahInboxReplySend.test.tsx \
  packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplySendAction.test.tsx \
  packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxReplyWorkspace.test.tsx \
  packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxDraftEditor.test.tsx \
  packages/twenty-front/src/modules/myah/inbox/components/__tests__/MyahInboxProposalPreview.test.tsx \
  --config=packages/twenty-front/jest.config.mjs --runInBand
```

Expected: all suites pass with exact **Generate Reply**, **Send** order and zero modal assertions.

- [ ] **Step 3: Run generated-code, type, lint, format, and build checks**

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx run twenty-front:graphql:generate --skip-nx-cache
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx typecheck twenty-server --skip-nx-cache
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx typecheck twenty-front --skip-nx-cache
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx lint:diff-with-main twenty-server --skip-nx-cache
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx lint:diff-with-main twenty-front --skip-nx-cache
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec nx build twenty-front --skip-nx-cache
```

Expected: every command exits 0. If `generateBarrels.ts` repeats the known fresh-worktree stall, stop only that process, reuse ignored `twenty-shared/dist`/`twenty-ui/dist` from the same current `origin/main` commit, rerun the affected command, and record that qualification rather than claiming a clean dependency build.

- [ ] **Step 4: Review the final diff against the spec**

Confirm all of these by file/diff inspection:

```text
[ ] Generate Reply precedes Send
[ ] Send is primary and rightmost
[ ] no modal / Approve & send / second click
[ ] no visible Shared reply draft label; textbox remains accessibly named
[ ] browser sends only threadId + expectedDraftRevision
[ ] provider-neutral authority; no Icemail branch
[ ] one receipt and one provider call per logical revision
[ ] SENT clears only the approved revision
[ ] FAILED preserves body and advances revision once
[ ] UNKNOWN retains/locks draft and never resends
[ ] no agent tool, sender picker, migration, new dependency, triage/Task/Campaign write
```

Expected: every box is satisfied; otherwise fix the source and rerun the smallest affected checks before continuing.

- [ ] **Step 5: Start one isolated runtime and browser session**

Use unique MYAH-169 container names, volumes, ports, and one named browser session. Start frontend, API, worker, PostgreSQL, and Redis against the same isolated environment. Verify API `/healthz`, GraphQL, worker queue connectivity, and authenticated Inbox before opening Chromium.

Expected: the selected test thread renders with a saved reply editor and healthy mailbox; no production/customer data is used.

- [ ] **Step 6: Browser-verify non-external behavior first**

With the one named browser session:

1. open `/myah/inbox`;
2. select the controlled thread;
3. confirm visible buttons are **Generate Reply**, then rightmost **Send**;
4. confirm no visible **Shared reply draft** field label;
5. inspect accessibility and confirm the editor name is **Shared reply draft**;
6. type a draft and observe saved state;
7. exercise an intentionally stale revision or disconnected test mailbox and confirm no provider call, no modal, and retained draft;
8. inspect browser console and server logs for errors.

Expected: all UI contracts pass before any real external action.

- [ ] **Step 7: Obtain explicit maintainer approval for one controlled external send**

Present the exact test mailbox, dedicated recipient, subject, body, and expected one-send boundary. Do not continue without approval in the active conversation.

Expected: explicit approval names the controlled send.

- [ ] **Step 8: Execute and verify one real send**

After approval:

1. click **Send** once;
2. confirm no modal or second action appears;
3. verify the recipient receives the email with correct From, To, Subject, `Message-ID`, `In-Reply-To`, and provider thread;
4. verify one `actionApprovalBinding`, one `actionExecutionReceipt` ending `SENT`, one native outbound Message/association in the original MessageThread, and cleared/incremented draft revision;
5. verify no second provider message exists;
6. reload Inbox and confirm the sent Message persists and the composer stays empty.

Expected: one click, one external message, one receipt, one native Message, correct thread, no duplicate.

- [ ] **Step 9: Close and clean the isolated runtime**

Close the exact named browser session even if UAT fails. Stop only MYAH-169 services and remove only its disposable containers, network, volumes, ports, and local storage. Preserve the worktree.

Expected: no MYAH-169 browser/process/container/port remains; unrelated sessions and services remain untouched.

- [ ] **Step 10: Record evidence and commit any final source-only corrections**

If verification required source corrections, commit them:

```bash
git add packages/twenty-server/src packages/twenty-front/src
git commit -m "fix(myah): harden Inbox reply sending"
```

Update the existing hermesWiki MYAH-169 page with commits, commands, outcomes, UAT mailbox/recipient classification without secrets, production-safety status, and remaining risks. Add one Linear comment with the same concise evidence. Verify Obsidian sync health before claiming remote visibility.

- [ ] **Step 11: Final clean-state check**

```bash
git status --short --branch
```

Expected: clean feature worktree; branch contains the spec, plan, implementation commits, tests, and generated outputs only.

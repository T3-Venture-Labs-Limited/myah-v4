# Inbox Manual Reply Send Design

**Linear:** [MYAH-169](https://linear.app/t3labs/issue/MYAH-169/implement-inbound-communication-handling-reply-drafting-and-scheduled)

## Goal

Let an authorized operator send the current saved Myah Inbox reply through the email account that owns the native thread. The composer keeps its existing **Generate Reply** action and adds **Send** immediately to its right. The editable composer is the review surface, and the user's explicit **Send** click is the human approval. One server mutation then executes through Twenty's provider-neutral outbound messaging seam, persists one native outbound Message and one durable receipt, and clears only the sent draft.

Icemail is one way to provision a native `ConnectedAccount` and `MessageChannel`; it is not a separate Inbox transport. User-connected and Icemail-provisioned accounts follow the same Inbox interface, authority proof, approval, provider execution, receipt, and Message projection.

This design covers the manual Inbox reply-send slice of MYAH-169. Scheduled follow-up Tasks remain a later MYAH-169 slice and do not send automatically.

## Confirmed current behavior

### Inbox composer

`MyahInboxReplyWorkspace` loads `MessageThread.myahReplyDraftBody` and `myahReplyDraftRevision`, then reconciles them into the existing revision-CAS autosave controller. `MyahInboxDraftEditor` renders the rich-text editor and one action row. `MyahInboxProposalPreview` currently supplies the sole **Generate Reply** button; a successful generation immediately enters the same autosave path as a typed edit.

The composer currently renders:

- section heading **Reply draft**;
- helper text **Shared workspace draft · revision protected**;
- redundant visible field label **Shared reply draft**;
- one bottom-right **Generate Reply** action.

There is no Inbox send mutation, receipt state, or send button.

### Native email and provider transport

Twenty already represents configured email identities as core `ConnectedAccount` and `MessageChannel` records. `MessagingMessageOutboundService.sendMessage` dispatches through the existing Google, Microsoft, IMAP/SMTP, or Email Group driver according to `ConnectedAccount.provider`. Icemail activation feeds this native account/channel model; an Inbox caller must not know whether Icemail or the user supplied the account.

`SentMessagePersistenceService` already projects accepted provider output into native Message, MessageParticipant, MessageThread, and MessageChannelMessageAssociation records.

### Existing approval and receipt primitives

The core action-approval module already provides:

- immutable bindings with content, recipient, sender, and action-context fingerprints;
- one-use approval states and expiry;
- execution reservation and a workspace/logical-action idempotency key;
- `PROCESSING`, `PROVIDER_ACCEPTED`, `SENT`, `FAILED`, and `UNKNOWN` receipt states;
- provider-free receipt projection and reconciliation;
- safe redaction of external execution outcomes.

`send_outreach_email` uses these primitives, but its action definition is not the Inbox source model. It requires a CampaignCreator, Campaign, managed-mailbox assignment, `OutreachAction`, provider draft, and agent-chat thread. An Inbox thread may be unmatched or have no Campaign. MYAH-169 therefore reuses the approval, receipt, outbound, error-classification, persistence, and reconciliation modules without fabricating campaign outreach records or a chat thread.

### Inbox policy and drafts

The Inbox query/mutation path already enforces authenticated workspace context, policy-visible native MessageThread access, readable Message presence, and CAS writes. Draft content remains on MessageThread; no second editable draft store is needed.

## Approved product contract

### Composer layout

The bottom action row contains exactly these actions in DOM and visual order:

1. **Generate Reply**
2. **Send**

Both remain right-aligned. **Send** is always the rightmost action on desktop and responsive layouts. DOM order also gives keyboard users **Generate Reply** before **Send**.

**Generate Reply** remains the existing secondary action. **Send** is the primary action. Neither action moves to the composer header, message header, context drawer, command menu, or agent chat.

Remove only the visible **Shared reply draft** field label. Keep **Reply draft** as the section heading and keep the existing revision-protection helper. The contenteditable editor retains an accessible name, **Shared reply draft**, through an ARIA attribute rather than visible duplicate text.

### Send availability

The frontend enables **Send** only when all client and server conditions are true.

Client conditions:

- the local body is non-empty after trimming for the eligibility check;
- the autosave entry is not dirty;
- no debounce or save is pending;
- draft state is neither `error` nor `conflict`;
- no generate, send, or terminal-unknown operation is active.

Server readiness conditions:

- the authenticated member has `SEND_EMAIL_TOOL` permission;
- the MessageThread is policy-visible and reply-eligible;
- the current saved draft and revision exist;
- the canonical parent message, recipient, account, and channel resolve unambiguously;
- the account is not archived;
- the channel is enabled, fully visible to the actor, and in an active send-capable state;
- the provider is supported by `MessagingMessageOutboundService.sendMessage`;
- when the account/channel belongs to a managed mailbox, that exact managed identity passes the existing follow-up eligibility policy;
- no `PROCESSING`, `PROVIDER_ACCEPTED`, or `UNKNOWN` receipt locks this exact draft revision.

A server-owned selected-thread readiness query supplies the safe enabled state and reason. Do not derive sender eligibility solely from browser records.

### Direct Send interaction

The editable composer is the complete review surface. Existing thread and message headers already show the reply context, so Myah does not duplicate From, To, subject, or body in a confirmation step.

Selecting **Send** first flushes the existing autosave controller. The client then submits only the confirmed thread ID and saved draft revision. The server reloads every authoritative source value; the browser does not submit sender, recipient, subject, body, provider, or thread headers.

The explicit **Send** click is the human approval for that exact saved revision. There is no review modal, **Approve & send** action, pending-review state, sender picker, or second click.

Standard HTML/plain-text MIME representation may be derived through the existing email composer, but no signature, valediction, tracking content, template, recipient, subject, or other business content is appended or rewritten at send time. Generated drafts already containing a Campaign signature remain unchanged; manually authored drafts are sent as authored.

If the confirmed revision is stale by the time the server establishes authority, return **Draft changed. Review and send again.** and perform no provider operation.

## Server design

### Inbox reply action

Add action name `send_inbox_reply`, version `1`, to the existing action-binding types, logical-key digest, approved-binding reconstruction, receipt projection union, and reconciliation dispatcher.

For this action only:

- `draftId` is the native MessageThread ID that owns the saved draft;
- `threadId` is also that native MessageThread ID, not an AgentChatThread ID;
- the Myah Inbox resolver owns viewer authorization and must not call the agent-chat-specific `getBindingForViewer` path;
- evidence links identify the MessageThread as `draft` and the canonical parent Message as `thread_parent`.

Do not create a fake AgentChatThread, CampaignCreator, Campaign, OutreachAction, provider draft, or Icemail action record.

### Provider-neutral canonical graph

One `MyahInboxReplySendService` owns readiness, direct-send authority, execution, and status read-back behind the Myah Inbox GraphQL interface. It resolves a canonical graph from authenticated server data:

- workspace ID and initiating workspace-member identity;
- MessageThread ID;
- saved draft body and revision;
- latest non-draft Message ordered deterministically by `receivedAt`, then ID;
- that Message's exact channel association, direction, provider message identity, and provider thread identity;
- one authorized `MessageChannel` and its non-archived `ConnectedAccount`;
- sender handle and optional account display name;
- one external recipient;
- reply subject;
- RFC parent `headerMessageId` and native parent Message ID.

The channel candidate must be an email channel in the current workspace. It is authorized when either:

- its visibility is `SHARE_EVERYTHING`; or
- its ConnectedAccount belongs to the current `userWorkspaceId`.

Metadata-only or subject-only access to another member's account never grants send authority.

Resolve the external recipient from the canonical parent:

- for an incoming association, require one valid `FROM` handle that is not the connected account handle or alias;
- for an outgoing association, require one valid external `TO` handle after excluding the connected account handle and aliases.

Do not guess between multiple authorized channel associations or multiple external primary recipients. Return an ineligible state instead. Do not fall back to the first workspace account.

Build the reply subject from the canonical parent using the existing native reply rule: retain an existing `Re: ` prefix; otherwise prefix `Re: `. Preserve an empty parent subject as an empty reply subject. Require a non-empty parent header Message ID so the provider receives `inReplyTo`; retain the association's provider thread identity when available.

### Managed mailbox eligibility without Icemail coupling

During readiness and again inside the direct-send mutation immediately before execution, look for a managed-mailbox record associated with either the resolved ConnectedAccount or MessageChannel.

- No managed record: treat the identity as an ordinary configured account and continue.
- One exact account/channel match: apply the existing managed-mailbox eligibility check with `isFollowUp: true`.
- A partial, mismatched, duplicate, blocked, inactive, unpaid, or reconciliation-required managed identity: fail closed.

The Inbox API and UI expose only a safe unavailable/ineligible reason. They do not expose Icemail identifiers, credentials, billing details, raw health evidence, or provider payloads.

### Immutable Send binding

The explicit **Send** click creates one immutable core action binding and approves it server-side for the confirmed revision. The browser never creates, edits, or approves a binding separately. Its fingerprints cover:

- `contentDigest`: canonical subject plus the exact saved rich-text source and server-normalized send body;
- `recipientFingerprint`: normalized recipient email;
- `sendingAccountFingerprint`: connected-account ID, message-channel ID, sender handle, sender display name, and managed-mailbox ID when one exists;
- `actionContextFingerprint`: MessageThread ID, draft revision, parent Message ID, parent header Message ID, association direction, provider message identity, and provider thread identity.

The logical execution key includes action name/version, workspace, MessageThread/draft ID, and all four fingerprints. Concurrent or repeated **Send** clicks for the same immutable revision converge on one execution receipt.

The server proves the canonical graph, creates and approves the binding, activates the draft lock, rebuilds the graph, and reserves the receipt before provider I/O. If the second proof differs, invalidate the binding without a receipt, unlock the draft, and require the user to review the composer and click **Send** again.

### Draft lock

The MessageThread draft is the durable send snapshot. No new snapshot table is added.

`saveMyahInboxDraft` must reject writes while the current draft revision has:

- an approved or consumed `send_inbox_reply` binding created by **Send**; and
- a receipt that is absent after approval, `PROCESSING`, `PROVIDER_ACCEPTED`, or `UNKNOWN`.

The lock begins within the direct-send mutation before provider I/O. It prevents another tab or user from changing the only durable body while execution or reconciliation may still need it.

Unlock behavior:

- stale authority before receipt reservation: unlock without changing the draft;
- definitive provider failure: preserve the body, advance the draft revision once, and unlock so an identical retry receives a new logical action key;
- successful `SENT` projection: clear the body and advance the revision once;
- `UNKNOWN`: retain and lock the body until reconciliation or an explicit operator repair determines the outcome.

The frontend reconciles every returned body/revision into the existing autosave controller so queued local state cannot restore a sent body or overwrite the server revision.

### Direct approval and execution

`sendMyahInboxReply` is idempotent for the same workspace member, MessageThread, saved revision, and `send_inbox_reply` logical action. Stale, foreign, unavailable, or differently scoped inputs fail without provider I/O.

Execution order:

1. flush autosave in the browser and submit the confirmed thread ID and draft revision;
2. rebuild the canonical graph entirely from server data;
3. create the immutable binding and record the explicit **Send** click as approval;
4. activate the draft lock and rebuild authority;
5. reserve the existing action receipt before provider I/O;
6. call `MessagingMessageOutboundService.sendMessage` once with the approved recipient, subject, body, `inReplyTo`, and provider thread identity;
7. classify thrown outbound errors with the existing classifier;
8. record provider identifiers and `PROVIDER_ACCEPTED`, or a definitive `FAILED`/ambiguous `UNKNOWN` outcome;
9. run the existing receipt projector;
10. return a safe Inbox status.

Use `sendMessage`, not `createDraft`/`sendDraft`. The Myah MessageThread draft is already the canonical user-reviewed draft, Email Group supports direct sending but not provider drafts, and creating provider drafts before the Send click would add orphan-cleanup and divergence risks.

No path automatically retries provider I/O. Receipt replay may repeat only provider-free projection.

### Sent Message and draft projection

Extend the existing action receipt projection writer with a `send_inbox_reply` branch.

For `PROVIDER_ACCEPTED`:

1. take a workspace/draft advisory lock;
2. verify the MessageThread draft revision, binding fingerprints, sender/channel, parent Message evidence, and receipt identifiers;
3. find an already-imported native outbound Message by provider header/external identity and exact MessageChannel;
4. if absent, call `SentMessagePersistenceService` with the still-locked canonical draft and provider result;
5. require exactly one matching native outbound Message in the same MessageThread/channel;
6. clear `myahReplyDraftBody` and increment `myahReplyDraftRevision` with a CAS on the approved revision;
7. mark the receipt `SENT`.

Projection is idempotent. A repeated projector call finds the same Message and already-cleared approved revision and succeeds without another provider call, Message, or revision increment.

Do not change Inbox triage state automatically. Do not create Campaign, CampaignCreator, OutreachAction, timeline, Task, Note, or agent-chat records. The native outbound Message and durable action receipt are the canonical evidence for this slice.

## GraphQL interface

Add a narrow Inbox-owned interface:

- `myahInboxReplySendReadiness(threadId)` returns readiness and a safe reason without exposing provider authority;
- `sendMyahInboxReply(input: { threadId, expectedDraftRevision })` records the explicit click as approval, reserves and executes the action, and returns safe outcome, receipt ID, and current draft body/revision;
- `myahInboxReplySendStatus(input: { threadId, receiptId })` returns the safe receipt outcome and current draft body/revision without provider I/O.

Use GraphQL enums rather than free-form machine states. The public states are:

- readiness: `READY`, `THREAD_UNAVAILABLE`, `SENDER_UNAVAILABLE`, `RECIPIENT_UNAVAILABLE`, `RECONNECT_REQUIRED`, `MAILBOX_INELIGIBLE`, `OUTCOME_PENDING`, `OUTCOME_UNKNOWN`;
- outcome: `SENDING`, `SENT`, `FAILED`, `UNKNOWN`, `STALE`.

Foreign workspace/thread/receipt inputs return the same unavailable/forbidden surface and never reveal sender, recipient, mailbox, receipt, or record existence.

Protect the resolver with the existing workspace/user/custom permission guards plus `SettingsPermissionGuard(PermissionFlagType.SEND_EMAIL_TOOL)`. Keep these operations out of the agent tool provider. No `send_inbox_reply` agent tool is registered.

No database or workspace-metadata migration is required: core action names are stored as strings, the existing binding fingerprints/receipt fields are sufficient, and MessageThread already owns the draft body/revision. Generate frontend GraphQL types after adding the operations.

## Frontend design

Add a focused send sidecar under the existing Inbox reply workspace. It owns readiness loading, direct send, bounded status refresh, and outcome presentation. Keep autosave and generation in their current modules.

`MyahInboxDraftEditor` receives one action region rather than encoding send logic. The parent passes **Generate Reply** followed by the send sidecar, which makes the approved order explicit in one place.

The send sidecar:

- queries readiness when the selected thread or confirmed draft revision changes;
- disables **Send** while readiness or client draft state is unsafe;
- flushes autosave before sending;
- renders **Send** as a small primary button after the existing small secondary **Generate Reply** button;
- calls the direct-send mutation with only thread ID and confirmed draft revision;
- disables both composer actions during execution;
- polls only the returned binding after `PROCESSING` or `PROVIDER_ACCEPTED`, with a bounded timeout;
- performs no idle Inbox polling;
- reconciles returned draft body/revision into the autosave controller;
- refreshes the selected thread after `SENT` so the new native Message appears;
- keeps the draft visible after `FAILED`;
- keeps the draft locked and displays an actionable non-resend warning after `UNKNOWN`.

User-facing outcomes:

- stale revision: **Draft changed. Review and send again.**
- definitive failure: **Email was not sent. Your draft is still available.**
- accepted but projection pending: **Email accepted. Confirming delivery record…**
- unknown: **Delivery outcome is unknown. This draft is locked to prevent a duplicate send.**
- sent: clear the composer through server revision reconciliation, refresh the thread, and show the existing success snack-bar pattern.

Do not render a confirmation modal, duplicate From/To/subject preview, provider names, Icemail branding, raw exceptions, credentials, provider IDs, or a sender selector in the composer.

Regenerate and commit Lingui catalogs for every added or changed UI string.

## Alternatives rejected

### Call the existing `sendEmail` mutation directly

That mutation would make browser-supplied body/account values authoritative and bypass MYAH-169's immutable server binding and receipt reservation. The Inbox still needs its own direct-send mutation even though the user's single **Send** click is the approval. Rejected.

### Route Inbox through `send_outreach_email`

That definition requires CampaignCreator, Campaign, OutreachAction, managed-mailbox assignment, provider draft, and AgentChatThread. Unmatched or non-Campaign Inbox threads are valid. Fabricating those records would create false CRM provenance and an Icemail/managed-mailbox dependency. Rejected.

### Add an Icemail-specific send mutation

Icemail provisions a native account/channel. Provider-specific Inbox execution would duplicate transport and prevent ordinary Google, Microsoft, IMAP/SMTP, or Email Group configurations from using the feature. Rejected.

### Add a sender picker

The native thread already identifies the receiving/sending channel. Allowing arbitrary sender selection can break provider threading, cross private-account visibility, and invalidate the approved context. Ambiguous threads fail closed instead. Rejected.

### Create a provider draft before Send

The existing local MessageThread draft is already revision-protected. Provider drafts would exclude Email Group, add orphan cleanup, and create a second editable representation. Direct provider send occurs only after the user's **Send** click and receipt reservation. Rejected.

### Add an Inbox send-snapshot table

The locked MessageThread draft plus immutable binding already preserves the exact body through execution and reconciliation. A second table adds schema, retention, and consistency work without additional authority. Rejected.

### Clear the draft on provider acceptance

Provider acceptance can precede native Message projection. Clearing early risks losing the only durable body needed for recovery. Clear only after idempotent `SENT` projection. Rejected.

### Append signatures during send

MYAH-268 already snapshots generated signatures into the saved draft. Send-time append would surprise manual authors, duplicate signatures, and make the composer inaccurate as the review surface. Send the user-reviewed saved body. Rejected.

## Verification

### Focused server tests

Prove:

- ordinary user-connected and workspace-shared accounts resolve through the same canonical graph;
- managed identities use the exact managed account/channel and follow-up eligibility check, while ordinary identities do not require a managed record;
- Google, Microsoft, IMAP/SMTP, and Email Group dispatch through the existing `sendMessage` seam without provider-specific Inbox branches;
- archived, non-active, private-to-another-user, unsupported, ambiguous, reconnect-required, and managed-ineligible identities fail before binding or provider I/O;
- incoming and outgoing parent-message recipient resolution excludes the sender account and refuses ambiguity;
- subject, `inReplyTo`, native thread, and provider-thread context are server-derived;
- one **Send** mutation creates and approves a binding with the exact content, recipient, sender, context, revision, and evidence fingerprints;
- a stale submitted revision performs no provider I/O;
- approved/executing/accepted/unknown sends lock draft writes, while stale/failed sends do not;
- concurrent identical **Send** requests reserve one logical receipt and perform one provider call;
- definitive failure preserves the body, advances revision once, and permits a newly approved retry;
- unknown outcome preserves and locks the draft and never resends;
- provider acceptance plus projector retry produces exactly one native outbound Message, clears only the approved revision once, and ends `SENT`;
- an already-imported sent Message is reused rather than duplicated;
- foreign workspace/member/thread/binding access is indistinguishable and provider-free;
- no agent tool exposes `send_inbox_reply`.

Keep existing outreach and Instagram approval suites passing; their action names, chat-thread semantics, and projection behavior remain unchanged.

### Focused frontend tests

Prove observable behavior:

- the composer action buttons are exactly **Generate Reply**, then **Send**, with **Send** rightmost in DOM/visual order;
- **Send** is primary and **Generate Reply** remains secondary;
- the visible **Shared reply draft** label is absent while the editor has accessible name **Shared reply draft**;
- empty, dirty, saving, error, conflict, generating, executing, reconnect-required, ineligible, pending, and unknown states disable **Send** correctly;
- one **Send** click flushes autosave and calls the direct mutation with only thread ID and confirmed revision;
- no review modal, duplicate From/To/subject preview, **Approve & send**, or second confirmation action renders;
- stale, failed, accepted-pending, sent, and unknown outcomes render the approved behavior;
- sent reconciliation clears the editor and refreshes the selected native thread without restoring stale local content;
- responsive action order remains unchanged.

### Repository checks

Run the focused Inbox frontend suites; Myah Inbox send/action-approval/server suites; existing outreach send, receipt, projection, and managed-eligibility suites; `twenty-front` and `twenty-server` typechecks; affected lint/format checks; GraphQL generation; Lingui extraction/compilation; and a production frontend build.

### Authenticated isolated UAT

After automated checks pass:

1. connect or activate one healthy test mailbox through any supported native email configuration;
2. receive or seed one dedicated test thread and open it in Myah Inbox;
3. verify **Generate Reply** and rightmost **Send**, with no visible **Shared reply draft** field label;
4. type or generate a reply and wait for saved state;
5. review the recipient context and exact body in the existing thread/composer;
6. explicitly select **Send** once and verify no confirmation modal or second action appears;
7. verify the controlled recipient receives the message with correct threading headers;
8. verify one outbound native Message, one binding/receipt, cleared composer revision, and no second send;
9. exercise one safe pre-provider failure and confirm the draft remains available;
10. close the exact named browser session and stop the isolated runtime.

External sending requires separate maintainer approval immediately before the controlled UAT send. No production/customer mailbox or recipient is used without that approval.

## Non-goals

- Initial outreach or bulk Campaign sending.
- Autonomous approval, agent sending, automatic replies, or automatic follow-up sending.
- Scheduled follow-up Task implementation in this slice.
- Sender selection, mailbox switching, CC/BCC, attachments, subject editing, or recipient editing in Inbox.
- Mailbox purchase, provisioning, warmup, billing, reconnect UI, or managed-email lifecycle changes.
- Provider-specific Inbox UI or Icemail branding.
- New email drivers, queues, workflow frameworks, draft stores, send-snapshot tables, or metadata objects.
- Triage-state, Campaign, CampaignCreator, OutreachAction, Task, Note, or timeline mutation after send.
- Retrofitting already-sent historical drafts or receipts.
- Changes to agent proposal/draft authority.

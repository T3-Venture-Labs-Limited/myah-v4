# Outreach draft → approval → send → receipt workflow

## Problem

Creator Ops already has canonical `CampaignCreator` and `OutreachAction` records, Twenty already sends provider-native drafts through connected accounts, and the action-approval module already provides immutable approval bindings and idempotent execution receipts. These pieces are not yet composed into the one-creator outreach workflow required by MYAH-168.

Without one owning workflow, an outreach email could be sent with changed content or sender details after approval, retried after an uncertain provider response, associated with another workspace's mailbox, or sent through a different mailbox when continuing an existing thread.

## Decision

Use `OutreachAction` as the single Creator Ops lifecycle record and extend the existing action-approval binding with a `send_outreach_email` variant. Reserve execution through `ActionApprovalService`, send through Twenty's existing connected-account outbound messaging services, and project the durable result back to the Outreach Action and the related creator/deal timeline.

Do not create a second campaign executor, approval ledger, email provider abstraction, or receipt system.

## Lifecycle

One Outreach Action owns one email lifecycle:

1. `DRAFT`: the selected Campaign Creator, recipient, subject, body, mailbox selection, and optional existing-thread identity are complete.
2. `AWAITING_APPROVAL`: an immutable approval binding records the exact content, recipient, sender, thread, workspace member, and evidence links.
3. `APPROVED`: a human approved that exact binding. Any change to a bound fact requires a new binding and approval.
4. `SENDING`: `ActionApprovalService` reserved the workspace-scoped logical action key.
5. `SENT`: the provider accepted the message, the execution receipt is durable, and the linked timeline result is projected.
6. `BLOCKED`: a required precondition was absent before provider submission.
7. `FAILED`: the provider returned a known rejection.
8. `UNKNOWN`: provider acceptance cannot be established safely. Automatic retry is prohibited because it could send a duplicate.

A repeated execution request returns the existing receipt. It does not submit the message again.

## Immutable approval binding

Add a discriminated `send_outreach_email` variant to the existing action-approval contract. The binding includes:

- workspace ID;
- Outreach Action ID and immutable draft/version identity;
- Campaign Creator ID;
- digest of the approved subject and body;
- recipient fingerprint;
- selected connected-account/message-channel/sender fingerprint;
- existing-thread identity when the action continues a thread;
- initiating user-workspace ID; and
- evidence links for the Outreach Action, Campaign Creator, Creator, and Campaign.

The binding digest and logical action key must change when any approval-sensitive fact changes. The existing `send_instagram_reply` behavior remains unchanged.

## Outreach Action persistence

Extend the canonical typed Myah standard-application metadata for `OutreachAction` with only the facts needed to audit and recover this lifecycle:

- immutable draft subject and body snapshot;
- content digest;
- recipient address or safe recipient identity;
- selected connected-account ID, message-channel ID, sender address, and optional sender display name;
- approval binding ID;
- action execution receipt ID;
- provider draft/message/thread identifiers needed for recovery and thread continuity;
- completed timestamp and safe result/failure summary.

Update the canonical Myah object declarations, shared universal-identifier registry, typed standard metadata builders, and metadata tests through the repository's existing generation/composition path. Do not hand-edit generated artifacts or create a second metadata registry.

## Mailbox-selection and sender-identity consumer contract

MYAH-168 owns this narrow server-side contract for MYAH-237 Task 13:

```ts
type OutreachMailboxSelection = {
  workspaceId: string;
  outreachActionId: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
};
```

The contract guarantees:

- selection is resolved and validated inside the workspace-scoped service boundary;
- the connected account and message channel belong to the same workspace and support outbound email;
- credentials and provider configuration never enter this contract, GraphQL payloads, logs, jobs, or agent context;
- account, channel, and sender identity are snapshotted before approval;
- changing the mailbox or sender invalidates the current approval;
- an action continuing an existing thread must retain that thread's stored account, channel, and sender identity; and
- MYAH-237 may later supply an eligible managed mailbox selection, but it may not create drafts, approve, execute, retry, or record outreach sends.

The contract does not decide managed-mailbox eligibility. MYAH-237 owns that future eligibility rule and must call the MYAH-168 boundary with an already eligible selection.

## Workspace isolation

Every record read or write for the workflow uses the existing workspace repository/data-source boundary. Caller-provided IDs are never sufficient proof of ownership. Before approval or execution, the service verifies that the Outreach Action, Campaign Creator, Creator, Campaign, connected account, message channel, approval binding, and existing thread all belong to the same workspace.

No mailbox credential, provider token, SMTP password, or provider configuration is persisted on Outreach Action.

## Send and recovery flow

1. Load the Outreach Action and its related Campaign Creator inside the workspace boundary.
2. Resolve and validate the selected mailbox and sender identity.
3. Compute the exact approval binding from the persisted draft and sender facts.
4. Require an approved matching binding.
5. Reserve execution through `ActionApprovalService`.
6. If the reservation already exists, return its receipt without provider submission.
7. Send the provider-native draft through the existing outbound messaging service and selected connected account.
8. Record provider acceptance, a known terminal failure, or an unknown outcome on the durable execution receipt.
9. Project the safe receipt onto Outreach Action and a linked creator/deal timeline event.
10. Preserve the selected sender and provider thread identity for later actions in the same thread.

An exception before provider submission may remain retryable through the same reservation rules. An exception after submission that cannot prove rejection becomes `UNKNOWN` and requires reconciliation rather than automatic resend.

## Public surface

Expose only the narrow mutations/services needed to create/update a draft, request approval, and execute an approved Outreach Action through existing Twenty authorization patterns. No endpoint accepts credentials or a raw provider configuration. No endpoint accepts a caller-supplied approval result as proof; it resolves the durable approval binding server-side.

There is no automatic-send, bulk-send, social-outbound, approval-bypass, or agent-owned provisioning surface.

## Tests and verification

Implement test-first and observe each focused test fail for the missing behavior before adding production code. Cover these observable contracts:

- a draft cannot send without the exact approved binding;
- changing subject/body, recipient, selected sender, or existing-thread identity invalidates approval;
- a repeated execution request does not submit a second provider message;
- an uncertain provider result is persisted as `UNKNOWN` and is not automatically retried;
- cross-workspace action, creator, connected-account, message-channel, approval, and thread IDs are rejected;
- an existing thread retains its selected sender identity;
- provider acceptance records one receipt and one linked timeline event; and
- an eligible selection supplied through the MYAH-237 consumer contract still cannot bypass MYAH-168 approval and execution.

On Linux, run the narrow affected Jest suites, metadata consistency/generation checks, Twenty server typecheck, lint for the affected project, and the Twenty server build. Smoke the owning service flow with a real workspace-scoped repository path and a fake provider boundary that records submissions; assert one approved action produces one submission and one durable receipt across a repeated request.

Obtain an independent correctness/security review after focused checks pass. Resolve all Critical and Important findings, rerun checks invalidated by corrections, then make coherent commits and add the finalized consumer contract plus verification evidence to MYAH-237 in Linear.

## Scope stop

This issue does not implement managed mailbox purchasing, Icemail, warmup, Metronome email subscriptions, managed-email settings UI, mailbox credential storage, inbox/reply handling, bulk outreach, social actions, or automatic sends. Those remain owned by MYAH-184, MYAH-237, MYAH-169, or later explicitly approved work.

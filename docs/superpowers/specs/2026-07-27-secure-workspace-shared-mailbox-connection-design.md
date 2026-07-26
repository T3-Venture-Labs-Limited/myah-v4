# Secure Workspace-Shared Mailbox Connection Design

**Linear issue:** MYAH-184 — Implement secure workspace-shared outreach mailbox connection  
**Project:** myah  
**Milestone:** Stage 3 — Ready for first paying customers  
**Canonical branch:** `daryll/myah-184-implement-secure-workspace-shared-outreach-mailbox`

## 1. Goal

Provide one customer-owned outreach mailbox per workspace through a secure, workspace-shared SMTP/IMAP connection. The server validates both protocols, encrypts credentials before persistence, registers the mailbox through Twenty's native `ConnectedAccount` and `MessageChannel` models, and exposes only customer-safe status and errors.

The contract supports any standards-compliant SMTP/IMAP provider that offers authenticated SMTP, authenticated IMAP, and valid TLS. Google Workspace, Microsoft 365, and other providers may receive provider-specific setup guidance later, but the server does not maintain a provider allowlist.

## 2. Non-goals

MYAH-184 does not implement:

- Icemail domain or mailbox provisioning;
- managed-email subscriptions, billing, entitlements, or Metronome integration;
- warmup-provider connection or warmup lifecycle;
- campaign readiness policy, send-capacity policy, or health scoring;
- campaign mailbox assignment, drafting, approval, sending, or receipts;
- inbound reply processing or reply assignment;
- per-user mailbox fleets;
- CalDAV, Instagram, or TikTok connections.

A successful SMTP/IMAP connection proves only that the mailbox is connected. It does not make the mailbox campaign-eligible or warmup-ready.

## 3. Existing platform capabilities to reuse

The implementation must reuse these existing Twenty boundaries:

- `ImapSmtpCaldavService` for connection-parameter validation and protocol connection tests;
- `ImapSmtpCalDavAPIService` for transactional account persistence, workspace membership validation, credential encryption, and `MessageChannel` creation;
- `ConnectedAccountTokenEncryptionService` for workspace-bound encryption and decryption;
- `ConnectedAccountEntity` with `visibility: 'workspace'` for team-wide access;
- `ConnectedAccountMetadataService` for workspace-scoped lookup and native deletion events;
- `MessageChannelEntity` for channel identity and sync state;
- `AccountsToReconnectService` and the existing channel sync reset path for reconnection.

No second credential table, mailbox registry, provider SDK framework, or parallel message channel is introduced.

## 4. Architecture

### 4.1 Myah-owned server service

Add one server capability under `MyahModule`:

```ts
WorkspaceMailboxConnectionService
```

It owns the Myah policy for one shared SMTP/IMAP mailbox per workspace. It is the only new public server abstraction introduced by this issue.

The core server-only connection method is:

```ts
connectWorkspaceMailbox(input: {
  workspaceId: string;
  userWorkspaceId?: string;
  handle: string;
  accountType: 'IMAP_SMTP';
  connectionParameters: PlaintextImapSmtpCaldavParams;
}): Promise<{
  connectedAccountId: string;
  messageChannelId: string;
  status: WorkspaceMailboxConnectionStatus;
}>;
```

`userWorkspaceId` is supplied by an authenticated customer connection flow. A trusted server flow may omit it; the service then selects a valid workspace member only as the native account's technical owner. The account remains `visibility: 'workspace'`, so the technical owner does not become the mailbox's product owner.

Plaintext credentials exist only for the duration of validation and encrypted persistence. The method does not log, serialize into queue data, return, or retain plaintext credentials.

### 4.2 Customer API surface

The existing personal `saveImapSmtpCaldavAccount` mutation remains unchanged and user-scoped.

MYAH-184 adds a workspace-shared resolver surface protected by:

- `WorkspaceAuthGuard`;
- `SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS)`;
- authenticated `workspaceId` and `userWorkspaceId` decorators rather than client-supplied tenant identity.

The connect mutation accepts SMTP/IMAP settings once over the authenticated TLS request and never returns them. Query, rotate, reconnect, and revoke operations accept only opaque account IDs or safe non-secret fields. The resolver delegates all tenant checks to the service as defense in depth.

The browser may submit a password entered by an authorized user, but it must never receive a stored password, encrypted secret, raw provider error, or raw provider response from the server. Browser storage, analytics, timeline metadata, agent/tool context, and logs must not contain credentials.

Trusted server consumers, including a later managed-mailbox activation flow, call the service directly and do not route credentials through GraphQL.

### 4.3 Native persistence and uniqueness

The shared account is persisted as:

```ts
{
  provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
  visibility: 'workspace',
  workspaceId,
  handle,
  connectionParameters: encryptedConnectionParameters,
}
```

Replay is keyed by:

```ts
{
  workspaceId,
  provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
  visibility: 'workspace',
  handle,
}
```

This key deliberately excludes `userWorkspaceId`, allowing another authorized member of the same workspace to rotate or reconnect the mailbox without creating a duplicate account.

The service enforces one active workspace-shared outreach mailbox per workspace. After network validation completes, the existing upsert transaction acquires a PostgreSQL advisory transaction lock keyed by the workspace mailbox boundary, then re-reads the account before deciding whether to create or reuse it. This makes both sequential and concurrent requests deterministic without holding a database lock during SMTP/IMAP calls.

A request for the already-connected handle is an idempotent replay. A request for a different handle returns a deterministic `MAILBOX_ALREADY_CONNECTED` error until the existing mailbox is revoked. The mailbox identity and workspace uniqueness are the durable replay boundary; no separate idempotency ledger or request-key field is added.

The `MessageChannel` is created in the same transaction by the existing API service. Replay or rotation returns the existing channel rather than creating another one.

### 4.4 Validation and supported providers

A connection is accepted only when:

1. both `IMAP` and `SMTP` settings are present;
2. no `CALDAV` settings are present;
3. the handle is a normalized email address;
4. the SMTP and IMAP hosts pass Twenty's outbound-host validation;
5. both protocols use `SSL_TLS` or `STARTTLS`;
6. TLS certificate verification succeeds;
7. SMTP authentication/verification succeeds;
8. IMAP authentication and mailbox listing succeeds.

`NONE`/plaintext connection security is rejected. Self-signed, expired, hostname-mismatched, or otherwise invalid certificates are rejected. Any provider satisfying these standards is supported; provider brand is not used for admission.

Validation happens before encrypted persistence. Failed rotation leaves the existing encrypted credentials and active channel unchanged.

### 4.5 Safe status projection

The customer-facing status type contains no connection parameters:

```ts
type WorkspaceMailboxConnectionStatus = {
  connectedAccountId: string;
  messageChannelId: string;
  maskedHandle: string;
  state: 'CONNECTED' | 'RECONNECT_REQUIRED' | 'REVOKED';
  lastSafeOperation: 'CONNECTED' | 'ROTATED' | 'RECONNECTED' | 'REVOKED';
  syncStatus: MessageChannelSyncStatus;
  syncStage: MessageChannelSyncStage;
  updatedAt: Date;
  errorCode: WorkspaceMailboxConnectionErrorCode | null;
  errorMessage: string | null;
};
```

The masked handle preserves enough identity for recognition, for example `o***h@example.com`, but does not expose credentials. The status reflects connection and native channel sync facts only; it has no billing, warmup, readiness-policy, capacity, or campaign-assignment fields.

### 4.6 Error contract

Customer-facing failures use stable codes and fixed messages:

- `INVALID_CONFIGURATION` — SMTP and IMAP settings are incomplete or unsupported;
- `INSECURE_CONNECTION` — plaintext or invalid TLS settings were supplied;
- `AUTHENTICATION_FAILED` — the provider rejected the credentials;
- `CONNECTION_REFUSED` — the configured host/port refused the connection;
- `CONNECTION_UNAVAILABLE` — a safe connection could not be established;
- `MAILBOX_ALREADY_CONNECTED` — the workspace already has a different shared mailbox;
- `MAILBOX_NOT_FOUND` — no matching mailbox exists in the authenticated workspace;
- `RECONNECT_REQUIRED` — stored credentials are no longer accepted;
- `UNKNOWN` — an unexpected safe fallback.

Provider exception messages, stacks, response bodies, host-internal details, usernames, and passwords are never copied into customer errors or logs. Server logs contain only stable event names, workspace/account IDs where safe, protocol category, and the stable error code.

Manual fallback is deterministic: the customer is told to verify the provider's SMTP/IMAP enablement, create or rotate an app password when required, confirm TLS host/port settings, and retry. Support can diagnose from stable codes without requesting the mailbox password.

## 5. Lifecycle behavior

### 5.1 Initial connection

1. Authorize the workspace member.
2. Normalize and validate non-secret input.
3. Verify the workspace has no different active shared mailbox.
4. Test SMTP and IMAP with strict TLS.
5. Encrypt connection parameters with the workspace encryption context.
6. Upsert the workspace-visible `ConnectedAccount` transactionally.
7. Create or reuse exactly one `MessageChannel`.
8. Return the safe status projection.

### 5.2 Idempotent replay

Repeating or concurrently submitting the same request for the same workspace and handle returns the existing account/channel IDs. The service may revalidate supplied credentials, then serializes only the database upsert with the workspace advisory transaction lock. It must not create duplicate records. A different workspace never participates in the lookup, even if it uses the same handle.

### 5.3 Rotation

Rotation requires the authenticated workspace and existing account ID. New SMTP/IMAP credentials are fully validated before persistence. On success, the existing account ID and channel ID remain stable, encrypted parameters are replaced, `authFailedAt` is cleared, reconnect markers are removed, and the safe operation becomes `ROTATED`.

On failure, the old encrypted parameters remain untouched and only the deterministic safe error is returned.

### 5.4 Reconnection

Reconnection follows the rotation path for an account in a failed-auth/reconnect state. On success it clears reconnect state, resets native channel sync where appropriate, and reuses the existing account/channel IDs. It does not create a second mailbox.

### 5.5 Revocation

Revocation looks up the account by both account ID and authenticated `workspaceId`, verifies it is the Myah workspace-shared SMTP/IMAP account, and then calls Twenty's native `ConnectedAccountMetadataService.delete` path. That removes the account through the standard lifecycle, removes dependent channels according to native relations, and emits the existing account/channel deletion events.

Replay of revoke is safe: an already-absent mailbox returns the same customer-safe revoked/not-found outcome without exposing whether another workspace owns the supplied ID. A revoked mailbox cannot be selected or sent through.

## 6. Workspace isolation and authorization

Every read and write includes the authenticated `workspaceId`. Account IDs, channel IDs, and handles never replace tenant scoping.

Tests must prove that Workspace A cannot:

- query Workspace B's mailbox status;
- rotate or reconnect Workspace B's credentials;
- revoke Workspace B's mailbox;
- obtain Workspace B's account or channel IDs through replay;
- select Workspace B's channel for downstream sending.

The same mailbox address may exist independently in two different workspaces. Each workspace receives different encrypted credential envelopes because encryption is bound to `workspaceId`.

## 7. Security invariants

- Passwords are encrypted before database persistence.
- Database encryption constraints remain the final storage guard.
- Passwords and raw connection parameters are absent from DTOs and status objects.
- No credentials are serialized into jobs, events, logs, analytics, receipts, timeline metadata, or AI/tool context.
- Strict TLS is required for both protocols.
- Provider errors are categorized, not forwarded.
- Rotation is validate-then-replace, never replace-then-test.
- All account/channel operations are workspace-scoped.
- No browser API can retrieve stored or decrypted credentials.

## 8. Test strategy

Tests are written first and must cover observable contracts:

1. workspace-visible encrypted persistence while personal connections remain user-visible;
2. exact replay across two members of one workspace;
3. independent same-handle connections in two workspaces;
4. exactly one `MessageChannel` on replay and rotation;
5. SMTP and IMAP are both required and tested;
6. plaintext security and invalid certificates are rejected;
7. failed validation does not persist or replace credentials;
8. rotation and reconnection reuse IDs and clear failure state;
9. revoke uses the native workspace-scoped deletion path;
10. cross-workspace query/rotate/reconnect/revoke fail safely;
11. returned status and thrown/logged errors contain no password, username, raw provider message, or provider payload;
12. `MyahModule` production dependency injection resolves the new service.

Focused verification runs on the approved Linux host with Node 24. It includes the new service/resolver specs, affected generic IMAP/SMTP specs, Myah module DI spec, and `twenty-server` typecheck. A final broader server test run is required because the generic connection primitive is shared infrastructure.

## 9. Acceptance criteria

MYAH-184 is complete when:

- an authorized workspace member can connect one standards-compliant SMTP/IMAP mailbox as workspace-shared;
- trusted server code can call the same service directly without GraphQL credential transit;
- credentials are validated with strict TLS and encrypted before persistence;
- one native `ConnectedAccount` and one native `MessageChannel` are created;
- replay, rotation, and reconnection reuse those records;
- revocation removes access through Twenty's native lifecycle;
- another workspace cannot read, mutate, select, or revoke the mailbox;
- all customer status and errors are deterministic and secret-free;
- no managed provisioning, billing, warmup/readiness policy, or campaign assignment is introduced;
- focused tests, typecheck, independent review, coherent commit, and Linear handoff evidence are complete.

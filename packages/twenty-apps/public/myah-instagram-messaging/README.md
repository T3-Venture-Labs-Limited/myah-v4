# Myah Instagram Messaging

No-polling Twenty app for manual Instagram account and conversation lookup through a narrow Composio adapter.

## Scope

This app remains intentionally read-only for provider operations:

- Reply polling is disabled.
- No cron trigger settings are defined.
- No first-contact Instagram DM automation is implemented.
- Existing Instagram conversations and messages can be listed manually.
- The app exposes no sender or draft-creation function. A separate server-owned action may prepare a local review draft and, only after an exact user approval, validate and send a reply through the canonical workspace account.
- Composio calls from this app are limited to the allowlisted read tools:
  - `INSTAGRAM_LIST_ALL_CONVERSATIONS`
  - `INSTAGRAM_LIST_ALL_MESSAGES`

## Required app variables

Configure these in the Twenty app/server variable UI for read-only Composio lookups:

| Variable | Required | Secret | Purpose |
|---|---:|---:|---|
| `COMPOSIO_API_KEY` | yes | yes | Composio API key used by server-side logic functions. |
| `MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID` | recommended | no | Default Instagram Composio connected account id, used when a lookup omits `connectedAccountId`. |
| `MYAH_COMPOSIO_USER_ID` | optional | no | Composio user id to attach to direct tool execution. |

You can also pass `connectedAccountId` per invocation instead of setting `MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID`.

## Safe manual test sequence

1. Confirm polling is still disabled by checking tests or the generated manifest for no `cronTriggerSettings`.
2. Configure `COMPOSIO_API_KEY` and either set `MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID` or pass `connectedAccountId` manually in the workflow/tool input.
3. Run **List Instagram Conversations**.
4. Pick a returned conversation id.
5. Run **List Instagram Messages** for that conversation.
6. For a real reply, use the authenticated server-owned chat action, verify the approval card's exact text and recipient, then explicitly approve it. The app itself must never call a provider send operation.

Important constraints:

- Usernames are not valid `recipientId` values.
- This does not open new conversations or cold-DM creators.
- Do not paste tokenized paging URLs back into inputs; only use paging cursors.

## Verification commands

From this package directory:

```bash
corepack yarn test:unit
corepack yarn typecheck
corepack yarn twenty dev:build .
```

## Production follow-up boundary

Background reply polling, bulk sends, auto-replies, schedules, and automatic retries remain out of scope. Keep all outbound delivery behind the server-owned workspace broker, exact approval binding, durable idempotency receipt, and provider-side recipient verification.

# Myah Instagram Messaging

No-polling Twenty app for manual Instagram account and conversation lookup through a narrow Composio adapter.

## Scope

This first slice is intentionally read-only for provider operations:

- Reply polling is disabled.
- No cron trigger settings are defined.
- No first-contact Instagram DM automation is implemented.
- Existing Instagram conversations and messages can be listed manually.
- Instagram send operations are fail-closed until an authenticated server-side workspace ownership broker exists. The send action rejects before any provider request and must not be treated as landed messaging behavior.
- Composio calls are limited to the allowlisted read tools:
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
6. Do not invoke a send action: it is intentionally disabled and returns a non-sensitive rejection without provider I/O.

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

When background reply polling or authenticated sending becomes part of scope, implement it behind a server-side workspace ownership broker with durable idempotency and persistence gates. Do not implement polling as a front-component refresh loop.

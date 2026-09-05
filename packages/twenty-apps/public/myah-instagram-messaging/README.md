# Myah Instagram Messaging

This Twenty app owns the stable metadata for Myah Instagram messaging. It contains no provider configuration, secrets, transport, or executable logic functions.

## Metadata ownership

The app retains the established Myah Instagram account, social conversation, social message, and Instagram reply draft objects with their fields, relations, indexes, and universal identifiers. Historical provider identities remain intact, including `COMPOSIO_HISTORY` and `UNIPILE`, so existing records continue to resolve to their original metadata.

Application metadata must be synced before the corresponding server upgrade commands run.

## Runtime boundary

The server owns the Unipile v1 account connection, synchronization, and delivery runtime. The server-owned `send_instagram_message` v2 action remains the only authority for Instagram sends and preserves the existing approval and history contracts.

This app does not connect accounts, list conversations or messages, send messages, schedule work, or call a provider. Configure and operate the server runtime through its server-owned settings and actions, not through this package.

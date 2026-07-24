# MYAH-212 — Global Inbox and communications workspace

**Status:** Product decisions and implementation plan approved; implementation resumed 2026-07-24 after MYAH-210 merged  
**Linear:** [MYAH-212](https://linear.app/t3labs/issue/MYAH-212/core-mvp-build-global-inbox-and-communications-workspace)  
**Scope:** Core MVP email-only Inbox. No send, provider mutation, production deployment, merge, or new dependency.

## Goal

Give Creator Operations a single human-operated email workspace at `/myah/inbox`: operators can find conversations, understand the linked Creator and campaign context, triage work, take the next Task/Note action, and prepare one shared reply draft without replacing Twenty's email system or sending email.

## Product decisions

- The first release is **email only**. Instagram, other social channels, reply-window logic, first-message handoffs, and multi-channel tabs are excluded.
- The Inbox row is one native Twenty `MessageThread`, not one Creator, one individual `Message`, or a sidecar conversation record.
- Twenty `MessageThread` and `Message` remain canonical for email payload, participants, subject, message history, and delivery/provider state.
- Creator-linked threads are the default queue. `Creator = null` is the explicit, visible, filterable **Unmatched** queue.
- An operator, never an inference, selects the optional Myah Campaign label. Twenty's `MessageCampaign` is a bulk-email object and must not be overloaded as a Myah campaign relation.
- A thread has zero or one workspace-member Inbox owner. Assignment organizes operator responsibility but does not replace Task assignment or notifications.
- Inbox workload state is deliberately small: `Needs reply`, `Waiting on creator`, `Snoozed`, and `Closed`. Tasks remain the canonical next action.
- One reply-only shared manual draft belongs to an existing Inbox thread. The assigned owner edits it. A current revision is required for each write.
- Native `Message.isDraft` is provider-synced and is not an editable Myah draft store.
- `Generate with AI` and sidebar chat return an editable reply proposal only. The owner explicitly applies it to the shared draft. AI never sends.

## Information architecture

The stable MYAH-209 entry route is `/myah/inbox`; MYAH-212 owns the route body and must not change the drawer, route registry, shared labels, or shell.

```text
/myah/inbox
├── Thread list
│   ├── Creator-linked queue
│   ├── Unmatched queue
│   ├── My threads / Unassigned
│   ├── Campaign and triage-state filters
│   └── cursor pagination
├── Active thread
│   ├── native email history
│   ├── editable shared reply draft
│   └── Generate with AI proposal preview and explicit application
└── Context panel
    ├── Creator or link/create-Creator handoff
    ├── optional Myah Campaign label
    ├── owner, state, and snooze controls
    └── linked Tasks and Notes
```

The list is the selection controller. Selecting a row loads that thread into the center and context panels. The panel layout is responsive: narrow viewports preserve one selected thread and reveal the list/context through established Twenty responsive patterns; they do not introduce a second Inbox model.

## Data model and ownership

### Canonical native data

| Data | Canonical owner | MYAH-212 use |
| --- | --- | --- |
| Email thread, subject, messages, participants, timestamps, provider delivery state | native `MessageThread` / `Message` | display and derive list summaries; never copy payload |
| Email channel/account association | native messaging objects | display only; no connection/write behavior |
| Task and Note | native Twenty objects | canonical next action and operator context |
| Creator and Myah Campaign | Myah standard metadata | link context; no duplicate fields on Creator |

### MYAH-212 metadata on native `MessageThread`

| Field | Shape | Meaning |
| --- | --- | --- |
| `creator` | optional many-to-one Myah Creator relation | `null` means Unmatched |
| `myahCampaign` | optional many-to-one Myah Campaign relation | operator-selected campaign context |
| `inboxOwner` | optional many-to-one `WorkspaceMember` relation | one accountable operator, or unassigned |
| `inboxState` | required select | `NEEDS_REPLY`, `WAITING_ON_CREATOR`, `SNOOZED`, `CLOSED` |
| `snoozedUntil` | optional timestamp | required for a Snoozed transition; cleared otherwise |
| `myahReplyDraftBody` | nullable rich text | local shared reply draft; never a provider draft |
| `myahReplyDraftRevision` | non-null number, default `0` | monotonically increasing optimistic-concurrency token |

The current Myah metadata replacement removes Twenty's standard Person CRM model. MYAH-212 must link directly to Creator and must not depend on `MessageParticipant.person` for Inbox identity or rendering.

### Shared reply draft

The shared draft is stored as the two `MessageThread` fields above, not as a sidecar object. This is one local draft per existing native thread and has these invariants:

- reply-only; no first-outbound-thread creation;
- `myahReplyDraftBody` changes only through the owner-authorized server mutation;
- `myahReplyDraftRevision` is incremented atomically with every save or clear;
- no provider API call, provider payload mutation, or use of `Message.isDraft`;
- no accidental overwrite: a revision mismatch returns the persisted body and current revision.

The mutation uses the existing source-controlled Myah metadata and workspace-command path to add these fields. It must not introduce raw SQL, a sidecar Inbox schema, or a provider-owned write path.

## Read and query contract

A server-owned workspace-global projection returns cursor-paginated thread summaries. It derives sender, preview, latest activity, and display timestamps from native Message data and joins only the Myah Inbox fields above.

The projection must enforce the same per-message connected-account and channel-visibility policy as native Message reads **before** latest-message selection, search, ordering, cursor creation, and page limiting. The first release requires authenticated user context; it does not silently treat API-key, application, or system auth as an Inbox operator. A connected-account owner or `SHARE_EVERYTHING` may see subject and body, `SUBJECT` may expose only the subject, `METADATA` masks both subject and body, and messages with no valid association or visibility are omitted. Masked or hidden content must not influence search matches, result counts, `pageInfo`, ordering, or cursor movement.

Required query behavior:

- stable ordering: `lastActivity DESC, threadId DESC`;
- cursor pagination only; never offset pagination;
- filter by Creator-linked/Unmatched, owner/unassigned, campaign, state, snooze status, and text search;
- load the selected thread separately through native thread/message detail behavior;
- avoid N+1 thread/message/Creator/Campaign/owner loading;
- tolerate deleted Creator or Campaign references as `null` context without deleting email history;
- require an implementation-time `EXPLAIN (ANALYZE, BUFFERS)` against a realistic seeded workspace before the final filter/order index is chosen.

## Triage and draft transitions

| Event | Preconditions | Result |
| --- | --- | --- |
| Operator links Creator | current thread is readable; target Creator is readable | set `creator`; Unmatched membership ends |
| Operator unlinks Creator | current thread is writable | clear `creator`; thread enters Unmatched |
| Operator assigns owner | target member belongs to workspace; current thread is writable | set `inboxOwner` |
| Operator changes owner | current thread is writable | retain draft; new owner becomes the only draft editor |
| Operator marks Needs reply | current thread is writable | set `inboxState = NEEDS_REPLY`; clear `snoozedUntil` |
| Operator marks Waiting on creator | current thread is writable | set `inboxState = WAITING_ON_CREATOR`; clear `snoozedUntil` |
| Operator snoozes | future `snoozedUntil` supplied | set `inboxState = SNOOZED` and the timestamp |
| Snooze expires | no background job in this release | display as due/attention-needed in query/UI; operator may reopen |
| Operator closes | current thread is writable | set `inboxState = CLOSED`; clear `snoozedUntil` |
| Future inbound email | owned by MYAH-169 | later integration reopens Snoozed or Closed to Needs reply; MYAH-212 does not implement ingestion |
| Owner saves draft | owner and expected draft revision match | create/update draft and increment revision |
| Owner clears draft | owner and expected revision match | clear persisted content and increment revision |
| Stale draft save | expected revision differs | no write; return conflict and current draft/revision |

An Unmatched thread may be linked to an existing Creator or handed to MYAH-210's native Creator creation flow, then linked by explicit operator action. MYAH-212 must never auto-match or auto-create a Creator.

## AI reply assistance

The Inbox button and sidebar agent call one shared server capability. It reads only the selected native thread, linked Creator and Campaign, operator instructions, and permitted Brand Brain context. It returns a schema-validated proposal suitable for editing.

The proposal path has these non-negotiable boundaries:

- it does not mutate a persisted draft;
- it does not send, queue, approve, or perform any provider I/O;
- it does not expose provider credentials or hidden model reasoning to the browser;
- only an explicit action by the current draft owner applies a proposal through the revision-protected draft mutation;
- workspace, actor, role, tool permissions, billing/model availability, and permitted Brand Brain context reuse existing server-side AI/chat controls.

MYAH-224 defers sidebar-agent triage mutation tools. MYAH-225 defers sidebar-agent shared-draft write tools. Neither expands MYAH-212's read-and-propose scope.

## Twenty primitive reuse and deviation rationale

| Need | Reused Twenty primitive | Decision |
| --- | --- | --- |
| Email history | `MessageThread`, `Message`, native record/thread UI | Reuse directly |
| Tasks and Notes | native objects, record side panel, permissions | Reuse directly |
| Creator/Campaign relations and views | Myah/Twenty metadata, generic record mutations | Extend native thread metadata |
| Responsive shell, loading/error conventions, controls | existing Twenty frontend modules and `twenty-ui` | Reuse directly |
| AI streaming, tools, model/billing/permission controls | server AI chat and Vercel AI SDK | Reuse directly |

**Deviation rationale: workspace-global Inbox projection and local draft.** Twenty's existing email-thread query is record-scoped and offset-paginated; it cannot drive an operator-wide triage queue with Inbox-specific filters without duplicating the projection in the browser. Native `Message.isDraft` is provider-synced and cannot safely hold a local shared draft. MYAH-212 therefore adds only (1) a cursor-paginated read projection over native data, backed by a shared message-visibility policy also consumed by native Message reads, and (2) the narrow revision-protected server draft required for collaborative operator editing. It does not create a separate mailbox, conversation payload store, chat framework, or send path.

## Scope boundaries

### Included

- `/myah/inbox` three-panel email workspace.
- Native email-thread list/detail presentation, triage fields, notes, linked Tasks, Creator linking, campaign label, and owner state.
- Cursor pagination, filters, search, loading/empty/error/read-only states, and responsive accessible behavior.
- Owner-authorized shared reply drafts and AI reply proposals with explicit application.

### Excluded

- Instagram and every other social channel; multi-channel tabs; reply windows/countdowns; first-message handoff.
- Chatwoot, Chatwoot-like systems, third-party Inbox dependencies, and MYAH-206's component comparison.
- Mailbox connection, provider credential management, browser/provider send, approval-bound send, receipts, inbound sync, delivery reconciliation, or follow-up scheduling.
- Automatic Creator matching/creation, autonomous AI triage/draft writes, duplicate email payload storage, and manual contact timestamps.
- MYAH-209 drawer/registry/shell changes; MYAH-210 Creator CRM internals; production deployment or service configuration changes.

## Integration and worktree boundaries

- MYAH-209 owns the Myah navigation shell and stable `/myah/inbox` route; MYAH-212 implements only the body behind it.
- MYAH-210 owns Creator CRM fields, views, lists, and Creator creation. MYAH-212 consumes its Creator identity and must coordinate its Myah metadata/2.20 workspace-command integration before merge.
- MYAH-184 owns the secure shared mailbox connection.
- MYAH-168 owns approval-bound outbound send and receipt creation.
- MYAH-169 owns inbound email handling, reply-triggered reopening, and follow-up scheduling.
- MYAH-214 owns Brand Brain and supplies only permission-appropriate context to the shared proposal capability.

## Acceptance criteria

1. `/myah/inbox` renders the three-panel, email-thread workflow while retaining the MYAH-209 shared shell.
2. Every Inbox row represents one native email thread; message history and preview data are derived from native records without duplicate payload storage, and list visibility/masking agrees with the native selected-thread read for the same authenticated operator.
3. Operators can use Creator-linked, Unmatched, owner/unassigned, campaign, and triage-state queues with stable cursor pagination and search.
4. Operators can explicitly link/unlink Creator, set/clear Campaign and owner, transition triage state, snooze/unsnooze, and use Tasks and Notes as the canonical follow-up context.
5. The current owner alone can create, edit, or clear the one shared reply draft; stale writes have a visible conflict and never overwrite newer work.
6. Generate with AI and sidebar chat return proposals only. Explicit owner application uses the same revision-protected draft path and never sends.
7. The server enforces workspace isolation, permissions, thread existence, relation validity, ownership, reply-only eligibility, revision checks, and input validation for every write.
8. No first outbound email, provider write, provider credential exposure, external side effect, or autonomous agent mutation occurs.
9. Keyboard list navigation, focus transitions, labelled controls, announced mutation/conflict status, and populated/empty/loading/error/read-only states work on desktop and responsive layouts.
10. Targeted automated tests cover query/filter/cursor invariants, authorization/tenant isolation, state transitions, relational integrity, draft concurrency, AI proposal application, and no-send/provider-I/O regressions. Browser smoke exercises a populated Inbox through explicit triage and draft application.

### Observed acceptance evidence (2026-07-24)

- [x] Native `/myah/inbox` three-panel desktop and responsive Context layouts rendered inside the existing Myah shell.
- [x] Isolated integration matched Inbox rows and native selected-thread reads across owner, `SHARE_EVERYTHING`, `SUBJECT`, `METADATA`, and hidden/deleted-association cases, including masked-search denial.
- [x] Integration and browser-real checks covered Creator-linked/Unmatched, Me/Unassigned, Campaign, state, search, and stable tied-timestamp and 50-to-56 cursor pagination.
- [x] Browser-real triage linked an Unmatched thread and saved Creator, Campaign, owner, state, and snooze; native Tasks and Notes were created and rendered in Creator context.
- [x] Browser-real owner Save persisted a shared draft; a second authenticated session received a visible revision conflict without overwriting the newer body.
- [x] Task 5 fake-model integration proved proposal orchestration and unchanged Message count. Browser proposal generation was explicitly intercepted only for the local `GenerateMyahInboxReplyProposal` operation; Apply was local and explicit Save was real.
- [x] Focused service/integration suites covered workspace-scoped relations, permission/owner gates, reply eligibility, revision checks, and bounded inputs.
- [x] Integration asserted unchanged native Message count; browser network capture contained local GraphQL only, with no send, provider, external-model, credential, or other external request.
- [x] Browser-real ArrowDown focus/selection, labelled controls, announced save/conflict statuses, Task/Note creation, and 390x844 responsive Context access were observed.
- [x] Task 3–7 focused suites, GraphQL generation against the isolated API, both typechecks, targeted formatting, and front/server diff lint passed.

## Verification strategy

1. Start each backend/frontend slice with targeted failing tests for its observable contract.
2. Verify migration/metadata behavior for both fresh and existing workspaces using the repository-supported workspace-command path; do not replay MYAH-210's committed command.
3. Exercise GraphQL generation if the schema changes and run targeted server/frontend typechecks after the relevant slice.
4. Verify owner, `SHARE_EVERYTHING`, `SUBJECT`, `METADATA`, unknown/no-association, mixed-association, and cross-workspace visibility cases. Prove masked or hidden content cannot affect search matches, counts, ordering, pagination, or cursors.
5. Seed an isolated local workspace with native email threads, Creator-linked and Unmatched queues, owners, campaigns, Tasks, Notes, and competing draft writers.
6. Browser-smoke the Inbox: select/filter/paginate threads; link an Unmatched thread; change owner/state/snooze; save and conflict a shared draft; generate and explicitly apply a proposal; confirm no provider network mutation occurs.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| MYAH-210 and MYAH-212 both alter the source-controlled Myah metadata graph. | Freeze Creator relation identities and rebase MYAH-212 metadata work on the merged MYAH-210 command/contract before integration. |
| Global Inbox query becomes slow at realistic volume. | Cursor pagination, deterministic composite order, narrow joins, and an `EXPLAIN`-proven index. |
| Local draft is confused with a provider draft or silently overwrites work. | Separate server model, owner authorization, revision precondition, visible conflict, no provider I/O. |
| AI appears to send or mutate state autonomously. | Proposal-only capability; explicit owner application; separate blocked follow-ups for agent mutation authority. |
| Older email records lack Creator context. | Preserve email history and show the explicit Unmatched queue; never infer/auto-create a Creator. |
| Inbox duplicates native CRM/email primitives. | Reuse `MessageThread`/`Message`, Tasks, Notes, metadata relations, existing AI controls, and `twenty-ui`; custom code is limited to the documented gap. |

## References

- Linear: MYAH-209, MYAH-210, MYAH-212, MYAH-224, MYAH-225, MYAH-184, MYAH-168, MYAH-169, MYAH-214.
- `docs/specs/MYAH-209-foundation-establish-myah-v4-navigation-and-shared-product-shell.md` in the MYAH-209 worktree.
- `docs/plans/MYAH-210-core-mvp-build-creator-crm-workspace.md` in the MYAH-210 worktree.
- `packages/twenty-server/docs/UPGRADE_COMMANDS.md`.
- Native messaging and AI-chat sources inspected during the MYAH-212 design investigation.
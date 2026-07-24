# MYAH-212 final sidebar repair report

## Result

The sidebar chat now receives a dedicated current-workspace Inbox selection context. Only that context enables the two source-controlled native tools:

- `get_myah_inbox_thread_context`
- `generate_myah_inbox_reply_proposal`

The selected native MessageThread ID is bound in authenticated server tool context and is not exposed in the model prompt or accepted as a model tool argument. No Inbox triage, owner, campaign, snooze, draft-save, write, or send tool was added. Ordinary record-page browsing retains its existing `Do not call any tools based on this context` rule.

Campaign filtering is now tagged with the workspace where the ID was selected. On a workspace switch, the first new-workspace Inbox query omits the foreign Campaign ID, then clears the Campaign filter and Inbox selection while retaining queue, owner, state, and search filters.

No external provider/model/send/network call, production or Railway mutation, migration, reset, restart, push, PR, or merge was performed. The existing live runtime was not stopped or changed.

## Root-cause reproduction and trace

### Sidebar selection and tool flow before repair

1. `MyahInboxPage` stored only `myahInboxSelectedThreadIdState` plus `myahInboxSelectionWorkspaceIdState`.
2. `useGetBrowsingContext` converted a same-workspace Inbox selection into the generic shape `{ type: 'recordPage', objectNameSingular: 'messageThread', recordId }`.
3. `useAgentChat` sent that JSON through `sendChatMessage`; `AgentChatResolver` forwarded it to `AgentChatStreamingService`, the stream job, and finally `ChatExecutionService.streamChat`.
4. `ChatExecutionService.buildContextFromBrowsingContext` rendered the MessageThread record ID into record-page context. `injectBrowsingContextIntoLastUserMessage` then wrapped it with: `Do not call any tools based on this context.` The selected Inbox conversation was therefore indistinguishable from ordinary record browsing and explicitly prohibited tool use.
5. Independently, `PRE_APPROVAL_SAFE_TOOL_NAMES` globally allowed both Inbox tools even when `browsingContext` was `null` or an unrelated record page. `execute_tool` could therefore dispatch either tool if a model guessed a UUID.
6. `ToolRegistryService.resolveAndExecute` resolved the static Inbox provider, `ToolExecutorService` rechecked provider availability, and `MyahInboxToolProvider` verified matching user/workspace/role read permission. However, `MyahInboxToolWorkspaceService` accepted `threadId` from model arguments, so the trusted UI selection was never bound to execution.
7. `MyahInboxReplyProposalService` did correctly rebuild matching user/agent actor context and read the exact policy-visible thread through `MyahInboxQueryService`; this existing authenticated, permission-aware seam remains the final record-authorization boundary.

The observed defect was therefore two-sided: the actual selection was prompt-wrapped as no-tools context, while the tools themselves were globally dispatcher-available and required an untrusted model-supplied internal UUID.

### Workspace filter flow before repair

`myahInboxFiltersState` persisted `campaignId` without a workspace owner. React rendered `useMyahInboxThreads(myahInboxFilters)` before the workspace-change effect cleaned selection. Consequently, the first query in workspace B could submit a Campaign ID selected in workspace A. Server-side Campaign validation correctly rejected the foreign ID, but the frontend should never have sent it.

## Repair and access policy

### Dedicated Inbox selection

- Frontend and server `BrowsingContext` unions now include `myahInboxThreadSelection { workspaceId, threadId }`.
- `useGetBrowsingContext` creates this context only when the selected-thread atom's workspace exactly matches `currentWorkspaceState`.
- `ChatExecutionService` accepts it only when its workspace matches the authenticated execution workspace and its thread ID is a UUID. Cross-workspace or malformed selection context is discarded.
- A valid selection is copied into `ToolContext.myahInboxSelection` and propagated by `ToolRegistryService` into `ToolProviderContext`. This is server-owned execution context, separate from model tool arguments.
- The selected-thread prompt part contains no UUID. It tells the model that the two tools are already bound to the current selection and that no thread ID should be provided or inferred.
- The ordinary `recordPage` and `listView` prompt wrapper remains unchanged, including its no-tools instruction.

### Exact tool allow-list and dispatch

- The two Inbox names were removed from the global pre-approval safe set.
- `ChatExecutionService` adds exactly those two names to the per-turn safe allow-list only for a validated Inbox selection.
- Without a selection, both remain excluded at `execute_tool`, even if a model supplies a syntactically valid guessed UUID.
- `MyahInboxToolProvider.isAvailable` now requires a same-workspace, valid-UUID Inbox selection in addition to the existing matching user/auth/actor and MessageThread read-permission checks. This keeps the tools out of `buildToolIndex` and `learn_tools` when selection is absent or foreign.
- The native Inbox descriptors take precedence over colliding logic-function names, reusing the existing native Brand Brain precedence pattern. This guarantees that the enabled names resolve to the audited static provider rather than an app-defined function.
- `MyahInboxToolWorkspaceService` exposes an empty strict schema for context reads and only `operatorInstructions` for proposal generation. Any model-supplied `threadId` is not part of the schema and is ignored by direct execution; the service always passes the bound selected ID to the permission-aware proposal service.
- The tool provider still exposes only read and proposal operations. It does not catalogue triage, assignment, Campaign, snooze, draft-save, write, or send operations. System auth remains rejected.
- A stale same-workspace selection reaches the exact policy-visible thread read and fails closed when the thread no longer exists or is no longer visible. It never falls back to another thread.

### Workspace-scoped Campaign filtering

- `MyahInboxFilters` now stores `campaignWorkspaceId` alongside `campaignId`.
- Campaign selection records the current workspace atomically with the selected ID.
- `MyahInboxPage` derives workspace-scoped filters before calling `useMyahInboxThreads`; a foreign Campaign ID is replaced with `null` on the first render in the next workspace.
- `useMyahInboxThreads` independently omits `campaignId` unless `campaignWorkspaceId` matches its current workspace argument.
- The workspace effect then clears the persisted Campaign ID/scope and Inbox selection. Queue, symbolic owner, state, and search values remain unchanged.

## RED evidence

### Chat/tool authorization

Before production edits, Node 24 ran the ChatExecution, Inbox workspace tool, and Inbox provider tests:

```text
NX_DAEMON=false npx jest \
  packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/services/__tests__/chat-execution.service.brand-brain-preflight.spec.ts \
  packages/twenty-server/src/engine/core-modules/myah-inbox/tools/__tests__/myah-inbox-tool.workspace-service.spec.ts \
  packages/twenty-server/src/engine/core-modules/tool-provider/providers/__tests__/myah-inbox-tool.provider.spec.ts \
  --config=packages/twenty-server/jest.config.mjs --runInBand
```

Observed:

```text
Test Suites: 3 failed, 3 total
Tests:       7 failed, 8 passed, 15 total
```

Exact failures established that:

- selected Inbox context was rendered as the generic no-tools browsing wrapper;
- null context and an ordinary record page both executed the Inbox context tool and returned `{ success: true }`;
- cross-workspace selection also executed;
- selected/stale dispatch carried no bound `myahInboxSelection`;
- provider availability returned `true` without a selection; and
- a foreign model-supplied UUID reached the proposal service instead of the selected UUID.

The no-selection regression now supplies a guessed UUID in `execute_tool.arguments` and asserts dispatcher denial before `ToolRegistryService.resolveAndExecute`.

### Workspace switch

Before frontend production edits, the dedicated context, query hook, and page workspace-switch tests observed:

```text
Test Suites: 3 failed, 3 total
Tests:       3 failed, 9 passed, 12 total
```

The failures showed that the Inbox selection was still emitted as generic `recordPage`, workspace B received workspace A's `campaignId`, and the stored Campaign filter remained scoped to workspace A.

### Static native tool precedence

A separate registry RED placed a legacy logic-function descriptor before the native Inbox provider:

```text
Test Suites: 1 failed, 1 total
Tests:       1 failed, 3 passed, 4 total
```

The catalogue returned both descriptors. The generalized native-descriptor precedence filter then made the selected Inbox name resolve only to `MYAH_INBOX`.

## GREEN evidence

Focused server verification after the repair covered ChatExecution dispatch, the safe-tool policy, bound tool arguments, authenticated Inbox provider availability, native descriptor precedence, and the shared proposal service. Focused frontend verification covered browsing context, workspace-scoped Apollo variables, page selection cleanup, and list filters.

Observed focused results before the final committed-diff checks:

```text
Server:   6 suites, 30 tests passed
Frontend: 4 suites, 19 tests passed
```

Both project typechecks passed on Node 24 with `NX_DAEMON=false`:

```text
NX Successfully ran target typecheck for project twenty-front and 6 tasks it depends on
NX Successfully ran target typecheck for project twenty-server and 4 tasks it depends on
```

Exact touched-source formatting completed with `oxfmt`. Package-scoped direct `oxlint` completed with zero warnings and zero errors for nine frontend and fourteen server files. The repository diff-lint targets and clean-worktree proof are recorded in the final handoff because they run against the committed diff.

## Remaining risk

No real model or external provider was invoked, as required. Chat behavior is proven through the real `ChatExecutionService` tool construction and `execute_tool` dispatcher with the AI SDK stream boundary mocked, plus real provider/workspace-service authorization units. A browser-real model turn was intentionally not exercised. The structured selection originates from the authenticated frontend request, but it is not itself an authorization grant: server workspace, actor, object permission, and exact policy-visible thread checks remain authoritative.

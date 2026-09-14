// Scheduling epochs changed; persisted upgrade identities must not start a second history family.
export const INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY = [
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'CreateUnipileInstagramFoundationFastInstanceCommand',
    timestamp: 1789307619348,
    durableName:
      '2.20.0_CreateUnipileInstagramFoundationFastInstanceCommand_1799201000000',
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'AddUnipileInstagramSyncStateFastInstanceCommand',
    timestamp: 1789307619352,
    durableName:
      '2.20.0_AddUnipileInstagramSyncStateFastInstanceCommand_1799201001000',
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'CreateInstagramActionBudgetFastInstanceCommand',
    timestamp: 1789307619356,
    durableName:
      '2.20.0_CreateInstagramActionBudgetFastInstanceCommand_1799201002000',
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'AddInstagramDirectActionContextFastInstanceCommand',
    timestamp: 1789307619359,
    durableName:
      '2.20.0_AddInstagramDirectActionContextFastInstanceCommand_1799201003000',
  },
  {
    version: '2.20.0',
    kind: 'slow-instance',
    className: 'InvalidateComposioInstagramAuthoritiesSlowInstanceCommand',
    timestamp: 1789307619363,
    durableName:
      '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000',
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'SynchronizeInstagramMessagePermissionsCommand',
    timestamp: 1789307619366,
    durableName:
      '2.20.0_SynchronizeInstagramMessagePermissionsCommand_1799201011000',
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'InvalidateComposioInstagramAuthoritiesWorkspaceCommand',
    timestamp: 1789307619370,
    durableName:
      '2.20.0_InvalidateComposioInstagramAuthoritiesWorkspaceCommand_1799201011500',
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'BackfillComposioInstagramHistoryWorkspaceCommand',
    timestamp: 1789307619373,
    durableName:
      '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000',
  },
] as const;

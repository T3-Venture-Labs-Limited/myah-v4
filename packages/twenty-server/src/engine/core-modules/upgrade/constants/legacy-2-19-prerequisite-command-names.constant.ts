// Native fast backports placed before the older slow Rebrand cursor.
// Receipts here are a necessary guard for unrestricted replay, never physical
// proof of a safe ordered upgrade.
export const LEGACY_2_19_PREREQUISITE_COMMAND_NAMES = [
  '2.19.0_CreateInstagramReplyAuditFastInstanceCommand_1784106536000',
  '2.19.0_PendingMigrationCheckFastInstanceCommand_1784112688976',
  '2.19.0_RepairInstagramReplyApprovalSchemaFastInstanceCommand_1784112963055',
  '2.19.0_CreateManagedProviderBillingFoundationFastInstanceCommand_1784112963056',
  '2.19.0_EvolveInstagramApprovalToActionAuthorityFastInstanceCommand_1784112963058',
  '2.19.0_CreateManagedProviderFundingActionFastInstanceCommand_1784266302003',
  '2.19.0_CreateManagedProviderPoolFastInstanceCommand_1784486000000',
  '2.19.0_AddMetronomeAuditPropertiesFastInstanceCommand_1784487000000',
  '2.19.0_RepairManagedProviderOperationRetentionFastInstanceCommand_1784488000000',
  '2.19.0_AddActionApprovalContextFingerprintFastInstanceCommand_1785453079000',
  '2.19.0_AddActionReceiptProviderIdentifiersFastInstanceCommand_1785453081000',
] as const;

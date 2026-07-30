export type CreatorBulkRelationshipTarget =
  | { kind: 'creator-list'; id: string; label: string }
  | { kind: 'campaign'; id: string; label: string };

export type CreatorListTarget = Extract<
  CreatorBulkRelationshipTarget,
  { kind: 'creator-list' }
>;

export type CreatorBulkRelationshipAction =
  | { operation: 'add'; target: CreatorBulkRelationshipTarget }
  | { operation: 'remove'; target: CreatorListTarget };

export type CreatorBulkRelationshipPreview = {
  selectedCreatorIds: string[];
  linkedCreatorIds: string[];
  unlinkedCreatorIds: string[];
  relationshipRecordIds: string[];
};

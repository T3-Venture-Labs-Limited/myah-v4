export type CreatorBulkRelationshipTarget =
  | { kind: 'creator-list'; id: string; label: string }
  | { kind: 'campaign'; id: string; label: string };

export type CreatorBulkRelationshipPreview = {
  selectedCreatorIds: string[];
  creatorIdsToAdd: string[];
  alreadyLinkedCreatorIds: string[];
};

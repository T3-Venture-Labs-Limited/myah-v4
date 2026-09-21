import { type ActionEvidenceLinkInput } from 'src/engine/core-modules/action-approval/types/action-approval.type';

const OBJECT_UNIVERSAL_IDENTIFIER_BY_ROLE: Record<string, string> = {
  INSTAGRAM_ACCOUNT: '2d357469-831a-4629-ad4b-47335900e883',
  INSTAGRAM_MESSAGE_DRAFT: '85762d24-541b-407f-9d6a-cdf89552c665',
  SOCIAL_CONVERSATION: '36817464-855f-42db-9fbb-f8853643f8d6',
  CREATOR: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
};

// Both creation and reconstruction use the historical account/draft/chat/Creator
// order. Callers supply metadata already scoped to the authenticated workspace.
export const buildInstagramMessageEvidenceLinks = (input: {
  objectMetadatas: Array<{ id: string; universalIdentifier: string }>;
  accountRecordId: string;
  draftId: string;
  conversationRecordId: string | null;
  creatorRecordId: string | null;
}): ActionEvidenceLinkInput[] => {
  const recordsByRole: Record<string, string | null> = {
    INSTAGRAM_ACCOUNT: input.accountRecordId,
    INSTAGRAM_MESSAGE_DRAFT: input.draftId,
    SOCIAL_CONVERSATION: input.conversationRecordId,
    CREATOR: input.creatorRecordId,
  };
  return Object.entries(recordsByRole)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([role, recordId]) => {
      const matches = input.objectMetadatas.filter(
        ({ universalIdentifier }) =>
          universalIdentifier === OBJECT_UNIVERSAL_IDENTIFIER_BY_ROLE[role],
      );
      if (matches.length !== 1 || !matches[0].id)
        throw new Error('Instagram message evidence metadata is unavailable');
      return { objectMetadataId: matches[0].id, recordId, role };
    });
};

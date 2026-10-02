export type GetOneMessageListResponse = {
  messageExternalIds: string[];
  messageExternalIdsToDelete: string[];
  previousSyncCursor: string | null;
  nextSyncCursor: string;
  folderId: string | undefined;
  // Gmail only: creation events, never label replays. Other connectors do not
  // acquire prospective Email authority from this field.
  newMessageExternalIds?: string[];
  // Set only after a Gmail history walk from a pre-scan mailbox cursor
  // reaches its final cursor and the additions join the initial enumeration.
  initialFrontierVerified?: boolean;
};

export type GetMessageListsResponse = Array<GetOneMessageListResponse>;

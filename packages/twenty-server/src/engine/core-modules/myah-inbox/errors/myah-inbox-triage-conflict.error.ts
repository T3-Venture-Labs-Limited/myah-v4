import {
  BaseGraphQLError,
  ErrorCode,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

export type MyahInboxContactTriageConflictTuple = {
  inboxOwnerId: string | null;
  inboxState: string;
  snoozedUntil: string | null;
  revision: number;
  identityGeneration: string;
};

export class MyahInboxTriageConflictError extends BaseGraphQLError {
  constructor(triage: MyahInboxContactTriageConflictTuple) {
    super('This contact changed.', ErrorCode.CONFLICT, {
      subCode: 'MYAH_INBOX_TRIAGE_CONFLICT',
      triage,
    });
  }
}

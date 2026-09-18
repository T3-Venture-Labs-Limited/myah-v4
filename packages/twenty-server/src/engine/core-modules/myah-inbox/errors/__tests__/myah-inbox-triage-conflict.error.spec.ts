import { MyahInboxTriageConflictError } from '../myah-inbox-triage-conflict.error';

describe('MyahInboxTriageConflictError', () => {
  it('serializes the current tuple as the typed conflict payload', () => {
    const triage = {
      inboxOwnerId: null,
      inboxState: 'NEEDS_REPLY',
      snoozedUntil: null,
      revision: 3,
      identityGeneration: '2',
    };

    expect(new MyahInboxTriageConflictError(triage).toJSON()).toMatchObject({
      extensions: {
        code: 'CONFLICT',
        subCode: 'MYAH_INBOX_TRIAGE_CONFLICT',
        triage,
      },
    });
  });
});

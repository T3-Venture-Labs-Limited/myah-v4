import {
  MyahInboxReplyContextDraftService,
  type AnchoredReplyIdentity,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

const identity: AnchoredReplyIdentity = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  contactAnchorKind: 'CREATOR',
  contactAnchorId: '10000000-0000-4000-8000-000000000002',
  channel: ReplyChannel.EMAIL,
  deliveryTargetId: '10000000-0000-4000-8000-000000000003',
  context: {
    kind: ReplyContextKind.CAMPAIGN,
    campaignId: '10000000-0000-4000-8000-000000000004',
  },
};

const row = {
  id: '10000000-0000-4000-8000-000000000005',
  revision: 2,
  bodyMarkdown: 'current',
  bodyBlocknote: null,
  proposalContextFingerprint: 'a'.repeat(64),
  reviewedContextFingerprint: 'b'.repeat(64),
};

const createService = (query: jest.Mock) =>
  new MyahInboxReplyContextDraftService({
    transaction: async (
      callback: (manager: { query: typeof query }) => unknown,
    ) => callback({ query }),
  } as never);

describe('MyahInboxReplyContextDraftService', () => {
  it('treats a PostgreSQL affected=0 CAS tuple as a conflict and reloads the authorized row', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([row]);

    await expect(
      createService(query).save({
        ...identity,
        expectedRevision: 1,
        body: { markdown: 'next', blocknote: null },
      }),
    ).resolves.toEqual({
      status: 'CONFLICT',
      revision: 2,
      body: { markdown: 'current', blocknote: null },
    });
  });

  it('uses rows[0] from a PostgreSQL affected=1 CAS tuple', async () => {
    const updated = { ...row, revision: 3, bodyMarkdown: 'next' };
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[updated], 1]);

    await expect(
      createService(query).save({
        ...identity,
        expectedRevision: 2,
        body: { markdown: 'next', blocknote: null },
      }),
    ).resolves.toEqual({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'next', blocknote: null },
    });
  });

  it('keeps a missing clear virtual and creates the first row only for a non-null save', async () => {
    const clearQuery = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await expect(
      createService(clearQuery).save({
        ...identity,
        expectedRevision: 0,
        body: null,
      }),
    ).resolves.toEqual({ status: 'SAVED', revision: 0, body: null });
    expect(
      clearQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO'),
      ),
    ).toBe(false);

    const created = {
      ...row,
      revision: 1,
      bodyMarkdown: 'first',
      reviewedContextFingerprint: null,
    };
    const createQuery = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([created]);
    await expect(
      createService(createQuery).save({
        ...identity,
        expectedRevision: 0,
        body: { markdown: 'first', blocknote: null },
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 1 });
  });

  it('keeps missing review virtual and uses the review UPDATE tuple for an existing row', async () => {
    const missingQuery = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await expect(
      createService(missingQuery).review({
        ...identity,
        reviewedContextFingerprint: 'c'.repeat(64),
      }),
    ).resolves.toMatchObject({ draftId: null, revision: 0 });
    expect(
      missingQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO'),
      ),
    ).toBe(false);

    const reviewed = { ...row, reviewedContextFingerprint: 'c'.repeat(64) };
    const existingQuery = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[reviewed], 1]);
    await expect(
      createService(existingQuery).review({
        ...identity,
        reviewedContextFingerprint: 'c'.repeat(64),
      }),
    ).resolves.toMatchObject({ reviewedContextFingerprint: 'c'.repeat(64) });
  });

  it('uses the full anchored identity tuple for the advisory lock and CAS predicates', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[{ ...row, revision: 3 }], 1]);

    await createService(query).save({
      ...identity,
      expectedRevision: 2,
      body: { markdown: 'next', blocknote: null },
    });

    expect(query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        'myah-reply-context:10000000-0000-4000-8000-000000000001:CREATOR:10000000-0000-4000-8000-000000000002:EMAIL:10000000-0000-4000-8000-000000000003:CAMPAIGN:10000000-0000-4000-8000-000000000004',
      ],
    ]);
    expect(query.mock.calls[2][0]).toContain(
      '"campaignId" IS NOT DISTINCT FROM $7::uuid',
    );
    expect(query.mock.calls[2][1]).toEqual([
      identity.workspaceId,
      identity.contactAnchorKind,
      identity.contactAnchorId,
      identity.channel,
      identity.deliveryTargetId,
      identity.context.kind,
      identity.context.campaignId,
      'next',
      null,
      null,
      false,
      2,
      row.id,
    ]);
  });

  it('preserves fingerprints and revision lineage when clearing an existing draft', async () => {
    const cleared = { ...row, revision: 3, bodyMarkdown: null };
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[cleared], 1]);

    await expect(
      createService(query).save({
        ...identity,
        expectedRevision: 2,
        body: null,
      }),
    ).resolves.toEqual({ status: 'SAVED', revision: 3, body: null });
    expect(query.mock.calls[2][0]).toContain('WHEN $11::boolean THEN NULL');
    expect(query.mock.calls[2][0]).toContain(
      'ELSE "reviewedContextFingerprint"',
    );
    expect(query.mock.calls[2][1][10]).toBe(false);
  });

  it('clears proposal and review acknowledgement when requested', async () => {
    const cleared = {
      ...row,
      revision: 3,
      proposalContextFingerprint: null,
      reviewedContextFingerprint: null,
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[cleared], 1]);

    await expect(
      createService(query).save({
        ...identity,
        expectedRevision: 2,
        body: { markdown: 'chat edit', blocknote: null },
        clearContextAcknowledgement: true,
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 3 });
    expect(query.mock.calls[2][1][10]).toBe(true);
    expect(query.mock.calls[2][0]).toContain(
      'WHEN $10::varchar IS NOT NULL OR $11::boolean THEN NULL',
    );
  });

  it('rejects malformed proposal and review fingerprints before querying', async () => {
    const proposalQuery = jest.fn();
    await expect(
      createService(proposalQuery).save({
        ...identity,
        expectedRevision: 0,
        body: { markdown: 'proposal', blocknote: null },
        proposalContextFingerprint: 'not-a-fingerprint',
      }),
    ).rejects.toThrow('Invalid reply context fingerprint');
    expect(proposalQuery).not.toHaveBeenCalled();

    const reviewQuery = jest.fn();
    await expect(
      createService(reviewQuery).review({
        ...identity,
        reviewedContextFingerprint: 'A'.repeat(64),
      }),
    ).rejects.toThrow('Invalid reply context fingerprint');
    expect(reviewQuery).not.toHaveBeenCalled();
  });

  it('rejects unsupported channel and contact-anchor combinations before querying', async () => {
    const query = jest.fn();

    await expect(
      createService(query).save({
        ...identity,
        contactAnchorKind: 'INSTAGRAM_CONVERSATION',
        expectedRevision: 0,
        body: { markdown: 'invalid', blocknote: null },
      }),
    ).rejects.toThrow('Invalid reply context draft identity');
    expect(query).not.toHaveBeenCalled();
  });

  it('clears a reviewed override only when applying a new proposal', async () => {
    const updated = {
      ...row,
      revision: 3,
      bodyMarkdown: 'proposal',
      proposalContextFingerprint: 'd'.repeat(64),
      reviewedContextFingerprint: null,
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[updated], 1]);

    await expect(
      createService(query).save({
        ...identity,
        expectedRevision: 2,
        body: { markdown: 'proposal', blocknote: null },
        proposalContextFingerprint: 'd'.repeat(64),
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 3 });

    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE core.'),
    );
    expect(update?.[0]).toContain('"reviewedContextFingerprint" = CASE');
  });
});

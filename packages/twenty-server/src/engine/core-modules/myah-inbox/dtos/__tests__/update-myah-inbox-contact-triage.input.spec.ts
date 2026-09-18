import { validate } from 'class-validator';

import {
  assertValidMyahInboxContactTriageUpdate,
  UpdateMyahInboxContactTriageInput,
} from 'src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-contact-triage.input';

describe('UpdateMyahInboxContactTriageInput', () => {
  it.each(['0', '-1', '+1', '1.5', 'abc', ' 1'])(
    'rejects non-positive decimal bigint identity generation %p',
    async (generation) => {
      const input = Object.assign(new UpdateMyahInboxContactTriageInput(), {
        expectedWorkspaceId: '00000000-0000-4000-8000-000000000001',
        contactId: 'contact-id',
        expectedRevision: 1,
        expectedIdentityGeneration: generation,
      });

      await expect(validate(input)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'expectedIdentityGeneration' }),
        ]),
      );
    },
  );

  it('accepts a positive decimal bigint identity generation', async () => {
    const input = Object.assign(new UpdateMyahInboxContactTriageInput(), {
      expectedWorkspaceId: '00000000-0000-4000-8000-000000000001',
      contactId: 'contact-id',
      expectedRevision: 1,
      expectedIdentityGeneration: '9223372036854775807',
      inboxOwnerId: null,
    });

    await expect(validate(input)).resolves.toEqual([]);
  });

  it.each(['9223372036854775808', '9999999999999999999'])(
    'rejects identity generation above the PostgreSQL bigint maximum %p',
    async (generation) => {
      const input = Object.assign(new UpdateMyahInboxContactTriageInput(), {
        expectedWorkspaceId: '00000000-0000-4000-8000-000000000001',
        contactId: 'contact-id',
        expectedRevision: 1,
        expectedIdentityGeneration: generation,
        inboxOwnerId: null,
      });

      await expect(validate(input)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'expectedIdentityGeneration' }),
        ]),
      );
    },
  );

  it('accepts an owner-only patch with an explicit null snooze as omission', async () => {
    const input = Object.assign(new UpdateMyahInboxContactTriageInput(), {
      expectedWorkspaceId: '00000000-0000-4000-8000-000000000001',
      contactId: 'contact-id',
      expectedRevision: 1,
      expectedIdentityGeneration: '1',
      inboxOwnerId: '00000000-0000-4000-8000-000000000002',
      snoozedUntil: null,
    });

    await expect(validate(input)).resolves.toEqual([]);
    expect(() => assertValidMyahInboxContactTriageUpdate(input)).not.toThrow();
  });

  it('accepts a deadline supplied for a non-Snoozed state, which the server clears', async () => {
    const input = Object.assign(new UpdateMyahInboxContactTriageInput(), {
      expectedWorkspaceId: '00000000-0000-4000-8000-000000000001',
      contactId: 'contact-id',
      expectedRevision: 1,
      expectedIdentityGeneration: '1',
      inboxState: 'CLOSED',
      snoozedUntil: '2099-01-01T00:00:00.000Z',
    });

    await expect(validate(input)).resolves.toEqual([]);
    expect(() => assertValidMyahInboxContactTriageUpdate(input)).not.toThrow();
  });

  it.each([
    {},
    { inboxState: 'SNOOZED' },
    { snoozedUntil: '2099-01-01T00:00:00.000Z' },
    {
      inboxState: 'SNOOZED',
      snoozedUntil: '2020-01-01T00:00:00.000Z',
    },
  ])('rejects invalid triage patches %p', async (patch) => {
    const input = Object.assign(new UpdateMyahInboxContactTriageInput(), {
      expectedWorkspaceId: '00000000-0000-4000-8000-000000000001',
      contactId: 'contact-id',
      expectedRevision: 1,
      expectedIdentityGeneration: '1',
      ...patch,
    });

    await expect(validate(input)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'expectedRevision' }),
      ]),
    );
  });
});

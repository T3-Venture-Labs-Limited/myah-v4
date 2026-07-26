import { ActionReceiptRedactionService } from 'src/engine/core-modules/action-approval/services/action-receipt-redaction.service';

describe('ActionReceiptRedactionService', () => {
  const service = new ActionReceiptRedactionService();

  it('only exposes stable receipt outcome fields', () => {
    const receipt = service.toSafeReceipt({
      id: 'receipt-id',
      workspaceId: 'workspace-id',
      state: 'PROVIDER_ACCEPTED',
      providerCode: 'accepted',
      redactedOutcome: 'accepted',
      createdAt: new Date('2026-07-16T00:00:00.000Z'),
      updatedAt: new Date('2026-07-16T00:01:00.000Z'),
      providerMessageId: 'provider-private-id',
      providerResponse: {
        body: 'message body',
        preview: 'message preview',
        oauth: 'secret',
        apiKey: 'secret',
        authorization: 'Bearer secret',
        token: 'secret',
        url: 'https://provider.example/messages',
        error: 'raw provider error',
      },
    });

    expect(receipt).toEqual({
      id: 'receipt-id',
      workspaceId: 'workspace-id',
      state: 'PROVIDER_ACCEPTED',
      providerCode: 'accepted',
      outcome: 'accepted',
      occurredAt: new Date('2026-07-16T00:01:00.000Z'),
    });
    expect(JSON.stringify(receipt)).not.toMatch(
      /body|preview|oauth|apiKey|authorization|token|provider-private-id|provider\.example|raw provider error/i,
    );
  });

  it('accepts only explicit provider outcome codes', () => {
    for (const code of ['accepted', 'queued']) {
      expect(() =>
        service.toAcceptedProviderOutcome({
          code,
          acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
        }),
      ).not.toThrow();
    }

    for (const code of [
      'Bearer secret',
      'constructor',
      'toString',
      '__proto__',
      'arbitrary',
    ]) {
      expect(() =>
        service.toAcceptedProviderOutcome({
          code,
          acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
        }),
      ).toThrow('Unsafe provider outcome');
    }
  });

  it('keeps safe provider identifiers internally', () => {
    expect(
      service.toAcceptedProviderOutcome({
        code: 'accepted',
        acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
        providerMessageId: '<message@example.com>',
        providerExternalMessageId: 'provider-message-id',
        providerThreadExternalId: 'provider-thread-id',
      }),
    ).toEqual({
      code: 'accepted',
      acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
      providerMessageId: '<message@example.com>',
      providerExternalMessageId: 'provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
    });
  });

  it.each(['message\r\nBcc: secret@example.com', 'x'.repeat(999)])(
    'rejects an unsafe provider message id',
    (providerMessageId) => {
      expect(() =>
        service.toAcceptedProviderOutcome({
          code: 'accepted',
          acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
          providerMessageId,
        }),
      ).toThrow('Unsafe provider message id');
    },
  );

  it.each([
    ['external message', { providerExternalMessageId: 'unsafe\r\nid' }],
    ['thread', { providerThreadExternalId: 'x'.repeat(999) }],
  ])('rejects an unsafe provider %s id', (label, identifiers) => {
    expect(() =>
      service.toAcceptedProviderOutcome({
        code: 'accepted',
        acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
        ...identifiers,
      }),
    ).toThrow(`Unsafe provider ${label} id`);
  });
});

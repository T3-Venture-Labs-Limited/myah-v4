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

  it('rejects provider outcomes outside the safe allowlist', () => {
    expect(() =>
      service.toAcceptedProviderOutcome({
        code: 'accepted',
        acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
      }),
    ).not.toThrow();
    expect(() =>
      service.toAcceptedProviderOutcome({
        code: 'Bearer secret',
        acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
      }),
    ).toThrow('Unsafe provider outcome');
  });
});

import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';

describe('ActionReceiptProjectorService', () => {
  const receipt = {
    id: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
    state: 'PROVIDER_ACCEPTED',
    actionApprovalBinding: {
      draftId: '00000000-0000-4000-8000-000000000003',
      contentDigest: 'a'.repeat(64),
    },
  };

  it('projects by receipt id, retries an idempotent projection after the post-projection boundary, and then marks sent', async () => {
    let storedState = receipt.state;
    const writes = new Set<string>();
    const writer = {
      project: jest.fn(async ({ receiptId }: { receiptId: string }) => {
        writes.add(receiptId);
      }),
    };
    const repository = {
      findOne: jest.fn(async () => ({ ...receipt, state: storedState })),
      update: jest.fn().mockImplementation(async () => {
        storedState = 'SENT';
        return { affected: 1 };
      }),
    };
    const service = new ActionReceiptProjectorService(
      repository as never,
      writer,
    );

    await expect(
      service.projectReceipt(receipt.id, {
        afterWorkspaceProjection: async () => {
          throw new Error('lost after workspace projection');
        },
      }),
    ).rejects.toThrow('lost after workspace projection');
    expect(writes).toEqual(new Set([receipt.id]));

    await expect(service.projectReceipt(receipt.id)).resolves.toEqual({
      projected: true,
    });
    expect(writes).toEqual(new Set([receipt.id]));
    expect(repository.update).toHaveBeenCalledWith(
      { id: receipt.id, state: 'PROVIDER_ACCEPTED' },
      { state: 'SENT' },
    );
  });

  it('does not project any state except PROVIDER_ACCEPTED', async () => {
    const writer = { project: jest.fn() };
    const repository = {
      findOne: jest.fn(async () => ({ ...receipt, state: 'UNKNOWN' })),
      update: jest.fn(),
    };
    const service = new ActionReceiptProjectorService(
      repository as never,
      writer,
    );

    await expect(service.projectReceipt(receipt.id)).resolves.toEqual({
      projected: false,
    });
    expect(writer.project).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
});

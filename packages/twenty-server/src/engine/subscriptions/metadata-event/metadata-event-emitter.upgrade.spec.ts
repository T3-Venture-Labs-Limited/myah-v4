import { MetadataEventEmitter } from 'src/engine/subscriptions/metadata-event/metadata-event-emitter';

describe('pinned metadata event delivery', () => {
  it('waits for the asynchronous subscriber before returning', async () => {
    let release!: () => void;
    const listener = new Promise<void>((resolve) => {
      release = resolve;
    });
    const emit = jest.fn();
    const emitAsync = jest.fn().mockReturnValue(listener);
    const emitter = new MetadataEventEmitter({ emit, emitAsync } as never);
    const batch = {
      workspaceId: '20202020-0000-4000-8000-000000000001',
      metadataEvents: [{ metadataName: 'fieldMetadata', type: 'updated' }],
    };
    let finished = false;
    const delivery = emitter
      .emitMetadataEventsAsync(batch as never)
      .then(() => {
        finished = true;
      });

    expect(emitAsync).toHaveBeenCalledWith(
      'metadata.fieldMetadata.updated',
      expect.objectContaining({ workspaceId: batch.workspaceId }),
    );
    expect(finished).toBe(false);
    expect(emit).not.toHaveBeenCalled();
    release();
    await delivery;
    expect(finished).toBe(true);
  });
});

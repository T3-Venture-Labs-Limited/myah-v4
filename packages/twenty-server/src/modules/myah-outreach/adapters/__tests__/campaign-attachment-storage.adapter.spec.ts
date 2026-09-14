import { once, PassThrough, Readable } from 'stream';

import bytes from 'bytes';
import { FileFolder } from 'twenty-shared/types';

import { settings } from 'src/engine/constants/settings';
import { type FileService } from 'src/engine/core-modules/file/services/file.service';
import { CampaignAttachmentStorageAdapter } from 'src/modules/myah-outreach/adapters/campaign-attachment-storage.adapter';
import { type CampaignSequenceEmailFile } from 'src/modules/myah-outreach/types/campaign-message-render.type';

const workspaceId = '20202020-1111-4111-8111-111111111111';
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: '20202020-2222-4222-8222-222222222222',
  workspaceMemberId: '20202020-3333-4333-8333-333333333333',
  user: { id: '20202020-4444-4444-8444-444444444444' },
  workspaceMember: {},
} as never;
const file: CampaignSequenceEmailFile = {
  id: '20202020-5555-4555-8555-555555555555',
  name: 'brief.txt',
  type: 'text/plain',
  size: 5,
  createdAt: '2026-09-07T00:00:00.000Z',
};

class DelayedDestroyErrorStream extends Readable {
  destroyErrorListenerCount: number | null = null;
  readonly destroyStarted: Promise<void>;
  private destroyCallback: ((error?: Error | null) => void) | null = null;
  private didPushContent = false;
  private resolveDestroyStarted: () => void = () => undefined;

  constructor(
    private readonly content: Buffer,
    private readonly endAfterContent = false,
  ) {
    super();
    this.destroyStarted = new Promise<void>((resolve) => {
      this.resolveDestroyStarted = resolve;
    });
  }

  override _read(): void {
    if (!this.didPushContent) {
      this.didPushContent = true;
      this.push(this.content);

      if (this.endAfterContent) {
        this.push(null);
      }
    }
  }

  override _destroy(
    _error: Error | null,
    callback: (error?: Error | null) => void,
  ): void {
    this.destroyCallback = callback;
    this.resolveDestroyStarted();
  }

  completeDestroyWithError(): void {
    if (this.destroyCallback === null) {
      throw new Error('Destruction has not started');
    }

    this.destroyErrorListenerCount = this.listenerCount('error');

    // Keep a failing implementation from crashing Jest while preserving
    // the listener-count observation made before this test-only guard.
    if (this.destroyErrorListenerCount === 0) {
      this.once('error', () => undefined);
    }

    const callback = this.destroyCallback;

    this.destroyCallback = null;
    callback(new Error('delayed destroy failure'));
  }
}

const delayedDestroyErrorStream = (
  content: Buffer,
  endAfterContent = false,
) => {
  const stream = new DelayedDestroyErrorStream(content, endAfterContent);
  const closed = new Promise<void>((resolve) => {
    stream.once('close', resolve);
  });

  return {
    closed,
    destroyErrorListenerCount: () => stream.destroyErrorListenerCount,
    stream,
  };
};

const flushMicrotasks = async (): Promise<void> => {
  jest.runAllTicks();
  await Promise.resolve();
  jest.runAllTicks();
  await Promise.resolve();
};

describe('CampaignAttachmentStorageAdapter', () => {
  const getFileStreamById = jest.fn();
  const adapter = new CampaignAttachmentStorageAdapter({
    getFileStreamById,
  } as unknown as FileService);

  beforeEach(() => {
    jest.clearAllMocks();
    getFileStreamById.mockResolvedValue({
      mimeType: 'text/plain',
      stream: Readable.from(Buffer.from('hello')),
    });
  });

  it('loads exact bounded Workflow File bytes once', async () => {
    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({
      kind: 'READY',
      value: {
        bytes: Buffer.from('hello'),
        contentType: 'text/plain',
        filename: 'brief.txt',
      },
    });

    expect(getFileStreamById).toHaveBeenCalledTimes(1);
    expect(getFileStreamById).toHaveBeenCalledWith({
      allowedFileFolders: [FileFolder.Workflow],
      fileId: file.id,
      workspaceId,
    });
  });

  it.each([
    ['workspace mismatch', { workspaceId: 'other-workspace', file }],
    [
      'oversized authored File',
      {
        workspaceId,
        file: {
          ...file,
          size: (bytes(settings.storage.maxFileSize) ?? 0) + 1,
        },
      },
    ],
    ['malformed authored File', { workspaceId, file: { ...file, id: '' } }],
  ])('blocks %s before File access', async (_label, input) => {
    await expect(adapter.load({ authContext, ...input })).resolves.toEqual({
      kind: 'FORBIDDEN',
    });
    expect(getFileStreamById).not.toHaveBeenCalled();
  });

  it('maps an inaccessible File to NOT_FOUND without cause disclosure', async () => {
    getFileStreamById.mockResolvedValue(null);

    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({ kind: 'NOT_FOUND' });
  });

  it('destroys an unread stream on MIME mismatch without buffering it', async () => {
    const stream = new Readable({ read: jest.fn() });
    const destroy = jest.spyOn(stream, 'destroy');

    getFileStreamById.mockResolvedValue({
      mimeType: 'application/json',
      stream,
    });

    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({ kind: 'CHANGED' });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(stream.readableDidRead).toBe(false);
  });

  it('returns CHANGED without cause disclosure when rejection destroy throws', async () => {
    const stream = new Readable({ read: jest.fn() });

    jest.spyOn(stream, 'destroy').mockImplementation(() => {
      throw new Error('secret destroy path');
    });
    getFileStreamById.mockResolvedValue({
      mimeType: 'application/json',
      stream,
    });

    const result = await adapter.load({ authContext, file, workspaceId });

    expect(result).toEqual({ kind: 'CHANGED' });
    expect(JSON.stringify(result)).not.toContain('secret destroy path');
    expect(stream.readableDidRead).toBe(false);
  });

  it('protects a queued destroy error when acquired closed before MIME rejection', async () => {
    const stream = new Readable({
      read: () => undefined,
      destroy: (error, callback) => callback(error),
    });
    const closed = new Promise<void>((resolve) => {
      stream.once('close', resolve);
    });
    let adapterGuardPresentDuringError = false;

    stream.once('error', () => {
      adapterGuardPresentDuringError = stream.listenerCount('error') > 0;
    });

    const result = Promise.resolve().then(async () => {
      stream.destroy(new Error('queued destroy failure'));
      expect(stream.closed).toBe(true);
      getFileStreamById.mockResolvedValue({
        mimeType: 'application/json',
        stream,
      });

      return await adapter.load({ authContext, file, workspaceId });
    });

    await expect(result).resolves.toEqual({ kind: 'CHANGED' });
    await closed;
    await flushMicrotasks();

    expect(adapterGuardPresentDuringError).toBe(true);
    expect(stream.listenerCount('error')).toBe(0);
  });

  it('protects a reentrant error through the MIME rejection close dispatch', async () => {
    const stream = new Readable({ read: jest.fn() });
    const testErrorGuard = () => undefined;
    let guardCountDuringClose = 0;

    getFileStreamById.mockResolvedValue({
      mimeType: 'application/json',
      stream,
    });

    const result = adapter.load({ authContext, file, workspaceId });

    await flushMicrotasks();
    stream.on('error', testErrorGuard);
    const closed = new Promise<void>((resolve) => {
      stream.once('close', () => {
        guardCountDuringClose = stream.listenerCount('error');
        stream.emit('error', new Error('reentrant close failure'));
        resolve();
      });
    });

    await expect(result).resolves.toEqual({ kind: 'CHANGED' });
    await closed;
    await flushMicrotasks();
    stream.removeListener('error', testErrorGuard);

    expect(guardCountDuringClose).toBeGreaterThan(1);
    expect(stream.listenerCount('error')).toBe(0);
  });

  it('accepts an exact zero-byte File', async () => {
    getFileStreamById.mockResolvedValue({
      mimeType: 'text/plain',
      stream: Readable.from(Buffer.alloc(0)),
    });

    await expect(
      adapter.load({
        authContext,
        file: { ...file, size: 0 },
        workspaceId,
      }),
    ).resolves.toEqual({
      kind: 'READY',
      value: {
        bytes: Buffer.alloc(0),
        contentType: 'text/plain',
        filename: 'brief.txt',
      },
    });
  });

  it('destroys and rejects a stream that exceeds the authored size', async () => {
    const stream = Readable.from(Buffer.from('hello!'));
    const destroy = jest.spyOn(stream, 'destroy');

    getFileStreamById.mockResolvedValue({ mimeType: 'text/plain', stream });

    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({ kind: 'CHANGED' });
    expect(destroy).toHaveBeenCalled();
  });

  it('protects a delayed destruction error after authored-size overrun', async () => {
    const observed = delayedDestroyErrorStream(Buffer.from('hello!'));

    getFileStreamById.mockResolvedValue({
      mimeType: 'text/plain',
      stream: observed.stream,
    });
    const result = adapter.load({ authContext, file, workspaceId });

    await observed.stream.destroyStarted;
    observed.stream.completeDestroyWithError();

    await expect(result).resolves.toEqual({ kind: 'CHANGED' });
    await observed.closed;
    await flushMicrotasks();

    expect(observed.destroyErrorListenerCount()).toBeGreaterThan(0);
    expect(observed.stream.closed).toBe(true);
    expect(observed.stream.listenerCount('error')).toBe(0);
  });

  it('protects a delayed destruction error after MIME rejection', async () => {
    const observed = delayedDestroyErrorStream(Buffer.from('hello'));

    getFileStreamById.mockResolvedValue({
      mimeType: 'application/json',
      stream: observed.stream,
    });
    const result = adapter.load({ authContext, file, workspaceId });

    await observed.stream.destroyStarted;
    observed.stream.completeDestroyWithError();

    await expect(result).resolves.toEqual({ kind: 'CHANGED' });
    await observed.closed;
    await flushMicrotasks();

    expect(observed.destroyErrorListenerCount()).toBeGreaterThan(0);
    expect(observed.stream.closed).toBe(true);
    expect(observed.stream.readableDidRead).toBe(false);
    expect(observed.stream.listenerCount('error')).toBe(0);
  });

  it('protects a delayed auto-destroy error after exact-byte EOF', async () => {
    const observed = delayedDestroyErrorStream(Buffer.from('hello'), true);

    getFileStreamById.mockResolvedValue({
      mimeType: 'text/plain',
      stream: observed.stream,
    });
    const result = adapter.load({ authContext, file, workspaceId });

    await observed.stream.destroyStarted;
    observed.stream.completeDestroyWithError();

    await expect(result).resolves.toEqual({
      kind: 'READY',
      value: {
        bytes: Buffer.from('hello'),
        contentType: 'text/plain',
        filename: 'brief.txt',
      },
    });
    await observed.closed;
    await flushMicrotasks();

    expect(observed.destroyErrorListenerCount()).toBeGreaterThan(0);
    expect(observed.stream.closed).toBe(true);
    expect(observed.stream.listenerCount('error')).toBe(0);
  });

  it('returns CHANGED when authored-size overrun destroy throws', async () => {
    const stream = new PassThrough();
    const destroy = jest.spyOn(stream, 'destroy').mockImplementation(() => {
      throw new Error('secret overrun destroy path');
    });

    getFileStreamById.mockResolvedValue({ mimeType: 'text/plain', stream });

    const result = adapter.load({ authContext, file, workspaceId });
    let outcome: Awaited<typeof result> | undefined;
    let dispatchError: unknown;

    void result.then((value) => {
      outcome = value;
    });
    await flushMicrotasks();

    try {
      stream.write(Buffer.from('hello!'));
    } catch (error) {
      dispatchError = error;
    }

    await flushMicrotasks();

    if (dispatchError === undefined) {
      outcome = await result;
    }

    destroy.mockRestore();
    stream.destroy();

    expect(dispatchError).toBeUndefined();
    expect(outcome).toEqual({ kind: 'CHANGED' });
    expect(JSON.stringify(outcome)).not.toContain(
      'secret overrun destroy path',
    );
  });

  it('returns without waiting when rejected destruction emits no terminal event', async () => {
    const stream = new Readable({ emitClose: false, read: jest.fn() });

    getFileStreamById.mockResolvedValue({
      mimeType: 'application/json',
      stream,
    });

    const result = adapter.load({ authContext, file, workspaceId });
    let outcome: Awaited<typeof result> | undefined;

    void result.then((value) => {
      outcome = value;
    });
    await Promise.resolve();
    await Promise.resolve();
    const settledBeforeTerminalEvent = outcome !== undefined;

    if (!settledBeforeTerminalEvent) {
      stream.emit('close');
      await result;
    }

    expect(settledBeforeTerminalEvent).toBe(true);
    expect(outcome).toEqual({ kind: 'CHANGED' });
    expect(stream.destroyed).toBe(true);
  });

  it('rejects a stream shorter than the authored size', async () => {
    getFileStreamById.mockResolvedValue({
      mimeType: 'text/plain',
      stream: Readable.from(Buffer.from('four')),
    });

    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({ kind: 'CHANGED' });
  });

  it('fails closed and destroys an already-ended stream when possible', async () => {
    const stream = Readable.from(Buffer.from('hello'));

    stream.resume();
    await once(stream, 'end');
    getFileStreamById.mockResolvedValue({ mimeType: 'text/plain', stream });

    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({ kind: 'CHANGED' });
    expect(stream.destroyed).toBe(true);
  });

  it('fails closed on a stream error without an unhandled late error', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('secret storage path'));
      },
    });
    const destroy = jest.spyOn(stream, 'destroy');

    getFileStreamById.mockResolvedValue({ mimeType: 'text/plain', stream });

    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({ kind: 'CHANGED' });
    expect(destroy).toHaveBeenCalled();
  });

  it('fails closed on premature close', async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.from('he'));
        this.destroy();
      },
    });

    getFileStreamById.mockResolvedValue({ mimeType: 'text/plain', stream });

    await expect(
      adapter.load({ authContext, file, workspaceId }),
    ).resolves.toEqual({ kind: 'CHANGED' });
  });

  it('maps unexpected FileService failure to FORBIDDEN without leaking it', async () => {
    getFileStreamById.mockRejectedValue(new Error('secret storage path'));

    const result = await adapter.load({ authContext, file, workspaceId });

    expect(result).toEqual({ kind: 'FORBIDDEN' });
    expect(JSON.stringify(result)).not.toContain('secret storage path');
  });
});

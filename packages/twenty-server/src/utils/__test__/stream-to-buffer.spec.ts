import { PassThrough, Readable } from 'stream';

import { streamToBuffer } from 'src/utils/stream-to-buffer';

class DelayedDestroyErrorStream extends Readable {
  destroyErrorListenerCount: number | null = null;
  readonly destroyStarted: Promise<void>;
  private destroyCallback: ((error?: Error | null) => void) | null = null;
  private didPushContent = false;
  private resolveDestroyStarted: () => void = () => undefined;

  constructor(private readonly content: Buffer) {
    super();
    this.destroyStarted = new Promise<void>((resolve) => {
      this.resolveDestroyStarted = resolve;
    });
  }

  override _read(): void {
    if (!this.didPushContent) {
      this.didPushContent = true;
      this.push(this.content);
      this.push(null);
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

    if (this.destroyErrorListenerCount === 0) {
      this.once('error', () => undefined);
    }

    const callback = this.destroyCallback;

    this.destroyCallback = null;
    callback(new Error('delayed destroy failure'));
  }
}

const waitForClose = (stream: Readable): Promise<void> =>
  new Promise((resolve) => {
    stream.once('close', resolve);
  });

const flushMicrotasks = async (): Promise<void> => {
  jest.runAllTicks();
  await Promise.resolve();
  jest.runAllTicks();
  await Promise.resolve();
};

describe('streamToBuffer', () => {
  describe('successful scenarios', () => {
    it('should convert a stream with single chunk to buffer', async () => {
      const testData = 'Hello, World!';
      const stream = Readable.from([Buffer.from(testData)]);

      const result = await streamToBuffer(stream);

      expect(result.toString()).toBe(testData);
    });

    it('should convert a stream with multiple chunks to buffer', async () => {
      const chunks = ['Hello, ', 'World', '!'];
      const stream = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));

      const result = await streamToBuffer(stream);

      expect(result.toString()).toBe('Hello, World!');
    });

    it('should handle empty stream', async () => {
      const stream = Readable.from([]);

      const result = await streamToBuffer(stream);

      expect(result.length).toBe(0);
      expect(result.toString()).toBe('');
    });

    it('protects a delayed auto-destroy error after exact EOF', async () => {
      const stream = new DelayedDestroyErrorStream(Buffer.from('hello'));
      const closed = waitForClose(stream);
      const promise = streamToBuffer(stream);
      let settlementCount = 0;

      void promise.then(() => {
        settlementCount += 1;
      });

      await stream.destroyStarted;
      await expect(promise).resolves.toEqual(Buffer.from('hello'));

      expect(stream.listenerCount('data')).toBe(0);
      expect(stream.listenerCount('end')).toBe(0);
      expect(stream.listenerCount('close')).toBe(2);
      expect(stream.listenerCount('error')).toBeGreaterThan(0);

      stream.completeDestroyWithError();
      await closed;
      await flushMicrotasks();

      expect(stream.destroyErrorListenerCount).toBeGreaterThan(0);
      expect(stream.listenerCount('error')).toBe(0);
      expect(settlementCount).toBe(1);
    });

    it('protects a reentrant error during close after prior end settlement', async () => {
      const stream = new PassThrough();
      const promise = streamToBuffer(stream);
      const testErrorGuard = () => undefined;
      let guardCountDuringClose = 0;
      let settlementCount = 0;

      void promise.then(() => {
        settlementCount += 1;
      });
      stream.on('error', testErrorGuard);
      const closed = new Promise<void>((resolve) => {
        stream.once('close', () => {
          guardCountDuringClose = stream.listenerCount('error');
          stream.emit('error', new Error('reentrant close failure'));
          resolve();
        });
      });

      stream.end(Buffer.from('hello'));

      await expect(promise).resolves.toEqual(Buffer.from('hello'));
      await closed;
      await flushMicrotasks();
      stream.removeListener('error', testErrorGuard);

      expect(guardCountDuringClose).toBeGreaterThan(1);
      expect(stream.listenerCount('error')).toBe(0);
      expect(settlementCount).toBe(1);
    });

    it('preserves close-after-readable-EOF resolution', async () => {
      const stream = new PassThrough();
      let readableEndedReadCount = 0;

      Object.defineProperty(stream, 'readableEnded', {
        configurable: true,
        get: () => readableEndedReadCount++ > 0,
      });

      const promise = streamToBuffer(stream);

      stream.emit('close');

      await expect(promise).resolves.toEqual(Buffer.alloc(0));
      await flushMicrotasks();
      expect(stream.listenerCount('error')).toBe(0);
    });
  });

  describe('error scenarios', () => {
    it('should reject when stream is already ended', async () => {
      const stream = Readable.from([Buffer.from('test')]);

      await streamToBuffer(stream);

      await expect(streamToBuffer(stream)).rejects.toThrow(
        'Stream has already ended',
      );
    });

    it('protects an already-ended autoDestroy:false stream until future close', async () => {
      const stream = Readable.from([Buffer.from('test')], {
        autoDestroy: false,
      });

      await streamToBuffer(stream);
      await expect(streamToBuffer(stream)).rejects.toThrow(
        'Stream has already ended',
      );

      expect(stream.listenerCount('error')).toBe(2);

      const closed = waitForClose(stream);

      stream.destroy();
      await closed;
      await flushMicrotasks();

      expect(stream.listenerCount('error')).toBe(0);
    });

    it('should reject when stream is not readable (destroyed)', async () => {
      const stream = new PassThrough();

      stream.destroy();

      await expect(streamToBuffer(stream)).rejects.toThrow(
        'Stream is not readable',
      );
    });

    it('retains a guard when close was already delivered at acquisition', async () => {
      const stream = new PassThrough();
      const closed = waitForClose(stream);

      stream.destroy();
      await closed;

      await expect(streamToBuffer(stream)).rejects.toThrow(
        'Stream is not readable',
      );
      expect(stream.listenerCount('error')).toBe(1);
      expect(stream.listenerCount('close')).toBe(1);

      stream.removeAllListeners();
    });

    it('protects a queued destroy error when closed is already true', async () => {
      const stream = new Readable({
        read: () => undefined,
        destroy: (error, callback) => callback(error),
      });
      const closed = waitForClose(stream);
      let helperGuardPresentDuringError = false;

      stream.once('error', () => {
        helperGuardPresentDuringError = stream.listenerCount('error') > 0;
      });
      stream.destroy(new Error('queued destroy failure'));

      expect(stream.closed).toBe(true);

      const promise = streamToBuffer(stream);

      await expect(promise).rejects.toThrow('Stream is not readable');
      await closed;
      await flushMicrotasks();

      expect(helperGuardPresentDuringError).toBe(true);
      expect(stream.listenerCount('error')).toBe(0);
    });

    it('should reject when stream emits an error', async () => {
      const stream = new PassThrough();
      const testError = new Error('Stream error');
      const promise = streamToBuffer(stream);
      let settlementCount = 0;

      void promise.catch(() => {
        settlementCount += 1;
      });
      stream.write(Buffer.from('partial'));
      stream.emit('error', testError);

      await expect(promise).rejects.toThrow('Stream error');

      expect(stream.listenerCount('data')).toBe(0);
      expect(stream.listenerCount('end')).toBe(0);
      expect(stream.listenerCount('close')).toBe(1);
      expect(stream.listenerCount('error')).toBe(1);
      expect(settlementCount).toBe(1);

      const closed = waitForClose(stream);

      stream.destroy();
      await closed;
      await flushMicrotasks();

      expect(stream.listenerCount('error')).toBe(0);
      expect(settlementCount).toBe(1);
    });

    it('should reject when stream closes before end', async () => {
      const stream = new PassThrough();
      const promise = streamToBuffer(stream);

      stream.write(Buffer.from('data'));
      stream.destroy();

      await expect(promise).rejects.toThrow('Stream closed before end');
    });

    it('protects a reentrant error during the close that rejects consumption', async () => {
      const stream = new PassThrough();
      const promise = streamToBuffer(stream);
      const testErrorGuard = () => undefined;
      let guardCountDuringClose = 0;
      let settlementCount = 0;

      void promise.catch(() => {
        settlementCount += 1;
      });
      stream.on('error', testErrorGuard);
      const closed = new Promise<void>((resolve) => {
        stream.once('close', () => {
          guardCountDuringClose = stream.listenerCount('error');
          stream.emit('error', new Error('reentrant close failure'));
          resolve();
        });
      });

      stream.destroy();

      await expect(promise).rejects.toThrow('Stream closed before end');
      await closed;
      await flushMicrotasks();
      stream.removeListener('error', testErrorGuard);

      expect(guardCountDuringClose).toBeGreaterThan(1);
      expect(stream.listenerCount('error')).toBe(0);
      expect(settlementCount).toBe(1);
    });
  });

  describe('maxSizeBytes', () => {
    it('should accept stream within size limit', async () => {
      const data = 'Hello, World!';
      const stream = Readable.from([Buffer.from(data)]);

      const result = await streamToBuffer(stream, 100);

      expect(result.toString()).toBe(data);
    });

    it('should reject when stream exceeds maxSizeBytes', async () => {
      const stream = new PassThrough();
      const promise = streamToBuffer(stream, 10);

      stream.write(Buffer.from('12345'));
      stream.write(Buffer.from('678901'));

      await expect(promise).rejects.toThrow(
        'Stream exceeds maximum allowed size of 10 bytes',
      );
    });

    it('should reject on a single chunk exceeding maxSizeBytes', async () => {
      const stream = Readable.from([Buffer.from('this is too long')]);

      await expect(streamToBuffer(stream, 5)).rejects.toThrow(
        'Stream exceeds maximum allowed size of 5 bytes',
      );
    });

    it('should accept stream exactly at maxSizeBytes', async () => {
      const data = '12345';
      const stream = Readable.from([Buffer.from(data)]);

      const result = await streamToBuffer(stream, 5);

      expect(result.toString()).toBe(data);
    });

    it('rejects overflow exactly once even when destroy throws', async () => {
      const stream = new PassThrough();
      const destroy = jest.spyOn(stream, 'destroy').mockImplementation(() => {
        throw new Error('destroy failure');
      });
      const promise = streamToBuffer(stream, 5);
      let rejection: Error | undefined;
      let rejectionCount = 0;
      let dispatchError: unknown;

      void promise.catch((error: unknown) => {
        rejectionCount += 1;
        rejection = error instanceof Error ? error : new Error(String(error));
      });

      try {
        stream.write(Buffer.from('123456'));
      } catch (error) {
        dispatchError = error;
      }

      await flushMicrotasks();
      const closed = waitForClose(stream);

      destroy.mockRestore();
      stream.destroy();
      await closed;
      await flushMicrotasks();

      expect(dispatchError).toBeUndefined();
      expect(rejection?.message).toBe(
        'Stream exceeds maximum allowed size of 5 bytes',
      );
      expect(rejectionCount).toBe(1);
      expect(stream.listenerCount('data')).toBe(0);
      expect(stream.listenerCount('end')).toBe(0);
      expect(stream.listenerCount('error')).toBe(0);
    });

    it('rejects overflow without waiting for emitClose:false', async () => {
      const stream = new PassThrough({ emitClose: false });
      const promise = streamToBuffer(stream, 5);
      let rejection: Error | undefined;

      void promise.catch((error: unknown) => {
        rejection = error instanceof Error ? error : new Error(String(error));
      });
      stream.write(Buffer.from('123456'));
      await flushMicrotasks();

      expect(rejection?.message).toBe(
        'Stream exceeds maximum allowed size of 5 bytes',
      );
      expect(stream.destroyed).toBe(true);
      expect(stream.listenerCount('data')).toBe(0);
      expect(stream.listenerCount('end')).toBe(0);
      expect(stream.listenerCount('error')).toBe(1);

      stream.removeAllListeners();
    });
  });
});

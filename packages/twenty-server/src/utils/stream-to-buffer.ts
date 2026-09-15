import { type Readable } from 'stream';

export const streamToBuffer = async (
  stream: Readable,
  maxSizeBytes?: number,
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  return new Promise((resolve, reject) => {
    let isSettled = false;

    const onLateError = () => undefined;
    const onGuardClose = () => {
      queueMicrotask(() => {
        stream.removeListener('error', onLateError);
      });
    };

    const cleanupConsumptionListeners = () => {
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    };

    const settleResolve = (buffer: Buffer) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanupConsumptionListeners();
      resolve(buffer);
    };

    const settleReject = (error: Error) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanupConsumptionListeners();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      if (isSettled) {
        return;
      }

      totalSize += chunk.length;

      if (maxSizeBytes !== undefined && totalSize > maxSizeBytes) {
        settleReject(
          new Error(
            `Stream exceeds maximum allowed size of ${maxSizeBytes} bytes`,
          ),
        );

        try {
          stream.destroy();
        } catch {
          // Rejection is authoritative even if stream destruction fails.
        }

        return;
      }

      chunks.push(chunk);
    };

    const onEnd = () => {
      settleResolve(Buffer.concat(chunks));
    };

    const onError = (error: Error) => {
      settleReject(error);
    };

    const onClose = () => {
      if (stream.readableEnded) {
        settleResolve(Buffer.concat(chunks));
      } else {
        settleReject(new Error('Stream closed before end'));
      }
    };

    stream.on('error', onLateError);
    stream.once('close', onGuardClose);

    if (stream.readableEnded) {
      settleReject(new Error('Stream has already ended'));

      return;
    }

    if (!stream.readable) {
      settleReject(new Error('Stream is not readable'));

      return;
    }

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
    stream.on('close', onClose);
  });
};

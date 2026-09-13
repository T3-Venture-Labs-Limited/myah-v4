import { createHook } from 'async_hooks';
import { createServer, type AddressInfo, type Server, type Socket } from 'net';

import { createOwnedSocketSmtpClient } from 'src/modules/messaging/message-import-manager/drivers/smtp/providers/smtp-client.provider';

const trackReferencedTimeouts = (durationMs: number) => {
  const activeTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
  const hook = createHook({
    destroy: (asyncId) => activeTimeouts.delete(asyncId),
    init: (asyncId, type, _triggerAsyncId, resource) => {
      if (
        type === 'Timeout' &&
        (resource as NodeJS.Timeout & { _idleTimeout?: number })
          ._idleTimeout === durationMs
      ) {
        activeTimeouts.set(asyncId, resource as ReturnType<typeof setTimeout>);
      }
    },
  });

  hook.enable();

  return {
    disable: () => hook.disable(),
    getReferencedTimeouts: () =>
      [...activeTimeouts.values()].filter((timeout) => timeout.hasRef()),
  };
};

const waitFor = async <T>(promise: Promise<T>, description: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${description}`)),
          3000,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

type LoopbackSmtpServer = {
  host: string;
  messageReceived: Promise<void>;
  peerTerminated: Promise<void>;
  port: number;
  close: () => Promise<void>;
};

const startLoopbackSmtpServer = async ({
  sendGreeting,
}: {
  sendGreeting: boolean;
}): Promise<LoopbackSmtpServer> => {
  const sockets = new Set<Socket>();
  let resolveMessageReceived: () => void = () => undefined;
  let resolvePeerTerminated: () => void = () => undefined;
  const messageReceived = new Promise<void>((resolve) => {
    resolveMessageReceived = resolve;
  });
  const peerTerminated = new Promise<void>((resolve) => {
    resolvePeerTerminated = resolve;
  });
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.once('end', resolvePeerTerminated);
    socket.once('close', () => {
      sockets.delete(socket);
      resolvePeerTerminated();
    });

    if (sendGreeting) {
      socket.write('220 loopback ESMTP ready\r\n');
    }

    let bufferedInput = '';
    let receivingData = false;

    socket.on('data', (chunk: string) => {
      bufferedInput += chunk;

      while (bufferedInput.length > 0) {
        if (receivingData) {
          const messageEnd = bufferedInput.indexOf('\r\n.\r\n');

          if (messageEnd === -1) {
            return;
          }

          bufferedInput = bufferedInput.slice(messageEnd + 5);
          resolveMessageReceived();

          // Deliberately withhold final SMTP acceptance while the client deadline
          // expires. The test observes whether the actual peer socket terminates.
          return;
        }

        const lineEnd = bufferedInput.indexOf('\r\n');

        if (lineEnd === -1) {
          return;
        }

        const command = bufferedInput.slice(0, lineEnd).toUpperCase();

        bufferedInput = bufferedInput.slice(lineEnd + 2);

        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-loopback\r\n250 PIPELINING\r\n');
        } else if (
          command.startsWith('MAIL FROM:') ||
          command.startsWith('RCPT TO:')
        ) {
          socket.write('250 accepted\r\n');
        } else if (command === 'DATA') {
          receivingData = true;
          socket.write('354 continue\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 bye\r\n');
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    host: '127.0.0.1',
    messageReceived,
    peerTerminated,
    port: address.port,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }

      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

describe('owned-socket SMTP deadline', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('terminates the peer connection while sendMail awaits final acceptance', async () => {
    const loopbackServer = await startLoopbackSmtpServer({
      sendGreeting: true,
    });
    const deadlineMs = 500;
    const client = createOwnedSocketSmtpClient(
      {
        host: loopbackServer.host,
        port: loopbackServer.port,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: 3000,
        greetingTimeout: 3000,
        socketTimeout: 3000,
      },
      deadlineMs,
    );

    try {
      const sendResult = client
        .sendMail({
          from: 'sender@example.com',
          to: 'recipient@example.com',
          raw: Buffer.from(
            'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: deadline\r\n\r\nbody',
          ),
        })
        .catch((error: unknown) => error);

      await waitFor(loopbackServer.messageReceived, 'SMTP DATA');

      const error = await waitFor(sendResult, 'send deadline');

      expect(error).toEqual(
        new Error(`SMTP operation exceeded ${deadlineMs}ms`),
      );
      await expect(
        waitFor(loopbackServer.peerTerminated, 'peer socket termination'),
      ).resolves.toBeUndefined();
    } finally {
      await loopbackServer.close();
    }
  });

  it('clears the installed transport greeting timer when verify reaches the deadline', async () => {
    const loopbackServer = await startLoopbackSmtpServer({
      sendGreeting: false,
    });
    const deadlineMs = 100;
    const greetingTimeoutMs = 10_000;
    const timeoutTracker = trackReferencedTimeouts(greetingTimeoutMs);
    const client = createOwnedSocketSmtpClient(
      {
        host: loopbackServer.host,
        port: loopbackServer.port,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: 3000,
        greetingTimeout: greetingTimeoutMs,
        socketTimeout: 3000,
      },
      deadlineMs,
    );

    try {
      await expect(client.verify()).rejects.toThrow(
        `SMTP operation exceeded ${deadlineMs}ms`,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(timeoutTracker.getReferencedTimeouts()).toHaveLength(0);
      await expect(
        waitFor(loopbackServer.peerTerminated, 'verify peer termination'),
      ).resolves.toBeUndefined();
    } finally {
      timeoutTracker.disable();
      await loopbackServer.close();
    }
  });
});

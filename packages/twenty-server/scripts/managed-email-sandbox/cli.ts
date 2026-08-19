import { createManagedEmailProviderSandbox } from './managed-email-provider-sandbox';

const main = async (): Promise<void> => {
  const command = process.argv[2] ?? 'start';
  const controlBaseUrl =
    process.env.MANAGED_EMAIL_SANDBOX_CONTROL_URL ?? 'http://127.0.0.1:18083';

  if (command === 'reset' || command === 'stop') {
    const controlUrl = new URL(controlBaseUrl);

    if (!['127.0.0.1', 'localhost', '[::1]'].includes(controlUrl.hostname)) {
      throw new Error('Managed email sandbox control URL must use loopback');
    }

    const response = await fetch(new URL(`/${command}`, controlUrl), {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(
        `Managed email sandbox ${command} failed with HTTP ${response.status}`,
      );
    }

    console.log(await response.text());
    return;
  }

  if (command !== 'start') {
    throw new Error('Usage: yarn managed-email:sandbox [start|reset|stop]');
  }

  const statePath =
    process.env.MANAGED_EMAIL_SANDBOX_STATE_PATH ??
    '/tmp/myah-managed-email-sandbox.json';
  const sandbox = await createManagedEmailProviderSandbox({
    statePath,
    host: '127.0.0.1',
    icemailPort: 18081,
    warmupPort: 18082,
    controlPort: 18083,
  });
  const started = await sandbox.start();

  console.log(JSON.stringify(started));
  process.once('SIGINT', async () => {
    await sandbox.stop();
    process.exit(0);
  });
  process.once('SIGTERM', async () => {
    await sandbox.stop();
    process.exit(0);
  });
  await new Promise(() => undefined);
};

void main();

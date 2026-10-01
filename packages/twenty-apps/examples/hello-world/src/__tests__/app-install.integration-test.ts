import { appBuild, appDeploy, appInstall } from 'twenty-sdk/cli';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { beforeAll, describe, expect, it } from 'vitest';

const APP_PATH = process.cwd();

describe('App installation', () => {
  beforeAll(async () => {
    const buildResult = await appBuild({
      appPath: APP_PATH,
      tarball: true,
      onProgress: (message: string) => console.log(`[build] ${message}`),
    });

    if (!buildResult.success) {
      throw new Error(
        `Build failed: ${buildResult.error?.message ?? 'Unknown error'}`,
      );
    }

    const deployResult = await appDeploy({
      tarballPath: buildResult.data.tarballPath!,
      onProgress: (message: string) => console.log(`[deploy] ${message}`),
    });

    if (!deployResult.success) {
      throw new Error(
        `Deploy failed: ${deployResult.error?.message ?? 'Unknown error'}`,
      );
    }
  });

  it('denies installing a schema-owning customer app without changing installed applications', async () => {
    const metadataClient = new MetadataApiClient();
    const query = {
      findManyApplications: {
        id: true,
        name: true,
        universalIdentifier: true,
      },
    } as const;
    const before = await metadataClient.query(query);
    const installResult = await appInstall({ appPath: APP_PATH });

    expect(installResult.success).toBe(false);
    if (installResult.success) return;
    expect(installResult.error.message).toContain(
      'Schema definitions are managed by the product and cannot be changed by customers',
    );
    expect(await metadataClient.query(query)).toEqual(before);
  });
});

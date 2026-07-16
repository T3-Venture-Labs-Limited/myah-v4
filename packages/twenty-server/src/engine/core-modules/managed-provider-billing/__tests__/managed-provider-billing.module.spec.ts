import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MyahModule } from 'src/engine/core-modules/myah/myah.module';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { MetronomeWorkspaceCustomerService } from '../services/metronome-workspace-customer.service';
import { ManagedProviderOperationService } from '../services/managed-provider-operation.service';

import { ManagedProviderBillingModule } from '../managed-provider-billing.module';

describe('ManagedProviderBillingModule', () => {
  it('registers the operation journal repository through TypeORM', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedProviderBillingModule,
    ) as Array<{ module?: unknown; providers?: Array<{ provide?: unknown }> }>;
    const typeOrmFeature = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeature).toBeDefined();
    expect(typeOrmFeature?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: getRepositoryToken(ManagedProviderOperationEntity),
        }),
      ]),
    );
  });

  it('registers and exports workspace customer provisioning dependencies', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedProviderBillingModule,
    ) as Array<{ module?: unknown; providers?: Array<{ provide?: unknown }> }>;
    const typeOrmFeature = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ManagedProviderBillingModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ManagedProviderBillingModule,
    ) as unknown[];

    expect(typeOrmFeature?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: getRepositoryToken(MyahWorkspaceInstallationEntity),
        }),
        expect.objectContaining({
          provide: getRepositoryToken(WorkspaceEntity),
        }),
      ]),
    );
    expect(providers).toContain(MetronomeWorkspaceCustomerService);
    expect(exports).toContain(MetronomeWorkspaceCustomerService);
    expect(providers).toContain(ManagedProviderOperationService);
    expect(exports).toContain(ManagedProviderOperationService);
  });
  it('keeps the billing foundation Community-safe and reachable only through Myah', () => {
    const billingImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedProviderBillingModule,
    ) as unknown[];
    const myahImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MyahModule,
    ) as unknown[];
    const controllers =
      Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        ManagedProviderBillingModule,
      ) ?? [];
    const billingSourceDirectory = join(__dirname, '..');
    const productionSources = readdirSync(billingSourceDirectory, {
      recursive: true,
    })
      .filter(
        (path) =>
          typeof path === 'string' &&
          path.endsWith('.ts') &&
          !path.includes('__tests__'),
      )
      .map((path) => readFileSync(join(billingSourceDirectory, path), 'utf8'));
    const sourceRoot = join(__dirname, '../../../../');
    const billingModuleImportFiles = readdirSync(sourceRoot, {
      recursive: true,
    })
      .filter(
        (path) =>
          typeof path === 'string' &&
          path.endsWith('.ts') &&
          !path.includes('__tests__'),
      )
      .filter((path) =>
        readFileSync(join(sourceRoot, path), 'utf8').includes(
          "from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module'",
        ),
      );

    expect(
      myahImports.filter(
        (importedModule) => importedModule === ManagedProviderBillingModule,
      ),
    ).toHaveLength(1);
    expect(billingModuleImportFiles).toEqual([
      'engine/core-modules/myah/myah.module.ts',
    ]);
    expect(billingImports).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'BillingModule' }),
        expect.objectContaining({ name: 'AiBillingModule' }),
      ]),
    );
    expect(controllers).toEqual([]);
    expect(productionSources.join('\n')).not.toContain(
      'src/engine/core-modules/billing/',
    );
    expect(productionSources.join('\n')).not.toContain(
      'src/engine/metadata-modules/ai/ai-billing/',
    );
  });
});

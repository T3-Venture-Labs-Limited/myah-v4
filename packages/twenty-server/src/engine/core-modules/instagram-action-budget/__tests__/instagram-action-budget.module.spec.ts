import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { type DynamicModule } from '@nestjs/common';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { CoreEngineModule } from 'src/engine/core-modules/core-engine.module';
import { InstagramActionLimitBlockEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-limit-block.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import { InstagramActionBudgetModule } from 'src/engine/core-modules/instagram-action-budget/instagram-action-budget.module';
import { InstagramActionBudgetResolver } from 'src/engine/core-modules/instagram-action-budget/resolvers/instagram-action-budget.resolver';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { InstagramActionReceiptReconciliationService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-receipt-reconciliation.service';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

const registeredEntities = [
  InstagramActionReservationEntity,
  InstagramActionLimitBlockEntity,
  ActionExecutionReceiptEntity,
  ActionApprovalBindingEntity,
  UnipileInstagramAccountBindingEntity,
];

describe('InstagramActionBudgetModule', () => {
  it('registers every budget, receipt, binding, and account entity in the global TypeORM scope', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      InstagramActionBudgetModule,
    ) as unknown[];
    const typeOrmFeature = imports.find(
      (module): module is DynamicModule =>
        typeof module === 'object' &&
        module !== null &&
        'module' in module &&
        module.module === TypeOrmModule,
    );

    expect(imports).toContain(GlobalWorkspaceDataSourceModule);
    expect(typeOrmFeature).toEqual(
      expect.objectContaining({
        providers: expect.arrayContaining(
          registeredEntities.map((entity) =>
            expect.objectContaining({ provide: getRepositoryToken(entity) }),
          ),
        ),
      }),
    );
  });

  it('provides the GraphQL resolver and exports budget and receipt reconciliation services', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      InstagramActionBudgetModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      InstagramActionBudgetModule,
    ) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        InstagramActionBudgetResolver,
        InstagramActionBudgetService,
        InstagramActionReceiptReconciliationService,
      ]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([
        InstagramActionBudgetService,
        InstagramActionReceiptReconciliationService,
      ]),
    );
  });

  it('registers the budget module with CoreEngineModule', () => {
    const coreImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CoreEngineModule,
    ) as unknown[];

    expect(coreImports).toContain(InstagramActionBudgetModule);
  });
});

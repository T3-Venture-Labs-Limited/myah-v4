import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramActionLimitBlockEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-limit-block.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import { InstagramActionBudgetResolver } from 'src/engine/core-modules/instagram-action-budget/resolvers/instagram-action-budget.resolver';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { InstagramActionReceiptReconciliationService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-receipt-reconciliation.service';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    PermissionsModule,
    TypeOrmModule.forFeature([
      InstagramActionReservationEntity,
      InstagramActionLimitBlockEntity,
      ActionExecutionReceiptEntity,
      ActionApprovalBindingEntity,
      UnipileInstagramAccountBindingEntity,
    ]),
  ],
  providers: [
    InstagramActionBudgetResolver,
    InstagramActionBudgetService,
    InstagramActionReceiptReconciliationService,
    provideWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity),
  ],
  exports: [
    InstagramActionBudgetService,
    InstagramActionReceiptReconciliationService,
  ],
})
export class InstagramActionBudgetModule {}

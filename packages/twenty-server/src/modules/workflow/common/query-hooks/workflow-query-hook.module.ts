import { Module } from '@nestjs/common';

import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';

import { CommandMenuItemModule } from 'src/engine/metadata-modules/command-menu-item/command-menu-item.module';
import { FeatureFlagModule } from 'src/engine/core-modules/feature-flag/feature-flag.module';
import { RecordPositionModule } from 'src/engine/core-modules/record-position/record-position.module';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { LogicFunctionModule } from 'src/engine/metadata-modules/logic-function/logic-function.module';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { CodeStepBuildModule } from 'src/modules/workflow/workflow-builder/workflow-version-step/code-step/code-step-build.module';
import { WorkflowCreateManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-create-many.post-query.hook';
import { WorkflowCreateManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-create-many.pre-query.hook';
import { WorkflowCreateOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-create-one.post-query.hook';
import { WorkflowCreateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-create-one.pre-query.hook';
import { WorkflowDeleteManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-delete-many.post-query.hook';
import { WorkflowDeleteOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-delete-one.post-query.hook';
import { WorkflowDeleteOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-delete-one.pre-query.hook';
import { WorkflowDeleteManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-delete-many.pre-query.hook';
import { WorkflowDestroyManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-destroy-many.pre-query.hook';
import { WorkflowDestroyOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-destroy-one.pre-query.hook';
import { WorkflowFindOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-find-one.post-query.hook';
import { WorkflowFindManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-find-many.post-query.hook';
import { WorkflowRestoreManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-restore-many.post-query.hook';
import { WorkflowRestoreOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-restore-one.pre-query.hook';
import { WorkflowRestoreOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-restore-one.post-query.hook';
import { WorkflowRestoreManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-restore-many.pre-query.hook';
import { WorkflowRunCreateManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-create-many.pre-query.hook';
import { WorkflowRunCreateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-create-one.pre-query.hook';
import { WorkflowRunDeleteManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-delete-many.pre-query.hook';
import { WorkflowRunDeleteOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-delete-one.pre-query.hook';
import { WorkflowRunDestroyManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-destroy-many.pre-query.hook';
import { WorkflowRunDestroyOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-destroy-one.pre-query.hook';
import { WorkflowRunFindManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-find-many.post-query.hook';
import { WorkflowRunFindOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-find-one.post-query.hook';
import { WorkflowRunRestoreManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-restore-many.pre-query.hook';
import { WorkflowRunRestoreOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-restore-one.pre-query.hook';
import { WorkflowRunUpdateManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-update-many.pre-query.hook';
import { WorkflowRunUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-update-one.pre-query.hook';
import { WorkflowUpdateManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-many.post-query.hook';
import { WorkflowUpdateManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-many.pre-query.hook';
import { WorkflowUpdateOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-one.post-query.hook';
import { WorkflowUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-one.pre-query.hook';
import { WorkflowVersionCreateManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-create-many.pre-query.hook';
import { WorkflowVersionCreateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-create-one.pre-query.hook';
import { WorkflowVersionDeleteManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-delete-many.pre-query.hook';
import { WorkflowVersionDeleteOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-delete-one.pre-query.hook';
import { WorkflowVersionDestroyManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-destroy-many.pre-query.hook';
import { WorkflowVersionDestroyOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-destroy-one.pre-query.hook';
import { WorkflowVersionFindManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-find-many.post-query.hook';
import { WorkflowVersionFindOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-find-one.post-query.hook';
import { WorkflowVersionRestoreManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-restore-many.pre-query.hook';
import { WorkflowVersionRestoreOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-restore-one.pre-query.hook';
import { WorkflowVersionUpdateManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-update-many.pre-query.hook';
import { WorkflowVersionUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-update-one.pre-query.hook';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';
import { WorkflowOutreachAssociationGuardService } from 'src/modules/workflow/common/services/workflow-outreach-association-guard.service';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowVersionValidationWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-version-validation.workspace-service';

@Module({
  imports: [
    NestjsQueryTypeOrmModule.forFeature([ObjectMetadataEntity]),
    LogicFunctionModule,
    RecordPositionModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
    ObjectMetadataModule,
    TwentyORMModule,
    CodeStepBuildModule,
    CommandMenuItemModule,
    FeatureFlagModule,
  ],
  providers: [
    WorkflowCreateOnePreQueryHook,
    WorkflowCreateManyPreQueryHook,
    WorkflowUpdateOnePreQueryHook,
    WorkflowUpdateManyPreQueryHook,
    WorkflowUpdateOnePostQueryHook,
    WorkflowUpdateManyPostQueryHook,
    WorkflowRunCreateOnePreQueryHook,
    WorkflowRunCreateManyPreQueryHook,
    WorkflowRunUpdateOnePreQueryHook,
    WorkflowRunUpdateManyPreQueryHook,
    WorkflowRunDeleteOnePreQueryHook,
    WorkflowRunDeleteManyPreQueryHook,
    WorkflowRunDestroyOnePreQueryHook,
    WorkflowRunDestroyManyPreQueryHook,
    WorkflowRunRestoreOnePreQueryHook,
    WorkflowRunRestoreManyPreQueryHook,
    WorkflowRestoreOnePreQueryHook,
    WorkflowRestoreOnePostQueryHook,
    WorkflowRestoreManyPostQueryHook,
    WorkflowVersionCreateOnePreQueryHook,
    WorkflowVersionCreateManyPreQueryHook,
    WorkflowVersionUpdateOnePreQueryHook,
    WorkflowVersionUpdateManyPreQueryHook,
    WorkflowVersionDeleteOnePreQueryHook,
    WorkflowVersionDeleteManyPreQueryHook,
    WorkflowVersionDestroyOnePreQueryHook,
    WorkflowVersionDestroyManyPreQueryHook,
    WorkflowVersionRestoreOnePreQueryHook,
    WorkflowVersionRestoreManyPreQueryHook,
    WorkflowCreateOnePostQueryHook,
    WorkflowCreateManyPostQueryHook,
    WorkflowVersionValidationWorkspaceService,
    WorkflowOutreachAssociationGuardService,
    WorkflowOutreachAccessGuardService,
    WorkflowCommonWorkspaceService,
    WorkflowDeleteManyPostQueryHook,
    WorkflowDeleteManyPreQueryHook,
    WorkflowDeleteOnePostQueryHook,
    WorkflowFindOnePostQueryHook,
    WorkflowFindManyPostQueryHook,
    WorkflowRunFindOnePostQueryHook,
    WorkflowRunFindManyPostQueryHook,
    WorkflowVersionFindOnePostQueryHook,
    WorkflowVersionFindManyPostQueryHook,
    WorkflowDeleteOnePreQueryHook,
    WorkflowDestroyOnePreQueryHook,
    WorkflowDestroyManyPreQueryHook,
    WorkflowRestoreManyPreQueryHook,
  ],
})
export class WorkflowQueryHookModule {}

import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  CommitCreatorImportInput,
  CommitCreatorImportResult,
} from 'src/modules/myah-creator-social-profile/dtos/creator-import.dto';
import { CreatorImportService } from 'src/modules/myah-creator-social-profile/services/creator-import.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
export class CreatorImportResolver {
  constructor(private readonly creatorImportService: CreatorImportService) {}

  @Mutation(() => CommitCreatorImportResult)
  commitCreatorImport(
    @Args('input') input: CommitCreatorImportInput,
  ): Promise<CommitCreatorImportResult> {
    return this.creatorImportService.commit(input, getWorkspaceAuthContext());
  }
}

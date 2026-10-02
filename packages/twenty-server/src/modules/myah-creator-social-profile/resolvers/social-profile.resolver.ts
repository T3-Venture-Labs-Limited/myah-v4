import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  RestoreSocialProfileInput,
  RetireSocialProfileInput,
  SocialProfileDTO,
  UpdateSocialProfileIdentityInput,
} from 'src/modules/myah-creator-social-profile/dtos/social-profile.dto';
import { SocialProfileService } from 'src/modules/myah-creator-social-profile/services/social-profile.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
export class SocialProfileResolver {
  constructor(private readonly socialProfileService: SocialProfileService) {}

  @Mutation(() => SocialProfileDTO)
  updateSocialProfileIdentity(
    @Args('input') input: UpdateSocialProfileIdentityInput,
  ): Promise<SocialProfileDTO> {
    return this.socialProfileService.updateIdentity(
      {
        ...input,
        followerCountObservedAt:
          input.followerCountObservedAt === undefined
            ? undefined
            : input.followerCountObservedAt === null
              ? null
              : new Date(input.followerCountObservedAt),
      },
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => SocialProfileDTO)
  retireSocialProfile(
    @Args('input') input: RetireSocialProfileInput,
  ): Promise<SocialProfileDTO> {
    return this.socialProfileService.retire(
      input.id,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => SocialProfileDTO)
  restoreSocialProfile(
    @Args('input') input: RestoreSocialProfileInput,
  ): Promise<SocialProfileDTO> {
    return this.socialProfileService.restore(
      input.id,
      getWorkspaceAuthContext(),
    );
  }
}

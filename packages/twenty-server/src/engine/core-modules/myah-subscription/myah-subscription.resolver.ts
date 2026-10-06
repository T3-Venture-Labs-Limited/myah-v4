import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  Float,
  GraphQLISODateTime,
  Mutation,
  ObjectType,
  Query,
} from '@nestjs/graphql';
import { PermissionFlagType } from 'twenty-shared/constants';

import { msg } from '@lingui/core/macro';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { type ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { AuthApiKey } from 'src/engine/decorators/auth/auth-api-key.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { MyahCheckoutService } from 'src/engine/core-modules/myah-subscription/myah-checkout.service';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@ObjectType()
export class MyahCheckoutPrice {
  @Field(() => Float)
  amountCents: number;

  @Field(() => Float)
  regularAmountCents: number;

  @Field(() => Boolean)
  earlyAccess: boolean;
}

@ObjectType()
export class MyahSubscriptionDetails {
  @Field(() => Float, { nullable: true })
  amountCents: number | null;

  @Field(() => Boolean)
  cancelAtPeriodEnd: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  currentPeriodEnd: Date | null;
}

@ObjectType()
export class MyahWorkspaceUsage {
  @Field(() => Boolean)
  instagramReconnectRequired: boolean;

  @Field(() => String)
  state: string;

  @Field(() => Float, { nullable: true })
  percentUsed: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  periodStart: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  resetAt: Date | null;

  @Field(() => Boolean)
  paymentRetrying: boolean;

  @Field(() => Boolean)
  exhausted: boolean;
}

const PROMOTION_CODE_ATTEMPTS = 10;
const PROMOTION_CODE_WINDOW_MS = 10 * 60 * 1000;

@MetadataResolver()
@UseGuards(WorkspaceAuthGuard)
export class MyahSubscriptionResolver {
  constructor(
    private readonly checkout: MyahCheckoutService,
    private readonly usage: MyahUsageService,
    private readonly permissions: PermissionsService,
    private readonly throttler: ThrottlerService,
  ) {}

  // Every member sees the plain price; only Billing admins can check promotion
  // codes, and only a few times a minute, so codes cannot be guessed.
  @Query(() => MyahCheckoutPrice)
  @UseGuards(NoPermissionGuard)
  async myahCheckoutPrice(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId({ allowUndefined: true })
    userWorkspaceId: string | undefined,
    @AuthApiKey() apiKey: ApiKeyEntity | undefined,
    @Args('code', { type: () => String, nullable: true }) code?: string,
  ) {
    if (code?.trim()) {
      const canManageBilling =
        await this.permissions.userHasWorkspaceSettingPermission({
          userWorkspaceId,
          setting: PermissionFlagType.BILLING,
          workspaceId: workspace.id,
          apiKeyId: apiKey?.id,
        });
      if (canManageBilling !== true)
        throw new PermissionsException(
          PermissionsExceptionMessage.PERMISSION_DENIED,
          PermissionsExceptionCode.PERMISSION_DENIED,
          {
            userFriendlyMessage: msg`Only a workspace admin can apply a promotion code.`,
          },
        );
      await this.throttler.tokenBucketThrottleOrThrow(
        `myah-promotion-code:${workspace.id}`,
        1,
        PROMOTION_CODE_ATTEMPTS,
        PROMOTION_CODE_WINDOW_MS,
      );
    }
    return this.checkout.quoteCheckout(workspace.id, code);
  }

  @Query(() => MyahWorkspaceUsage)
  @UseGuards(NoPermissionGuard)
  myahWorkspaceUsage(@AuthWorkspace() workspace: WorkspaceEntity) {
    return this.usage.getUsage(workspace.id);
  }

  @Query(() => MyahSubscriptionDetails)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.BILLING))
  myahSubscriptionDetails(@AuthWorkspace() workspace: WorkspaceEntity) {
    return this.checkout.getBillingDetails(workspace.id);
  }

  @Mutation(() => String)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.BILLING))
  createMyahCheckoutSession(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('code', { type: () => String, nullable: true }) code?: string,
    @Args('expectedAmountCents', { type: () => Float, nullable: true })
    expectedAmountCents?: number,
  ) {
    return this.checkout.createCheckout(workspace, code, expectedAmountCents);
  }

  @Mutation(() => String)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.BILLING))
  syncMyahCheckoutSession(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('sessionId', { type: () => String }) sessionId: string,
  ) {
    return this.checkout.syncCheckout(workspace.id, sessionId);
  }

  @Mutation(() => String)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.BILLING))
  createMyahCustomerPortalSession(@AuthWorkspace() workspace: WorkspaceEntity) {
    return this.checkout.createPortal(workspace);
  }
}

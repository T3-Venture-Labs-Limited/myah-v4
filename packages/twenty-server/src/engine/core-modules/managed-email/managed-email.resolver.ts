import { Inject, Optional, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

import {
  ManagedEmailActionResultDTO,
  ManagedEmailBundleDTO,
  ManagedEmailDomainDTO,
  ManagedEmailHealthDetailsDTO,
  ManagedEmailMailboxDTO,
  ManagedEmailOperationDTO,
  ManagedEmailOverviewDTO,
  ManagedEmailPaymentMethodStatusDTO,
  ManagedEmailPaymentSetupDTO,
  ManagedEmailProposalDTO,
  ManagedEmailQuoteDTO,
  ManagedEmailSubscriptionDTO,
} from './managed-email.dto';
import { ManagedEmailAcquisitionMode } from './enums/managed-email-acquisition-mode.enum';
import {
  ManagedEmailCampaignCapInput,
  ManagedEmailCompletePaymentMethodInput,
  ManagedEmailDomainActionInput,
  ManagedEmailHealthDetailsInput,
  ManagedEmailMailboxActionInput,
  ManagedEmailOperationInput,
  ManagedEmailPrewarmedProposalInput,
  ManagedEmailProposalInput,
  ManagedEmailPurchaseInput,
  ManagedEmailQuoteInput,
} from './managed-email.input';
import { ManagedEmailCustomerService } from './services/managed-email-customer.service';
import { ManagedProviderStripeService } from 'src/engine/core-modules/managed-provider-billing/stripe/managed-provider-stripe.service';

@MetadataResolver()
@UseGuards(
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.BILLING),
)
@UsePipes(ResolverValidationPipe)
export class ManagedEmailResolver {
  constructor(
    private readonly managedEmailCustomerService: ManagedEmailCustomerService,
    @Optional()
    @Inject(ManagedProviderStripeService)
    private readonly managedProviderStripeService: ManagedProviderStripeService | undefined,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  @Query(() => ManagedEmailOverviewDTO)
  async managedEmailOverview(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailOverviewDTO> {
    return this.managedEmailCustomerService.overview(workspace.id);
  }

  @Query(() => [ManagedEmailDomainDTO])
  async managedEmailDomains(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailDomainDTO[]> {
    return this.managedEmailCustomerService.domains(workspace.id);
  }

  @Query(() => [ManagedEmailMailboxDTO])
  async managedEmailMailboxes(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailMailboxDTO[]> {
    return this.managedEmailCustomerService.mailboxes(workspace.id);
  }
  @Query(() => [ManagedEmailSubscriptionDTO])
  async managedEmailSubscriptions(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailSubscriptionDTO[]> {
    return this.managedEmailCustomerService.subscriptions({
      workspaceId: workspace.id,
    });
  }

  @Query(() => [ManagedEmailBundleDTO])
  async managedEmailPrewarmedBundles(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailBundleDTO[]> {
    return this.managedEmailCustomerService.prewarmedBundles({
      actorId,
      workspaceId: workspace.id,
    });
  }

  @Query(() => ManagedEmailProposalDTO)
  async managedEmailProposal(
    @Args('input') input: ManagedEmailProposalInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailProposalDTO> {
    return this.managedEmailCustomerService.newProposal({
      actorId,
      input,
      workspaceId: workspace.id,
      workspaceSlug: workspace.subdomain,
    });
  }

  @Query(() => ManagedEmailQuoteDTO)
  async managedEmailQuote(
    @Args('input') input: ManagedEmailQuoteInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailQuoteDTO> {
    return this.managedEmailCustomerService.quote({
      actorId,
      proposalId: input.proposalId,
      workspaceId: workspace.id,
    });
  }

  @Query(() => ManagedEmailProposalDTO)
  async managedEmailPrewarmedProposal(
    @Args('input') input: ManagedEmailPrewarmedProposalInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailProposalDTO> {
    return this.managedEmailCustomerService.prewarmedProposal({
      actorId,
      bundleId: input.bundleId,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailPaymentSetupDTO)
  async prepareManagedEmailPaymentMethod(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailPaymentSetupDTO> {
    if (!this.managedProviderStripeService) {
      throw new Error('Managed email payment is unavailable');
    }
    const result =
      await this.managedProviderStripeService.prepareWorkspacePaymentMethod({
        metronomeBaseUrlEnvironment: this.twentyConfigService.get(
          'METRONOME_BASE_URL_ENVIRONMENT',
        )!,
        workspaceId: workspace.id,
      });
    return {
      clientSecret: result.clientSecret,
      publishableKey: result.publishableKey,
      ready: result.ready,
      setupIntentId: result.setupIntentId,
    };
  }

  @Mutation(() => ManagedEmailPaymentMethodStatusDTO)
  async completeManagedEmailPaymentMethod(
    @Args('input') input: ManagedEmailCompletePaymentMethodInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailPaymentMethodStatusDTO> {
    if (!this.managedProviderStripeService) {
      throw new Error('Managed email payment is unavailable');
    }
    await this.managedProviderStripeService.completeWorkspacePaymentMethodSetup(
      {
        metronomeBaseUrlEnvironment: this.twentyConfigService.get(
          'METRONOME_BASE_URL_ENVIRONMENT',
        )!,
        setupIntentId: input.setupIntentId,
        workspaceId: workspace.id,
      },
    );
    return { ready: true };
  }

  @Query(() => ManagedEmailOperationDTO, { nullable: true })
  async managedEmailOperation(
    @Args('input') input: ManagedEmailOperationInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailOperationDTO | null> {
    return this.managedEmailCustomerService.operation(
      workspace.id,
      input.operationId,
    );
  }

  @Query(() => ManagedEmailHealthDetailsDTO, { nullable: true })
  async managedEmailHealthDetails(
    @Args('input') input: ManagedEmailHealthDetailsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailHealthDetailsDTO | null> {
    return input.resourceType === 'DOMAIN'
      ? this.managedEmailCustomerService.domainHealth(
          workspace.id,
          input.resourceId,
        )
      : this.managedEmailCustomerService.mailboxHealth(
          workspace.id,
          input.resourceId,
        );
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async confirmManagedEmailPrewarmedPurchase(
    @Args('input') input: ManagedEmailPurchaseInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.purchase({
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      actorId,
      input,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async confirmManagedEmailOrdinaryPurchase(
    @Args('input') input: ManagedEmailPurchaseInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.purchase({
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      actorId,
      input,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async setManagedEmailCampaignCap(
    @Args('input') input: ManagedEmailCampaignCapInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.setCampaignCap({
      actorId,
      dailyCap: input.dailyCap,
      idempotencyKey: input.idempotencyKey,
      mailboxId: input.mailboxId,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async cancelManagedEmailWarmup(
    @Args('input') input: ManagedEmailMailboxActionInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.cancelWarmup({
      actorId,
      idempotencyKey: input.idempotencyKey,
      mailboxId: input.mailboxId,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async pauseManagedEmailWarmup(
    @Args('input') input: ManagedEmailMailboxActionInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.pauseWarmup({
      actorId,
      idempotencyKey: input.idempotencyKey,
      mailboxId: input.mailboxId,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async resumeManagedEmailWarmup(
    @Args('input') input: ManagedEmailMailboxActionInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.resumeWarmup({
      actorId,
      idempotencyKey: input.idempotencyKey,
      mailboxId: input.mailboxId,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async stopManagedEmailMailbox(
    @Args('input') input: ManagedEmailMailboxActionInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.stopMailbox({
      actorId,
      idempotencyKey: input.idempotencyKey,
      mailboxId: input.mailboxId,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => ManagedEmailActionResultDTO)
  async cancelManagedEmailDomainRenewal(
    @Args('input') input: ManagedEmailDomainActionInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.cancelDomainRenewal({
      actorId,
      domainId: input.domainId,
      idempotencyKey: input.idempotencyKey,
      workspaceId: workspace.id,
    });
  }
}

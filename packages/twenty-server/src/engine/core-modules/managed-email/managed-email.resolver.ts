import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
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
  ManagedEmailProposalDTO,
  ManagedEmailQuoteDTO,
} from './managed-email.dto';
import { ManagedEmailAcquisitionMode } from './enums/managed-email-acquisition-mode.enum';
import {
  ManagedEmailCampaignCapInput,
  ManagedEmailDomainActionInput,
  ManagedEmailHealthDetailsInput,
  ManagedEmailMailboxActionInput,
  ManagedEmailOperationInput,
  ManagedEmailProposalInput,
  ManagedEmailPurchaseInput,
  ManagedEmailQuoteInput,
  ManagedEmailRetryPaymentInput,
} from './managed-email.input';
import { ManagedEmailCustomerService } from './services/managed-email-customer.service';

@CoreResolver()
@UseGuards(
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.BILLING),
)
@UsePipes(ResolverValidationPipe)
export class ManagedEmailResolver {
  constructor(
    private readonly managedEmailCustomerService: ManagedEmailCustomerService,
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

  @Query(() => [ManagedEmailBundleDTO])
  async managedEmailPrewarmedBundles(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ManagedEmailBundleDTO[]> {
    return this.managedEmailCustomerService.prewarmedBundles(workspace.id);
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
  ): Promise<ManagedEmailQuoteDTO> {
    return this.managedEmailCustomerService.quote({
      proposalId: input.proposalId,
      workspaceId: workspace.id,
    });
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
  async retryManagedEmailPayment(
    @Args('input') input: ManagedEmailRetryPaymentInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() actorId: string,
  ): Promise<ManagedEmailActionResultDTO> {
    return this.managedEmailCustomerService.retryPayment({
      actorId,
      idempotencyKey: input.idempotencyKey,
      operationId: input.operationId,
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

import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class CreateMyahE2eCampaignMailboxFixtureInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;
}

@InputType()
export class MyahE2eFixtureIdInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  fixtureId!: string;
}

@InputType()
export class CreateMyahE2eCallbackFixtureInput extends MyahE2eFixtureIdInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  operationsTabId!: string;
}

@ObjectType()
export class MyahE2eCampaignMailboxFixtureDTO {
  @Field(() => UUIDScalarType)
  id!: string;

  @Field(() => [UUIDScalarType])
  availableAccountIds!: string[];

  @Field(() => UUIDScalarType)
  unavailableAccountId!: string;

  @Field(() => UUIDScalarType)
  approvalThreadId!: string;

  @Field()
  approvalThreadTitle!: string;

  @Field(() => UUIDScalarType)
  actionApprovalBindingId!: string;

  @Field()
  expectedFrom!: string;

  @Field()
  expectedTo!: string;

  @Field()
  expectedSubject!: string;

  @Field()
  expectedBody!: string;
}

@ObjectType()
export class MyahE2eCampaignMailboxFixtureStatusDTO {
  @Field()
  providerSendAttemptCount!: number;

  @Field()
  providerDraftPreparationCount!: number;
}

@ObjectType()
export class MyahE2eCallbackFixtureDTO {
  @Field(() => UUIDScalarType)
  connectedAccountId!: string;

  @Field()
  callbackPath!: string;
}

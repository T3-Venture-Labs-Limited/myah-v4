import { Field, InputType, ObjectType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

const MAX_IDS = 500;

@InputType()
export class CampaignInfluencerCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;
}

@InputType()
export class AttachCampaignCreatorListsInput extends CampaignInfluencerCampaignInput {
  @Field(() => [UUIDScalarType])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IDS)
  @IsUUID('4', { each: true })
  creatorListIds!: string[];
}

@InputType()
export class AddDirectCampaignCreatorsInput extends CampaignInfluencerCampaignInput {
  @Field(() => [UUIDScalarType])
  @ArrayMinSize(1)
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsUUID('4', { each: true })
  creatorIds!: string[];

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  assignedManagedMailboxId?: string | null;
}

@InputType()
export class CampaignCreatorListRemovalImpactInput extends CampaignInfluencerCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  creatorListId!: string;
}

@InputType()
export class DetachCampaignCreatorListInput extends CampaignCreatorListRemovalImpactInput {
  @Field(() => [UUIDScalarType])
  @IsArray()
  @IsUUID('4', { each: true })
  confirmedCreatorIds!: string[];

  @Field({ nullable: true })
  confirmationToken?: string;
}

@ObjectType()
export class CampaignCreatorDTO {
  @Field(() => UUIDScalarType)
  id!: string;

  @Field(() => UUIDScalarType)
  campaignId!: string;

  @Field(() => UUIDScalarType)
  creatorId!: string;

  @Field(() => Boolean)
  isDirectlyAdded!: boolean;
}

@ObjectType()
export class CampaignCreatorListDTO {
  @Field(() => UUIDScalarType)
  id!: string;

  @Field(() => UUIDScalarType)
  campaignId!: string;

  @Field(() => UUIDScalarType)
  creatorListId!: string;
}

@ObjectType()
export class CampaignInfluencerSnapshotDTO {
  @Field(() => [CampaignCreatorDTO])
  campaignCreators!: CampaignCreatorDTO[];

  @Field(() => [CampaignCreatorListDTO])
  campaignCreatorLists!: CampaignCreatorListDTO[];
}

@ObjectType()
export class CampaignCreatorListRemovalImpactDTO {
  @Field(() => Boolean)
  requiresConfirmation!: boolean;

  @Field(() => [UUIDScalarType])
  affectedCreatorIds!: string[];

  @Field({ nullable: true })
  confirmationToken?: string;
}

@InputType()
export class CreatorListMembershipIntentInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  creatorListId!: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  creatorId!: string;
}

@InputType()
export class RemoveCreatorListMemberIntentInput extends CreatorListMembershipIntentInput {
  @Field(() => [UUIDScalarType])
  @IsArray()
  @IsUUID('4', { each: true })
  confirmedCampaignIds!: string[];

  @Field({ nullable: true })
  confirmationToken?: string;
}

@ObjectType()
export class CreatorListMembershipRemovalImpactDTO {
  @Field(() => [UUIDScalarType])
  affectedCampaignIds!: string[];

  @Field(() => Boolean)
  requiresConfirmation!: boolean;

  @Field({ nullable: true })
  confirmationToken?: string;
}

@ObjectType()
export class CreatorListMemberDTO {
  @Field(() => UUIDScalarType)
  id!: string;
  @Field(() => UUIDScalarType)
  creatorListId!: string;
  @Field(() => UUIDScalarType)
  creatorId!: string;
}

@InputType()
export class CreatorListMembersIntentInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  creatorListId!: string;

  @Field(() => [UUIDScalarType])
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IDS)
  @IsArray()
  @IsUUID('4', { each: true })
  creatorIds!: string[];
}

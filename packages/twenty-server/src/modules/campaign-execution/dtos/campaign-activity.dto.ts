import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

@InputType()
export class CampaignActivityInput {
  @Field(() => ID)
  @IsUUID()
  campaignId: string;

  @Field(() => Int, { defaultValue: 25 })
  @IsInt()
  @Min(1)
  @Max(50)
  first = 25;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  after?: string;
}

@ObjectType()
export class CampaignActivityMessageDTO {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  threadId: string;

  @Field()
  happenedAt: string;

  @Field()
  state: string;
}

@ObjectType()
export class CampaignActivityCreatorDTO {
  @Field(() => ID)
  campaignCreatorId: string;

  @Field(() => ID)
  creatorId: string;

  @Field(() => String, { nullable: true })
  creatorName: string | null;

  @Field(() => String, { nullable: true })
  stage: string | null;

  @Field(() => String, { nullable: true })
  stageLabel: string | null;

  @Field(() => CampaignActivityMessageDTO, { nullable: true })
  latestOutbound: CampaignActivityMessageDTO | null;

  @Field(() => CampaignActivityMessageDTO, { nullable: true })
  latestInbound: CampaignActivityMessageDTO | null;

  @Field(() => String, { nullable: true })
  plannedAt: string | null;

  @Field(() => String, { nullable: true })
  currentAttemptState: string | null;

  @Field(() => String, { nullable: true })
  reason: string | null;

  @Field()
  needsAttention: boolean;

  @Field(() => String, { nullable: true })
  inboxContactId: string | null;

  @Field(() => ID, { nullable: true })
  inboxThreadId: string | null;

  @Field()
  excluded: boolean;

  @Field()
  mayStillSend: boolean;
}

@ObjectType()
export class CampaignActivityPageInfoDTO {
  @Field()
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType()
export class CampaignActivityConnectionDTO {
  @Field(() => [CampaignActivityCreatorDTO])
  nodes: CampaignActivityCreatorDTO[];

  @Field(() => CampaignActivityPageInfoDTO)
  pageInfo: CampaignActivityPageInfoDTO;
}

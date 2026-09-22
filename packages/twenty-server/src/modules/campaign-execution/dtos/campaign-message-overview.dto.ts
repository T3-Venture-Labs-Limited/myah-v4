import {
  Field,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum CampaignMessageOverviewView {
  ALL = 'ALL',
  SCHEDULED = 'SCHEDULED',
  SENT = 'SENT',
  NEEDS_ATTENTION = 'NEEDS_ATTENTION',
}

export enum CampaignMessageOverviewDateBasis {
  ESTIMATED_SEND = 'ESTIMATED_SEND',
  SENT_AT = 'SENT_AT',
}

registerEnumType(CampaignMessageOverviewView, {
  name: 'CampaignMessageOverviewView',
});
registerEnumType(CampaignMessageOverviewDateBasis, {
  name: 'CampaignMessageOverviewDateBasis',
});

@InputType()
export class CampaignMessageOverviewInput {
  @Field(() => Int, { defaultValue: 50 })
  @IsInt()
  @Min(1)
  @Max(100)
  first = 50;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  after?: string;

  @Field(() => CampaignMessageOverviewView, {
    defaultValue: CampaignMessageOverviewView.ALL,
  })
  @IsEnum(CampaignMessageOverviewView)
  view = CampaignMessageOverviewView.ALL;

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  campaignIds?: string[];

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  connectedAccountIds?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field(() => CampaignMessageOverviewDateBasis, { nullable: true })
  @IsOptional()
  @IsEnum(CampaignMessageOverviewDateBasis)
  dateBasis?: CampaignMessageOverviewDateBasis;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

@ObjectType()
export class CampaignMessageOverviewRowDTO {
  @Field(() => ID)
  occurrenceId: string;
  @Field(() => ID)
  campaignId: string;
  @Field()
  campaignName: string;
  @Field(() => ID)
  creatorId: string;
  @Field(() => String, { nullable: true })
  creatorName: string | null;
  @Field(() => String, { nullable: true })
  recipient: string | null;
  @Field(() => String, { nullable: true })
  subject: string | null;
  @Field(() => String, { nullable: true })
  preview: string | null;
  @Field(() => Int)
  sequenceStep: number;
  @Field()
  platform: string;
  @Field()
  status: string;
  @Field(() => String, { nullable: true })
  estimatedSendAt: string | null;
  @Field(() => String, { nullable: true })
  sentAt: string | null;
  @Field(() => String, { nullable: true })
  eligibleAfter: string | null;
  @Field(() => ID, { nullable: true })
  connectedAccountId: string | null;
  @Field(() => String, { nullable: true })
  connectedAccountLabel: string | null;
  @Field()
  senderIsEstimated: boolean;
  @Field()
  needsAttention: boolean;
  @Field(() => String, { nullable: true })
  reason: string | null;
  @Field(() => String, { nullable: true })
  inboxContactId: string | null;
  @Field(() => ID, { nullable: true })
  inboxThreadId: string | null;
}

@ObjectType()
export class CampaignMessageOverviewPageInfoDTO {
  @Field()
  hasNextPage: boolean;
  @Field(() => String, { nullable: true })
  endCursor: string | null;
  @Field(() => ID, { nullable: true })
  generationId: string | null;
  @Field(() => String, { nullable: true })
  generatedAt: string | null;
  @Field(() => String, { nullable: true })
  horizonEndsAt: string | null;
  @Field()
  forecastComplete: boolean;
  @Field()
  refreshing: boolean;
}

@ObjectType()
export class CampaignMessageOverviewConnectedAccountOptionDTO {
  @Field(() => ID)
  id: string;
  @Field()
  label: string;
}

@ObjectType()
export class CampaignMessageOverviewFilterOptionsDTO {
  @Field(() => [CampaignMessageOverviewCampaignOptionDTO])
  campaigns: CampaignMessageOverviewCampaignOptionDTO[];
  @Field(() => [CampaignMessageOverviewConnectedAccountOptionDTO])
  connectedAccounts: CampaignMessageOverviewConnectedAccountOptionDTO[];
  @Field(() => [ID])
  connectedAccountIds: string[];
}

@ObjectType()
export class CampaignMessageOverviewCampaignOptionDTO {
  @Field(() => ID)
  id: string;
  @Field()
  name: string;
}

@ObjectType()
export class CampaignMessageOverviewConnectionDTO {
  @Field(() => [CampaignMessageOverviewRowDTO])
  nodes: CampaignMessageOverviewRowDTO[];
  @Field(() => CampaignMessageOverviewPageInfoDTO)
  pageInfo: CampaignMessageOverviewPageInfoDTO;
  @Field(() => CampaignMessageOverviewFilterOptionsDTO)
  filterOptions: CampaignMessageOverviewFilterOptionsDTO;
}

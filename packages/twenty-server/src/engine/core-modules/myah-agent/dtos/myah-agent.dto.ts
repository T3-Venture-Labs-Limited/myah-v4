import {
  Field,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

export enum MyahAgentSendingModeEnum {
  DRAFT_FOR_APPROVAL = 'DRAFT_FOR_APPROVAL',
  SEND_AUTOMATICALLY = 'SEND_AUTOMATICALLY',
}

export enum MyahCampaignPreferredChannelEnum {
  INSTAGRAM = 'INSTAGRAM',
  EMAIL = 'EMAIL',
  NO_PREFERENCE = 'NO_PREFERENCE',
}

registerEnumType(MyahAgentSendingModeEnum, { name: 'MyahAgentSendingMode' });
registerEnumType(MyahCampaignPreferredChannelEnum, {
  name: 'MyahCampaignPreferredChannel',
});

const MAX_GUIDANCE_LENGTH = 20_000;

@ObjectType('MyahAgent')
export class MyahAgentDTO {
  @Field(() => String, { nullable: true })
  tone: string | null;

  @Field(() => String, { nullable: true })
  responseLength: string | null;

  @Field(() => String, { nullable: true })
  language: string | null;

  @Field(() => String, { nullable: true })
  brandInformation: string | null;

  @Field(() => String, { nullable: true })
  replyRules: string | null;

  @Field(() => String, { nullable: true })
  escalationBoundaries: string | null;

  @Field(() => MyahAgentSendingModeEnum)
  sendingMode: MyahAgentSendingModeEnum;

  @Field(() => String, { nullable: true })
  sendingModeEnabledByName: string | null;

  @Field(() => Date, { nullable: true })
  sendingModeEnabledAt: Date | null;
}

@InputType()
export class UpdateMyahAgentInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  responseLength?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  language?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_GUIDANCE_LENGTH)
  brandInformation?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_GUIDANCE_LENGTH)
  replyRules?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_GUIDANCE_LENGTH)
  escalationBoundaries?: string | null;

  @Field(() => MyahAgentSendingModeEnum, { nullable: true })
  @IsOptional()
  @IsIn(Object.values(MyahAgentSendingModeEnum))
  sendingMode?: MyahAgentSendingModeEnum;
}

@ObjectType('MyahCampaignInstagramAccountOption')
export class MyahCampaignInstagramAccountOptionDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String, { nullable: true })
  username: string | null;

  @Field(() => String, { nullable: true })
  status: string | null;
}

@ObjectType('MyahCampaignAgentSetting')
export class MyahCampaignAgentSettingDTO {
  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => MyahCampaignPreferredChannelEnum)
  preferredChannel: MyahCampaignPreferredChannelEnum;

  @Field(() => Boolean)
  requireReplyApproval: boolean;

  @Field(() => UUIDScalarType, { nullable: true })
  instagramAccountId: string | null;

  @Field(() => [MyahCampaignInstagramAccountOptionDTO])
  instagramAccountOptions: MyahCampaignInstagramAccountOptionDTO[];
}

@InputType()
export class MyahCampaignAgentSettingInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId: string;
}

@InputType()
export class UpdateMyahCampaignAgentSettingInput extends MyahCampaignAgentSettingInput {
  @Field(() => MyahCampaignPreferredChannelEnum, { nullable: true })
  @IsOptional()
  @IsIn(Object.values(MyahCampaignPreferredChannelEnum))
  preferredChannel?: MyahCampaignPreferredChannelEnum;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  requireReplyApproval?: boolean;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  instagramAccountId?: string | null;
}

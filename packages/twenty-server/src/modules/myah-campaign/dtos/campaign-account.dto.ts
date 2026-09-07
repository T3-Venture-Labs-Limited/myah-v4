import {
  Field,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { IsUUID } from 'class-validator';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

export enum CampaignEmailAccountHealth {
  AVAILABLE = 'AVAILABLE',
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  UNAVAILABLE = 'UNAVAILABLE',
}

registerEnumType(CampaignEmailAccountHealth, {
  name: 'CampaignEmailAccountHealth',
});

@InputType()
export class CampaignEmailAccountCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;
}

@InputType()
export class LinkCampaignEmailAccountInput extends CampaignEmailAccountCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  connectedAccountId!: string;
}

@InputType()
export class CampaignEmailAccountLinkInput extends CampaignEmailAccountCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignAccountId!: string;
}

@ObjectType()
export class CampaignEmailAccountDTO {
  @Field(() => UUIDScalarType)
  id!: string;

  @Field(() => UUIDScalarType)
  connectedAccountId!: string;

  @Field(() => UUIDScalarType)
  messageChannelId!: string;

  @Field(() => String, { nullable: true })
  provider!: ConnectedAccountProvider | null;

  @Field(() => String, { nullable: true })
  senderEmail!: string | null;

  @Field()
  label!: string;

  @Field(() => Boolean)
  isDefault!: boolean;

  @Field(() => CampaignEmailAccountHealth)
  health!: CampaignEmailAccountHealth;
}

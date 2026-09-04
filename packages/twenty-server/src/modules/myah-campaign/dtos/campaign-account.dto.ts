import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
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

@ObjectType()
export class CampaignEmailAccountDTO {
  @Field(() => UUIDScalarType)
  id!: string;

  @Field(() => UUIDScalarType)
  connectedAccountId!: string;

  @Field(() => UUIDScalarType)
  messageChannelId!: string;

  @Field(() => String)
  provider!: ConnectedAccountProvider;

  @Field()
  senderEmail!: string;

  @Field()
  label!: string;

  @Field(() => Boolean)
  isDefault!: boolean;

  @Field(() => CampaignEmailAccountHealth)
  health!: CampaignEmailAccountHealth;
}

import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsString, IsUUID, Matches } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class StartCampaignExecutionInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  startIdempotencyKey!: string;
}

@InputType()
export class StopCampaignExecutionInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;
}

@InputType()
export class UpdateCampaignSendingWindowInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;

  @Field()
  @IsString()
  timeZone!: string;

  @Field()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
  startLocalTime!: string;

  @Field()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
  endLocalTime!: string;
}

@ObjectType()
export class CampaignSendingWindowMutationResultDTO {
  @Field()
  status!: 'UPDATED' | 'UNCHANGED' | 'BLOCKED';

  @Field(() => String, { nullable: true })
  reason!: string | null;
}

@ObjectType()
export class CampaignExecutionMutationResultDTO {
  @Field()
  status!: 'STARTED' | 'STOPPED' | 'ACKNOWLEDGED' | 'BLOCKED';

  @Field(() => String, { nullable: true })
  lifecycleStatus!: 'ACTIVE' | 'STOPPED' | null;

  @Field(() => String, { nullable: true })
  reason!: string | null;

  @Field()
  replayed!: boolean;

  @Field()
  changed!: boolean;

  @Field(() => Int, { nullable: true })
  inFlightCount!: number | null;
}

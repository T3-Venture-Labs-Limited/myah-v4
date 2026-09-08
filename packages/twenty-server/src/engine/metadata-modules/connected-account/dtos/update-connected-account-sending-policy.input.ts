import { Field, InputType, Int } from '@nestjs/graphql';

import { IsInt, IsUUID, Min } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class UpdateConnectedAccountSendingPolicyInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  connectedAccountId: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  dailySendLimit: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  minimumSendIntervalMs: number;
}

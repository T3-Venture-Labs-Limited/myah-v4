import { Field, InputType, Int } from '@nestjs/graphql';

import { IsInt, IsUUID, Max, Min } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

const GRAPHQL_INT_MAX = 2_147_483_647;

@InputType()
export class UpdateConnectedAccountSendingPolicyInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  connectedAccountId: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(GRAPHQL_INT_MAX)
  dailySendLimit: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(GRAPHQL_INT_MAX)
  minimumSendIntervalMs: number;
}

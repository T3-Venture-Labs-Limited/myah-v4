import { ArgsType, Field, Int } from '@nestjs/graphql';

import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ArgsType()
export class GrantManagedProviderCreditInput {
  @Field(() => UUIDScalarType)
  @IsNotEmpty()
  @IsUUID()
  workspaceId: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  amountCents: number;

  @Field(() => Date)
  @IsDate()
  endingBefore: Date;

  @Field(() => String)
  @Length(1, 128)
  idempotencyKey: string;

  @Field(() => String)
  @IsNotEmpty()
  @Length(1, 500)
  reason: string;
}

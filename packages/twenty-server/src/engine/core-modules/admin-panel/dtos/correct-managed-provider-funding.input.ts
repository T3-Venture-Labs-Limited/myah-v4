import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsNotEmpty, IsUUID, Length, Min } from 'class-validator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ArgsType()
export class CorrectManagedProviderFundingInput {
  @Field(() => UUIDScalarType) @IsUUID() workspaceId: string;
  @Field(() => UUIDScalarType) @IsUUID() correctedOperationId: string;
  @Field(() => String) @Length(1, 128) idempotencyKey: string;
  @Field(() => String) @IsNotEmpty() externalReference: string;
  @Field(() => Int) @IsInt() @Min(1) amountCents: number;
  @Field(() => String, { defaultValue: 'USD' }) currency: string;
  @Field(() => String) @Length(1, 500) reason: string;
}

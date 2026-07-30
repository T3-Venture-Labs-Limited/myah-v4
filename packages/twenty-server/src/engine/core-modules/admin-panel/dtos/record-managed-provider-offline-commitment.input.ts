import { ArgsType, Field, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ArgsType()
export class RecordManagedProviderOfflineCommitmentInput {
  @Field(() => UUIDScalarType) @IsUUID() workspaceId: string;
  @Field(() => String) @Length(1, 128) idempotencyKey: string;
  @Field(() => String) @IsNotEmpty() externalReference: string;
  @Field(() => Int) @IsInt() @Min(1) amountCents: number;
  @Field(() => String, { defaultValue: 'USD' }) currency: string;
  @Field(() => String) @Length(1, 500) reason: string;
  @Field(() => Date, { nullable: true }) @IsOptional() expiresAt?: Date;
  @Field(() => String, { nullable: true }) @IsOptional() applicability?: string;
  @Field(() => String) @IsNotEmpty() paymentEvidence: string;
}

import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class ResolveInstagramSendOutcomeInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  receiptId: string;

  @Field()
  @IsIn(['CONFIRMED_SENT', 'CLEARED_NOT_SENT'])
  outcome: 'CONFIRMED_SENT' | 'CLEARED_NOT_SENT';

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  senderUiReviewed?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  recipientUiReviewed?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@ObjectType()
export class InstagramSendOutcomeResolutionDto {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => UUIDScalarType)
  receiptId: string;

  @Field()
  outcome: string;
}

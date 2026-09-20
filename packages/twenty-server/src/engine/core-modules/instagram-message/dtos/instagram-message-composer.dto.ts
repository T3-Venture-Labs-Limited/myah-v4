import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class PrepareInstagramMessageComposerInputDto {
  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  creatorRecordId: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  rawHandle: string | null;
}

@ObjectType()
export class InstagramMessageComposerSenderDto {
  @Field(() => UUIDScalarType)
  accountRecordId: string;

  @Field()
  label: string;
}

@ObjectType()
export class InstagramMessageComposerPreparedDto {
  @Field()
  status: string;

  @Field(() => String, { nullable: true })
  code: string | null;

  @Field(() => String, { nullable: true })
  normalizedHandle: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  creatorRecordId: string | null;

  @Field(() => InstagramMessageComposerSenderDto, { nullable: true })
  sender: InstagramMessageComposerSenderDto | null;

  @Field(() => String, { nullable: true })
  actionKind: string | null;

  @Field(() => String, { nullable: true })
  preparationFingerprint: string | null;
}

@ObjectType()
@InputType()
export class SendInstagramMessageComposerInputDto extends PrepareInstagramMessageComposerInputDto {
  @Field(() => UUIDScalarType)
  @IsUUID()
  draftId: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  expectedAccountRecordId: string;

  @Field()
  @IsString()
  expectedPreparationFingerprint: string;

  @Field()
  @IsString()
  body: string;
}

@ObjectType()
export class InstagramMessageComposerAttemptDto {
  @Field(() => UUIDScalarType)
  draftId: string;

  @Field(() => UUIDScalarType, { nullable: true })
  approvalBindingId: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  receiptId: string | null;

  @Field(() => String, { nullable: true })
  state: string | null;
}

@ObjectType()
export class InstagramMessageComposerAccountDto {
  @Field()
  status: string;

  @Field(() => String, { nullable: true })
  code: string | null;

  @Field(() => InstagramMessageComposerSenderDto, { nullable: true })
  sender: InstagramMessageComposerSenderDto | null;
}

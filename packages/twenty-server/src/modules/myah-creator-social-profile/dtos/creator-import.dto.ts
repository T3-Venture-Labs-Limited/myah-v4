import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { SOCIAL_PROFILE_PLATFORMS } from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

@InputType()
export class CreatorImportCreatorInput {
  @Field() @IsString() @Length(1, 256) name: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  @Length(1, 320)
  email?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  phone?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  location?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  language?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  source?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  sourceUrl?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  importSource?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  lastImportedAt?: string;
}

@InputType()
export class CreatorImportSocialProfileInput {
  @Field()
  @IsIn(SOCIAL_PROFILE_PLATFORMS)
  platform: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  handle?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  profileUrl?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  platformAccountId?: string;
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  followerCount?: number;
  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  followerCountObservedAt?: string;
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  followerCountSource?: string;
}

@InputType()
export class CreatorImportNoteInput {
  @Field() @IsString() @Length(1, 256) title: string;
  @Field() @IsString() @Length(1, 100_000) markdown: string;
}

@InputType()
export class CommitCreatorImportInput {
  @Field(() => UUIDScalarType) @IsUUID() attemptKey: string;
  @Field() @IsString() @Length(1, 256) operationKey: string;
  @Field(() => CreatorImportCreatorInput)
  @ValidateNested()
  @Type(() => CreatorImportCreatorInput)
  creator: CreatorImportCreatorInput;
  @Field(() => [CreatorImportSocialProfileInput])
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreatorImportSocialProfileInput)
  profiles: CreatorImportSocialProfileInput[];
  @Field(() => CreatorImportNoteInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatorImportNoteInput)
  note?: CreatorImportNoteInput;
}

@ObjectType()
export class CommitCreatorImportResult {
  @Field(() => UUIDScalarType) receiptId: string;
  @Field(() => UUIDScalarType) creatorId: string;
  @Field(() => [UUIDScalarType]) socialProfileIds: string[];
  @Field(() => UUIDScalarType, { nullable: true }) noteId: string | null;
  @Field(() => UUIDScalarType, { nullable: true }) noteTargetId: string | null;
  @Field() replayed: boolean;
}

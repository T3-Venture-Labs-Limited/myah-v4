import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  Length,
  Max,
  Min,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { SOCIAL_PROFILE_PLATFORMS } from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

@InputType()
export class UpdateSocialProfileIdentityInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  id: string;

  @Field({ nullable: true })
  @ValidateIf((_input, value) => value !== undefined)
  @IsIn(SOCIAL_PROFILE_PLATFORMS)
  platform?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  handle?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  profileUrl?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  platformAccountId?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  followerCount?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsISO8601()
  followerCountObservedAt?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  followerCountSource?: string | null;
}

@InputType()
class SocialProfileTargetInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  id: string;
}

@InputType()
export class RetireSocialProfileInput extends SocialProfileTargetInput {}

@InputType()
export class RestoreSocialProfileInput extends SocialProfileTargetInput {}

@ObjectType()
export class SocialProfileDTO {
  @Field(() => UUIDScalarType) id: string;
  @Field(() => UUIDScalarType) creatorId: string;
  @Field() name: string;
  @Field() platform: string;
  @Field(() => String, { nullable: true }) handle: string | null;
  @Field(() => String, { nullable: true }) profileUrl: string | null;
  @Field(() => String, { nullable: true }) platformAccountId: string | null;
  @Field(() => Int, { nullable: true }) followerCount: number | null;
  @Field(() => Date, { nullable: true }) followerCountObservedAt: Date | null;
  @Field(() => String, { nullable: true }) followerCountSource: string | null;
  @Field(() => Date, { nullable: true }) deletedAt: Date | null;
}

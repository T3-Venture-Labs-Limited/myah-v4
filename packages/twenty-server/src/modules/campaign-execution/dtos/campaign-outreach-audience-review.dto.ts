import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

export enum CampaignOutreachAudienceReviewStateDTO {
  LOADED = 'LOADED',
  ERROR = 'ERROR',
}

export enum CampaignOutreachAudienceExclusionReasonDTO {
  INVALID_MEMBERSHIP = 'INVALID_MEMBERSHIP',
  MISSING_CREATOR = 'MISSING_CREATOR',
  INVALID_STAGE = 'INVALID_STAGE',
  NON_EMAIL_CONTACT_METHOD = 'NON_EMAIL_CONTACT_METHOD',
  INVALID_EMAIL = 'INVALID_EMAIL',
  SUPPRESSED_EMAIL = 'SUPPRESSED_EMAIL',
  DUPLICATE_CREATOR_EMAIL = 'DUPLICATE_CREATOR_EMAIL',
}

registerEnumType(CampaignOutreachAudienceReviewStateDTO, {
  name: 'CampaignOutreachAudienceReviewState',
});
registerEnumType(CampaignOutreachAudienceExclusionReasonDTO, {
  name: 'CampaignOutreachAudienceExclusionReason',
});

@ObjectType('CampaignOutreachAudienceCreator')
export class CampaignOutreachAudienceCreatorDTO {
  @Field(() => UUIDScalarType)
  campaignCreatorId: string;

  @Field(() => UUIDScalarType)
  creatorId: string;

  @Field(() => String)
  creatorName: string;
}

@ObjectType('CampaignOutreachAudienceExcludedCreator')
export class CampaignOutreachAudienceExcludedCreatorDTO {
  @Field(() => UUIDScalarType)
  campaignCreatorId: string;

  @Field(() => UUIDScalarType, { nullable: true })
  creatorId: string | null;

  @Field(() => String, { nullable: true })
  creatorName: string | null;

  @Field(() => [CampaignOutreachAudienceExclusionReasonDTO])
  reasons: CampaignOutreachAudienceExclusionReasonDTO[];
}

@ObjectType('CampaignOutreachAudienceReview')
export class CampaignOutreachAudienceReviewDTO {
  @Field(() => CampaignOutreachAudienceReviewStateDTO)
  state: CampaignOutreachAudienceReviewStateDTO;

  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => String, { nullable: true })
  errorCode: string | null;

  @Field(() => Int)
  eligibleCount: number;

  @Field(() => [CampaignOutreachAudienceCreatorDTO])
  eligibleCreators: CampaignOutreachAudienceCreatorDTO[];

  @Field(() => Int)
  excludedCount: number;

  @Field(() => [CampaignOutreachAudienceExcludedCreatorDTO])
  excludedCreators: CampaignOutreachAudienceExcludedCreatorDTO[];
}

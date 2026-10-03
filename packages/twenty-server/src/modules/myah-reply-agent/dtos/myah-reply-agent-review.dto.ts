import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

import { IsIn, IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class MyahReplyAgentReviewInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId: string;
}

@InputType()
export class RegenerateMyahReplyAgentDraftInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignCreatorId: string;
}

@InputType()
export class MyahReplyAgentDraftLabelInput {
  @Field()
  @IsIn(['EMAIL', 'INSTAGRAM'])
  channel: 'EMAIL' | 'INSTAGRAM';

  @Field(() => UUIDScalarType)
  @IsUUID()
  conversationRecordId: string;
}

@ObjectType('MyahReplyAgentReviewNode')
export class MyahReplyAgentReviewNodeDTO {
  @Field(() => UUIDScalarType)
  campaignCreatorId: string;

  @Field(() => UUIDScalarType)
  creatorId: string;

  // REVIEW_DRAFT | NEEDS_YOU | SENT_AUTOMATICALLY | SEND_UNKNOWN | SKIPPED | NOT_CONTACTABLE
  @Field(() => String, { nullable: true })
  nextAction: string | null;

  @Field(() => String, { nullable: true })
  reason: string | null;

  @Field(() => String, { nullable: true })
  channel: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  conversationRecordId: string | null;

  @Field(() => String, { nullable: true })
  inboxContactId: string | null;
}

@ObjectType('MyahReplyAgentReview')
export class MyahReplyAgentReviewDTO {
  @Field(() => [MyahReplyAgentReviewNodeDTO])
  nodes: MyahReplyAgentReviewNodeDTO[];

  @Field(() => Int)
  needReviewCount: number;
}

@ObjectType('MyahReplyAgentDraftLabel')
export class MyahReplyAgentDraftLabelDTO {
  // DRAFTED | NEEDS_YOU
  @Field()
  kind: string;

  @Field(() => String, { nullable: true })
  reason: string | null;

  @Field(() => String, { nullable: true })
  campaignName: string | null;
}

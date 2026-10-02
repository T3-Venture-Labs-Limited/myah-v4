import { ArgsType, Field, Int, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ArgsType()
export class MyahInboxCampaignReplyHeldInput {
  @Field(() => UUIDScalarType)
  expectedWorkspaceId: string;

  @Field(() => UUIDScalarType)
  threadId: string;

  @Field(() => String, { nullable: true })
  cursor?: string;
}

@ArgsType()
export class MyahInboxCampaignReplyPromoteInput {
  @Field(() => UUIDScalarType)
  expectedWorkspaceId: string;

  @Field(() => UUIDScalarType)
  workItemId: string;

  @Field(() => UUIDScalarType)
  bindingId: string;

  @Field(() => Int)
  expectedContextGeneration: number;

  @Field(() => Int)
  expectedParticipationMaterialGeneration: number;
}

@ObjectType()
export class MyahInboxCampaignReplyChoice {
  @Field(() => UUIDScalarType)
  bindingId: string;

  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => UUIDScalarType)
  participationId: string;

  @Field(() => UUIDScalarType)
  creatorId: string;
}

@ObjectType()
export class MyahInboxCampaignReplyHeldWork {
  @Field(() => UUIDScalarType)
  workItemId: string;

  @Field(() => Int)
  contextGeneration: number;

  @Field(() => [MyahInboxCampaignReplyChoice])
  choices: MyahInboxCampaignReplyChoice[];
}

@ObjectType()
export class MyahInboxCampaignReplyHeldPage {
  @Field(() => [MyahInboxCampaignReplyHeldWork])
  items: MyahInboxCampaignReplyHeldWork[];

  @Field(() => Boolean)
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType()
export class MyahInboxCampaignReplyCollision {
  @Field(() => UUIDScalarType)
  collisionId: string;

  @Field(() => UUIDScalarType)
  originalWorkItemId: string;

  @Field(() => String)
  originalState: string;
}

@ObjectType()
export class MyahInboxCampaignReplyCollisionPage {
  @Field(() => [MyahInboxCampaignReplyCollision])
  items: MyahInboxCampaignReplyCollision[];

  @Field(() => Boolean)
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType()
export class MyahInboxCampaignReplyPromoted {
  @Field(() => UUIDScalarType)
  workItemId: string;

  @Field(() => String)
  state: string;

  @Field(() => Int)
  contextGeneration: number;
}

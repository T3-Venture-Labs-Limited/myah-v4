import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxRichText } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

export enum MyahInboxReplyDraftExecutionState {
  READY = 'READY',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  OUTCOME_PENDING = 'OUTCOME_PENDING',
  OUTCOME_UNKNOWN = 'OUTCOME_UNKNOWN',
  CONTEXT_UNAVAILABLE = 'CONTEXT_UNAVAILABLE',
}

registerEnumType(MyahInboxReplyDraftExecutionState, {
  name: 'MyahInboxReplyDraftExecutionState',
});

@ObjectType('MyahInboxResolvedReplyTarget')
export class MyahInboxResolvedReplyTarget {
  @Field(() => ReplyChannel)
  channel: ReplyChannel;

  @Field(() => UUIDScalarType)
  deliveryTargetId: string;

  @Field(() => String)
  contactAnchorKind: string;

  @Field(() => UUIDScalarType)
  contactAnchorId: string;

  @Field(() => UUIDScalarType, { nullable: true })
  creatorId: string | null;
}

@ObjectType('MyahInboxResolvedReplyContext')
export class MyahInboxResolvedReplyContext {
  @Field(() => MyahInboxResolvedReplyTarget)
  target: MyahInboxResolvedReplyTarget;

  @Field(() => ReplyContextKind)
  kind: ReplyContextKind;

  @Field(() => UUIDScalarType, { nullable: true })
  campaignId: string | null;

  @Field(() => String, { nullable: true })
  contextFingerprint: string | null;
}

@ObjectType('MyahInboxReplyContextDraft')
export class MyahInboxReplyContextDraft {
  @Field(() => UUIDScalarType, { nullable: true })
  draftId: string | null;

  @Field(() => Int)
  revision: number;

  @Field(() => MyahInboxRichText, { nullable: true })
  body: MyahInboxRichText | null;

  @Field(() => MyahInboxResolvedReplyContext, { nullable: true })
  resolvedContext: MyahInboxResolvedReplyContext | null;

  @Field(() => MyahInboxReplyDraftExecutionState)
  executionState: MyahInboxReplyDraftExecutionState;
}

import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { MyahInboxThreadContext } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';

export enum MyahInboxContactIdentityKind {
  CREATOR = 'CREATOR',
  EMAIL_THREAD = 'EMAIL_THREAD',
  INSTAGRAM_CONVERSATION = 'INSTAGRAM_CONVERSATION',
}

export enum MyahInboxContactLatestChannel {
  EMAIL = 'EMAIL',
  INSTAGRAM = 'INSTAGRAM',
}

export enum MyahInboxInstagramChannelState {
  UNAVAILABLE = 'UNAVAILABLE',
  READY = 'READY',
  AMBIGUOUS = 'AMBIGUOUS',
}

registerEnumType(MyahInboxContactIdentityKind, {
  name: 'MyahInboxContactIdentityKind',
});
registerEnumType(MyahInboxContactLatestChannel, {
  name: 'MyahInboxContactLatestChannel',
});
registerEnumType(MyahInboxInstagramChannelState, {
  name: 'MyahInboxInstagramChannelState',
});

@ObjectType('MyahInboxContactEmailChannelSummary')
export class MyahInboxContactEmailChannelSummary {
  @Field(() => Boolean)
  isAvailable: boolean;

  @Field(() => Int)
  threadCount: number;

  @Field(() => [UUIDScalarType])
  threadIds: string[];

  @Field(() => UUIDScalarType, { nullable: true })
  latestThreadId: string | null;

  @Field(() => Boolean)
  needsAttention: boolean;
}

@ObjectType('MyahInboxContactInstagramConversation')
export class MyahInboxContactInstagramConversation {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String)
  providerConversationId: string;

  @Field(() => String)
  provider: 'COMPOSIO_HISTORY' | 'UNIPILE';

  @Field(() => String)
  lifecycle: 'ACTIVE' | 'HISTORICAL';

  @Field(() => String, { nullable: true })
  recipientUsername: string | null;

  @Field(() => String, { nullable: true })
  recipientDisplayName: string | null;

  @Field(() => String)
  lastActivityAt: string;

  @Field(() => String, { nullable: true })
  latestDirection: 'INBOUND' | 'OUTBOUND' | 'UNKNOWN' | null;
}

@ObjectType('MyahInboxContactInstagramChannelSummary')
export class MyahInboxContactInstagramChannelSummary {
  @Field(() => Boolean)
  isAvailable: boolean;

  @Field(() => MyahInboxInstagramChannelState)
  state: MyahInboxInstagramChannelState;

  @Field(() => Boolean)
  needsAttention: boolean;

  @Field(() => [MyahInboxContactInstagramConversation])
  conversations: MyahInboxContactInstagramConversation[];
}

@ObjectType('MyahInboxContactTriageSummary')
export class MyahInboxContactTriageSummary {
  @Field(() => Boolean)
  isAvailable: boolean;

  @Field(() => UUIDScalarType, { nullable: true })
  inboxOwnerId: string | null;

  @Field(() => MyahInboxState, { nullable: true })
  inboxState: MyahInboxState | null;

  @Field(() => String, { nullable: true })
  snoozedUntil: string | null;

  @Field(() => Int, { nullable: true })
  revision: number | null;

  @Field(() => String, { nullable: true })
  identityGeneration: string | null;
}

@ObjectType('MyahInboxContactInitialSelection')
export class MyahInboxContactInitialSelection {
  @Field(() => MyahInboxContactLatestChannel)
  channel: MyahInboxContactLatestChannel;

  @Field(() => UUIDScalarType, { nullable: true })
  emailThreadId: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  instagramConversationId: string | null;
}

@ObjectType('MyahInboxContactSummary')
export class MyahInboxContactSummary {
  @Field(() => String)
  id: string;

  @Field(() => MyahInboxContactIdentityKind)
  identityKind: MyahInboxContactIdentityKind;

  @Field(() => String)
  displayName: string;

  @Field(() => MyahInboxThreadContext, { nullable: true })
  creator: MyahInboxThreadContext | null;

  @Field(() => String)
  lastActivityAt: string;

  @Field(() => String, { nullable: true })
  instagramUsername: string | null;

  @Field(() => MyahInboxContactLatestChannel)
  latestChannel: MyahInboxContactLatestChannel;

  @Field(() => MyahInboxContactInitialSelection)
  initialSelection: MyahInboxContactInitialSelection;

  @Field(() => String, { nullable: true })
  preview: string | null;

  @Field(() => String, { nullable: true })
  sender: string | null;

  @Field(() => Boolean)
  needsAttention: boolean;

  @Field(() => MyahInboxContactTriageSummary)
  triage: MyahInboxContactTriageSummary;

  @Field(() => MyahInboxContactEmailChannelSummary)
  email: MyahInboxContactEmailChannelSummary;

  @Field(() => MyahInboxContactInstagramChannelSummary)
  instagram: MyahInboxContactInstagramChannelSummary;
}

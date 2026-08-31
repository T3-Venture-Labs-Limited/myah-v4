import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import {
  MyahInboxRichText,
  type MyahRichText,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';

export enum MyahInboxReplySendReadinessStatus {
  READY = 'READY',
  THREAD_UNAVAILABLE = 'THREAD_UNAVAILABLE',
  SENDER_UNAVAILABLE = 'SENDER_UNAVAILABLE',
  RECIPIENT_UNAVAILABLE = 'RECIPIENT_UNAVAILABLE',
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  MAILBOX_INELIGIBLE = 'MAILBOX_INELIGIBLE',
  OUTCOME_PENDING = 'OUTCOME_PENDING',
  OUTCOME_UNKNOWN = 'OUTCOME_UNKNOWN',
}

export enum MyahInboxReplySendOutcome {
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  STALE = 'STALE',
}

registerEnumType(MyahInboxReplySendReadinessStatus, {
  name: 'MyahInboxReplySendReadinessStatus',
});
registerEnumType(MyahInboxReplySendOutcome, {
  name: 'MyahInboxReplySendOutcome',
});

@ObjectType('MyahInboxReplySendReadiness')
export class MyahInboxReplySendReadiness {
  @Field(() => MyahInboxReplySendReadinessStatus)
  status: MyahInboxReplySendReadinessStatus;

  @Field(() => String, { nullable: true })
  reason: string | null;
}

@ObjectType('MyahInboxReplySendResult')
export class MyahInboxReplySendResult {
  @Field(() => MyahInboxReplySendOutcome)
  outcome: MyahInboxReplySendOutcome;

  @Field(() => String, { nullable: true })
  receiptId: string | null;

  @Field(() => Int)
  revision: number;

  @Field(() => MyahInboxRichText, { nullable: true })
  body: MyahRichText | null;
}

@ObjectType('MyahInboxReplySendStatus')
export class MyahInboxReplySendStatus {
  @Field(() => MyahInboxReplySendOutcome)
  outcome: MyahInboxReplySendOutcome;

  @Field(() => String, { nullable: true })
  receiptId: string | null;

  @Field(() => Int)
  revision: number;

  @Field(() => MyahInboxRichText, { nullable: true })
  body: MyahRichText | null;
}

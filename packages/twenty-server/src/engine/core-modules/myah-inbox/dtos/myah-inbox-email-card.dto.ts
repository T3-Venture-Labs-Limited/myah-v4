import { Field, ObjectType } from '@nestjs/graphql';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxContactEmailMessage } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-email-message.dto';

@ObjectType()
export class MyahInboxEmailCard {
  @Field(() => UUIDScalarType) threadId: string;
  @Field(() => String) anchorKey: string;
  @Field(() => UUIDScalarType) rootMessageId: string;
  @Field(() => String) startTimestamp: string;
  @Field(() => String, { nullable: true }) subject: string | null;
  @Field(() => String, { nullable: true }) campaignLabel: string | null;
  @Field(() => String) historyBasis: 'EARLIEST_AUTHORIZED_RETAINED' | 'PENDING';
}

@ObjectType()
export class MyahInboxEmailCardPage {
  @Field(() => [MyahInboxEmailCard]) cards: MyahInboxEmailCard[];
  @Field(() => String) snapshot: string;
  @Field(() => String, { nullable: true }) olderCursor: string | null;
  @Field(() => UUIDScalarType, { nullable: true }) latestThreadId:
    | string
    | null;
}

@ObjectType()
export class MyahInboxEmailMessagePage {
  @Field(() => UUIDScalarType) threadId: string;
  @Field(() => String) anchorKey: string;
  @Field(() => MyahInboxContactEmailMessage) root: MyahInboxContactEmailMessage;
  @Field(() => [MyahInboxContactEmailMessage])
  messages: MyahInboxContactEmailMessage[];
  @Field(() => String, { nullable: true }) olderCursor: string | null;
  @Field(() => String, { nullable: true }) newerCursor: string | null;
}

@ObjectType()
export class MyahInboxEmailMessageLocation {
  @Field(() => MyahInboxEmailCard) card: MyahInboxEmailCard;
  @Field(() => MyahInboxEmailMessagePage) page: MyahInboxEmailMessagePage;
  @Field(() => UUIDScalarType) messageId: string;
}

@ObjectType()
export class MyahInboxEmailCardProjection {
  @Field(() => String) snapshot: string;
  @Field(() => MyahInboxEmailCard, { nullable: true })
  card: MyahInboxEmailCard | null;
}

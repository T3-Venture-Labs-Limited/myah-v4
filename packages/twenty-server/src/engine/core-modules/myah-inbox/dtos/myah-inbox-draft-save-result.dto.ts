import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export type MyahRichText = {
  markdown: string;
  blocknote: string | null;
};

export enum MyahInboxDraftSaveStatus {
  SAVED = 'SAVED',
  CONFLICT = 'CONFLICT',
}

registerEnumType(MyahInboxDraftSaveStatus, {
  name: 'MyahInboxDraftSaveStatus',
});

@ObjectType('MyahInboxRichText')
export class MyahInboxRichText implements MyahRichText {
  @Field(() => String)
  markdown: string;

  @Field(() => String, { nullable: true })
  blocknote: string | null;
}

@ObjectType('MyahInboxDraftSaveResult')
export class MyahInboxDraftSaveResult {
  @Field(() => MyahInboxDraftSaveStatus)
  status: MyahInboxDraftSaveStatus;

  @Field(() => Int)
  revision: number;

  @Field(() => MyahInboxRichText, { nullable: true })
  body: MyahRichText | null;
}

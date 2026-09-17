import { Field, InputType, Int } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { MyahInboxReplyDraftInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import {
  MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH,
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';

@InputType('MyahInboxRichTextInput')
export class MyahInboxRichTextInput {
  @Field(() => String)
  @IsString()
  @MaxLength(MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH)
  markdown: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH)
  blocknote: string | null;
}

@InputType('SaveMyahInboxDraftInput')
export class SaveMyahInboxDraftInput extends MyahInboxReplyDraftInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  proposalContextFingerprint?: string | null;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @Field(() => MyahInboxRichTextInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => MyahInboxRichTextInput)
  body: MyahInboxRichTextInput | null;
}

@InputType('ReviewMyahInboxReplyContextInput')
export class ReviewMyahInboxReplyContextInput extends MyahInboxReplyDraftInput {
  @Field(() => Int)
  @IsInt()
  @Min(0)
  expectedDraftRevision: number;

  @Field(() => String)
  @Matches(/^[a-f0-9]{64}$/)
  expectedContextFingerprint: string;
}

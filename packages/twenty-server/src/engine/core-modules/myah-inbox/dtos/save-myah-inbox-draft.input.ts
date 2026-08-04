import { Field, InputType, Int } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
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
export class SaveMyahInboxDraftInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

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

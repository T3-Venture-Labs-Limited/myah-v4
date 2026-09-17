import { BadRequestException } from '@nestjs/common';
import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { isValidUuid } from 'twenty-shared/utils';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import {
  MYAH_INBOX_DEFAULT_PAGE_SIZE,
  MYAH_INBOX_MAX_PAGE_SIZE,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  ReplyChannel,
  ReplyTargetInput,
  validateReplyTargetInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

@InputType('MyahInboxReplyContextOptionsInput')
export class MyahInboxReplyContextOptionsInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  expectedWorkspaceId: string;

  @Field(() => ReplyTargetInput)
  @IsDefined()
  @ValidateNested()
  target: ReplyTargetInput;

  @Field(() => Int, {
    nullable: true,
    defaultValue: MYAH_INBOX_DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MYAH_INBOX_MAX_PAGE_SIZE)
  first?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  after?: string | null;
}

export const validateReplyContextOptionsInput = (
  input: MyahInboxReplyContextOptionsInput,
) => {
  if (
    typeof input.expectedWorkspaceId !== 'string' ||
    !isValidUuid(input.expectedWorkspaceId)
  ) {
    throw new BadRequestException('Expected workspace ID is required');
  }
  const target = validateReplyTargetInput(input.target);
  if (target.channel !== ReplyChannel.EMAIL) {
    throw new BadRequestException(
      'Reply context options require an Email target',
    );
  }
  const first = input.first ?? MYAH_INBOX_DEFAULT_PAGE_SIZE;
  if (
    !Number.isInteger(first) ||
    first < 1 ||
    first > MYAH_INBOX_MAX_PAGE_SIZE
  ) {
    throw new BadRequestException('Invalid reply context options page size');
  }
  if (
    input.after != null &&
    (typeof input.after !== 'string' ||
      input.after.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/.test(input.after))
  ) {
    throw new BadRequestException('Invalid reply context options cursor');
  }
  return { target, first };
};

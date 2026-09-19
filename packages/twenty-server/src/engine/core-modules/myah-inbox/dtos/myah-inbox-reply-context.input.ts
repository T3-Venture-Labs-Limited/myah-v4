import { BadRequestException } from '@nestjs/common';
import { Field, InputType, registerEnumType } from '@nestjs/graphql';

import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
  IsDefined,
} from 'class-validator';

import { isValidUuid } from 'twenty-shared/utils';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

export enum ReplyChannel {
  EMAIL = 'EMAIL',
  INSTAGRAM = 'INSTAGRAM',
}

export enum ReplyContextKind {
  CAMPAIGN = 'CAMPAIGN',
  GENERAL = 'GENERAL',
}

registerEnumType(ReplyChannel, { name: 'ReplyChannel' });
registerEnumType(ReplyContextKind, { name: 'ReplyContextKind' });

export type ReplyTarget =
  | { channel: ReplyChannel.EMAIL; contactId: string; threadId: string }
  | {
      channel: ReplyChannel.INSTAGRAM;
      contactId: string;
      conversationId: string;
    };

export type ReplyContext =
  | { kind: ReplyContextKind.GENERAL; campaignId?: never }
  | { kind: ReplyContextKind.CAMPAIGN; campaignId: string };

@InputType('ReplyTargetInput')
export class ReplyTargetInput {
  @Field(() => ReplyChannel)
  @IsEnum(ReplyChannel)
  channel: ReplyChannel;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @Length(1, 512)
  contactId: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  threadId?: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  conversationId?: string | null;
}

@InputType('ReplyContextInput')
export class ReplyContextInput {
  @Field(() => ReplyContextKind)
  @IsEnum(ReplyContextKind)
  kind: ReplyContextKind;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  campaignId?: string | null;
}

@InputType('MyahInboxReplyDraftInput')
export class MyahInboxReplyDraftInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  expectedWorkspaceId: string;

  @Field(() => ReplyTargetInput)
  @IsDefined()
  @ValidateNested()
  target: ReplyTargetInput;

  @Field(() => ReplyContextInput)
  @IsDefined()
  @ValidateNested()
  replyContext: ReplyContextInput;
}

export const validateReplyTargetInput = (
  input: ReplyTargetInput | ReplyTarget,
): ReplyTarget => {
  const target = input as ReplyTargetInput;

  if (
    typeof target.contactId !== 'string' ||
    target.contactId.length === 0 ||
    target.contactId.length > 512
  ) {
    throw new BadRequestException('Invalid reply target contact ID');
  }

  if (target.channel === ReplyChannel.EMAIL) {
    if (!target.threadId) {
      throw new BadRequestException('Email reply target requires a thread ID');
    }
    if (target.conversationId !== null && target.conversationId !== undefined) {
      throw new BadRequestException(
        'Email reply target must not include a conversation ID',
      );
    }
    if (!isValidUuid(target.threadId)) {
      throw new BadRequestException('Invalid reply target thread ID');
    }
    return {
      channel: ReplyChannel.EMAIL,
      contactId: target.contactId,
      threadId: target.threadId,
    };
  }

  if (target.channel === ReplyChannel.INSTAGRAM) {
    if (!target.conversationId) {
      throw new BadRequestException(
        'Instagram reply target requires a conversation ID',
      );
    }
    if (target.threadId !== null && target.threadId !== undefined) {
      throw new BadRequestException(
        'Instagram reply target must not include a thread ID',
      );
    }
    if (!isValidUuid(target.conversationId)) {
      throw new BadRequestException('Invalid reply target conversation ID');
    }
    return {
      channel: ReplyChannel.INSTAGRAM,
      contactId: target.contactId,
      conversationId: target.conversationId,
    };
  }

  throw new BadRequestException('Invalid reply target channel');
};

export const validateReplyContextInput = (
  input: ReplyContextInput | ReplyContext,
): ReplyContext => {
  if (input.kind === ReplyContextKind.CAMPAIGN) {
    if (!input.campaignId) {
      throw new BadRequestException(
        'Campaign reply context requires a Campaign ID',
      );
    }
    if (!isValidUuid(input.campaignId)) {
      throw new BadRequestException('Invalid reply context Campaign ID');
    }
    return { kind: ReplyContextKind.CAMPAIGN, campaignId: input.campaignId };
  }

  if (input.kind === ReplyContextKind.GENERAL) {
    if (input.campaignId !== null && input.campaignId !== undefined) {
      throw new BadRequestException(
        'General reply context must not include a Campaign ID',
      );
    }
    return { kind: ReplyContextKind.GENERAL };
  }

  throw new BadRequestException('Invalid reply context kind');
};

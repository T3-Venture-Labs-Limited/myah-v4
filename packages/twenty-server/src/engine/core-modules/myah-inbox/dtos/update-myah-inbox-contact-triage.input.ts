import { BadRequestException } from '@nestjs/common';
import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  isISO8601,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';

const POSTGRES_BIGINT_MAX = BigInt('9223372036854775807');

type MyahInboxContactTriagePatch = {
  inboxOwnerId?: string | null;
  inboxState?: MyahInboxState | null;
  snoozedUntil?: string | null;
};

const isPostgresBigint = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) {
    return false;
  }

  return BigInt(value) <= POSTGRES_BIGINT_MAX;
};

const isValidTriagePatch = (input: MyahInboxContactTriagePatch): boolean => {
  const hasOwnerMutation = input.inboxOwnerId !== undefined;
  const hasStateMutation =
    input.inboxState !== undefined && input.inboxState !== null;

  if (!hasOwnerMutation && !hasStateMutation) {
    return false;
  }

  if (!hasStateMutation) {
    return input.snoozedUntil === undefined || input.snoozedUntil === null;
  }

  if (input.inboxState !== MyahInboxState.SNOOZED) {
    return input.snoozedUntil === undefined || input.snoozedUntil === null;
  }

  return (
    typeof input.snoozedUntil === 'string' &&
    isISO8601(input.snoozedUntil, { strict: true }) &&
    Date.parse(input.snoozedUntil) > Date.now()
  );
};

const IsPostgresBigint =
  () => (object: { constructor: Function }, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      validator: {
        validate: isPostgresBigint,
        defaultMessage: () =>
          'expectedIdentityGeneration must be a positive PostgreSQL bigint',
      },
    });
  };

const HasValidTriagePatch = (): ClassDecorator => (target) => {
  registerDecorator({
    target,
    propertyName: 'expectedRevision',
    validator: {
      validate: (_value: unknown, args: ValidationArguments) =>
        isValidTriagePatch(args.object as MyahInboxContactTriagePatch),
      defaultMessage: () => 'Invalid Myah inbox triage input',
    },
  });
};

@InputType('UpdateMyahInboxContactTriageInput')
@HasValidTriagePatch()
export class UpdateMyahInboxContactTriageInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  expectedWorkspaceId: string;

  @Field(() => String)
  @IsString()
  contactId: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  expectedRevision: number;

  @Field(() => String)
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/, {
    message: 'expectedIdentityGeneration must be a positive decimal bigint',
  })
  @IsPostgresBigint()
  expectedIdentityGeneration: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  inboxOwnerId?: string | null;

  @Field(() => MyahInboxState, { nullable: true })
  @IsOptional()
  @IsEnum(MyahInboxState)
  inboxState?: MyahInboxState;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  snoozedUntil?: string | null;
}

export const assertValidMyahInboxContactTriageUpdate = (
  input: UpdateMyahInboxContactTriageInput,
): void => {
  if (
    !isPostgresBigint(input.expectedIdentityGeneration) ||
    !isValidTriagePatch(input)
  ) {
    throw new BadRequestException('Invalid Myah inbox triage input');
  }
};

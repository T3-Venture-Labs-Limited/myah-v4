import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Field, InputType, Int } from '@nestjs/graphql';

const MAX_MAILBOX_COUNT = 50;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
const MAX_OPAQUE_REFERENCE_LENGTH = 255;

@InputType('ManagedEmailPersonaInput')
export class ManagedEmailPersonaInput {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  displayName: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  localPartPreference: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  roleTitle?: string | null;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  signature: string;
}

@InputType('ManagedEmailProposalInput')
export class ManagedEmailProposalInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(MAX_MAILBOX_COUNT)
  mailboxCount: number;

  @Field(() => [ManagedEmailPersonaInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MAILBOX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => ManagedEmailPersonaInput)
  personas: ManagedEmailPersonaInput[];
}

@InputType('ManagedEmailQuoteInput')
export class ManagedEmailQuoteInput {
  @Field(() => String)
  @IsUUID()
  proposalId: string;
}

@InputType('ManagedEmailPurchaseInput')
export class ManagedEmailPurchaseInput {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey: string;

  @Field(() => String)
  @IsUUID()
  quoteId: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_OPAQUE_REFERENCE_LENGTH)
  quoteVersion: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_OPAQUE_REFERENCE_LENGTH)
  quoteFingerprint: string;
}

@InputType('ManagedEmailOperationInput')
export class ManagedEmailOperationInput {
  @Field(() => String)
  @IsUUID()
  operationId: string;
}

@InputType('ManagedEmailHealthDetailsInput')
export class ManagedEmailHealthDetailsInput {
  @Field(() => String)
  @IsIn(['DOMAIN', 'MAILBOX'])
  resourceType: 'DOMAIN' | 'MAILBOX';

  @Field(() => String)
  @IsUUID()
  resourceId: string;
}

@InputType('ManagedEmailCampaignCapInput')
export class ManagedEmailCampaignCapInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  dailyCap: number | null;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey: string;

  @Field(() => String)
  @IsUUID()
  mailboxId: string;
}

@InputType('ManagedEmailMailboxActionInput')
export class ManagedEmailMailboxActionInput {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey: string;

  @Field(() => String)
  @IsUUID()
  mailboxId: string;
}

@InputType('ManagedEmailRetryPaymentInput')
export class ManagedEmailRetryPaymentInput {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey: string;

  @Field(() => String)
  @IsUUID()
  operationId: string;
}

@InputType('ManagedEmailDomainActionInput')
export class ManagedEmailDomainActionInput {
  @Field(() => String)
  @IsUUID()
  domainId: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey: string;
}

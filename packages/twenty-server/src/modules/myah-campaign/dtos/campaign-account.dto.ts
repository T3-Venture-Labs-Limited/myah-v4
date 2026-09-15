import {
  Field,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { IsArray, IsString, IsUUID, MinLength } from 'class-validator';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import {
  type CampaignSenderBlockedReason,
  type CampaignSenderPoolSnapshot,
  type CampaignSenderReadiness,
  type ReadyCampaignSenderReadiness,
} from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

export enum CampaignEmailAccountHealth {
  AVAILABLE = 'AVAILABLE',
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  UNAVAILABLE = 'UNAVAILABLE',
}

registerEnumType(CampaignEmailAccountHealth, {
  name: 'CampaignEmailAccountHealth',
});

@InputType()
export class CampaignEmailAccountCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignId!: string;
}

@InputType()
export class LinkCampaignEmailAccountInput extends CampaignEmailAccountCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  connectedAccountId!: string;
}

@InputType()
export class CampaignEmailAccountLinkInput extends CampaignEmailAccountCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  campaignAccountId!: string;
}

@InputType()
export class ReplaceCampaignEmailPoolInput extends CampaignEmailAccountCampaignInput {
  @Field(() => [UUIDScalarType])
  @IsArray()
  @IsUUID('4', { each: true })
  connectedAccountIds!: string[];
}

@InputType()
export class ResolveExactCampaignEmailSenderInput extends CampaignEmailAccountCampaignInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  connectedAccountId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  expectedSenderPoolFingerprint!: string;
}

@ObjectType()
export class CampaignSenderReadinessDTO {
  @Field()
  bindingStatus!: 'RESOLVED_BINDING' | 'MISSING_CORE_BINDING';

  @Field(() => UUIDScalarType)
  campaignAccountId!: string;

  @Field(() => UUIDScalarType)
  connectedAccountId!: string;

  @Field(() => UUIDScalarType)
  messageChannelId!: string;

  @Field(() => String, { nullable: true })
  senderHandle!: string | null;

  @Field(() => String, { nullable: true })
  provider!: ConnectedAccountProvider | null;

  @Field()
  status!: 'READY' | 'BLOCKED';

  @Field(() => String, { nullable: true })
  reason!: CampaignSenderBlockedReason | null;

  @Field(() => String, { nullable: true })
  recoveryPath!: string | null;

  @Field(() => Int, { nullable: true })
  dailySendLimit!: number | null;

  @Field(() => Int, { nullable: true })
  minimumSendIntervalMs!: number | null;

  @Field(() => String, { nullable: true })
  missingBinding!: 'CONNECTED_ACCOUNT' | 'MESSAGE_CHANNEL' | 'BOTH' | null;
}

@ObjectType()
export class CampaignSenderPoolSnapshotDTO {
  @Field(() => String)
  rotationPolicyId!: string;

  @Field(() => String)
  serializationRevision!: string;

  @Field(() => [CampaignSenderReadinessDTO])
  mailboxes!: CampaignSenderReadinessDTO[];

  @Field()
  senderPoolFingerprint!: string;
}

@ObjectType()
export class ExactCampaignEmailSenderResultDTO {
  @Field()
  status!: 'READY' | 'STALE_POOL' | 'BLOCKED';

  @Field(() => CampaignSenderReadinessDTO, { nullable: true })
  sender!: CampaignSenderReadinessDTO | null;

  @Field(() => String, { nullable: true })
  reason!: CampaignSenderBlockedReason | null;
}

export const toCampaignSenderReadinessDTO = (
  readiness: CampaignSenderReadiness,
): CampaignSenderReadinessDTO => {
  switch (readiness.bindingStatus) {
    case 'RESOLVED_BINDING':
      return {
        bindingStatus: readiness.bindingStatus,
        campaignAccountId: readiness.campaignAccountId,
        connectedAccountId: readiness.connectedAccountId,
        messageChannelId: readiness.messageChannelId,
        senderHandle: readiness.senderHandle,
        provider: readiness.provider,
        status: readiness.status,
        reason: readiness.reason,
        recoveryPath: readiness.recoveryPath,
        dailySendLimit: readiness.dailySendLimit,
        minimumSendIntervalMs: readiness.minimumSendIntervalMs,
        missingBinding: null,
      };
    case 'MISSING_CORE_BINDING':
      return {
        bindingStatus: readiness.bindingStatus,
        campaignAccountId: readiness.campaignAccountId,
        connectedAccountId: readiness.connectedAccountId,
        messageChannelId: readiness.messageChannelId,
        senderHandle: null,
        provider: null,
        status: 'BLOCKED',
        reason: 'ACCOUNT_UNAVAILABLE',
        recoveryPath: readiness.recoveryPath,
        dailySendLimit: null,
        minimumSendIntervalMs: null,
        missingBinding: readiness.missingBinding,
      };
    default:
      return assertUnreachableReadiness(readiness);
  }
};

export const toCampaignSenderPoolSnapshotDTO = (
  snapshot: CampaignSenderPoolSnapshot,
): CampaignSenderPoolSnapshotDTO => ({
  rotationPolicyId: snapshot.rotationPolicyId,
  serializationRevision: snapshot.serializationRevision,
  mailboxes: snapshot.mailboxes.map(toCampaignSenderReadinessDTO),
  senderPoolFingerprint: snapshot.senderPoolFingerprint,
});

export const toExactCampaignEmailSenderResultDTO = (
  result:
    | { status: 'READY'; sender: ReadyCampaignSenderReadiness }
    | { status: 'STALE_POOL' }
    | { status: 'BLOCKED'; reason: CampaignSenderBlockedReason },
): ExactCampaignEmailSenderResultDTO => {
  switch (result.status) {
    case 'READY':
      return {
        status: 'READY',
        sender: toCampaignSenderReadinessDTO(result.sender),
        reason: null,
      };
    case 'STALE_POOL':
      return { status: 'STALE_POOL', sender: null, reason: null };
    case 'BLOCKED':
      return { status: 'BLOCKED', sender: null, reason: result.reason };
    default:
      return assertUnreachableResult(result);
  }
};

const assertUnreachableReadiness = (value: never): never => {
  throw new Error(`Unsupported Campaign sender readiness: ${String(value)}`);
};

const assertUnreachableResult = (value: never): never => {
  throw new Error(`Unsupported exact Campaign sender result: ${String(value)}`);
};

@ObjectType()
export class CampaignSenderCandidateReadinessDTO {
  @Field(() => String)
  rotationPolicyId!: string;

  @Field(() => UUIDScalarType)
  connectedAccountId!: string;

  @Field(() => UUIDScalarType)
  messageChannelId!: string;

  @Field(() => String)
  senderHandle!: string;

  @Field(() => String)
  status!: 'READY' | 'BLOCKED';

  @Field(() => String, { nullable: true })
  reason!: CampaignSenderBlockedReason | null;
}

@ObjectType()
export class CampaignEmailAccountDTO {
  @Field(() => UUIDScalarType)
  id!: string;

  @Field(() => UUIDScalarType)
  connectedAccountId!: string;

  @Field(() => UUIDScalarType)
  messageChannelId!: string;

  @Field(() => String, { nullable: true })
  provider!: ConnectedAccountProvider | null;

  @Field(() => String, { nullable: true })
  senderEmail!: string | null;

  @Field()
  label!: string;

  @Field(() => Boolean)
  isDefault!: boolean;

  @Field(() => CampaignEmailAccountHealth)
  health!: CampaignEmailAccountHealth;

  @Field(() => CampaignSenderCandidateReadinessDTO, { nullable: true })
  senderReadiness?: CampaignSenderCandidateReadinessDTO | null;
}

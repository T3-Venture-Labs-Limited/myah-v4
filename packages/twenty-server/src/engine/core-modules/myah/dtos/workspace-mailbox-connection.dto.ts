import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('WorkspaceMailboxConnectionStatus')
export class WorkspaceMailboxConnectionStatusDTO {
  @Field(() => UUIDScalarType)
  connectedAccountId: string;

  @Field(() => String, { nullable: true })
  errorCode: string | null;

  @Field(() => String, { nullable: true })
  errorMessage: string | null;

  @Field(() => String)
  lastSafeOperation: string;

  @Field(() => String)
  maskedHandle: string;

  @Field(() => UUIDScalarType)
  messageChannelId: string;

  @Field(() => String)
  state: string;

  @Field(() => String)
  syncStage: string;

  @Field(() => String)
  syncStatus: string;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType('WorkspaceMailboxConnectionResult')
export class WorkspaceMailboxConnectionResultDTO {
  @Field(() => UUIDScalarType)
  connectedAccountId: string;

  @Field(() => UUIDScalarType)
  messageChannelId: string;

  @Field(() => WorkspaceMailboxConnectionStatusDTO)
  status: WorkspaceMailboxConnectionStatusDTO;
}

@ObjectType('RevokeWorkspaceMailboxResult')
export class RevokeWorkspaceMailboxResultDTO {
  @Field(() => UUIDScalarType)
  connectedAccountId: string;

  @Field(() => Boolean)
  revoked: true;

  @Field(() => String)
  state: 'REVOKED';
}

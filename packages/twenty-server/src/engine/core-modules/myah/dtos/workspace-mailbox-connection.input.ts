import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Field, InputType } from '@nestjs/graphql';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';

@InputType('WorkspaceMailboxProtocolConnectionInput')
export class WorkspaceMailboxProtocolConnectionInput {
  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  host: string;

  @Field(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  username?: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  password: string;

  @Field(() => String)
  @IsEnum(EmailConnectionSecurity)
  connectionSecurity: EmailConnectionSecurity;
}

@InputType('WorkspaceMailboxConnectionParametersInput')
export class WorkspaceMailboxConnectionParametersInput {
  @Field(() => WorkspaceMailboxProtocolConnectionInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspaceMailboxProtocolConnectionInput)
  IMAP?: WorkspaceMailboxProtocolConnectionInput;

  @Field(() => WorkspaceMailboxProtocolConnectionInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspaceMailboxProtocolConnectionInput)
  SMTP?: WorkspaceMailboxProtocolConnectionInput;
}

@InputType('ConnectWorkspaceMailboxInput')
export class ConnectWorkspaceMailboxInputDTO {
  @Field(() => String)
  @IsIn(['IMAP_SMTP'])
  accountType: 'IMAP_SMTP';

  @Field(() => WorkspaceMailboxConnectionParametersInput)
  @ValidateNested()
  @Type(() => WorkspaceMailboxConnectionParametersInput)
  connectionParameters: WorkspaceMailboxConnectionParametersInput;

  @Field(() => String)
  @IsEmail()
  handle: string;
}

@InputType('ReplaceWorkspaceMailboxCredentialsInput')
export class ReplaceWorkspaceMailboxCredentialsInputDTO {
  @Field(() => String)
  @IsUUID()
  connectedAccountId: string;

  @Field(() => WorkspaceMailboxConnectionParametersInput)
  @ValidateNested()
  @Type(() => WorkspaceMailboxConnectionParametersInput)
  connectionParameters: WorkspaceMailboxConnectionParametersInput;
}

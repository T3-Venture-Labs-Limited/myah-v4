import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789307619348)
export class CreateUnipileInstagramFoundationFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "core"."unipileHostedAuthAttempt_operation_enum" AS ENUM('CREATE', 'RECONNECT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "core"."unipileHostedAuthAttempt_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."unipileInstagramAccountBinding" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "workspaceInstagramAccountRecordId" uuid NOT NULL,
        "unipileAccountId" text NOT NULL,
        "instagramUserId" text NOT NULL,
        "connectedByUserWorkspaceId" uuid,
        "status" character varying NOT NULL DEFAULT 'CONNECTING',
        "deactivatedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UNIPILE_IG_BINDING" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_UNIPILE_IG_BINDING_UNIPILE_ACCOUNT" UNIQUE ("unipileAccountId"),
        CONSTRAINT "CHK_UNIPILE_IG_BINDING_IDENTITIES" CHECK (btrim("unipileAccountId") <> '' AND btrim("instagramUserId") <> ''),
        CONSTRAINT "CHK_UNIPILE_IG_BINDING_STATUS" CHECK ("status" IN ('CONNECTING', 'ACTIVE', 'NEEDS_RECONNECT', 'ERROR', 'INACTIVE', 'DELETE_UNKNOWN')),
        CONSTRAINT "FK_UNIPILE_IG_BINDING_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UNIPILE_IG_BINDING_USER_WORKSPACE" FOREIGN KEY ("connectedByUserWorkspaceId") REFERENCES "core"."userWorkspace"("id") ON DELETE SET NULL
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_UNIPILE_IG_BINDING_ACTIVE_WORKSPACE" ON "core"."unipileInstagramAccountBinding" ("workspaceId") WHERE "deactivatedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_UNIPILE_IG_BINDING_ACTIVE_INSTAGRAM_OWNER" ON "core"."unipileInstagramAccountBinding" ("instagramUserId") WHERE "deactivatedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_UNIPILE_IG_BINDING_ACTIVE_ACCOUNT_RECORD" ON "core"."unipileInstagramAccountBinding" ("workspaceInstagramAccountRecordId") WHERE "deactivatedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."unipileHostedAuthAttempt" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "userWorkspaceId" uuid,
        "operation" "core"."unipileHostedAuthAttempt_operation_enum" NOT NULL,
        "expectedBindingId" uuid,
        "callbackSecretHash" text NOT NULL,
        "callbackDigest" text,
        "callbackAccountId" text,
        "callbackStatus" text,
        "status" "core"."unipileHostedAuthAttempt_status_enum" NOT NULL DEFAULT 'PENDING',
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "processedAt" TIMESTAMP WITH TIME ZONE,
        "failureCode" text,
        "failureReason" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UNIPILE_HOSTED_AUTH_ATTEMPT" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_UNIPILE_AUTH_ATTEMPT_CALLBACK_SECRET" UNIQUE ("callbackSecretHash"),
        CONSTRAINT "CHK_UNIPILE_AUTH_ATTEMPT_OPERATION_BINDING" CHECK (("operation" = 'CREATE' AND "expectedBindingId" IS NULL) OR ("operation" = 'RECONNECT' AND "expectedBindingId" IS NOT NULL)),
        CONSTRAINT "CHK_UNIPILE_AUTH_ATTEMPT_SECRET" CHECK (btrim("callbackSecretHash") <> ''),
        CONSTRAINT "FK_UNIPILE_AUTH_ATTEMPT_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_UNIPILE_AUTH_ATTEMPT_USER_WORKSPACE" FOREIGN KEY ("userWorkspaceId") REFERENCES "core"."userWorkspace"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_UNIPILE_AUTH_ATTEMPT_BINDING" FOREIGN KEY ("expectedBindingId") REFERENCES "core"."unipileInstagramAccountBinding"("id") ON DELETE RESTRICT
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_UNIPILE_IG_BINDING_ACTIVE_INSTAGRAM_OWNER"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_UNIPILE_IG_BINDING_ACTIVE_ACCOUNT_RECORD"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_UNIPILE_IG_BINDING_ACTIVE_WORKSPACE"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."unipileHostedAuthAttempt"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."unipileInstagramAccountBinding"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "core"."unipileHostedAuthAttempt_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "core"."unipileHostedAuthAttempt_operation_enum"`,
    );
  }
}

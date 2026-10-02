import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { type SocialProfileWriteInput } from 'src/modules/myah-creator-social-profile/services/social-profile.service';
import {
  normalizeSocialProfileIdentity,
  resolveSocialProfileIdentityMatch,
  socialProfileDisplayName,
  type SocialProfileIdentityRecord,
} from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

export type CreatorDataOperationActor = {
  source: 'IMPORT' | 'SYSTEM';
  workspaceMemberId: string | null;
  name: string;
};

export type CreatorImportRecordInput = {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  language?: string;
  source?: string;
  sourceUrl?: string;
  importSource?: string;
  lastImportedAt?: string;
};

@Injectable()
export class CreatorDataOperationWriterService {
  async createCreator(
    manager: EntityManager,
    schemaName: string,
    input: CreatorImportRecordInput,
    actor: CreatorDataOperationActor,
  ): Promise<string> {
    const escapedSchemaName = manager.connection.driver.escape(schemaName);
    const id = randomUUID();

    // SAFETY: schemaName comes from getWorkspaceSchemaName and is escaped by the active PostgreSQL driver.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    await manager.query(
      `INSERT INTO ${escapedSchemaName}."creator" (
        "id", "name", "email", "phone", "location", "language", "source",
        "sourceUrl", "importSource", "lastImportedAt",
        "createdBySource", "createdByWorkspaceMemberId", "createdByName",
        "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16
      )`,
      [
        id,
        input.name.trim(),
        input.email?.trim() || null,
        input.phone?.trim() || null,
        input.location?.trim() || null,
        input.language?.trim() || null,
        input.source?.trim() || null,
        input.sourceUrl?.trim() || null,
        input.importSource?.trim() || null,
        input.lastImportedAt ? new Date(input.lastImportedAt) : null,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
      ],
    );

    return id;
  }

  async preserveSocialProfile(
    manager: EntityManager,
    schemaName: string,
    creatorId: string,
    input: Omit<SocialProfileWriteInput, 'creatorId'>,
    actor: CreatorDataOperationActor,
  ): Promise<string> {
    const identity = normalizeSocialProfileIdentity(input);
    const escapedSchemaName = manager.connection.driver.escape(schemaName);

    if (identity.platformAccountId) {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          `social-profile:${schemaName}:${identity.platform}:id:${identity.platformAccountId}`,
        ],
      );
    }
    if (identity.normalizedLocator) {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          `social-profile:${schemaName}:${identity.platform}:locator:${identity.normalizedLocator}`,
        ],
      );
    }

    // SAFETY: schemaName comes from getWorkspaceSchemaName and is escaped by the active PostgreSQL driver.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    const matches = await manager.query<SocialProfileIdentityRecord[]>(
      `SELECT
        "id", "creatorId", "platform", "normalizedLocator", "platformAccountId"
      FROM ${escapedSchemaName}."socialProfile"
      WHERE "deletedAt" IS NULL
        AND "platform" = $1
        AND (
          ($2::text IS NOT NULL AND "platformAccountId" = $2)
          OR ($3::text IS NOT NULL AND "normalizedLocator" = $3)
        )
      FOR UPDATE`,
      [
        identity.platform,
        identity.platformAccountId,
        identity.normalizedLocator,
      ],
    );
    const byPlatformAccountId =
      matches.find(
        (profile) =>
          identity.platformAccountId !== null &&
          profile.platformAccountId === identity.platformAccountId,
      ) ?? null;
    const byNormalizedLocator =
      matches.find(
        (profile) =>
          identity.normalizedLocator !== null &&
          profile.normalizedLocator === identity.normalizedLocator,
      ) ?? null;
    const match = resolveSocialProfileIdentityMatch({
      creatorId,
      identity,
      byPlatformAccountId,
      byNormalizedLocator,
    });

    if (match.profile) {
      if (match.enrichPlatformAccountId && identity.platformAccountId) {
        // SAFETY: schemaName comes from getWorkspaceSchemaName and is escaped by the active PostgreSQL driver.
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await manager.query(
          `UPDATE ${escapedSchemaName}."socialProfile"
           SET "platformAccountId" = $1, "updatedAt" = now()
           WHERE "id" = $2 AND "platformAccountId" IS NULL`,
          [identity.platformAccountId, match.profile.id],
        );
      }

      return match.profile.id;
    }

    const id = randomUUID();
    // SAFETY: schemaName comes from getWorkspaceSchemaName and is escaped by the active PostgreSQL driver.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    await manager.query(
      `INSERT INTO ${escapedSchemaName}."socialProfile" (
        "id", "name", "creatorId", "platform", "handle", "profileUrl",
        "normalizedLocator", "platformAccountId", "followerCount",
        "followerCountObservedAt", "followerCountSource",
        "createdBySource", "createdByWorkspaceMemberId", "createdByName",
        "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17
      )`,
      [
        id,
        socialProfileDisplayName(identity),
        creatorId,
        identity.platform,
        identity.handle,
        identity.profileUrl,
        identity.normalizedLocator,
        identity.platformAccountId,
        input.followerCount ?? null,
        input.followerCountObservedAt ?? null,
        input.followerCountSource?.trim() || null,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
      ],
    );

    return id;
  }

  async createSupplementaryNote(
    manager: EntityManager,
    schemaName: string,
    creatorId: string,
    title: string,
    markdown: string | null,
    actor: CreatorDataOperationActor,
  ): Promise<{ noteId: string | null; noteTargetId: string | null }> {
    if (!markdown) return { noteId: null, noteTargetId: null };

    const escapedSchemaName = manager.connection.driver.escape(schemaName);
    const noteId = randomUUID();
    const noteTargetId = randomUUID();
    const blocknote = JSON.stringify([
      {
        id: randomUUID(),
        type: 'paragraph',
        props: {
          textColor: 'default',
          backgroundColor: 'default',
          textAlignment: 'left',
        },
        content: [{ type: 'text', text: markdown, styles: {} }],
        children: [],
      },
    ]);

    // SAFETY: schemaName comes from getWorkspaceSchemaName and is escaped by the active PostgreSQL driver.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    await manager.query(
      `INSERT INTO ${escapedSchemaName}."note" (
        "id", "title", "bodyV2Blocknote", "bodyV2Markdown",
        "createdBySource", "createdByWorkspaceMemberId", "createdByName",
        "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        noteId,
        title,
        blocknote,
        markdown,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
      ],
    );
    // SAFETY: schemaName comes from getWorkspaceSchemaName and is escaped by the active PostgreSQL driver.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    await manager.query(
      `INSERT INTO ${escapedSchemaName}."noteTarget" (
        "id", "noteId", "targetCreatorId",
        "createdBySource", "createdByWorkspaceMemberId", "createdByName",
        "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        noteTargetId,
        noteId,
        creatorId,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
        actor.source,
        actor.workspaceMemberId,
        actor.name,
      ],
    );

    return { noteId, noteTargetId };
  }
}

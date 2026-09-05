import type { DataSource } from 'typeorm';

export const invalidateComposioInstagramAuthorities = async (
  dataSource: Pick<DataSource, 'query'>,
  workspaceId?: string,
): Promise<void> => {
  const workspacePredicate = workspaceId ? 'AND "workspaceId" = $1' : '';

  await dataSource.query(
    `
      WITH "expiredBindings" AS (
        UPDATE core."actionApprovalBinding"
        SET
          "state" = 'EXPIRED',
          "decidedAt" = COALESCE("decidedAt", now()),
          "updatedAt" = now()
        WHERE "actionName" = 'send_instagram_reply'
          AND "state" IN ('PENDING', 'APPROVED')
          ${workspacePredicate}
        RETURNING "id"
      ),
      "draftEvidence" AS (
        SELECT
          "evidence"."actionApprovalBindingId",
          "evidence"."objectMetadataId",
          "evidence"."recordId"
        FROM core."actionApprovalBindingEvidenceLink" AS "evidence"
        INNER JOIN "expiredBindings"
          ON "expiredBindings"."id" = "evidence"."actionApprovalBindingId"
        WHERE "evidence"."role" = 'draft'
      )
      INSERT INTO core."actionApprovalBindingEvidenceLink" (
        "actionApprovalBindingId",
        "objectMetadataId",
        "recordId",
        "role"
      )
      SELECT
        "draftEvidence"."actionApprovalBindingId",
        "draftEvidence"."objectMetadataId",
        "draftEvidence"."recordId",
        'PROVIDER_CUTOVER'
      FROM "draftEvidence"
      ON CONFLICT (
        "actionApprovalBindingId",
        "objectMetadataId",
        "recordId",
        "role"
      ) DO NOTHING
    `,
    workspaceId ? [workspaceId] : [],
  );
};

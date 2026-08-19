import { DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

const MANAGED_EMAIL_RENEWAL_RESOURCES_ARE_VALID_SQL = `
  jsonb_typeof("pendingRenewalProjection"->'resources') = 'array'
  AND jsonb_array_length(
    CASE
      WHEN jsonb_typeof("pendingRenewalProjection"->'resources') = 'array'
        THEN "pendingRenewalProjection"->'resources'
      ELSE '[]'::jsonb
    END
  ) BETWEEN 1 AND 100
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof("pendingRenewalProjection"->'resources') = 'array'
          THEN "pendingRenewalProjection"->'resources'
        ELSE '[]'::jsonb
      END
    ) AS entry(value)
    WHERE (
      jsonb_typeof(entry.value) = 'object'
      AND (entry.value - 'kind' - 'resourceId' - 'paidThrough') = '{}'::jsonb
      AND jsonb_typeof(entry.value->'kind') = 'string'
      AND entry.value->>'kind' IN ('domain', 'mailbox', 'warmup')
      AND jsonb_typeof(entry.value->'resourceId') = 'string'
      AND length(entry.value->>'resourceId') <= 36
      AND entry.value->>'resourceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND jsonb_typeof(entry.value->'paidThrough') = 'string'
      AND btrim(entry.value->>'paidThrough') <> ''
      AND length(entry.value->>'paidThrough') <= 256
      AND entry.value->>'paidThrough' ~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$'
      AND pg_input_is_valid(
        entry.value->>'paidThrough',
        'timestamp with time zone'
      )
    ) IS NOT TRUE
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof("pendingRenewalProjection"->'resources') = 'array'
          THEN "pendingRenewalProjection"->'resources'
        ELSE '[]'::jsonb
      END
    ) AS entry(value)
    GROUP BY entry.value->>'kind', entry.value->>'resourceId'
    HAVING count(*) > 1
  )
`;
const MANAGED_EMAIL_CONVERTED_RENEWAL_PROJECTION_IS_VALID_SQL = `
  jsonb_typeof("pendingRenewalProjection") = 'object'
  AND octet_length("pendingRenewalProjection"::text) <= 65536
  AND (
    CASE
      WHEN jsonb_typeof("pendingRenewalProjection") = 'object'
        THEN "pendingRenewalProjection"
      ELSE '{}'::jsonb
    END - 'receipts' - 'resources'
  ) = '{}'::jsonb
  AND jsonb_typeof("pendingRenewalProjection"->'receipts') = 'array'
  AND jsonb_array_length(
    CASE
      WHEN jsonb_typeof("pendingRenewalProjection"->'receipts') = 'array'
        THEN "pendingRenewalProjection"->'receipts'
      ELSE '[]'::jsonb
    END
  ) = 1
  AND jsonb_typeof("pendingRenewalProjection"->'receipts'->0) = 'object'
  AND (
    CASE
      WHEN jsonb_typeof("pendingRenewalProjection"->'receipts'->0) = 'object'
        THEN "pendingRenewalProjection"->'receipts'->0
      ELSE '{}'::jsonb
    END - 'externalInvoiceId' - 'externalPaymentId' - 'metronomeInvoiceId'
  ) = '{}'::jsonb
  AND jsonb_typeof("pendingRenewalProjection"->'receipts'->0->'externalInvoiceId') = 'string'
  AND btrim("pendingRenewalProjection"->'receipts'->0->>'externalInvoiceId') <> ''
  AND length("pendingRenewalProjection"->'receipts'->0->>'externalInvoiceId') <= 256
  AND jsonb_typeof("pendingRenewalProjection"->'receipts'->0->'externalPaymentId') = 'string'
  AND btrim("pendingRenewalProjection"->'receipts'->0->>'externalPaymentId') <> ''
  AND length("pendingRenewalProjection"->'receipts'->0->>'externalPaymentId') <= 256
  AND jsonb_typeof("pendingRenewalProjection"->'receipts'->0->'metronomeInvoiceId') = 'string'
  AND btrim("pendingRenewalProjection"->'receipts'->0->>'metronomeInvoiceId') <> ''
  AND length("pendingRenewalProjection"->'receipts'->0->>'metronomeInvoiceId') <= 256
  AND (${MANAGED_EMAIL_RENEWAL_RESOURCES_ARE_VALID_SQL})
`;

@RegisteredInstanceCommand('2.20.0', 1786000004001, { type: 'slow' })
export class MigrateManagedEmailPaymentReceiptsSlowInstanceCommand
  implements SlowInstanceCommand
{
  public readonly runDataMigrationWithoutWorkspaces = true;

  public async runDataMigration(dataSource: DataSource): Promise<void> {
    const [preflight] = (await dataSource.query(`
      WITH normalized AS (
        SELECT
          "metronomeInvoiceId",
          "externalInvoiceId",
          "externalPaymentId",
          CASE
            WHEN (
              jsonb_typeof("pendingRenewalProjection") = 'object'
              AND (
                "pendingRenewalProjection" - 'receipts' - 'resources'
              ) = '{}'::jsonb
              AND jsonb_typeof(
                "pendingRenewalProjection"->'receipts'
              ) = 'array'
              AND jsonb_array_length(
                CASE
                  WHEN jsonb_typeof(
                    "pendingRenewalProjection"->'receipts'
                  ) = 'array'
                    THEN "pendingRenewalProjection"->'receipts'
                  ELSE '[]'::jsonb
                END
              ) = 1
            )
              THEN jsonb_build_object(
                'receipt',
                "pendingRenewalProjection"->'receipts'->0,
                'resources',
                "pendingRenewalProjection"->'resources'
              )
            ELSE "pendingRenewalProjection"
          END AS "pendingRenewalProjection"
        FROM "core"."managedEmailAcquisitionOperation"
      )
      SELECT
        COALESCE(
          bool_or(
            NOT (
              (
                "metronomeInvoiceId" IS NULL
                AND "externalInvoiceId" IS NULL
                AND "externalPaymentId" IS NULL
              )
              OR (
                "metronomeInvoiceId" IS NOT NULL
                AND "externalInvoiceId" IS NOT NULL
                AND btrim("externalInvoiceId") <> ''
                AND "externalPaymentId" IS NOT NULL
                AND btrim("externalPaymentId") <> ''
              )
            )
          ),
          false
        ) AS "hasInvalidReceiptRows",
        COALESCE(
          bool_or(
            "pendingRenewalProjection" IS NOT NULL
            AND (
              jsonb_typeof("pendingRenewalProjection") = 'object'
              AND octet_length("pendingRenewalProjection"::text) <= 65536
              AND (
                CASE
                  WHEN jsonb_typeof("pendingRenewalProjection") = 'object'
                    THEN "pendingRenewalProjection"
                  ELSE '{}'::jsonb
                END - 'receipt' - 'resources'
              ) = '{}'::jsonb
              AND jsonb_typeof("pendingRenewalProjection"->'receipt') = 'object'
              AND (
                CASE
                  WHEN jsonb_typeof("pendingRenewalProjection"->'receipt') = 'object'
                    THEN "pendingRenewalProjection"->'receipt'
                  ELSE '{}'::jsonb
                END - 'externalInvoiceId' - 'externalPaymentId' - 'metronomeInvoiceId'
              ) = '{}'::jsonb
              AND jsonb_typeof("pendingRenewalProjection"->'receipt'->'externalInvoiceId') = 'string'
              AND btrim("pendingRenewalProjection"->'receipt'->>'externalInvoiceId') <> ''
              AND length("pendingRenewalProjection"->'receipt'->>'externalInvoiceId') <= 256
              AND jsonb_typeof("pendingRenewalProjection"->'receipt'->'externalPaymentId') = 'string'
              AND btrim("pendingRenewalProjection"->'receipt'->>'externalPaymentId') <> ''
              AND length("pendingRenewalProjection"->'receipt'->>'externalPaymentId') <= 256
              AND jsonb_typeof("pendingRenewalProjection"->'receipt'->'metronomeInvoiceId') = 'string'
              AND btrim("pendingRenewalProjection"->'receipt'->>'metronomeInvoiceId') <> ''
              AND length("pendingRenewalProjection"->'receipt'->>'metronomeInvoiceId') <= 256
              AND (${MANAGED_EMAIL_RENEWAL_RESOURCES_ARE_VALID_SQL})
            ) IS NOT TRUE
          ),
          false
        ) AS "hasInvalidRenewalProjections"
      FROM normalized
    `)) as Array<{
      hasInvalidReceiptRows: boolean;
      hasInvalidRenewalProjections: boolean;
    }>;

    if (
      preflight?.hasInvalidReceiptRows !== false ||
      preflight.hasInvalidRenewalProjections !== false
    ) {
      throw new Error(
        'Managed email payment receipt migration preflight failed',
      );
    }

    await dataSource.query(
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "paymentReceipts" = jsonb_build_array(jsonb_build_object(\'externalInvoiceId\', "externalInvoiceId", \'externalPaymentId\', "externalPaymentId", \'metronomeInvoiceId\', "metronomeInvoiceId")) WHERE "externalInvoiceId" IS NOT NULL AND "externalPaymentId" IS NOT NULL AND "metronomeInvoiceId" IS NOT NULL',
    );
    await dataSource.query(
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "pendingRenewalProjection" = jsonb_build_object(\'receipts\', jsonb_build_array("pendingRenewalProjection"->\'receipt\'), \'resources\', "pendingRenewalProjection"->\'resources\') WHERE "pendingRenewalProjection" IS NOT NULL AND "pendingRenewalProjection" ? \'receipt\'',
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [preflight] = (await queryRunner.query(`
      SELECT
        COALESCE(
          bool_or(
            "pendingRenewalProjection" IS NOT NULL
            AND (
              ${MANAGED_EMAIL_CONVERTED_RENEWAL_PROJECTION_IS_VALID_SQL}
            ) IS NOT TRUE
          ),
          false
        ) AS "hasInvalidRenewalProjections"
      FROM "core"."managedEmailAcquisitionOperation"
    `)) as Array<{ hasInvalidRenewalProjections: boolean }>;

    if (preflight?.hasInvalidRenewalProjections !== false) {
      throw new Error(
        'Managed email payment receipt cutover preflight failed',
      );
    }

    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "metronomeInvoiceId"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "externalInvoiceId"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "externalPaymentId"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [preflight] = (await queryRunner.query(`
      SELECT
        COALESCE(
          bool_or(
            "paymentReceipts" IS NOT NULL
            AND (
              jsonb_typeof("paymentReceipts") = 'array'
              AND jsonb_array_length(
                CASE
                  WHEN jsonb_typeof("paymentReceipts") = 'array'
                    THEN "paymentReceipts"
                  ELSE '[]'::jsonb
                END
              ) = 1
              AND jsonb_typeof("paymentReceipts"->0) = 'object'
              AND (
                CASE
                  WHEN jsonb_typeof("paymentReceipts"->0) = 'object'
                    THEN "paymentReceipts"->0
                  ELSE '{}'::jsonb
                END - 'externalInvoiceId' - 'externalPaymentId' - 'metronomeInvoiceId'
              ) = '{}'::jsonb
              AND jsonb_typeof("paymentReceipts"->0->'externalInvoiceId') = 'string'
              AND btrim("paymentReceipts"->0->>'externalInvoiceId') <> ''
              AND length("paymentReceipts"->0->>'externalInvoiceId') <= 256
              AND jsonb_typeof("paymentReceipts"->0->'externalPaymentId') = 'string'
              AND btrim("paymentReceipts"->0->>'externalPaymentId') <> ''
              AND length("paymentReceipts"->0->>'externalPaymentId') <= 256
              AND jsonb_typeof("paymentReceipts"->0->'metronomeInvoiceId') = 'string'
              AND btrim("paymentReceipts"->0->>'metronomeInvoiceId') ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            ) IS NOT TRUE
          ),
          false
        ) AS "hasInvalidPaymentReceipts",
        COALESCE(
          bool_or(
            "pendingRenewalProjection" IS NOT NULL
            AND (
              ${MANAGED_EMAIL_CONVERTED_RENEWAL_PROJECTION_IS_VALID_SQL}
            ) IS NOT TRUE
          ),
          false
        ) AS "hasInvalidRenewalProjections"
      FROM "core"."managedEmailAcquisitionOperation"
    `)) as Array<{
      hasInvalidPaymentReceipts: boolean;
      hasInvalidRenewalProjections: boolean;
    }>;

    if (
      preflight?.hasInvalidPaymentReceipts !== false ||
      preflight.hasInvalidRenewalProjections !== false
    ) {
      throw new Error(
        'Managed email payment receipt rollback preflight failed',
      );
    }

    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "metronomeInvoiceId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "externalInvoiceId" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "externalPaymentId" text',
    );
    await queryRunner.query(
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "metronomeInvoiceId" = NULLIF("paymentReceipts"->0->>\'metronomeInvoiceId\', \'\')::uuid, "externalInvoiceId" = NULLIF("paymentReceipts"->0->>\'externalInvoiceId\', \'\'), "externalPaymentId" = NULLIF("paymentReceipts"->0->>\'externalPaymentId\', \'\') WHERE "paymentReceipts" IS NOT NULL',
    );
    await queryRunner.query(
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "pendingRenewalProjection" = jsonb_build_object(\'receipt\', "pendingRenewalProjection"->\'receipts\'->0, \'resources\', "pendingRenewalProjection"->\'resources\') WHERE "pendingRenewalProjection" IS NOT NULL',
    );
  }
}

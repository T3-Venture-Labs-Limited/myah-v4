import { isValidUuid } from 'twenty-shared/utils';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

// Stages in which a creator's participation in a Campaign is still open.
export const CAMPAIGN_ACTIVE_PARTICIPATION_STAGES = [
  'CONTACTED',
  'NEGOTIATING',
  'ONBOARDED',
  'PRODUCT_SENT',
  'PRODUCT_RECEIVED',
  'WAITING_FOR_POST',
] as const;

export type CampaignActiveParticipation = Readonly<{
  creatorId: string;
  campaignId: string;
  campaignName: string | null;
  campaignCreatorId: string;
  stage: string | null;
}>;

type Query = (sql: string, parameters: unknown[]) => Promise<unknown>;

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as Record<string, unknown>[])
    : Array.isArray(value)
      ? (value as Record<string, unknown>[])
      : [];

// A creator is active in a Campaign while its outreach runs or its stage is
// Contacted..Waiting for post. Posted, Dropped and not-started Ready are not.
export const findCampaignActiveParticipations = async (
  query: Query,
  input: {
    workspaceId: string;
    creatorIds: readonly string[];
    excludeCampaignId?: string;
  },
): Promise<Map<string, CampaignActiveParticipation>> => {
  const creatorIds = input.creatorIds.filter((id) => isValidUuid(id));
  if (creatorIds.length === 0 || !isValidUuid(input.workspaceId))
    return new Map();
  const schema = getWorkspaceSchemaName(input.workspaceId);
  const found = rows(
    // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
    await query(
      `SELECT DISTINCT ON (cc."creatorId") cc."creatorId", cc.id AS "campaignCreatorId",
              cc.stage::text AS stage, c.id AS "campaignId", c.name AS "campaignName"
         FROM "${schema}"."campaignCreator" cc
         JOIN "${schema}".campaign c ON c.id = cc."campaignId" AND c."deletedAt" IS NULL
        WHERE cc."creatorId" = ANY($1::uuid[]) AND cc."deletedAt" IS NULL
          AND ($2::uuid IS NULL OR cc."campaignId" <> $2::uuid)
          AND (cc.stage::text = ANY($3::text[])
            OR EXISTS (SELECT 1 FROM core."campaignEnrollment" e
                        WHERE e."workspaceId" = $4 AND e."campaignCreatorId" = cc.id
                          AND e.state = 'ACTIVE'))
        ORDER BY cc."creatorId", cc."updatedAt" DESC, cc.id`,
      [
        creatorIds,
        input.excludeCampaignId ?? null,
        CAMPAIGN_ACTIVE_PARTICIPATION_STAGES,
        input.workspaceId,
      ],
    ),
  );
  return new Map(
    found.map((row) => [
      String(row.creatorId),
      {
        creatorId: String(row.creatorId),
        campaignId: String(row.campaignId),
        campaignName:
          typeof row.campaignName === 'string' ? row.campaignName : null,
        campaignCreatorId: String(row.campaignCreatorId),
        stage: typeof row.stage === 'string' ? row.stage : null,
      },
    ]),
  );
};

// Instagram handle per creator from their normalized social profiles.
export const findCreatorInstagramHandles = async (
  query: Query,
  input: { workspaceId: string; creatorIds: readonly string[] },
): Promise<Map<string, string>> => {
  const creatorIds = input.creatorIds.filter((id) => isValidUuid(id));
  if (creatorIds.length === 0 || !isValidUuid(input.workspaceId))
    return new Map();
  const schema = getWorkspaceSchemaName(input.workspaceId);
  const found = rows(
    await query(
      `SELECT DISTINCT ON (sp."creatorId") sp."creatorId", sp.handle
         FROM "${schema}"."socialProfile" sp
        WHERE sp."creatorId" = ANY($1::uuid[]) AND sp."deletedAt" IS NULL
          AND sp.platform::text = 'INSTAGRAM' AND COALESCE(TRIM(sp.handle), '') <> ''
        ORDER BY sp."creatorId", sp."createdAt", sp.id`,
      [creatorIds],
    ),
  );
  return new Map(
    found.map((row) => [
      String(row.creatorId),
      String(row.handle).trim().replace(/^@/, '').toLowerCase(),
    ]),
  );
};

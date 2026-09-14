import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

export type MyahInboxEmailSqlScope = { sql: string; parameters: unknown[] };
export type MyahInboxEmailReadSelection = {
  mode: 'cards' | 'card' | 'messages' | 'location';
  threadId?: string;
  messageId?: string;
  direction?: 'older' | 'newer';
  cutoff?: string;
  fingerprint?: string;
  boundary?: { timestamp: string; id: string };
};

// Keep native timestamps for comparisons; PostgreSQL, not JS Date, owns precision.
const timestamp = (expression: string) =>
  `to_char(${expression} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

// A single statement gates bounded hydration on the current authorized metadata.
// The cutoff freezes card starts, not authorization or subsequent reply content.
export const buildMyahInboxEmailReadQuery = (
  scope: MyahInboxEmailSqlScope,
  selection: MyahInboxEmailReadSelection,
): MyahInboxEmailSqlScope => {
  const parameters = [...scope.parameters];
  const parameter = (value: unknown) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };
  const cutoff = parameter(selection.cutoff ?? null);
  const fingerprint = parameter(selection.fingerprint ?? null);
  const boundaryTimestamp = parameter(selection.boundary?.timestamp ?? null);
  const boundaryId = parameter(selection.boundary?.id ?? null);
  const restricted = parameter(
    FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
  );
  const threadId = parameter(selection.threadId ?? null);
  const messageId = parameter(selection.messageId ?? null);
  const isCards = selection.mode === 'cards';
  const readsMessages = ['messages', 'location'].includes(selection.mode);
  const isNewer = selection.direction === 'newer';

  return {
    parameters,
    sql: `WITH ${scope.sql},
clock AS (SELECT COALESCE(${cutoff}::timestamptz, statement_timestamp()) AS at, ${threadId}::uuid AS "targetThreadId"),
roots AS (
  SELECT DISTINCT ON ("messageThreadId") id, "messageThreadId", "receivedAt"
  FROM authorized_email, clock
  WHERE "createdAt" <= clock.at
  ORDER BY "messageThreadId", "receivedAt", id
),
current_roots AS (
  SELECT DISTINCT ON ("messageThreadId") id, "messageThreadId", "receivedAt"
  FROM authorized_email ORDER BY "messageThreadId", "receivedAt", id
),
metadata AS (
  SELECT ${timestamp('clock.at')} AS "snapshotAt",
    md5(COALESCE((SELECT string_agg(id::text || ':' || "messageThreadId"::text || ':' || ${timestamp('"receivedAt"')}, ',' ORDER BY "receivedAt", "messageThreadId") FROM roots), '')) AS fingerprint,
    EXISTS(SELECT 1 FROM authorized_email WHERE "receivedAt" IS NULL OR "createdAt" IS NULL) AS "orderingUnavailable",
    EXISTS(SELECT 1 FROM roots JOIN current_roots current USING ("messageThreadId") WHERE roots.id <> current.id AND roots."messageThreadId" = COALESCE(${threadId}::uuid, (SELECT "messageThreadId" FROM authorized_email WHERE id = ${messageId}::uuid))) AS "rootChanged",
    (${boundaryTimestamp}::timestamptz IS NULL OR ${
      isCards
        ? `EXISTS(SELECT 1 FROM roots WHERE ("receivedAt", "messageThreadId") = (${boundaryTimestamp}::timestamptz, ${boundaryId}::uuid))`
        : `EXISTS(SELECT 1 FROM authorized_email message JOIN roots root ON root."messageThreadId" = message."messageThreadId" WHERE message."messageThreadId" = ${threadId}::uuid AND message.id <> root.id AND (message."receivedAt", message.id) = (${boundaryTimestamp}::timestamptz, ${boundaryId}::uuid))`
    }) AS "cursorValid",
    EXISTS(SELECT 1 FROM readable_member) AND EXISTS(SELECT 1 FROM readable_contact) AS authorized,
    (SELECT "messageThreadId" FROM roots ORDER BY "receivedAt" DESC, "messageThreadId" DESC LIMIT 1) AS "latestThreadId"
  FROM clock
),
selected_roots AS (
  SELECT roots.* FROM roots, metadata
  WHERE metadata.authorized AND NOT metadata."orderingUnavailable" AND NOT metadata."rootChanged" AND metadata."cursorValid"
    AND (${fingerprint}::text IS NULL OR metadata.fingerprint = ${fingerprint}::text)
    AND ${
      isCards
        ? `(${boundaryTimestamp}::timestamptz IS NULL OR (roots."receivedAt", roots."messageThreadId") < (${boundaryTimestamp}::timestamptz, ${boundaryId}::uuid))`
        : `roots."messageThreadId" = COALESCE(${threadId}::uuid, (SELECT "messageThreadId" FROM authorized_email WHERE id = ${messageId}::uuid))`
    }
  ORDER BY roots."receivedAt" DESC, roots."messageThreadId" DESC LIMIT ${isCards ? 3 : 1}
),
cards AS (
  SELECT root."receivedAt", root."messageThreadId", jsonb_build_object(
    'threadId', root."messageThreadId", 'rootMessageId', root.id,
    'startTimestamp', ${timestamp('root."receivedAt"')},
    'subject', CASE WHEN message.visibility IN ('FULL','SUBJECT') AND subject.id IS NOT NULL THEN subject.subject ELSE ${restricted}::text END,
    'campaignLabel', campaign_name.name, 'historyBasis', 'EARLIEST_AUTHORIZED_RETAINED'
  ) AS value
  FROM selected_roots root
  JOIN authorized_email message ON message.id = root.id
  LEFT JOIN readable_subject subject ON subject.id = root.id
  LEFT JOIN readable_campaign_relation relation ON relation.id = root."messageThreadId"
  LEFT JOIN readable_campaign campaign ON campaign.id = relation."myahCampaignId"
  LEFT JOIN readable_campaign_name campaign_name ON campaign_name.id = campaign.id
),
reply_window AS (
  SELECT message.* FROM authorized_email message
  JOIN selected_roots root ON root."messageThreadId" = message."messageThreadId"
  WHERE ${readsMessages} AND message.id <> root.id
    AND (${boundaryTimestamp}::timestamptz IS NULL OR (message."receivedAt", message.id) ${isNewer ? '>' : '<'} (${boundaryTimestamp}::timestamptz, ${boundaryId}::uuid))
    AND (${messageId}::uuid IS NULL OR ${messageId}::uuid = root.id OR (message."receivedAt", message.id) <= (SELECT "receivedAt", id FROM authorized_email WHERE id = ${messageId}::uuid))
  ORDER BY message."receivedAt" ${isNewer ? 'ASC' : 'DESC'}, message.id ${isNewer ? 'ASC' : 'DESC'} LIMIT 20
),
window_bounds AS (
  SELECT
    COALESCE((SELECT "receivedAt" FROM reply_window ORDER BY "receivedAt", id LIMIT 1), ${boundaryTimestamp}::timestamptz) AS "olderAt",
    COALESCE((SELECT id FROM reply_window ORDER BY "receivedAt", id LIMIT 1), ${boundaryId}::uuid) AS "olderId",
    COALESCE((SELECT "receivedAt" FROM reply_window ORDER BY "receivedAt" DESC, id DESC LIMIT 1), ${boundaryTimestamp}::timestamptz) AS "newerAt",
    COALESCE((SELECT id FROM reply_window ORDER BY "receivedAt" DESC, id DESC LIMIT 1), ${boundaryId}::uuid) AS "newerId"
),
hydrated_messages AS (
  SELECT message.id, message."receivedAt", jsonb_build_object(
    'id', message.id, 'messageThreadId', message."messageThreadId",
    'receivedAt', ${timestamp('message."receivedAt"')},
    'subject', CASE WHEN message.visibility IN ('FULL','SUBJECT') AND subject.id IS NOT NULL THEN subject.subject ELSE ${restricted}::text END,
    'text', CASE WHEN message.visibility = 'FULL' AND body.id IS NOT NULL THEN body.text ELSE ${restricted}::text END,
    'visibility', message.visibility, 'direction', message.direction,
    'participants', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', role, 'handle', handle, 'displayName', "displayName") ORDER BY id) FROM readable_participants WHERE "messageId" = message.id), '[]'::jsonb),
    'attachmentFileIds', '[]'::jsonb
  ) AS value
  FROM authorized_email message
  LEFT JOIN readable_subject subject ON subject.id = message.id
  LEFT JOIN readable_text body ON body.id = message.id
  WHERE ${readsMessages} AND (message.id IN (SELECT id FROM selected_roots) OR message.id IN (SELECT id FROM reply_window))
)
SELECT metadata.*,
  (SELECT value FROM cards LIMIT 1) AS card,
  (SELECT jsonb_build_object(
    'threadId', root."messageThreadId",
    'root', (SELECT value FROM hydrated_messages WHERE id = root.id),
    'messages', COALESCE((SELECT jsonb_agg(value ORDER BY "receivedAt", id) FROM hydrated_messages WHERE id <> root.id), '[]'::jsonb),
    'hasOlder', EXISTS(SELECT 1 FROM authorized_email message WHERE message."messageThreadId" = root."messageThreadId" AND message.id <> root.id AND (message."receivedAt", message.id) < (SELECT "olderAt", "olderId" FROM window_bounds)),
    'hasNewer', EXISTS(SELECT 1 FROM authorized_email message WHERE message."messageThreadId" = root."messageThreadId" AND message.id <> root.id AND (message."receivedAt", message.id) > (SELECT "newerAt", "newerId" FROM window_bounds))
  ) FROM selected_roots root WHERE ${readsMessages}) AS page,
  COALESCE((SELECT jsonb_agg(value ORDER BY "receivedAt", "messageThreadId") FROM cards), '[]'::jsonb) AS cards,
  EXISTS(SELECT 1 FROM roots WHERE ("receivedAt", "messageThreadId") < (SELECT "receivedAt", "messageThreadId" FROM selected_roots ORDER BY "receivedAt", "messageThreadId" LIMIT 1)) AS "hasOlderCards"
FROM metadata`,
  };
};

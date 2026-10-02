import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

export type MyahInboxEmailSqlScope = {
  sql: string;
  parameters: unknown[];
  responseCardsOnly?: boolean;
  legacyCardsOnly?: boolean;
};
export type MyahInboxEmailReadSelection = {
  mode: 'cards' | 'card' | 'messages' | 'location';
  threadId?: string;
  anchorKey?: string;
  messageId?: string;
  direction?: 'older' | 'newer';
  cutoff?: string;
  fingerprint?: string;
  boundary?: { timestamp: string; id: string; threadId?: string };
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
  const boundaryThreadId =
    selection.mode === 'cards'
      ? parameter(selection.boundary?.threadId ?? null)
      : 'NULL';
  const restricted = parameter(
    FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
  );
  const threadId = parameter(selection.threadId ?? null);
  const anchorKey =
    selection.mode === 'cards'
      ? 'NULL'
      : parameter(selection.anchorKey ?? null);
  const messageId = parameter(selection.messageId ?? null);
  const isCards = selection.mode === 'cards';
  const readsMessages = ['messages', 'location'].includes(selection.mode);
  const isNewer = selection.direction === 'newer';
  const messageBoundaryId = isCards ? 'NULL::uuid' : `${boundaryId}::uuid`;
  const cardsFilter = scope.responseCardsOnly
    ? `"anchorKey" NOT LIKE 'legacy:%'`
    : scope.legacyCardsOnly
      ? `"anchorKey" LIKE 'legacy:%'`
      : 'TRUE';

  return {
    parameters,
    sql: `WITH RECURSIVE ${scope.sql},
clock AS (SELECT COALESCE(${cutoff}::timestamptz, statement_timestamp()) AS at, ${threadId}::uuid AS "targetThreadId"),
promotable_threads AS (
  SELECT recorded."inboundMessageId" AS id, MIN(exact."matchedAttemptId"::text) AS "attemptId"
  FROM reply_evidence recorded
  JOIN reply_evidence exact ON exact."messageThreadId"=recorded."messageThreadId"
    AND exact."messageChannelId"=recorded."messageChannelId"
    AND exact."campaignId"=recorded."campaignId" AND exact."enrollmentId"=recorded."enrollmentId"
    AND exact.classification='EXACT' AND exact."matchedAttemptId" IS NOT NULL
  JOIN accepted_outreach accepted ON accepted."attemptId"=exact."matchedAttemptId"
    AND accepted."messageChannelId"=recorded."messageChannelId"
  JOIN authorized_email inbound ON inbound.id=recorded."inboundMessageId"
    AND inbound."receivedAt">=accepted."providerAcceptedAt"
    AND accepted."campaignId"=recorded."campaignId" AND accepted."enrollmentId"=recorded."enrollmentId"
  WHERE recorded.classification='THREAD' AND recorded."campaignId" IS NOT NULL AND recorded."enrollmentId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM accepted_outreach other
      WHERE other."campaignId"=recorded."campaignId" AND other."enrollmentId"=recorded."enrollmentId"
        AND other."attemptId"<>exact."matchedAttemptId")
  GROUP BY recorded."inboundMessageId"
  HAVING COUNT(DISTINCT exact."matchedAttemptId")=1
),
direct_groups AS (
  SELECT evidence."inboundMessageId" AS id, evidence."messageThreadId", evidence."messageChannelId",
    COALESCE(evidence."projectedMessageId", promoted_attempt."projectedMessageId") AS "projectedMessageId",
    CASE WHEN evidence.classification='EXACT' AND evidence."matchedAttemptId" IS NOT NULL
      THEN 'attempt:' || evidence."matchedAttemptId"::text
      WHEN promoted.id IS NOT NULL THEN 'attempt:' || promoted."attemptId"
      ELSE 'thread:' || evidence."messageThreadId"::text END AS "anchorKey"
  FROM reply_evidence evidence
  LEFT JOIN promotable_threads promoted ON promoted.id=evidence."inboundMessageId"
  LEFT JOIN accepted_outreach promoted_attempt ON promoted_attempt."attemptId"::text=promoted."attemptId"
),
inbox_reply_candidates AS (
  SELECT sent.id, sent."messageThreadId", sent."messageChannelId", link."recordId" AS "parentId"
  FROM authorized_email sent
  JOIN core."actionExecutionReceipt" receipt ON receipt."workspaceId"=sent."workspaceId"
    AND receipt.state='SENT' AND receipt."providerMessageId"=sent."headerMessageId"
    AND (receipt."providerExternalMessageId" IS NULL OR receipt."providerExternalMessageId"=sent."messageExternalId")
  JOIN core."actionApprovalBinding" binding ON binding.id=receipt."actionApprovalBindingId"
    AND binding."workspaceId"=sent."workspaceId" AND binding."actionName"='send_inbox_reply'
  JOIN core."actionApprovalBindingEvidenceLink" target ON target."actionApprovalBindingId"=binding.id
    AND target.role IN ('draft','delivery_target') AND target."recordId"=sent."messageThreadId"
  JOIN core."actionApprovalBindingEvidenceLink" link ON link."actionApprovalBindingId"=binding.id
    AND link.role='thread_parent'
  WHERE sent.direction='OUTGOING' AND sent."headerMessageId" IS NOT NULL
),
inbox_reply_paths AS (
  SELECT reply.id, reply."messageThreadId", reply."messageChannelId", parent."anchorKey"
  FROM inbox_reply_candidates reply
  JOIN direct_groups parent ON parent.id=reply."parentId"
    AND parent."messageThreadId"=reply."messageThreadId" AND parent."messageChannelId"=reply."messageChannelId"
  UNION
  SELECT reply.id, reply."messageThreadId", reply."messageChannelId", parent."anchorKey"
  FROM inbox_reply_candidates reply
  JOIN inbox_reply_paths parent ON parent.id=reply."parentId"
    AND parent."messageThreadId"=reply."messageThreadId" AND parent."messageChannelId"=reply."messageChannelId"
),
inbox_reply_groups AS (
  SELECT id, MIN("anchorKey") AS "anchorKey" FROM inbox_reply_paths
  GROUP BY id HAVING COUNT(DISTINCT "anchorKey")=1
),
root_candidates AS (
  SELECT COALESCE(parent.id, inbound.id) AS id, direct."messageThreadId",
    COALESCE(parent."receivedAt", inbound."receivedAt") AS "receivedAt",
    inbound."receivedAt" AS "replyAt", inbound.id AS "replyId", inbound."createdAt", direct."anchorKey"
  FROM direct_groups direct
  JOIN authorized_email inbound ON inbound.id=direct.id
  LEFT JOIN authorized_email parent ON parent.id=direct."projectedMessageId"
    AND parent."messageThreadId"=inbound."messageThreadId" AND parent.direction='OUTGOING'
  UNION ALL
  SELECT message.id, message."messageThreadId", message."receivedAt",
    message."receivedAt", message.id, message."createdAt",
    'legacy:' || message."messageThreadId"::text
  FROM authorized_email message
),
roots AS (
  SELECT DISTINCT ON ("messageThreadId", "anchorKey") id, "messageThreadId", "receivedAt", "anchorKey"
  FROM root_candidates, clock
  WHERE "createdAt" <= clock.at
  ORDER BY "messageThreadId", "anchorKey", "replyAt", "replyId"
),
current_roots AS (
  SELECT DISTINCT ON ("messageThreadId", "anchorKey") id, "messageThreadId", "receivedAt", "anchorKey"
  FROM root_candidates ORDER BY "messageThreadId", "anchorKey", "replyAt", "replyId"
),
message_groups AS (
  SELECT message.id, message."messageThreadId", message."receivedAt", message."createdAt",
    CASE ${scope.legacyCardsOnly ? `WHEN TRUE THEN 'legacy:' || message."messageThreadId"::text` : ''}
      WHEN direct.id IS NOT NULL THEN direct."anchorKey"
      WHEN inbox_reply.id IS NOT NULL THEN inbox_reply."anchorKey"
      ${scope.responseCardsOnly ? `WHEN message.direction='OUTGOING' AND accepted."projectedMessageId" IS NULL THEN NULL` : ''}
      WHEN message.direction='INCOMING' AND EXISTS (
        SELECT 1 FROM direct_groups evidence WHERE evidence."messageThreadId"=message."messageThreadId"
      ) THEN NULL
      WHEN accepted."projectedMessageId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM roots root WHERE root."messageThreadId"=message."messageThreadId"
          AND root."anchorKey" NOT LIKE 'legacy:%'
      ) THEN (SELECT root."anchorKey" FROM roots root
        WHERE root."messageThreadId"=message."messageThreadId"
          AND root."anchorKey"='attempt:' || accepted."attemptId"::text LIMIT 1)
      ELSE COALESCE(
        (SELECT root."anchorKey" FROM roots root
          WHERE root."messageThreadId"=message."messageThreadId" AND root."receivedAt"<=message."receivedAt"
          ORDER BY root."receivedAt" DESC, root."anchorKey" DESC LIMIT 1),
        (SELECT root."anchorKey" FROM roots root WHERE root."messageThreadId"=message."messageThreadId"
          ORDER BY root."receivedAt", root."anchorKey" LIMIT 1)) END AS "anchorKey"
  FROM authorized_email message
  LEFT JOIN direct_groups direct ON direct.id=message.id
  LEFT JOIN inbox_reply_groups inbox_reply ON inbox_reply.id=message.id
  LEFT JOIN accepted_outreach accepted ON accepted."projectedMessageId"=message.id
),
metadata AS (
  SELECT ${timestamp('clock.at')} AS "snapshotAt",
    md5(COALESCE((SELECT string_agg(id::text || ':' || "anchorKey" || ':' || ${timestamp('"receivedAt"')}, ',' ORDER BY "receivedAt", "messageThreadId", "anchorKey") FROM roots), '') || COALESCE((SELECT string_agg(id::text || ':' || "anchorKey", ',' ORDER BY id) FROM message_groups, clock WHERE "createdAt"<=clock.at), '')) AS fingerprint,
    EXISTS(SELECT 1 FROM authorized_email message
      ${scope.responseCardsOnly ? `JOIN message_groups membership ON membership.id=message.id AND membership."anchorKey" NOT LIKE 'legacy:%'` : ''}
      WHERE message."receivedAt" IS NULL OR message."createdAt" IS NULL) AS "orderingUnavailable",
    EXISTS(SELECT 1 FROM roots JOIN current_roots current USING ("messageThreadId", "anchorKey") WHERE roots.id <> current.id AND roots."messageThreadId" = COALESCE(${threadId}::uuid, (SELECT "messageThreadId" FROM authorized_email WHERE id = ${messageId}::uuid))) AS "rootChanged",
    (${boundaryTimestamp}::timestamptz IS NULL OR ${
      isCards
        ? `EXISTS(SELECT 1 FROM roots WHERE ("receivedAt", "messageThreadId", "anchorKey") = (${boundaryTimestamp}::timestamptz, ${boundaryThreadId}::uuid, ${boundaryId}::text))`
        : `EXISTS(SELECT 1 FROM message_groups message JOIN roots root ON root."messageThreadId" = message."messageThreadId" AND (root."anchorKey"=message."anchorKey" OR (root."anchorKey"='legacy:' || ${threadId}::text AND ${anchorKey}::text IS NULL)) WHERE message."messageThreadId" = ${threadId}::uuid AND message.id <> root.id AND (message."receivedAt", message.id) = (${boundaryTimestamp}::timestamptz, ${boundaryId}::uuid))`
    }) AS "cursorValid",
    EXISTS(SELECT 1 FROM readable_member) AND EXISTS(SELECT 1 FROM readable_contact) AS authorized,
    (SELECT "messageThreadId" FROM roots WHERE ${isCards ? cardsFilter : 'TRUE'} ORDER BY "receivedAt" DESC, "messageThreadId" DESC, "anchorKey" DESC LIMIT 1) AS "latestThreadId"
  FROM clock
),
selected_roots AS (
  SELECT roots.* FROM roots, metadata
  WHERE metadata.authorized AND NOT metadata."orderingUnavailable" AND NOT metadata."rootChanged" AND metadata."cursorValid"
    AND (${fingerprint}::text IS NULL OR metadata.fingerprint = ${fingerprint}::text)
    AND ${
      isCards
        ? `(${cardsFilter.replace(/"anchorKey"/g, 'roots."anchorKey"')} AND (${boundaryTimestamp}::timestamptz IS NULL OR (roots."receivedAt", roots."messageThreadId", roots."anchorKey") < (${boundaryTimestamp}::timestamptz, ${boundaryThreadId}::uuid, ${boundaryId}::text)))`
        : `${selection.mode === 'location' && scope.responseCardsOnly ? `roots.${cardsFilter} AND ` : ''}roots."messageThreadId" = COALESCE(${threadId}::uuid, (SELECT "messageThreadId" FROM authorized_email WHERE id = ${messageId}::uuid)) AND ((${messageId}::uuid IS NOT NULL AND roots."anchorKey"=(SELECT "anchorKey" FROM message_groups WHERE id=${messageId}::uuid)) OR (${messageId}::uuid IS NULL AND roots."anchorKey"=COALESCE(${anchorKey}::text, 'legacy:' || ${threadId}::text)))`
    }
  ORDER BY roots."receivedAt" DESC, roots."messageThreadId" DESC, roots."anchorKey" DESC LIMIT ${isCards ? 3 : 1}
),
cards AS (
  SELECT root."receivedAt", root."messageThreadId", root."anchorKey", jsonb_build_object(
    'threadId', root."messageThreadId", 'anchorKey', root."anchorKey", 'rootMessageId', root.id,
    'startTimestamp', ${timestamp('root."receivedAt"')},
    'subject', CASE WHEN message.visibility IN ('FULL','SUBJECT') AND subject.id IS NOT NULL THEN subject.subject ELSE ${restricted}::text END,
    'campaignLabel', campaign_name.name,
    'historyBasis', CASE WHEN root."anchorKey" LIKE 'attempt:%' AND message.direction='INCOMING'
      THEN 'PENDING' ELSE 'EARLIEST_AUTHORIZED_RETAINED' END
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
  JOIN message_groups membership ON membership.id=message.id AND (membership."anchorKey"=root."anchorKey" OR root."anchorKey" LIKE 'legacy:%')
  WHERE ${readsMessages} AND message.id <> root.id
    AND (${boundaryTimestamp}::timestamptz IS NULL OR (message."receivedAt", message.id) ${isNewer ? '>' : '<'} (${boundaryTimestamp}::timestamptz, ${messageBoundaryId}))
    AND (${messageId}::uuid IS NULL OR ${messageId}::uuid = root.id OR (message."receivedAt", message.id) <= (SELECT "receivedAt", id FROM authorized_email WHERE id = ${messageId}::uuid))
  ORDER BY message."receivedAt" ${isNewer ? 'ASC' : 'DESC'}, message.id ${isNewer ? 'ASC' : 'DESC'} LIMIT 20
),
window_bounds AS (
  SELECT
    COALESCE((SELECT "receivedAt" FROM reply_window ORDER BY "receivedAt", id LIMIT 1), ${boundaryTimestamp}::timestamptz) AS "olderAt",
    COALESCE((SELECT id FROM reply_window ORDER BY "receivedAt", id LIMIT 1), ${messageBoundaryId}) AS "olderId",
    COALESCE((SELECT "receivedAt" FROM reply_window ORDER BY "receivedAt" DESC, id DESC LIMIT 1), ${boundaryTimestamp}::timestamptz) AS "newerAt",
    COALESCE((SELECT id FROM reply_window ORDER BY "receivedAt" DESC, id DESC LIMIT 1), ${messageBoundaryId}) AS "newerId"
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
    'threadId', root."messageThreadId", 'anchorKey', root."anchorKey",
    'root', (SELECT value FROM hydrated_messages WHERE id = root.id),
    'messages', COALESCE((SELECT jsonb_agg(value ORDER BY "receivedAt", id) FROM hydrated_messages WHERE id <> root.id), '[]'::jsonb),
    'hasOlder', EXISTS(SELECT 1 FROM message_groups message WHERE message."messageThreadId" = root."messageThreadId" AND (message."anchorKey"=root."anchorKey" OR root."anchorKey" LIKE 'legacy:%') AND message.id <> root.id AND (message."receivedAt", message.id) < (SELECT "olderAt", "olderId" FROM window_bounds)),
    'hasNewer', EXISTS(SELECT 1 FROM message_groups message WHERE message."messageThreadId" = root."messageThreadId" AND (message."anchorKey"=root."anchorKey" OR root."anchorKey" LIKE 'legacy:%') AND message.id <> root.id AND (message."receivedAt", message.id) > (SELECT "newerAt", "newerId" FROM window_bounds))
  ) FROM selected_roots root WHERE ${readsMessages}) AS page,
  COALESCE((SELECT jsonb_agg(value ORDER BY "receivedAt", "messageThreadId", "anchorKey") FROM cards), '[]'::jsonb) AS cards,
  EXISTS(SELECT 1 FROM roots WHERE ${isCards ? `${cardsFilter} AND ` : ''}("receivedAt", "messageThreadId", "anchorKey") < (SELECT "receivedAt", "messageThreadId", "anchorKey" FROM selected_roots ORDER BY "receivedAt", "messageThreadId", "anchorKey" LIMIT 1)) AS "hasOlderCards"
FROM metadata`,
  };
};

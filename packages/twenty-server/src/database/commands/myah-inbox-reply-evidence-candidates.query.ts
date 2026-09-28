// Shared by the Nest apply command and the standalone read-only preview.
// The schema comes only from a validated workspace UUID via getWorkspaceSchemaName.
export const myahInboxReplyEvidenceCandidatesQuery = (schema: string) => `
  SELECT message.id AS "messageId", message."messageThreadId" AS "threadId",
         association."messageChannelId" AS "channelId",
         association."messageThreadExternalId" AS "threadExternalId",
         lower(trim(sender.handle)) AS sender
    FROM "${schema}".message message
    JOIN "${schema}"."messageChannelMessageAssociation" association
      ON association."messageId"=message.id AND association."deletedAt" IS NULL
    JOIN core."messageChannel" channel
      ON channel.id=association."messageChannelId" AND channel."workspaceId"=$1
    JOIN LATERAL (
      SELECT participant.handle FROM "${schema}"."messageParticipant" participant
       WHERE participant."messageId"=message.id AND participant.role='FROM'
       ORDER BY participant.id LIMIT 1
    ) sender ON true
   WHERE message."deletedAt" IS NULL AND message."receivedAt" IS NOT NULL
     AND message."messageThreadId" IS NOT NULL AND message."isDraft"=false
     AND association.direction='INCOMING'
     AND channel.type::text IN ('EMAIL','EMAIL_GROUP')
     AND association."messageThreadExternalId" IS NOT NULL
     AND trim(association."messageThreadExternalId") <> ''
     AND trim(sender.handle) <> ''
     AND ($2::uuid IS NULL OR message.id > $2)
     AND NOT EXISTS (
       SELECT 1 FROM "${schema}"."messageChannelMessageAssociation" other
        WHERE other."messageId"=message.id AND other."deletedAt" IS NULL
          AND other.direction='INCOMING' AND other.id<>association.id
     )
     AND EXISTS (
       SELECT 1 FROM core."outboundEmailAttempt" attempt
       JOIN core."campaignEnrollment" enrollment
         ON enrollment.id=attempt."enrollmentId"
        AND enrollment."workspaceId"=attempt."workspaceId"
       WHERE attempt."workspaceId"=$1
         AND attempt."messageChannelId"=association."messageChannelId"
         AND attempt.source='CAMPAIGN_SEQUENCE'
         AND attempt."attemptState"='ACCEPTED'
         AND attempt."providerAcceptedAt" <= message."receivedAt"
         AND attempt."resolvedThreadExternalId"=association."messageThreadExternalId"
         AND attempt."normalizedRecipient"=lower(trim(sender.handle))
     )
     AND NOT EXISTS (
       SELECT 1 FROM core."myahCampaignReplyEvidence" evidence
       WHERE evidence."workspaceId"=$1 AND evidence."inboundMessageId"=message.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM core."myahCampaignReplyPending" pending
       WHERE pending."workspaceId"=$1 AND pending."messageId"=message.id
     )
   ORDER BY message.id LIMIT $3`;

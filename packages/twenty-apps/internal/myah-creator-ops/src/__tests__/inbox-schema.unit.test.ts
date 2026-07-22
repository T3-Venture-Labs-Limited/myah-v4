import { describe, expect, it } from 'vitest';
import {
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';
import creatorOnMessageThreadResult from 'src/fields/creator-on-message-thread.field';
import inboxOwnerOnMessageThreadResult from 'src/fields/inbox-owner-on-message-thread.field';
import inboxStateOnMessageThreadResult from 'src/fields/inbox-state-on-message-thread.field';
import inboxThreadsOnCampaignResult from 'src/fields/inbox-threads-on-campaign.field';
import inboxThreadsOnCreatorResult from 'src/fields/inbox-threads-on-creator.field';
import myahCampaignOnMessageThreadResult from 'src/fields/myah-campaign-on-message-thread.field';
import myahReplyDraftBodyOnMessageThreadResult from 'src/fields/myah-reply-draft-body-on-message-thread.field';
import myahReplyDraftRevisionOnMessageThreadResult from 'src/fields/myah-reply-draft-revision-on-message-thread.field';
import ownedInboxThreadsOnWorkspaceMemberResult from 'src/fields/owned-inbox-threads-on-workspace-member.field';
import snoozedUntilOnMessageThreadResult from 'src/fields/snoozed-until-on-message-thread.field';

const unwrapValidationResult = <T>(result: {
  success: boolean;
  config: T;
  errors: string[];
}): T => {
  if (result.success === false) {
    throw new Error(result.errors.join(', '));
  }

  return result.config;
};

const inboxFields = [
  unwrapValidationResult(creatorOnMessageThreadResult),
  unwrapValidationResult(myahCampaignOnMessageThreadResult),
  unwrapValidationResult(inboxOwnerOnMessageThreadResult),
  unwrapValidationResult(inboxStateOnMessageThreadResult),
  unwrapValidationResult(snoozedUntilOnMessageThreadResult),
  unwrapValidationResult(myahReplyDraftBodyOnMessageThreadResult),
  unwrapValidationResult(myahReplyDraftRevisionOnMessageThreadResult),
  unwrapValidationResult(inboxThreadsOnCreatorResult),
  unwrapValidationResult(inboxThreadsOnCampaignResult),
  unwrapValidationResult(ownedInboxThreadsOnWorkspaceMemberResult),
];

const getField = (name: string) =>
  inboxFields.find((field) => field.name === name);

describe('Inbox MessageThread manifest schema', () => {
  it('declares the seven MessageThread fields with their storage contract', () => {
    expect(getField('creator')).toMatchObject({
      universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'creatorId',
      },
    });
    expect(getField('myahCampaign')).toMatchObject({
      universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahCampaign,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'myahCampaignId',
      },
    });
    expect(getField('inboxOwner')).toMatchObject({
      universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxOwner,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.ownedInboxThreads,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'inboxOwnerId',
      },
    });
    expect(getField('inboxState')).toMatchObject({
      universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxState,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      type: FieldType.SELECT,
      isNullable: false,
      defaultValue: "'NEEDS_REPLY'",
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'NEEDS_REPLY' }),
        expect.objectContaining({ value: 'WAITING_ON_CREATOR' }),
        expect.objectContaining({ value: 'SNOOZED' }),
        expect.objectContaining({ value: 'CLOSED' }),
      ]),
    });
    expect(getField('snoozedUntil')).toMatchObject({
      universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.snoozedUntil,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      type: FieldType.DATE_TIME,
      isNullable: true,
    });
    expect(getField('myahReplyDraftBody')).toMatchObject({
      universalIdentifier:
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftBody,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      type: FieldType.RICH_TEXT,
      isNullable: true,
    });
    expect(getField('myahReplyDraftRevision')).toMatchObject({
      universalIdentifier:
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftRevision,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      type: FieldType.NUMBER,
      isNullable: false,
      defaultValue: 0,
    });
  });

  it('pairs the three Inbox relations with nullable inverse ends', () => {
    expect(getField('inboxThreads')).toMatchObject({
      universalIdentifier: CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
      objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    });
    expect(
      inboxFields.find(
        (field) =>
          field.universalIdentifier ===
          CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
      ),
    ).toMatchObject({
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
      objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahCampaign,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    });
    expect(getField('ownedInboxThreads')).toMatchObject({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxOwner,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    });
  });
  it('prevents generic UI editing of Inbox fields', () => {
    for (const field of inboxFields) {
      expect(field).toMatchObject({ isUIEditable: false });
    }
  });


  it('uses unique IDs and leaves every Inbox field unindexed', () => {
    const inboxFieldIdentifiers = inboxFields.map(
      (field) => field.universalIdentifier,
    );

    expect(inboxFieldIdentifiers).toHaveLength(10);
    expect([...new Set(inboxFieldIdentifiers)]).toHaveLength(
      inboxFieldIdentifiers.length,
    );
    expect(Object.values(MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS)).toHaveLength(
      8,
    );
    for (const field of inboxFields) {
      expect(field).not.toMatchObject({ isIndexed: true });
    }
  });
});

import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const maps = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-09-25T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
}).allFlatEntityMaps;
const fields = maps.flatFieldMetadataMaps.byUniversalIdentifier;
const field = (
  object: { fields: Record<string, { universalIdentifier: string }> },
  name: string,
) => fields[object.fields[name].universalIdentifier];
const campaign = MYAH_STANDARD_OBJECTS.campaign;
const participation = MYAH_STANDARD_OBJECTS.campaignCreator;
const binding = MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding;

describe('dormant native Campaign reply authority metadata', () => {
  it('allocates noncolliding stable universal identifiers and a private object without default role grants', () => {
    const ids = Object.values(STANDARD_OBJECTS).flatMap((object) => [
      object.universalIdentifier,
      ...Object.values(object.fields).map((f) => f.universalIdentifier),
      ...Object.values(object.indexes).map((i) => i.universalIdentifier),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      maps.flatObjectMetadataMaps.byUniversalIdentifier[
        binding.universalIdentifier
      ],
    ).toMatchObject({
      nameSingular: 'campaignEmailConversationBinding',
      isUICreatable: false,
      isUIEditable: false,
    });
    const grants = Object.values(
      maps.flatObjectPermissionMaps.byUniversalIdentifier,
    );
    expect(
      grants.filter(
        (permission) =>
          permission?.objectMetadataUniversalIdentifier ===
          binding.universalIdentifier,
      ),
    ).toEqual([]);
  });

  it('defaults Campaign to off/Review and participation to unpaused with independent revisions', () => {
    for (const [object, name, type, defaultValue] of [
      [campaign, 'replyAgentEnabled', FieldMetadataType.BOOLEAN, false],
      [campaign, 'replyAgentMode', FieldMetadataType.SELECT, "'REVIEW'"],
      [campaign, 'replyAgentRevision', FieldMetadataType.NUMBER, 0],
      [participation, 'replyAgentPaused', FieldMetadataType.BOOLEAN, false],
      [participation, 'replyAgentRevision', FieldMetadataType.NUMBER, 0],
      [
        participation,
        'replyAgentMaterialGeneration',
        FieldMetadataType.NUMBER,
        0,
      ],
    ] as const) {
      expect(field(object, name)).toMatchObject({
        type,
        defaultValue,
        isNullable: false,
        isUIEditable: false,
      });
    }
    expect(field(campaign, 'replyAgentEnabledAt')).toMatchObject({
      defaultValue: null,
      isNullable: true,
    });
    expect(field(campaign, 'replyAgentEnabledByUserWorkspaceId')).toMatchObject(
      {
        type: FieldMetadataType.UUID,
        defaultValue: null,
        isNullable: true,
        isUIEditable: false,
      },
    );
    expect(field(participation, 'replyAgentPauseHistory')).toMatchObject({
      type: FieldMetadataType.RAW_JSON,
      defaultValue: null,
      isNullable: true,
      isUIEditable: false,
    });
    expect(
      field(campaign, 'replyAgentMode')?.options?.map((o) => o.value),
    ).toEqual(['REVIEW', 'AUTONOMOUS']);
  });

  it('preserves immutable identity/route/evidence snapshots independently of navigation and links both relation ends', () => {
    for (const name of [
      'campaignId',
      'participationId',
      'creatorId',
      'messageThreadId',
      'messageChannelId',
      'connectedAccountId',
      'providerThreadId',
      'creatorSender',
      'accountRecipient',
      'evidenceKind',
      'evidenceReference',
      'establishedAt',
      'establishedByWorkspaceMemberId',
      'messageId',
      'revokedAt',
      'revokedByWorkspaceMemberId',
      'revocationReason',
    ])
      expect(field(binding, name)).toMatchObject({
        isUIEditable: false,
        isNullable: [
          'establishedByWorkspaceMemberId',
          'messageId',
          'revokedAt',
          'revokedByWorkspaceMemberId',
          'revocationReason',
        ].includes(name),
      });
    expect(field(binding, 'campaignCreator')).toMatchObject({
      type: FieldMetadataType.RELATION,
      relationTargetFieldMetadataUniversalIdentifier:
        participation.fields.emailConversationBindings.universalIdentifier,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'campaignCreatorId',
      },
    });
    expect(field(participation, 'emailConversationBindings')).toMatchObject({
      type: FieldMetadataType.RELATION,
      relationTargetFieldMetadataUniversalIdentifier:
        binding.fields.campaignCreator.universalIdentifier,
      settings: { relationType: RelationType.ONE_TO_MANY },
    });
  });
});

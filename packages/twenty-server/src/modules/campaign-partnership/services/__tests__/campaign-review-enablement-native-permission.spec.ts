import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ObjectsPermissions } from 'twenty-shared/types';

import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

// This suite intentionally uses the real native field permission checker, unlike
// the service's transaction double. The companion service test checks that the
// actual repository call selects only id in its fifth (RETURNING) argument.
const maps = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-09-28T00:00:00.000Z',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  twentyStandardApplicationId: '22222222-2222-4222-8222-222222222222',
}).allFlatEntityMaps;
const campaign =
  maps.flatObjectMetadataMaps.byUniversalIdentifier[
    MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
  ]!;
const field = (name: keyof typeof MYAH_STANDARD_OBJECTS.campaign.fields) =>
  maps.flatFieldMetadataMaps.byUniversalIdentifier[
    MYAH_STANDARD_OBJECTS.campaign.fields[name].universalIdentifier
  ]!;
const controls = [
  'replyAgentEnabled',
  'replyAgentMode',
  'replyAgentRevision',
  'replyAgentEnabledAt',
  'replyAgentEnabledByUserWorkspaceId',
  'replyAgentChangedAt',
  'replyAgentChangedByWorkspaceMemberId',
];
// The source-controlled flat object template has no reverse fieldIds until
// metadata relations are assembled. Supply the installed object's relevant IDs.
const installedCampaign = {
  ...campaign,
  fieldIds: ['id', 'name', ...controls].map(
    (name) =>
      field(name as keyof typeof MYAH_STANDARD_OBJECTS.campaign.fields).id,
  ),
};
const installedObjectMaps = {
  ...maps.flatObjectMetadataMaps,
  byUniversalIdentifier: {
    ...maps.flatObjectMetadataMaps.byUniversalIdentifier,
    [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: installedCampaign,
  },
};
const permission = (deniedControl?: string): ObjectsPermissions => ({
  [campaign.id]: {
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
    restrictedFields: {
      [field('name').id]: { canRead: false, canUpdate: false },
      ...(deniedControl
        ? {
            [field(
              deniedControl as keyof typeof MYAH_STANDARD_OBJECTS.campaign.fields,
            ).id]: { canRead: true, canUpdate: false },
          }
        : {}),
    },
    rowLevelPermissionPredicates: [],
    rowLevelPermissionPredicateGroups: [],
  },
});
const check = (selectedColumns: string[] | '*', deniedControl?: string) =>
  validateOperationIsPermittedOrThrow({
    entityName: 'campaign',
    operationType: 'update',
    objectsPermissions: permission(deniedControl),
    flatObjectMetadataMaps: installedObjectMaps,
    flatFieldMetadataMaps: maps.flatFieldMetadataMaps,
    objectIdByNameSingular: { campaign: campaign.id },
    selectedColumns,
    allFieldsSelected: false,
    updatedColumns: controls,
  });

describe('native Campaign Review field permission path', () => {
  it('accepts id-only RETURNING for a permitted control write while rejecting default RETURNING *', () => {
    expect(installedCampaign.fieldIds).toContain(field('id').id);
    expect(() => check('*')).toThrow();
    expect(() => check(['id'])).not.toThrow();
  });
  it('still rejects writes to a denied control field with id-only RETURNING', () => {
    expect(() => check(['id'], 'replyAgentEnabledByUserWorkspaceId')).toThrow(
      /permission|denied/i,
    );
  });
});

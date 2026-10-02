import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ObjectRecord, FieldMetadataType } from 'twenty-shared/types';

import {
  CommonBaseQueryRunnerService,
  isProtectedCampaignReplyAuthorityMutation,
} from 'src/engine/api/common/common-query-runners/common-base-query-runner.service';
import {
  type CommonInput,
  CommonQueryNames,
  type UpdateOneQueryArgs,
} from 'src/engine/api/common/types/common-query-args.type';

const binding =
  MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding.universalIdentifier;
const campaign = MYAH_STANDARD_OBJECTS.campaign.universalIdentifier;
const participation = MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier;
const unrelated = MYAH_STANDARD_OBJECTS.creator.universalIdentifier;
// Minimal metadata graph: unrelated RAW_JSON is a leaf; only a real relation
// to a Campaign is traversed, including nested connect/where shapes.
const metadata = {
  flatObjectMetadata: {
    id: 'creator-id',
    universalIdentifier: unrelated,
    fieldIds: ['json-id', 'campaign-id', 'participation-id'],
  },
  flatObjectMetadataMaps: {
    byUniversalIdentifier: {
      [campaign]: {
        id: 'campaign-object-id',
        universalIdentifier: campaign,
        fieldIds: ['control-id'],
      },
      [participation]: {
        id: 'participation-object-id',
        universalIdentifier: participation,
        fieldIds: ['pause-id'],
      },
    },
    universalIdentifierById: {
      'campaign-object-id': campaign,
      'participation-object-id': participation,
    },
  },
  flatFieldMetadataMaps: {
    byUniversalIdentifier: {
      'json-uid': {
        id: 'json-id',
        name: 'payload',
        type: FieldMetadataType.RAW_JSON,
      },
      'campaign-uid': {
        id: 'campaign-id',
        name: 'campaign',
        type: FieldMetadataType.RELATION,
        relationTargetObjectMetadataId: 'campaign-object-id',
      },
      'control-uid': {
        id: 'control-id',
        name: 'replyAgentMode',
        type: FieldMetadataType.SELECT,
      },
      'participation-uid': {
        id: 'participation-id',
        name: 'campaignCreators',
        type: FieldMetadataType.RELATION,
        relationTargetObjectMetadataId: 'participation-object-id',
      },
      'pause-uid': {
        id: 'pause-id',
        name: 'replyAgentPaused',
        type: FieldMetadataType.BOOLEAN,
      },
    },
    universalIdentifierById: {
      'json-id': 'json-uid',
      'campaign-id': 'campaign-uid',
      'control-id': 'control-uid',
      'participation-id': 'participation-uid',
      'pause-id': 'pause-uid',
    },
  },
};
const operations = [
  CommonQueryNames.CREATE_ONE,
  CommonQueryNames.CREATE_MANY,
  CommonQueryNames.UPDATE_ONE,
  CommonQueryNames.UPDATE_MANY,
  CommonQueryNames.DELETE_ONE,
  CommonQueryNames.DELETE_MANY,
  CommonQueryNames.DESTROY_ONE,
  CommonQueryNames.DESTROY_MANY,
  CommonQueryNames.RESTORE_ONE,
  CommonQueryNames.RESTORE_MANY,
  CommonQueryNames.MERGE_MANY,
];

describe('dormant reply authority generic mutation guard', () => {
  it.each(operations)(
    'denies binding %s, including operations with no data',
    (operation) => {
      expect(
        isProtectedCampaignReplyAuthorityMutation(operation, binding, {}),
      ).toBe(true);
    },
  );

  it.each([campaign, participation])(
    'denies each control, bulk and nested mutation on %s',
    (id) => {
      const fields =
        id === campaign
          ? [
              'replyAgentEnabled',
              'replyAgentMode',
              'replyAgentRevision',
              'replyAgentEnabledAt',
              'replyAgentChangedAt',
              'replyAgentChangedByWorkspaceMemberId',
            ]
          : [
              'replyAgentPaused',
              'replyAgentMaterialGeneration',
              'replyAgentRevision',
              'replyAgentPauseHistory',
              'replyAgentChangedAt',
              'replyAgentChangedByWorkspaceMemberId',
            ];
      for (const field of fields) {
        for (const operation of [
          CommonQueryNames.CREATE_ONE,
          CommonQueryNames.CREATE_MANY,
          CommonQueryNames.UPDATE_ONE,
          CommonQueryNames.UPDATE_MANY,
        ]) {
          expect(
            isProtectedCampaignReplyAuthorityMutation(operation, id, {
              data: [{ [field]: null }],
            }),
          ).toBe(true);
        }
      }
    },
  );

  it('keeps unrelated CRUD and reads available without implying reply permission', () => {
    for (const operation of operations.filter(
      (name) => name !== CommonQueryNames.MERGE_MANY,
    )) {
      expect(
        isProtectedCampaignReplyAuthorityMutation(operation, campaign, {
          data: { name: 'Safe' },
        }),
      ).toBe(false);
      expect(
        isProtectedCampaignReplyAuthorityMutation(operation, participation, {
          data: { name: 'Safe' },
        }),
      ).toBe(false);
    }
    for (const id of [binding, campaign, participation]) {
      expect(
        isProtectedCampaignReplyAuthorityMutation(
          CommonQueryNames.FIND_ONE,
          id,
          { data: { replyAgentEnabled: true } },
        ),
      ).toBe(false);
    }
  });

  it('denies data-less Campaign and participation merges but not other objects', () => {
    for (const id of [campaign, participation]) {
      expect(
        isProtectedCampaignReplyAuthorityMutation(
          CommonQueryNames.MERGE_MANY,
          id,
          { ids: ['a', 'b'], conflictPriorityIndex: 0 },
        ),
      ).toBe(true);
    }
    expect(
      isProtectedCampaignReplyAuthorityMutation(
        CommonQueryNames.MERGE_MANY,
        unrelated,
        { ids: ['a', 'b'], conflictPriorityIndex: 0 },
      ),
    ).toBe(false);
  });

  it('ignores matching names inside unrelated RAW_JSON but protects actual nested relation writes', () => {
    const json = { data: { payload: { replyAgentMode: 'quoted source' } } };
    const relation = {
      data: {
        campaign: { connect: { where: { replyAgentMode: 'AUTONOMOUS' } } },
      },
    };
    expect(
      isProtectedCampaignReplyAuthorityMutation(
        CommonQueryNames.CREATE_ONE,
        unrelated,
        json,
        metadata as never,
      ),
    ).toBe(false);
    expect(
      isProtectedCampaignReplyAuthorityMutation(
        CommonQueryNames.UPDATE_ONE,
        campaign,
        json,
        {
          ...metadata,
          flatObjectMetadata: {
            id: 'campaign-object-id',
            universalIdentifier: campaign,
            fieldIds: ['json-id', 'control-id'],
          },
        } as never,
      ),
    ).toBe(false);
    expect(
      isProtectedCampaignReplyAuthorityMutation(
        CommonQueryNames.CREATE_ONE,
        unrelated,
        relation,
        metadata as never,
      ),
    ).toBe(true);
    expect(
      isProtectedCampaignReplyAuthorityMutation(
        CommonQueryNames.UPDATE_ONE,
        unrelated,
        {
          data: {
            campaignCreators: {
              connect: { where: { replyAgentPaused: true } },
            },
          },
        },
        metadata as never,
      ),
    ).toBe(true);
  });
});

class GuardRunner extends CommonBaseQueryRunnerService<
  UpdateOneQueryArgs,
  ObjectRecord
> {
  protected readonly operationName = CommonQueryNames.MERGE_MANY;
  protected async run(): Promise<ObjectRecord> {
    return { id: 'written' };
  }
  protected async validate(): Promise<void> {}
  protected async computeArgs(
    args: CommonInput<UpdateOneQueryArgs>,
  ): Promise<CommonInput<UpdateOneQueryArgs>> {
    return args;
  }
  protected async processQueryResult(
    result: ObjectRecord,
  ): Promise<ObjectRecord> {
    return result;
  }
}

it.each([campaign, participation])(
  'rejects data-less %s merges at the runner before hooks or run',
  async (objectId) => {
    for (const transactional of [false, true]) {
      const runner = new GuardRunner();
      const rawHooks = jest.fn();
      const run = jest.spyOn(runner as never, 'run');
      Object.assign(runner, {
        workspaceQueryHookService: {
          shouldRunPreQueryHooksInTransaction: () => transactional,
          executeRawInputPreQueryHooks: rawHooks,
        },
        throttlerService: { tokenBucketThrottleOrThrow: jest.fn() },
        metricsService: { incrementCounterForEvent: jest.fn() },
      });
      await expect(
        runner.execute(
          {
            ids: ['a', 'b'],
            conflictPriorityIndex: 0,
            selectedFields: {},
          } as never,
          {
            authContext: { type: 'system', workspace: { id: 'w' } },
            flatObjectMetadata: { universalIdentifier: objectId },
          } as never,
        ),
      ).rejects.toThrow(
        'Campaign reply authority is writable only through authorized domain services',
      );
      expect(rawHooks).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    }
  },
);

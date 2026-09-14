import { MyahCreatorOpsToolWorkspaceService } from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.workspace-service';

const authContext = {
  type: 'user',
  workspace: { id: '20202020-1c25-4d02-bf25-6aeccf7ea419' },
  userWorkspaceId: '20202020-1234-4678-9012-345678901234',
  user: { id: '20202020-1234-4678-9012-345678901235' },
  workspaceMemberId: '20202020-0b5c-4178-bed7-d371f6411eaa',
  workspaceMember: { id: '20202020-0b5c-4178-bed7-d371f6411eaa' },
};
const creatorListId = '20202020-1111-4111-8111-111111111111';
const campaignId = '20202020-2222-4222-8222-222222222222';
const creatorId = '20202020-3333-4333-8333-333333333333';
const anotherCreatorId = '20202020-4444-4444-8444-444444444444';
const managedMailboxId = '20202020-5555-4555-8555-555555555555';

type ExecutableTool = {
  inputSchema: {
    safeParse: (input: unknown) => { success: boolean };
  };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type CreatorOpsTools = Record<string, ExecutableTool>;

const expectedToolNames = [
  'add_creators_to_creator_list',
  'remove_creator_from_creator_list',
  'get_campaign_audience',
  'add_direct_campaign_creators',
  'attach_creator_lists_to_campaign',
  'detach_creator_list_from_campaign',
  'get_campaign_creator_list_addition_candidates',
  'approve_campaign_creator_list_additions',
].sort();

const createService = () => {
  const results = {
    members: [{ id: 'membership-id', creatorId }],
    snapshot: {
      campaignCreators: [{ id: 'campaign-creator-id', creatorId }],
      campaignCreatorLists: [{ id: 'attachment-id', creatorListId }],
    },
    candidates: { creatorIds: [creatorId] },
    removed: { removed: true },
  };
  const campaignInfluencerService = {
    addCreatorListMembersIntent: jest.fn().mockResolvedValue(results.members),
    removeCreatorListMemberIntent: jest.fn().mockResolvedValue(results.removed),
    snapshot: jest.fn().mockResolvedValue(results.snapshot),
    addDirectCampaignCreators: jest.fn().mockResolvedValue(results.snapshot),
    attachCampaignCreatorLists: jest.fn().mockResolvedValue(results.snapshot),
    detachCampaignCreatorList: jest.fn().mockResolvedValue(results.snapshot),
    campaignCreatorListAdditionCandidates: jest
      .fn()
      .mockResolvedValue(results.candidates),
    approveCampaignCreatorListAdditions: jest
      .fn()
      .mockResolvedValue(results.snapshot),
  };
  const service = new MyahCreatorOpsToolWorkspaceService(
    campaignInfluencerService as never,
  );

  return { service, campaignInfluencerService, results };
};

describe('MyahCreatorOpsToolWorkspaceService', () => {
  it('builds the exact Creator Ops tool set', () => {
    const { service } = createService();

    const tools = service.generateMyahCreatorOpsTools({
      authContext: authContext as never,
    });

    expect(Object.keys(tools).sort()).toEqual(expectedToolNames);
  });

  it.each([
    [
      'add_creators_to_creator_list',
      { creatorListId, creatorIds: [creatorId] },
      'creatorIds',
    ],
    [
      'add_direct_campaign_creators',
      { campaignId, creatorIds: [creatorId] },
      'creatorIds',
    ],
    [
      'attach_creator_lists_to_campaign',
      { campaignId, creatorListIds: [creatorListId] },
      'creatorListIds',
    ],
    [
      'approve_campaign_creator_list_additions',
      { campaignId, creatorListId, creatorIds: [creatorId] },
      'creatorIds',
    ],
  ])('accepts one through 500 UUIDs for %s', (toolName, input, bulkField) => {
    const { service } = createService();
    const tools = service.generateMyahCreatorOpsTools({
      authContext: authContext as never,
    }) as unknown as CreatorOpsTools;
    const tool = tools[toolName];
    const fiveHundredIds = Array.from(
      { length: 500 },
      (_, index) =>
        `20202020-${String(index).padStart(4, '0')}-4${String(index).padStart(3, '0')}-8${String(index).padStart(3, '0')}-${String(index).padStart(12, '0')}`,
    );

    expect(tool.inputSchema.safeParse(input).success).toBe(true);
    expect(
      tool.inputSchema.safeParse({ ...input, [bulkField]: fiveHundredIds })
        .success,
    ).toBe(true);
    expect(
      tool.inputSchema.safeParse({ ...input, [bulkField]: [] }).success,
    ).toBe(false);
    expect(
      tool.inputSchema.safeParse({
        ...input,
        [bulkField]: [...fiveHundredIds, creatorId],
      }).success,
    ).toBe(false);
    expect(
      tool.inputSchema.safeParse({ ...input, [bulkField]: ['not-a-uuid'] })
        .success,
    ).toBe(false);
  });

  it('accepts only the specified fields for destructive relationship removals', () => {
    const { service } = createService();
    const tools = service.generateMyahCreatorOpsTools({
      authContext: authContext as never,
    }) as unknown as CreatorOpsTools;

    expect(
      tools.remove_creator_from_creator_list.inputSchema.safeParse({
        creatorListId,
        creatorId,
      }).success,
    ).toBe(true);
    expect(
      tools.remove_creator_from_creator_list.inputSchema.safeParse({
        creatorListId,
        creatorId,
        confirmationToken: 'must-not-exist',
      }).success,
    ).toBe(false);
    expect(
      tools.detach_creator_list_from_campaign.inputSchema.safeParse({
        campaignId,
        creatorListId,
      }).success,
    ).toBe(true);
    expect(
      tools.detach_creator_list_from_campaign.inputSchema.safeParse({
        campaignId,
        creatorListId,
        confirmedCreatorIds: [creatorId],
      }).success,
    ).toBe(false);
  });

  it('does not expose a separate confirmation protocol', () => {
    const { service } = createService();
    const tools = service.generateMyahCreatorOpsTools({
      authContext: authContext as never,
    }) as unknown as CreatorOpsTools;
    const validInputs: Record<string, Record<string, unknown>> = {
      add_creators_to_creator_list: { creatorListId, creatorIds: [creatorId] },
      remove_creator_from_creator_list: { creatorListId, creatorId },
      get_campaign_audience: { campaignId },
      add_direct_campaign_creators: { campaignId, creatorIds: [creatorId] },
      attach_creator_lists_to_campaign: {
        campaignId,
        creatorListIds: [creatorListId],
      },
      detach_creator_list_from_campaign: { campaignId, creatorListId },
      get_campaign_creator_list_addition_candidates: {
        campaignId,
        creatorListId,
      },
      approve_campaign_creator_list_additions: {
        campaignId,
        creatorListId,
        creatorIds: [creatorId],
      },
    };

    for (const [toolName, input] of Object.entries(validInputs)) {
      expect(
        tools[toolName].inputSchema.safeParse({
          ...input,
          confirmationToken: 'not-supported',
        }).success,
      ).toBe(false);
      expect(
        tools[toolName].inputSchema.safeParse({
          ...input,
          confirmedCreatorIds: [creatorId],
        }).success,
      ).toBe(false);
    }
  });

  it('delegates each tool with the initiating user context and preserves service results', async () => {
    const { service, campaignInfluencerService, results } = createService();
    const tools = service.generateMyahCreatorOpsTools({
      authContext: authContext as never,
    }) as unknown as CreatorOpsTools;
    const cases = [
      [
        'add_creators_to_creator_list',
        { creatorListId, creatorIds: [creatorId, anotherCreatorId] },
        'addCreatorListMembersIntent',
        results.members,
      ],
      [
        'remove_creator_from_creator_list',
        { creatorListId, creatorId },
        'removeCreatorListMemberIntent',
        results.removed,
      ],
      ['get_campaign_audience', { campaignId }, 'snapshot', results.snapshot],
      [
        'add_direct_campaign_creators',
        {
          campaignId,
          creatorIds: [creatorId],
          assignedManagedMailboxId: managedMailboxId,
        },
        'addDirectCampaignCreators',
        results.snapshot,
      ],
      [
        'attach_creator_lists_to_campaign',
        { campaignId, creatorListIds: [creatorListId] },
        'attachCampaignCreatorLists',
        results.snapshot,
      ],
      [
        'detach_creator_list_from_campaign',
        { campaignId, creatorListId },
        'detachCampaignCreatorList',
        results.snapshot,
      ],
      [
        'get_campaign_creator_list_addition_candidates',
        { campaignId, creatorListId },
        'campaignCreatorListAdditionCandidates',
        results.candidates,
      ],
      [
        'approve_campaign_creator_list_additions',
        { campaignId, creatorListId, creatorIds: [creatorId] },
        'approveCampaignCreatorListAdditions',
        results.snapshot,
      ],
    ] as const;

    for (const [toolName, input, methodName, expectedResult] of cases) {
      const result = await tools[toolName].execute(input);

      const expectedInput =
        methodName === 'snapshot' ? input.campaignId : input;
      expect(campaignInfluencerService[methodName]).toHaveBeenCalledWith(
        expectedInput,
        authContext,
      );
      expect(result).toBe(expectedResult);
    }
  });
});

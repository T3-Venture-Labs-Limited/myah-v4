import {
  CampaignInstagramStepService,
  campaignInstagramDraftId,
  renderCampaignInstagramText,
} from 'src/modules/campaign-execution/services/campaign-instagram-step.service';

const WORKSPACE = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const CAMPAIGN = '42f7a72a-25d8-48eb-bd99-3f681509b7ae';
const OCCURRENCE = '0f8d5d7a-5c1e-4b8b-9c67-0b6a1e1d2a11';
const CREATOR = '6a1f2f0c-7a4d-4a43-9a8f-0f1f2a3b4c5d';

const makeService = (options: {
  text?: string;
  prepared?: Record<string, unknown>;
  send?: jest.Mock;
  accountId?: string | null;
}) => {
  const reconciled: Array<Record<string, unknown>> = [];
  const manager = {
    queryRunner: {
      query: jest.fn(async () => [
        {
          state: 'IN_FLIGHT',
          messageId: 'm1',
          workflowVersionId: 'v1',
          creatorId: CREATOR,
          binding: {
            request: {
              preparedProof: {
                initiatingUserWorkspaceId: 'uw-1',
                initiatingWorkspaceMemberId: 'wm-1',
              },
            },
          },
        },
      ]),
    },
  };
  const dataSource = {
    transaction: async (run: (m: typeof manager) => unknown) => run(manager),
  };
  const orm = {
    getGlobalWorkspaceDataSource: async () => dataSource,
    getRepository: async () => ({
      findOne: async () => ({ id: CREATOR, name: 'Ava', email: 'ava@x.co' }),
    }),
  };
  const progression = {
    reconcileInstagramOccurrenceInTransaction: jest.fn(async (input) => {
      reconciled.push(input);
      return 'CHANGED';
    }),
  };
  const send =
    options.send ??
    jest.fn(async () => ({ status: 'SENT', receiptId: 'receipt-1' }));
  const service = new CampaignInstagramStepService(
    orm as never,
    progression as never,
    {
      loadInstagramTextByVersionInTransaction: async () =>
        options.text ?? 'Hi {{creator.name}}!',
    } as never,
    {
      getCampaignSettingRecord: async () => ({
        instagramAccountId:
          options.accountId === undefined ? 'ig-1' : options.accountId,
      }),
    } as never,
    {
      prepare: jest.fn(
        async () =>
          options.prepared ?? {
            status: 'READY',
            sender: { accountRecordId: 'ig-1' },
            preparationFingerprint: 'fp',
          },
      ),
    } as never,
    { send, getAttempt: jest.fn(async () => null) } as never,
  );
  return { service, reconciled, send };
};

describe('CampaignInstagramStepService', () => {
  it('sends the rendered step once per occurrence and succeeds it', async () => {
    const { service, reconciled, send } = makeService({});
    await service.dispatch(WORKSPACE, CAMPAIGN, OCCURRENCE);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Hi Ava!',
        draftId: campaignInstagramDraftId(OCCURRENCE),
        recipient: { creatorRecordId: CREATOR },
      }),
      expect.objectContaining({
        initiatorUserWorkspaceId: 'uw-1',
        workspaceMemberId: 'wm-1',
      }),
    );
    expect(reconciled).toEqual([
      expect.objectContaining({ outcome: 'ACCEPTED', receiptId: 'receipt-1' }),
    ]);
  });

  it('holds a step longer than the Instagram limit without sending or truncating', async () => {
    const { service, reconciled, send } = makeService({
      text: 'x'.repeat(1001),
    });
    await service.dispatch(WORKSPACE, CAMPAIGN, OCCURRENCE);
    expect(send).not.toHaveBeenCalled();
    expect(reconciled).toEqual([
      expect.objectContaining({
        outcome: 'HOLD',
        holdReason: 'MATERIAL_STALE',
      }),
    ]);
  });

  it('waits when the cold-message limit blocks the send', async () => {
    const nextEligibleAt = new Date('2026-10-04T10:00:00Z');
    const { service, reconciled } = makeService({
      send: jest.fn(async () => ({
        status: 'BLOCKED',
        receiptId: 'r',
        nextEligibleAt,
      })),
    });
    await service.dispatch(WORKSPACE, CAMPAIGN, OCCURRENCE);
    expect(reconciled).toEqual([
      expect.objectContaining({ outcome: 'LIMITED', nextEligibleAt }),
    ]);
  });

  it('records an unknown outcome and never resends it', async () => {
    const { service, reconciled } = makeService({
      send: jest.fn(async () => ({ status: 'UNKNOWN', receiptId: 'r2' })),
    });
    await service.dispatch(WORKSPACE, CAMPAIGN, OCCURRENCE);
    expect(reconciled).toEqual([
      expect.objectContaining({ outcome: 'UNKNOWN', receiptId: 'r2' }),
    ]);
  });

  it('holds when the composer account is not the Campaign Instagram account', async () => {
    const { service, reconciled, send } = makeService({ accountId: 'ig-2' });
    await service.dispatch(WORKSPACE, CAMPAIGN, OCCURRENCE);
    expect(send).not.toHaveBeenCalled();
    expect(reconciled).toEqual([
      expect.objectContaining({ holdReason: 'SENDER_NOT_READY' }),
    ]);
  });

  it('renders only supported creator variables', () => {
    expect(
      renderCampaignInstagramText(
        'Hey {{ creator.name }} ({{creator.email}})',
        {
          name: null,
          email: 'a@b.co',
        },
      ),
    ).toBe('Hey there (a@b.co)');
  });
});

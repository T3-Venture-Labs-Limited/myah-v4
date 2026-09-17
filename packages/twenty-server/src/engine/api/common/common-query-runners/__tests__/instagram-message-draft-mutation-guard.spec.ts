import {
  CommonBaseQueryRunnerService,
  isProtectedInstagramDraftMutation,
  isProtectedMyahInboxReplyDraftMutation,
} from 'src/engine/api/common/common-query-runners/common-base-query-runner.service';
import { type ObjectRecord } from 'twenty-shared/types';

import {
  type CommonInput,
  CommonQueryNames,
  type UpdateOneQueryArgs,
} from 'src/engine/api/common/types/common-query-args.type';

class ProcessedPayloadRunner extends CommonBaseQueryRunnerService<
  UpdateOneQueryArgs,
  ObjectRecord
> {
  protected readonly operationName: CommonQueryNames;

  constructor(
    operationName = CommonQueryNames.UPDATE_ONE,
    private readonly processedData: unknown = {
      nested: { myahReplyDraftRevision: 3 },
    },
  ) {
    super();
    this.operationName = operationName;
  }

  protected async run(): Promise<ObjectRecord> {
    return { id: 'processed-payload-runner' };
  }

  protected async validate(): Promise<void> {}

  protected async computeArgs(
    args: CommonInput<UpdateOneQueryArgs>,
  ): Promise<CommonInput<UpdateOneQueryArgs>> {
    return {
      ...args,
      data: this.processedData,
    } as CommonInput<UpdateOneQueryArgs>;
  }

  protected async processQueryResult(
    queryResult: ObjectRecord,
  ): Promise<ObjectRecord> {
    return queryResult;
  }
}

const messageThreadContext = {
  authContext: { type: 'system', workspace: { id: 'workspace-a' } },
  flatObjectMetadata: {
    id: 'message-thread-object-id',
    nameSingular: 'messageThread',
    universalIdentifier: '20202020-849a-4c3e-84f5-a25a7d802271',
    isSystem: false,
    fieldIds: ['myah-reply-draft-revision-field-id'],
  },
  flatObjectMetadataMaps: {
    byUniversalIdentifier: {},
    universalIdentifierById: {},
    universalIdentifiersByApplicationId: {},
  },
  flatFieldMetadataMaps: {
    byUniversalIdentifier: {
      'myah-reply-draft-revision-field': {
        id: 'myah-reply-draft-revision-field-id',
        name: 'myahReplyDraftRevision',
        type: 'NUMBER',
      },
    },
    universalIdentifierById: {
      'myah-reply-draft-revision-field-id': 'myah-reply-draft-revision-field',
    },
    universalIdentifiersByApplicationId: {},
  },
} as never;

const buildProcessedPayloadRunner = (
  inTransaction: boolean,
  universalIdentifier = '20202020-849a-4c3e-84f5-a25a7d802271',
  operationName = CommonQueryNames.UPDATE_ONE,
  processedData: unknown = { nested: { myahReplyDraftRevision: 3 } },
) => {
  const runner = new ProcessedPayloadRunner(operationName, processedData);
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager: {},
  };
  Object.assign(runner, {
    workspaceQueryHookService: {
      shouldRunPreQueryHooksInTransaction: () => inTransaction,
      executeRawInputPreQueryHooks: jest.fn(),
      executePreQueryHooks: jest.fn(
        async (
          _auth: unknown,
          _object: unknown,
          _operation: unknown,
          args: unknown,
        ) => args,
      ),
      executePostQueryHooks: jest.fn(),
    },
    globalWorkspaceOrmManager: {
      executeInWorkspaceContext: async (callback: () => unknown) => callback(),
      getGlobalWorkspaceDataSource: async () => ({
        createQueryRunner: () => queryRunner,
      }),
    },
    twentyConfigService: { get: () => 100 },
  });
  (
    messageThreadContext as {
      flatObjectMetadata: { universalIdentifier: string };
    }
  ).flatObjectMetadata.universalIdentifier = universalIdentifier;
  return runner;
};

const processedPayloadArgs = {
  id: '10000000-0000-4000-8000-000000000001',
  data: { subject: 'allowed' },
  selectedFields: {},
} as CommonInput<UpdateOneQueryArgs>;

const draftObjectUniversalIdentifier = '85762d24-541b-407f-9d6a-cdf89552c665';

describe('isProtectedInstagramDraftMutation', () => {
  it.each([
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
  ])(
    'blocks generated %s mutations for the authority draft object',
    (operation) => {
      expect(
        isProtectedInstagramDraftMutation(
          operation,
          draftObjectUniversalIdentifier,
        ),
      ).toBe(true);
    },
  );

  it.each([
    CommonQueryNames.FIND_ONE,
    CommonQueryNames.FIND_MANY,
    CommonQueryNames.FIND_DUPLICATES,
    CommonQueryNames.GROUP_BY,
  ])('preserves generated %s reads for historical evidence', (operation) => {
    expect(
      isProtectedInstagramDraftMutation(
        operation,
        draftObjectUniversalIdentifier,
      ),
    ).toBe(false);
  });

  it('does not affect mutations for unrelated objects', () => {
    expect(
      isProtectedInstagramDraftMutation(
        CommonQueryNames.UPDATE_ONE,
        '00000000-0000-4000-8000-000000000001',
      ),
    ).toBe(false);
  });

  it.each([
    { data: { myahReplyDraftBodyMarkdown: 'protected' } },
    { data: { nested: { myahReplyDraftRevision: 3 } } },
    { data: [{ nested: { myahReplyDraftBodyBlocknote: '[]' } }] },
    { data: { relation: { myahReplyDraftBody: { markdown: 'protected' } } } },
  ])('blocks nested legacy Email draft fields', (args) => {
    expect(
      isProtectedMyahInboxReplyDraftMutation(
        CommonQueryNames.UPDATE_MANY,
        '20202020-849a-4c3e-84f5-a25a7d802271',
        args,
      ),
    ).toBe(true);
  });

  it('allows unrelated MessageThread fields', () => {
    expect(
      isProtectedMyahInboxReplyDraftMutation(
        CommonQueryNames.UPDATE_ONE,
        '20202020-849a-4c3e-84f5-a25a7d802271',
        { data: { subject: 'allowed', nested: { inboxState: 'OPEN' } } },
      ),
    ).toBe(false);
  });

  it.each([false, true])(
    'blocks generated Instagram object writes through the %s transaction-envelope branch',
    async (inTransaction) => {
      const runner = buildProcessedPayloadRunner(
        inTransaction,
        draftObjectUniversalIdentifier,
      );

      await expect(
        runner.execute(processedPayloadArgs, messageThreadContext),
      ).rejects.toThrow(
        'Instagram message drafts are writable only through the revision-protected service',
      );
    },
  );

  it.each([false, true])(
    'blocks processed nested Email data through the %s transaction-envelope branch',
    async (inTransaction) => {
      const runner = buildProcessedPayloadRunner(inTransaction);

      await expect(
        runner.execute(processedPayloadArgs, messageThreadContext),
      ).rejects.toThrow(
        'Myah Inbox reply drafts are writable only through the revision-protected service',
      );
    },
  );

  it.each([false, true])(
    'blocks direct, batch, and processed nested Email writes before run through the %s transaction-envelope branch',
    async (inTransaction) => {
      const cases = [
        {
          name: 'direct',
          operationName: CommonQueryNames.UPDATE_ONE,
          args: {
            ...processedPayloadArgs,
            data: { myahReplyDraftBodyMarkdown: 'protected' },
          },
          processedData: { subject: 'allowed' },
        },
        {
          name: 'batch',
          operationName: CommonQueryNames.CREATE_MANY,
          args: {
            ...processedPayloadArgs,
            data: [{ myahReplyDraftRevision: 3 }],
          },
          processedData: { subject: 'allowed' },
        },
        {
          name: 'processed nested',
          operationName: CommonQueryNames.UPDATE_MANY,
          args: processedPayloadArgs,
          processedData: {
            relation: { data: { myahReplyDraftBodyBlocknote: '[]' } },
          },
        },
      ];

      for (const testCase of cases) {
        const runner = buildProcessedPayloadRunner(
          inTransaction,
          undefined,
          testCase.operationName,
          testCase.processedData,
        );
        const run = jest.spyOn(
          runner as unknown as { run: () => Promise<ObjectRecord> },
          'run',
        );

        await expect(
          runner.execute(
            testCase.args as CommonInput<UpdateOneQueryArgs>,
            messageThreadContext,
          ),
        ).rejects.toThrow(
          'Myah Inbox reply drafts are writable only through the revision-protected service',
        );
        expect(run).not.toHaveBeenCalled();
      }
    },
  );

  it.each([false, true])(
    'allows unrelated MessageThread updates that select/filter protected fields through the %s transaction-envelope branch',
    async (inTransaction) => {
      const runner = buildProcessedPayloadRunner(inTransaction);
      const unrelatedArgs = {
        ...processedPayloadArgs,
        selectedFields: { myahReplyDraftRevision: true },
        filter: { myahReplyDraftBodyMarkdown: { eq: 'historical' } },
      } as CommonInput<UpdateOneQueryArgs>;
      const run = jest.spyOn(
        runner as unknown as { run: () => Promise<ObjectRecord> },
        'run',
      );
      jest
        .spyOn(
          runner as unknown as {
            computeArgs: () => Promise<CommonInput<UpdateOneQueryArgs>>;
          },
          'computeArgs',
        )
        .mockResolvedValue(unrelatedArgs);
      jest
        .spyOn(
          runner as unknown as {
            prepareExtendedQueryRunnerContextWithGlobalDatasource: () => Promise<unknown>;
          },
          'prepareExtendedQueryRunnerContextWithGlobalDatasource',
        )
        .mockResolvedValue({});

      await expect(
        runner.execute(unrelatedArgs, messageThreadContext),
      ).resolves.toMatchObject({
        results: { id: 'processed-payload-runner' },
      });
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it('does not treat selected fields or filters as mutation data', () => {
    expect(
      isProtectedMyahInboxReplyDraftMutation(
        CommonQueryNames.UPDATE_ONE,
        '20202020-849a-4c3e-84f5-a25a7d802271',
        {
          data: { subject: 'allowed' },
          selectedFields: { myahReplyDraftRevision: true },
          filter: { myahReplyDraftBodyMarkdown: { eq: 'historical' } },
        },
      ),
    ).toBe(false);
  });

  it('checks processed nested batch data rather than unrelated envelopes', () => {
    expect(
      isProtectedMyahInboxReplyDraftMutation(
        CommonQueryNames.UPDATE_MANY,
        '20202020-849a-4c3e-84f5-a25a7d802271',
        {
          data: [{ relation: { data: { myahReplyDraftRevision: 3 } } }],
          selectedFields: { subject: true },
          filter: { id: { eq: 'allowed' } },
        },
      ),
    ).toBe(true);
  });
});

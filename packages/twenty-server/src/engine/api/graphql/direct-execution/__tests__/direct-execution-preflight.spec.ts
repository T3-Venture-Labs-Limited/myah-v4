import { getIntrospectionQuery, parse } from 'graphql';

import { DirectExecutionService } from 'src/engine/api/graphql/direct-execution/direct-execution.service';
import { useDirectExecution } from 'src/engine/api/graphql/direct-execution/hooks/use-direct-execution.hook';
import { extractArgumentsFromAst } from 'src/engine/api/graphql/direct-execution/utils/extract-arguments-from-ast.util';
import { validateWorkspaceOperation } from 'src/engine/api/graphql/direct-execution/utils/validate-workspace-operation.util';

const sdl = `
  scalar Date
  scalar UUID
  scalar JSON
  type Query { creators(first: Int, filter: CreatorFilter, orderBy: CreatorOrder, date: Date, uuid: UUID, json: JSON, tags: [String!]): CreatorConnection, socialProfiles: SocialProfileConnection, notes: NoteConnection }
  type Mutation { updateCreator: Creator, updateOtherCreator: Creator }
  type CreatorConnection { edges: [CreatorEdge!]!, pageInfo: PageInfo! }
  type CreatorEdge { node: Creator! }
  type SocialProfileConnection { edges: [SocialProfileEdge!]! }
  type SocialProfileEdge { node: SocialProfile! }
  type NoteConnection { edges: [NoteEdge!]! }
  type NoteEdge { node: Note! }
  type Creator { id: ID!, socialProfiles: SocialProfileConnection }
  type SocialProfile { id: ID!, username: String }
  type Note { id: ID! }
  type PageInfo { hasNextPage: Boolean! }
  input CreatorFilter { id: IDFilter }
  input CreatorOrder { id: String }
  input IDFilter { eq: ID }
`;

const createService = () => {
  const write = jest.fn().mockResolvedValue({ id: 'creator-1' });
  const dispatch = jest.fn().mockResolvedValue({
    graphQLResolverNameMap: {
      updateCreator: {
        method: 'updateOne',
        objectMetadataUniversalIdentifier: 'creator-id',
      },
      updateOtherCreator: {
        method: 'updateOne',
        objectMetadataUniversalIdentifier: 'creator-id',
      },
      creators: {
        method: 'findMany',
        objectMetadataUniversalIdentifier: 'creator-id',
      },
    },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        'creator-id': {
          id: 'creator-id',
          nameSingular: 'creator',
          namePlural: 'creators',
        },
      },
    },
    flatFieldMetadataMaps: { byUniversalIdentifier: {} },
  });
  const getOrComputeSchemaSDL = jest.fn().mockResolvedValue({
    sdl,
    usedScalarNames: [],
  });
  const service = Object.assign(
    Object.create(DirectExecutionService.prototype),
    {
      workspaceGraphqlSchemaSDLService: { getOrComputeSchemaSDL },
      workspaceCacheService: { getOrRecompute: dispatch },
      twentyConfigService: { get: () => 20 },
      factoryMap: new Map([
        ['updateOne', { create: () => write }],
        [
          'findMany',
          {
            create: () =>
              jest.fn().mockResolvedValue({
                edges: [],
                pageInfo: { hasNextPage: false },
              }),
          },
        ],
      ]),
      argsAssertionMap: new Map([
        ['updateOne', () => undefined],
        ['findMany', () => undefined],
      ]),
    },
  ) as DirectExecutionService;
  const request = {
    workspace: { id: 'workspace-a', databaseSchema: 'workspace_a' },
    body: { operationName: 'Retired', variables: {} },
  };

  return { service, request, dispatch, write, getOrComputeSchemaSDL };
};

describe('direct execution workspace preflight', () => {
  it('rejects an unsupported nested Creator field before any root dispatch even with zero rows', async () => {
    const { service, request, dispatch } = createService();
    const document = parse(
      `query Retired { creators(first: 1) { edges { node { id instagramUsername } } pageInfo { hasNextPage } } }`,
    );

    const result = await service.execute(
      request as never,
      document,
      false,
      true,
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(result?.errors).toEqual([
      expect.objectContaining({
        extensions: expect.objectContaining({
          code: 'GRAPHQL_VALIDATION_FAILED',
        }),
      }),
    ]);
    expect(result).not.toHaveProperty('data');
  });

  it.each([
    {
      directive: '@include(if: $show)',
      show: true,
      expected: { id: 'creator-1' },
    },
    { directive: '@include(if: $show)', show: false, expected: {} },
    {
      directive: '@skip(if: $show)',
      show: false,
      expected: { id: 'creator-1' },
    },
  ])(
    'returns one successful mutation after checked variable directive $directive ($show)',
    async ({ directive, show, expected }) => {
      const { service, request, write } = createService();
      request.body.variables = { show };
      const result = await service.execute(
        request as never,
        parse(
          `mutation Retired($show: Boolean!) { updateCreator { id ${directive} } }`,
        ),
        false,
        true,
      );
      expect(write).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ data: { updateCreator: expected } });
    },
  );

  it('rejects an invalid mutation response projection before either root can write', async () => {
    const { service, request, write, dispatch } = createService();
    const result = await service.execute(
      request as never,
      parse(
        'mutation Retired { updateCreator { id } updateOtherCreator { instagramUsername } }',
      ),
      false,
      true,
    );
    expect(write).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(result?.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
    expect(result).not.toHaveProperty('data');
  });

  it('routes transitive root fragments to workspace preflight, then returns valid empty rows', async () => {
    const { service, request, write, getOrComputeSchemaSDL } = createService();
    const endResponse = jest.fn();
    const query =
      'query Retired { ...A } fragment A on Query { ...B } fragment B on Query { creators { edges { node { id } } pageInfo { hasNextPage } } }';
    const plugin = useDirectExecution({
      directExecutionService: service,
      featureFlagService: {} as never,
    });
    await plugin.onRequest?.({
      serverContext: { req: { ...request, body: { ...request.body, query } } },
      endResponse,
    } as never);
    expect(getOrComputeSchemaSDL).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(endResponse).toHaveBeenCalledTimes(1);
    expect(await (endResponse.mock.calls[0][0] as Response).json()).toEqual({
      data: { creators: { edges: [], pageInfo: { hasNextPage: false } } },
    });
  });

  it('denies transitive mixed core/workspace roots before any write', async () => {
    const { service, request, write } = createService();
    const endResponse = jest.fn();
    const query =
      'query Retired { ...A } fragment A on Query { ...B } fragment B on Query { creators { edges { node { id } } } coreOnly }';
    const plugin = useDirectExecution({
      directExecutionService: service,
      featureFlagService: {} as never,
    });
    await plugin.onRequest?.({
      serverContext: { req: { ...request, body: { ...request.body, query } } },
      endResponse,
    } as never);
    expect(write).not.toHaveBeenCalled();
    expect(endResponse).toHaveBeenCalledTimes(1);
    expect(await (endResponse.mock.calls[0][0] as Response).json()).toEqual({
      errors: [
        expect.objectContaining({ message: expect.stringContaining('split') }),
      ],
    });
  });

  it('preflights a transitive retired field without any resolver execution', async () => {
    const { service, request, write, getOrComputeSchemaSDL } = createService();
    const endResponse = jest.fn();
    const query =
      'query Retired { ...A } fragment A on Query { ...B } fragment B on Query { creators { edges { node { id instagramUsername } } } }';
    const plugin = useDirectExecution({
      directExecutionService: service,
      featureFlagService: {} as never,
    });
    await plugin.onRequest?.({
      serverContext: { req: { ...request, body: { ...request.body, query } } },
      endResponse,
    } as never);
    expect(getOrComputeSchemaSDL).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(await (endResponse.mock.calls[0][0] as Response).json()).toEqual({
      errors: [
        expect.objectContaining({
          extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
        }),
      ],
    });
  });

  it('keeps an actual empty connection successful for a valid Creator projection', async () => {
    const { service, request, write } = createService();
    const result = await service.execute(
      request as never,
      parse(
        'query Retired { creators { edges { node { id } } pageInfo { hasNextPage } } }',
      ),
      false,
      true,
    );
    expect(write).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: { creators: { edges: [], pageInfo: { hasNextPage: false } } },
    });
  });

  const runMutationThroughHook = async (
    query: string,
    variables: Record<string, unknown> = {},
  ) => {
    const { service, request, write, dispatch, getOrComputeSchemaSDL } =
      createService();
    const endResponse = jest.fn();
    const plugin = useDirectExecution({
      directExecutionService: service,
      featureFlagService: {} as never,
    });
    await plugin.onRequest?.({
      serverContext: {
        req: { ...request, body: { ...request.body, query, variables } },
      },
      endResponse,
    } as never);
    const response = endResponse.mock.calls[0]?.[0] as Response | undefined;
    return {
      result: response ? await response.json() : undefined,
      write,
      dispatch,
      getOrComputeSchemaSDL,
    };
  };

  it.each([
    [
      'direct',
      'mutation Retired($run: Boolean!) { updateCreator @include(if: $run) { id } }',
      { run: false },
    ],
    [
      'inline',
      'mutation Retired($run: Boolean!) { ... on Mutation @include(if: $run) { updateCreator { id } } }',
      { run: false },
    ],
    [
      'one-level spread',
      'mutation Retired($run: Boolean!) { ...A @include(if: $run) } fragment A on Mutation { updateCreator { id } }',
      { run: false },
    ],
    [
      'transitive spread',
      'mutation Retired($run: Boolean!) { ...A @include(if: $run) } fragment A on Mutation { ...B } fragment B on Mutation { updateCreator { id } }',
      { run: false },
    ],
    [
      'default false',
      'mutation Retired($run: Boolean = false) { ...A @include(if: $run) } fragment A on Mutation { updateCreator { id } }',
      {},
    ],
    [
      'skip precedence',
      'mutation Retired($run: Boolean!) { updateCreator @skip(if: true) @include(if: $run) { id } }',
      { run: true },
    ],
    [
      'disabled ancestor',
      'mutation Retired($run: Boolean!) { ...A @skip(if: $run) } fragment A on Mutation { ...B @include(if: true) } fragment B on Mutation { updateCreator { id } }',
      { run: true },
    ],
  ] as const)(
    'never writes for disabled %s root',
    async (_label, query, variables) => {
      const { result, write, dispatch, getOrComputeSchemaSDL } =
        await runMutationThroughHook(query, variables);
      expect(result).toEqual({ data: {} });
      expect(write).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1); // Hook resolver ownership only, no execution metadata.
      expect(getOrComputeSchemaSDL).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      'true',
      'mutation Retired($run: Boolean!) { ...A @include(if: $run) } fragment A on Mutation { ...B } fragment B on Mutation { updateCreator { id } }',
      { run: true },
    ],
    [
      'default true',
      'mutation Retired($run: Boolean = true) { ...A @include(if: $run) } fragment A on Mutation { updateCreator { id } }',
      {},
    ],
    [
      'direct skip false',
      'mutation Retired { updateCreator @skip(if: false) { id } }',
      {},
    ],
    [
      'false occurrence first',
      'mutation Retired { ...A @include(if: false) ...A @include(if: true) } fragment A on Mutation { updateCreator { id } }',
      {},
    ],
    [
      'true occurrence first',
      'mutation Retired { ...A @include(if: true) ...A @include(if: false) } fragment A on Mutation { updateCreator { id } }',
      {},
    ],
    [
      'repeated enabled',
      'mutation Retired { ...A ...A } fragment A on Mutation { updateCreator { id } }',
      {},
    ],
    [
      'surviving root alias',
      'mutation Retired { disabled: updateCreator @skip(if: true) { id } enabled: updateCreator { id } }',
      {},
    ],
  ] as const)(
    'writes once for enabled %s root',
    async (label, query, variables) => {
      const { result, write } = await runMutationThroughHook(query, variables);
      expect(write).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        data: {
          [label === 'surviving root alias' ? 'enabled' : 'updateCreator']: {
            id: 'creator-1',
          },
        },
      });
    },
  );

  it('rejects an invalid nullable directive after an earlier valid root before any write', async () => {
    const { result, write, dispatch } = await runMutationThroughHook(
      'mutation Retired($run: Boolean = true) { updateCreator { id } updateOtherCreator @include(if: $run) { id } }',
      { run: null },
    );
    expect(write).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('data');
    expect(result.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
  });

  it('runs only the enabled root and rejects two active aliases before writes', async () => {
    const single = await runMutationThroughHook(
      'mutation Retired { updateCreator @skip(if: true) { id } updateOtherCreator { id } }',
    );
    expect(single.write).toHaveBeenCalledTimes(1);
    expect(single.result).toEqual({
      data: { updateOtherCreator: { id: 'creator-1' } },
    });

    const duplicate = await runMutationThroughHook(
      'mutation Retired { first: updateCreator { id } second: updateCreator { id } }',
    );
    expect(duplicate.write).not.toHaveBeenCalled();
    expect(duplicate.result.errors?.[0]?.message).toContain(
      'Duplicate root resolver',
    );
  });

  it('does not hide an invalid retired projection behind a disabled root', async () => {
    const { result, write } = await runMutationThroughHook(
      'mutation Retired { updateCreator @skip(if: true) { instagramUsername } }',
    );
    expect(write).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('data');
    expect(result.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
  });

  it('rejects missing required directive values and cyclic root fragments before mutation writes', async () => {
    const missing = await runMutationThroughHook(
      'mutation Retired($run: Boolean!) { updateCreator @include(if: $run) { id } }',
    );
    expect(missing.write).not.toHaveBeenCalled();
    expect(missing.result.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
    const cycle = await runMutationThroughHook(
      'mutation Retired { ...A } fragment A on Mutation { ...B } fragment B on Mutation { ...A updateCreator { id } }',
    );
    expect(cycle.write).not.toHaveBeenCalled();
    expect(cycle.result.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
  });

  it('keeps static mixed-root denial even when workspace root is disabled', async () => {
    const { result, write, getOrComputeSchemaSDL } =
      await runMutationThroughHook(
        'mutation Retired { updateCreator @skip(if: true) { id } coreOnly { id } }',
      );
    expect(write).not.toHaveBeenCalled();
    expect(getOrComputeSchemaSDL).not.toHaveBeenCalled();
    expect(result.errors?.[0]?.message).toContain('split');
  });

  it('keeps pure core conditional mutations in Yoga and selects workspace operation beside an unselected core operation', async () => {
    const core = await runMutationThroughHook(
      'mutation Retired($run: Boolean!) { coreOnly @skip(if: $run) { id } }',
      { run: true },
    );
    expect(core.result).toBeUndefined();
    expect(core.write).not.toHaveBeenCalled();
    expect(core.getOrComputeSchemaSDL).not.toHaveBeenCalled();

    const workspace = await runMutationThroughHook(
      'mutation Core { coreOnly { id } } mutation Retired { updateCreator { id } }',
    );
    expect(workspace.write).toHaveBeenCalledTimes(1);
    expect(workspace.result).toEqual({
      data: { updateCreator: { id: 'creator-1' } },
    });
  });

  it('preserves combined workspace introspection and current Creator connection results', async () => {
    const { service, request, write } = createService();
    const result = await service.execute(
      request as never,
      parse(
        'query Retired { __schema { queryType { name } } creators { edges { node { id @include(if: true) } } pageInfo { hasNextPage } } }',
      ),
      true,
      true,
    );
    expect(write).not.toHaveBeenCalled();
    expect(result?.errors).toBeUndefined();
    expect(result?.data?.creators).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false },
    });
    expect(result?.data?.__schema).toEqual({ queryType: { name: 'Query' } });
  });

  const check = (
    query: string,
    variables: Record<string, unknown> = {},
    schema = sdl,
  ) =>
    validateWorkspaceOperation({
      document: parse(query),
      operationName: 'Check',
      variables,
      workspaceId: 'workspace-a',
      sdl: schema,
      usedScalarNames: ['Date', 'UUID', 'JSON'],
    });

  it.each([
    '{ creators(filter: { instagramUsername: { eq: "old" } }) { edges { node { id } } } }',
    '{ creators(orderBy: { instagramUsername: "ASC" }) { edges { node { id } } } }',
    '{ creators { edges { node { socialProfiles { edges { node { instagramUsername } } } } } } }',
    '{ creators { edges { node { ...Old } } } } fragment Old on Creator { instagramUsername }',
  ])('rejects invalid projections/inputs before dispatch: %s', (body) => {
    const result = check(`query Check ${body}`);
    expect(result.errors).toEqual([
      expect.objectContaining({
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('instagramUsername');
  });

  it('rejects a retired input key supplied inside a typed variable, without echoing its value', () => {
    const result = check(
      'query Check($filter: CreatorFilter) { creators(filter: $filter) { edges { node { id } } } }',
      { filter: { instagramUsername: { eq: 'sensitive' } } },
    );
    expect(result.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });

  it('preserves raw and checked dispatch arguments for valid Date/UUID/JSON/list/null inputs; applies defaults', () => {
    const uuid = 'e387885f-62bc-41e5-9b69-4a268803bde1';
    const variables = {
      date: '2026-09-24',
      uuid,
      json: { nested: ['value'] },
      tags: ['one', 'two'],
      filter: null,
    };
    const query =
      'query Check($date: Date, $uuid: UUID, $json: JSON, $tags: [String!], $filter: CreatorFilter, $first: Int = 1) { creators(date: $date, uuid: $uuid, json: $json, tags: $tags, filter: $filter, first: $first) { edges { node { id } } } }';
    const document = parse(query);
    const result = check(query, variables);
    expect(result.errors).toBeUndefined();
    const field = document.definitions[0];
    if (
      field.kind !== 'OperationDefinition' ||
      field.selectionSet.selections[0].kind !== 'Field'
    )
      throw new Error('Invalid test document');
    const args = field.selectionSet.selections[0].arguments;
    expect(extractArgumentsFromAst(args, result.variables)).toEqual({
      ...extractArgumentsFromAst(args, variables),
      first: 1,
    });
    const literal = check(
      `query Check { creators(date: "2026-09-24", uuid: "${uuid}", json: { nested: ["value"] }, tags: ["one", "two"], filter: null, first: 1) { edges { node { id } } } }`,
    );
    expect(literal.errors).toBeUndefined();
    const literalDocument = parse(
      `query Check { creators(date: "2026-09-24", uuid: "${uuid}", json: { nested: ["value"] }, tags: ["one", "two"], filter: null, first: 1) { edges { node { id } } } }`,
    );
    const literalOperation = literalDocument.definitions[0];
    if (
      literalOperation.kind !== 'OperationDefinition' ||
      literalOperation.selectionSet.selections[0].kind !== 'Field'
    )
      throw new Error('Invalid literal test document');
    expect(
      extractArgumentsFromAst(
        literalOperation.selectionSet.selections[0].arguments,
        literal.variables,
      ),
    ).toEqual(extractArgumentsFromAst(args, result.variables));
  });

  it.each([
    'query Check { creators { edges { node { id } } pageInfo { hasNextPage } } }',
    'query Check { socialProfiles { edges { node { id username } } } }',
    'query Check { notes { edges { node { id } } } }',
    'query Check { creators { edges { node { id ... on Creator { socialProfiles { edges { node { id } } } } } } } }',
  ])(
    'accepts valid current Creator/SocialProfile/Note selections: %s',
    (query) => {
      expect(check(query)).toEqual({ variables: {} });
    },
  );

  it('rejects defaulted retired filter, cyclic fragments and oversized variables', () => {
    const invalidDefault = check(
      'query Check($filter: CreatorFilter = { instagramUsername: { eq: "old" } }) { creators(filter: $filter) { edges { node { id } } } }',
    );
    expect(invalidDefault.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
    const cycle = check(
      'query Check { creators { edges { node { ...A } } } } fragment A on Creator { ...B } fragment B on Creator { ...A }',
    );
    expect(cycle.errors?.[0]?.extensions?.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
    expect(
      check('query Check { creators { edges { node { id } } } }', {
        huge: 'x'.repeat(65_000),
      }).errors,
    ).toBeDefined();
  });

  it('accepts workspace introspection without dispatching through the core route', () => {
    const result = validateWorkspaceOperation({
      document: parse(getIntrospectionQuery()),
      variables: {},
      workspaceId: 'workspace-a',
      sdl,
      usedScalarNames: ['Date', 'UUID', 'JSON'],
    });
    expect(result.errors).toBeUndefined();
  });

  it('keeps workspace/application SDL caches separated and replaces changed SDL', () => {
    const query =
      'query Check { creators { edges { node { instagramUsername } } } }';
    expect(check(query).errors).toBeDefined();
    const oldSchema = sdl.replace(
      'type Creator { id: ID!,',
      'type Creator { instagramUsername: String, id: ID!,',
    );
    expect(check(query, {}, oldSchema).errors).toBeUndefined();
    expect(check(query).errors).toBeDefined();
  });
});

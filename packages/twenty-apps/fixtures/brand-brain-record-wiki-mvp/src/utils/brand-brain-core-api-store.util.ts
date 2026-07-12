import {
  type BrandBrainExecutorLinkCreateInput,
  type BrandBrainExecutorLinkRecord,
  type BrandBrainExecutorLinkUpdatePatch,
  type BrandBrainExecutorPageCreateInput,
  type BrandBrainExecutorPageRecord,
  type BrandBrainExecutorPageUpdatePatch,
  type BrandBrainExecutorStore,
} from 'src/utils/brand-brain-agent-executor.util';

type CoreApiClientLike = {
  query: (selection: Record<string, unknown>) => Promise<Record<string, unknown>>;
  mutation: (selection: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type Connection<TNode> = {
  edges: Array<{ node: TNode }>;
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string | null;
  };
};

const PAGE_SELECTION = {
  id: true,
  title: true,
  slug: true,
  canonicalPath: true,
  idPath: true,
  parentPageId: true,
  pageType: true,
  status: true,
  body: { markdown: true, blocknote: true },
  summary: true,
  tags: true,
  sortOrder: true,
  aliases: true,
};

const LINK_SELECTION = {
  id: true,
  name: true,
  sourcePageId: true,
  targetPageId: true,
  linkType: true,
  description: true,
};

const stripUndefined = <TValue extends Record<string, unknown>>(
  value: TValue,
): TValue =>
  Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as TValue;

export const createBrandBrainCoreApiStore = ({
  client,
}: {
  client: CoreApiClientLike;
}): BrandBrainExecutorStore => {
  const listAllConnectionNodes = async <TNode>({
    connectionName,
    selection,
  }: {
    connectionName: 'brandBrainPages' | 'brandBrainLinks';
    selection: Record<string, unknown>;
  }): Promise<TNode[]> => {
    const nodes: TNode[] = [];
    let after: string | null = null;

    do {
      const data = await client.query({
        [connectionName]: {
          __args: { first: 500, after },
          edges: { node: selection },
          pageInfo: { hasNextPage: true, endCursor: true },
        },
      });
      const connection = data[connectionName] as Connection<TNode> | undefined;

      if (!connection) {
        throw new Error(
          `Brand Brain Core API response missing ${connectionName} connection.`,
        );
      }

      nodes.push(...connection.edges.map((edge: { node: TNode }) => edge.node));

      if (connection.pageInfo.hasNextPage && !connection.pageInfo.endCursor) {
        throw new Error(
          `Brand Brain Core API pagination for ${connectionName} reported hasNextPage without endCursor.`,
        );
      }

      after = connection.pageInfo.hasNextPage
        ? (connection.pageInfo.endCursor ?? null)
        : null;
    } while (after);

    return nodes;
  };

  return {
    listPagesByBrandSlug: async () =>
      listAllConnectionNodes<BrandBrainExecutorPageRecord>({
        connectionName: 'brandBrainPages',
        selection: PAGE_SELECTION,
      }),
    createPage: async (
      input: BrandBrainExecutorPageCreateInput,
    ): Promise<BrandBrainExecutorPageRecord> => {
      const data = await client.mutation({
        createBrandBrainPage: {
          __args: { data: stripUndefined({ ...input }) },
          ...PAGE_SELECTION,
        },
      });

      return data.createBrandBrainPage as BrandBrainExecutorPageRecord;
    },
    updatePage: async ({
      id,
      patch,
    }: {
      id: string;
      patch: BrandBrainExecutorPageUpdatePatch;
    }): Promise<BrandBrainExecutorPageRecord> => {
      const data = await client.mutation({
        updateBrandBrainPage: {
          __args: { id, data: stripUndefined({ ...patch }) },
          ...PAGE_SELECTION,
        },
      });

      return data.updateBrandBrainPage as BrandBrainExecutorPageRecord;
    },
    listLinksByBrandSlug: async () =>
      listAllConnectionNodes<BrandBrainExecutorLinkRecord>({
        connectionName: 'brandBrainLinks',
        selection: LINK_SELECTION,
      }),
    createLink: async (
      input: BrandBrainExecutorLinkCreateInput,
    ): Promise<BrandBrainExecutorLinkRecord> => {
      const data = await client.mutation({
        createBrandBrainLink: {
          __args: { data: stripUndefined({ ...input }) },
          ...LINK_SELECTION,
        },
      });

      return data.createBrandBrainLink as BrandBrainExecutorLinkRecord;
    },
    updateLink: async ({
      id,
      patch,
    }: {
      id: string;
      patch: BrandBrainExecutorLinkUpdatePatch;
    }): Promise<BrandBrainExecutorLinkRecord> => {
      const data = await client.mutation({
        updateBrandBrainLink: {
          __args: { id, data: stripUndefined({ ...patch }) },
          ...LINK_SELECTION,
        },
      });

      return data.updateBrandBrainLink as BrandBrainExecutorLinkRecord;
    },
  };
};

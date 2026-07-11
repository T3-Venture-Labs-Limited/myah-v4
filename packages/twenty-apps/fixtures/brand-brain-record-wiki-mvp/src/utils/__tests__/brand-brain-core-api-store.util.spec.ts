import { describe, expect, it, vi } from 'vitest';

import { createBrandBrainCoreApiStore } from 'src/utils/brand-brain-core-api-store.util';

const makeClient = () => ({
  query: vi.fn(),
  mutation: vi.fn(),
});

describe('brand brain core api store', () => {
  it('maps page/link operations through CoreApiClient query and mutation', async () => {
    const client = makeClient();

    client.query
      .mockResolvedValueOnce({ brandBrainPages: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } })
      .mockResolvedValueOnce({ brandBrainLinks: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } });
    client.mutation
      .mockResolvedValueOnce({ createBrandBrainPage: { id: 'page_1', title: 'Root', slug: 'brand', canonicalPath: 'brand', idPath: null, parentPageId: null, pageType: 'BRAND_ROOT', status: 'APPROVED', body: null, summary: 'Root summary', tags: ['brand-profile'], sortOrder: 0, aliases: null } })
      .mockResolvedValueOnce({ updateBrandBrainPage: { id: 'page_1', title: 'Root', slug: 'brand', canonicalPath: 'brand', idPath: 'page_1', parentPageId: null, pageType: 'BRAND_ROOT', status: 'APPROVED', body: null, summary: 'Root summary', tags: ['brand-profile'], sortOrder: 0, aliases: null } })
      .mockResolvedValueOnce({ createBrandBrainLink: { id: 'link_1', name: 'source cites target', sourcePageId: 'source', targetPageId: 'target', linkType: 'CITES', description: 'Source informed target.' } })
      .mockResolvedValueOnce({ updateBrandBrainLink: { id: 'link_1', name: 'source cites target', sourcePageId: 'source', targetPageId: 'target', linkType: 'CITES', description: 'Updated.' } });

    const store = createBrandBrainCoreApiStore({ client });

    await expect(store.listPagesByBrandSlug({ brandSlug: 'brand' })).resolves.toEqual([]);
    await expect(
      store.createPage({
        title: 'Root',
        slug: 'brand',
        canonicalPath: 'brand',
        parentPageId: null,
        pageType: 'BRAND_ROOT',
        status: 'APPROVED',
        summary: 'Root summary',
        tags: ['brand-profile'],
        sortOrder: 0,
      }),
    ).resolves.toMatchObject({ id: 'page_1', canonicalPath: 'brand' });
    await expect(
      store.updatePage({ id: 'page_1', patch: { idPath: 'page_1' } }),
    ).resolves.toMatchObject({ id: 'page_1', idPath: 'page_1' });
    await expect(store.listLinksByBrandSlug({ brandSlug: 'brand' })).resolves.toEqual([]);
    await expect(
      store.createLink({
        name: 'source cites target',
        sourcePageId: 'source',
        targetPageId: 'target',
        linkType: 'CITES',
        description: 'Source informed target.',
      }),
    ).resolves.toMatchObject({ id: 'link_1', linkType: 'CITES' });
    await expect(
      store.updateLink({
        id: 'link_1',
        patch: { name: 'source cites target', description: 'Updated.' },
      }),
    ).resolves.toMatchObject({ id: 'link_1', description: 'Updated.' });

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.mutation).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(client.query.mock.calls)).toContain('brandBrainPages');
    expect(JSON.stringify(client.mutation.mock.calls)).toContain('createBrandBrainPage');
  });

  it('paginates CoreApiClient connections so uniqueness checks see all records', async () => {
    const client = makeClient();

    client.query
      .mockResolvedValueOnce({
        brandBrainPages: {
          edges: [{ node: { id: 'page_1', canonicalPath: 'brand' } }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-page-1' },
        },
      })
      .mockResolvedValueOnce({
        brandBrainPages: {
          edges: [{ node: { id: 'page_2', canonicalPath: 'brand/products' } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      })
      .mockResolvedValueOnce({
        brandBrainLinks: {
          edges: [{ node: { id: 'link_1', sourcePageId: 'source' } }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-link-1' },
        },
      })
      .mockResolvedValueOnce({
        brandBrainLinks: {
          edges: [{ node: { id: 'link_2', sourcePageId: 'source' } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const store = createBrandBrainCoreApiStore({ client });

    await expect(store.listPagesByBrandSlug({ brandSlug: 'brand' })).resolves.toEqual([
      { id: 'page_1', canonicalPath: 'brand' },
      { id: 'page_2', canonicalPath: 'brand/products' },
    ]);
    await expect(store.listLinksByBrandSlug({ brandSlug: 'brand' })).resolves.toEqual([
      { id: 'link_1', sourcePageId: 'source' },
      { id: 'link_2', sourcePageId: 'source' },
    ]);
    expect(
      client.query.mock.calls.map(([selection]) => {
        const connection = selection.brandBrainPages ?? selection.brandBrainLinks;

        return connection.__args.after;
      }),
    ).toEqual([null, 'cursor-page-1', null, 'cursor-link-1']);
  });
});

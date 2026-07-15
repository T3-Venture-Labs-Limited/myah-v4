import {
  type BrandBrainExecutorLinkCreateInput,
  type BrandBrainExecutorLinkRecord,
  type BrandBrainExecutorPageCreateInput,
  type BrandBrainExecutorPageRecord,
  type BrandBrainExecutorPageUpdatePatch,
  type BrandBrainExecutorStore,
  applyBrandBrainSeedPlan,
  markdownToBlockNoteJson,
} from 'src/modules/myah-brand-brain/utils/brand-brain-agent-executor.util';
import { type BrandBrainSeedInput } from 'src/modules/myah-brand-brain/utils/brand-brain-agent-memory.util';

const seedInput: BrandBrainSeedInput = {
  brandName: 'Lashglow',
  websiteUrl: 'lashglow.example?utm_source=test',
  whatItIs: 'DTC lash serum brand',
  primaryOffer: '15% creator affiliate code',
  audience: 'Women 25-40 who want longer lashes without extensions',
  positioning: 'Premium but simple, beauty routine upgrade',
  contentGuidelines: 'Avoid medical claims; avoid saying guaranteed growth.',
  products: [
    { name: 'Lash serum', description: 'Hero lash serum product' },
    { name: 'Brow serum', description: 'Companion brow serum product' },
  ],
  socialChannels: [
    { platform: 'Instagram', value: '@lashglow' },
    { platform: 'TikTok', value: '@lashglow' },
  ],
  sourceNotes: [
    {
      label: 'User-provided fake brand brief',
      sourceType: 'user-provided',
      capturedAt: '2026-07-07T00:00:00.000Z',
      excerpt: 'Fake brand information supplied by Zachary for executor smoke.',
      informedPaths: ['lashglow/products', 'lashglow/content-guidelines'],
      confidence: 'medium',
    },
  ],
  actor: 'agent',
  occurredAt: '2026-07-07',
};

class MockBrandBrainStore implements BrandBrainExecutorStore {
  pages: BrandBrainExecutorPageRecord[];
  links: BrandBrainExecutorLinkRecord[];
  pageCreateCounter = 0;
  linkCreateCounter = 0;
  calls: string[] = [];

  constructor({
    pages = [],
    links = [],
  }: {
    pages?: BrandBrainExecutorPageRecord[];
    links?: BrandBrainExecutorLinkRecord[];
  } = {}) {
    this.pages = [...pages];
    this.links = [...links];
  }

  async listPagesByBrandSlug(): Promise<BrandBrainExecutorPageRecord[]> {
    this.calls.push('listPagesByBrandSlug');

    return [...this.pages];
  }

  async createPage(
    input: BrandBrainExecutorPageCreateInput,
  ): Promise<BrandBrainExecutorPageRecord> {
    this.calls.push(`createPage:${input.canonicalPath}`);
    this.pageCreateCounter += 1;

    const page: BrandBrainExecutorPageRecord = {
      id: `page_${this.pageCreateCounter}`,
      ...input,
    };

    this.pages.push(page);

    return page;
  }

  async updatePage({
    id,
    patch,
  }: {
    id: string;
    patch: BrandBrainExecutorPageUpdatePatch;
  }): Promise<BrandBrainExecutorPageRecord> {
    const pageIndex = this.pages.findIndex((page) => page.id === id);

    if (pageIndex === -1) {
      throw new Error(`Missing page ${id}`);
    }

    this.calls.push(
      `updatePage:${this.pages[pageIndex].canonicalPath}:${Object.keys(patch).join(',')}`,
    );
    this.pages[pageIndex] = { ...this.pages[pageIndex], ...patch };

    return this.pages[pageIndex];
  }

  async listLinksByBrandSlug(): Promise<BrandBrainExecutorLinkRecord[]> {
    this.calls.push('listLinksByBrandSlug');

    return [...this.links];
  }

  async createLink(
    input: BrandBrainExecutorLinkCreateInput,
  ): Promise<BrandBrainExecutorLinkRecord> {
    this.calls.push(
      `createLink:${input.sourcePageId}:${input.targetPageId}:${input.linkType}`,
    );
    this.linkCreateCounter += 1;

    const link = { id: `link_${this.linkCreateCounter}`, ...input };

    this.links.push(link);

    return link;
  }

  async updateLink({
    id,
    patch,
  }: {
    id: string;
    patch: Partial<BrandBrainExecutorLinkCreateInput>;
  }): Promise<BrandBrainExecutorLinkRecord> {
    const linkIndex = this.links.findIndex((link) => link.id === id);

    if (linkIndex === -1) {
      throw new Error(`Missing link ${id}`);
    }

    this.calls.push(`updateLink:${id}:${Object.keys(patch).join(',')}`);
    this.links[linkIndex] = { ...this.links[linkIndex], ...patch };

    return this.links[linkIndex];
  }
}

const page = (
  overrides: Partial<BrandBrainExecutorPageRecord>,
): BrandBrainExecutorPageRecord => ({
  id: 'page_existing',
  title: 'Existing',
  slug: 'existing',
  canonicalPath: 'lashglow/existing',
  parentPageId: null,
  pageType: 'PAGE',
  status: 'DRAFT',
  ...overrides,
});

describe('brand brain agent executor', () => {
  it('converts markdown to valid JSON-stringified BlockNote-ish paragraph blocks', () => {
    const blocknote = markdownToBlockNoteJson(
      '# Heading\n\n- Bullet\nPlain text',
    );
    const parsed = JSON.parse(blocknote);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: '# Heading', styles: {} }],
    });
    expect(JSON.parse(markdownToBlockNoteJson(''))).toEqual([
      { id: 'bb-0-0', type: 'paragraph', props: {}, content: [], children: [] },
    ]);
  });

  it('creates missing pages in parent order, computes idPaths, refreshes Index, appends Log, and creates links', async () => {
    const store = new MockBrandBrainStore();
    const result = await applyBrandBrainSeedPlan({ input: seedInput, store });
    const paths = store.pages.map((createdPage) => createdPage.canonicalPath);

    expect(paths).toEqual([
      'lashglow',
      'lashglow/overview',
      'lashglow/products',
      'lashglow/offer',
      'lashglow/audience',
      'lashglow/positioning',
      'lashglow/social-channels',
      'lashglow/content-guidelines',
      'lashglow/source-notes',
      'lashglow/index',
      'lashglow/log',
    ]);
    expect(paths).not.toContain('lashglow/creators-affiliates');
    expect(store.pages[0]).toMatchObject({
      canonicalPath: 'lashglow',
      idPath: 'page_1',
      parentPageId: null,
    });
    expect(store.pages[1]).toMatchObject({
      canonicalPath: 'lashglow/overview',
      idPath: 'page_1/page_2',
      parentPageId: 'page_1',
    });
    expect(
      store.pages.find(
        (createdPage) => createdPage.canonicalPath === 'lashglow/index',
      )?.body?.markdown,
    ).toContain('[[lashglow/content-guidelines|Content Guidelines]]');
    expect(
      store.pages.find(
        (createdPage) => createdPage.canonicalPath === 'lashglow/log',
      )?.body?.markdown,
    ).toContain('Prepared Lashglow Brand Brain seed plan');
    expect(store.links).toHaveLength(2);
    expect(result.finalPages).toHaveLength(11);
  });

  it('refreshes an outdated existing Index as an explicit body-write exception', async () => {
    const store = new MockBrandBrainStore({
      pages: [
        page({
          id: 'root',
          title: 'Lashglow',
          slug: 'lashglow',
          canonicalPath: 'lashglow',
          pageType: 'BRAND_ROOT',
          status: 'APPROVED',
          idPath: 'root',
        }),
        page({
          id: 'index',
          title: 'Index',
          slug: 'index',
          canonicalPath: 'lashglow/index',
          parentPageId: 'root',
          pageType: 'INDEX',
          status: 'APPROVED',
          idPath: 'root/index',
          body: { markdown: '# Old Index', blocknote: '[]' },
        }),
      ],
    });

    const result = await applyBrandBrainSeedPlan({ input: seedInput, store });
    const indexPage = store.pages.find(
      (candidate) => candidate.canonicalPath === 'lashglow/index',
    );

    expect(indexPage?.body?.markdown).toContain(
      '[[lashglow/content-guidelines|Content Guidelines]]',
    );
    expect(indexPage?.body?.markdown).not.toBe('# Old Index');
    expect(result.appliedOperations).toContainEqual(
      expect.objectContaining({ operation: 'refreshIndex', pageId: 'index' }),
    );
  });

  it('detects duplicate canonical paths before writing', async () => {
    const store = new MockBrandBrainStore({
      pages: [
        page({ id: 'page_a', canonicalPath: 'lashglow/products' }),
        page({ id: 'page_b', canonicalPath: '/Lashglow/Products/' }),
      ],
    });

    await expect(
      applyBrandBrainSeedPlan({ input: seedInput, store }),
    ).rejects.toThrow(
      'Duplicate Brand Brain canonical paths detected: lashglow/products: page_a, page_b',
    );
    expect(store.calls).toEqual(['listPagesByBrandSlug']);
  });

  it('fills missing scalar metadata on existing pages without overwriting curated bodies or statuses', async () => {
    const store = new MockBrandBrainStore({
      pages: [
        page({
          id: 'root',
          title: 'Lashglow',
          slug: 'lashglow',
          canonicalPath: 'lashglow',
          pageType: 'BRAND_ROOT',
          status: 'APPROVED',
          idPath: 'root',
        }),
        page({
          id: 'products',
          title: 'Products',
          slug: 'products',
          canonicalPath: 'lashglow/products',
          parentPageId: null,
          pageType: 'PAGE',
          status: 'STALE',
          body: { markdown: '# Curated products', blocknote: '[]' },
          summary: '',
          tags: [],
        }),
      ],
    });

    await applyBrandBrainSeedPlan({ input: seedInput, store });

    expect(
      store.pages.find((candidate) => candidate.id === 'products'),
    ).toMatchObject({
      body: { markdown: '# Curated products', blocknote: '[]' },
      parentPageId: 'root',
      idPath: 'root/products',
      status: 'STALE',
      summary: 'Products, services, bundles, and catalog notes.',
      tags: ['products'],
      sortOrder: 20,
    });
    expect(
      store.calls.some(
        (call) => call.includes('products') && call.includes('body'),
      ),
    ).toBe(false);
  });

  it('does not append duplicate log entries or create duplicate pages/links on idempotent rerun', async () => {
    const store = new MockBrandBrainStore();

    await applyBrandBrainSeedPlan({ input: seedInput, store });
    const pageCountAfterFirstRun = store.pages.length;
    const linkCountAfterFirstRun = store.links.length;
    const logMarkdownAfterFirstRun = store.pages.find(
      (candidate) => candidate.canonicalPath === 'lashglow/log',
    )?.body?.markdown;
    const result = await applyBrandBrainSeedPlan({ input: seedInput, store });
    const logMarkdownAfterSecondRun = store.pages.find(
      (candidate) => candidate.canonicalPath === 'lashglow/log',
    )?.body?.markdown;

    expect(store.pages).toHaveLength(pageCountAfterFirstRun);
    expect(store.links).toHaveLength(linkCountAfterFirstRun);
    expect(logMarkdownAfterSecondRun).toBe(logMarkdownAfterFirstRun);
    expect(result.appliedOperations).toContainEqual(
      expect.objectContaining({
        operation: 'appendLog',
        skippedDuplicate: true,
      }),
    );
  });

  it('refuses to append Log when markdown is empty but BlockNote has existing content', async () => {
    const existingBlocknoteOnlyLog = JSON.stringify([
      {
        id: 'existing-log-block',
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'text',
            text: 'Existing UI-authored log history',
            styles: {},
          },
        ],
        children: [],
      },
    ]);
    const store = new MockBrandBrainStore({
      pages: [
        page({
          id: 'root',
          title: 'Lashglow',
          slug: 'lashglow',
          canonicalPath: 'lashglow',
          pageType: 'BRAND_ROOT',
          status: 'APPROVED',
          idPath: 'root',
        }),
        page({
          id: 'log',
          title: 'Log',
          slug: 'log',
          canonicalPath: 'lashglow/log',
          parentPageId: 'root',
          pageType: 'LOG',
          status: 'APPROVED',
          idPath: 'root/log',
          body: { markdown: null, blocknote: existingBlocknoteOnlyLog },
        }),
      ],
    });

    await expect(
      applyBrandBrainSeedPlan({ input: seedInput, store }),
    ).rejects.toThrow('markdown is empty but blocknote has content');
    expect(
      store.pages.find((candidate) => candidate.id === 'log')?.body,
    ).toEqual({
      markdown: null,
      blocknote: existingBlocknoteOnlyLog,
    });
  });

  it('skips link upsert when source or target pages are missing after path normalization', async () => {
    const store = new MockBrandBrainStore();
    const result = await applyBrandBrainSeedPlan({
      input: {
        ...seedInput,
        sourceNotes: [
          {
            label: 'Missing target source note',
            sourceType: 'user-provided',
            capturedAt: '2026-07-07T00:00:00.000Z',
            informedPaths: ['lashglow/nonexistent'],
          },
        ],
      },
      store,
    });

    expect(store.links).toHaveLength(0);
    expect(result.skippedOperations).toEqual([
      {
        operation: 'upsertLink',
        reason: 'missing target page',
        sourcePath: 'lashglow/source-notes',
        targetPath: 'lashglow/nonexistent',
      },
    ]);
  });

  it('updates only missing existing link metadata and avoids duplicate link records', async () => {
    const store = new MockBrandBrainStore({
      pages: [
        page({
          id: 'root',
          title: 'Lashglow',
          slug: 'lashglow',
          canonicalPath: 'lashglow',
          pageType: 'BRAND_ROOT',
          status: 'APPROVED',
          idPath: 'root',
        }),
        page({
          id: 'source',
          title: 'Source Notes',
          slug: 'source-notes',
          canonicalPath: 'lashglow/source-notes',
          parentPageId: 'root',
          pageType: 'SOURCE',
          status: 'DRAFT',
          idPath: 'root/source',
        }),
        page({
          id: 'products',
          title: 'Products',
          slug: 'products',
          canonicalPath: 'lashglow/products',
          parentPageId: 'root',
          pageType: 'PAGE',
          status: 'DRAFT',
          idPath: 'root/products',
        }),
      ],
      links: [
        {
          id: 'link_existing',
          name: '',
          sourcePageId: 'source',
          targetPageId: 'products',
          linkType: 'CITES',
          description: null,
        },
      ],
    });

    await applyBrandBrainSeedPlan({ input: seedInput, store });

    expect(store.links).toHaveLength(2);
    expect(
      store.links.find((link) => link.id === 'link_existing'),
    ).toMatchObject({
      name: 'lashglow/source-notes cites lashglow/products',
      description: 'User-provided fake brand brief informed lashglow/products.',
    });
  });
});

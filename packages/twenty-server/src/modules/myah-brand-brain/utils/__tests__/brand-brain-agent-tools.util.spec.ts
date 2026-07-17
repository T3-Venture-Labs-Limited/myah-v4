import {
  type BrandBrainExecutorLinkCreateInput,
  type BrandBrainExecutorLinkRecord,
  type BrandBrainExecutorPageCreateInput,
  type BrandBrainExecutorPageRecord,
  type BrandBrainExecutorPageUpdatePatch,
  type BrandBrainExecutorStore,
  buildRichTextBody,
} from 'src/modules/myah-brand-brain/utils/brand-brain-agent-executor.util';
import {
  BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT,
  getBrandBrainContext,
  searchOrReadBrandBrain,
  seedOrUpdateBrandBrainFromBrief,
  updateBrandBrainPageContent,
} from 'src/modules/myah-brand-brain/utils/brand-brain-agent-tools.util';
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
      excerpt: 'Fake brand information supplied by Zachary for tool smoke.',
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

describe('brand brain agent tools', () => {
  it('seeds or updates Brand Brain from a brief and returns an agent-readable write summary', async () => {
    const store = new MockBrandBrainStore();

    const result = await seedOrUpdateBrandBrainFromBrief({
      input: seedInput,
      store,
    });

    expect(result).toMatchObject({
      brandSlug: 'lashglow',
      pagesCreated: 11,
      pagesFilled: 0,
      linksCreated: 2,
      linksUpdated: 0,
      indexRefreshed: false,
      logAppended: true,
    });
    expect(result.createdPaths).toEqual([
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
    expect(result.changedPaths).toContain('lashglow/content-guidelines');
    expect(result.changedPaths).not.toContain('lashglow/creators-affiliates');
    expect(result.summaryMarkdown).toContain(
      'Brand Brain updated for `lashglow`',
    );
    expect(result.summaryMarkdown).toContain('Pages created: 11');
    expect(result.summaryMarkdown).not.toContain('creators-affiliates');
  });

  it('builds a compact context pack from Brand Brain records without writing', async () => {
    const store = new MockBrandBrainStore();

    await seedOrUpdateBrandBrainFromBrief({ input: seedInput, store });
    store.calls = [];

    const context = await getBrandBrainContext({
      brandNameOrSlug: 'Lashglow',
      task: 'Draft creator outreach brief',
      store,
    });

    expect(store.calls).toEqual([
      'listPagesByBrandSlug',
      'listLinksByBrandSlug',
    ]);
    expect(context).toMatchObject({
      brandSlug: 'lashglow',
      task: 'Draft creator outreach brief',
      pageCount: 11,
      linkCount: 2,
      hasRoot: true,
      hasIndex: true,
      hasLog: true,
    });
    expect(context.missingRecommendedPaths).toEqual([]);
    expect(context.contextMarkdown).toContain(
      '# Brand Brain Context: lashglow',
    );
    expect(context.contextMarkdown).toContain(
      '## Task\nDraft creator outreach brief',
    );
    expect(context.contextMarkdown).toContain('## lashglow/content-guidelines');
    expect(context.contextMarkdown).toContain(
      'Avoid medical claims; avoid saying guaranteed growth.',
    );
    expect(context.contextMarkdown).toContain('## Recent Log');
    expect(context.contextMarkdown).not.toContain('creators-affiliates');
    expect(context.contextMarkdown).not.toContain('(PAGE, DRAFT)');
    expect(context.contextMarkdown).not.toContain(' / draft');
    expect(context.contextMarkdown).not.toContain('## lashglow/index');
    expect(context.pages[1]).not.toHaveProperty('status');
    expect(
      context.pages.find((page) => page.pageType === 'INDEX')?.markdown,
    ).toBeNull();
  });
  it('caps total context across pages, metadata, and links with truncation metadata', async () => {
    const store = new MockBrandBrainStore();

    await seedOrUpdateBrandBrainFromBrief({ input: seedInput, store });
    for (let index = 0; index < 100; index += 1) {
      store.pages.push({
        id: `extra-${index}`,
        slug: `extra-${index}`,
        status: 'DRAFT',
        canonicalPath: `lashglow/extra-${index}`,
        title: `Extra ${index}`,
        pageType: 'PAGE',
        summary: 'summary '.repeat(2000),
        body: buildRichTextBody('body '.repeat(2000)),
      });
    }
    store.links = store.pages.slice(1).map((page, index) => ({
      id: `link-${index}`,
      name: `link-${index}`,
      sourcePageId: store.pages[0].id,
      targetPageId: page.id,
      linkType: 'RELATED',
      description: 'description '.repeat(2000),
    }));

    const context = await getBrandBrainContext({
      brandNameOrSlug: 'Lashglow',
      store,
    });

    expect(context.contextMarkdown.length).toBeLessThanOrEqual(
      BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT,
    );
    expect(context.truncated).toBe(true);
    expect(context.truncatedPageCount).toBeGreaterThan(0);
    expect(context.truncatedLinkCount).toBeGreaterThan(0);
    expect(context.contextMarkdown).toContain('[Truncated');
  });
  it('keeps the complete serialized context result within the explicit cap', async () => {
    const store = new MockBrandBrainStore();
    const oversized = 'x'.repeat(20_000);
    store.pages = Array.from({ length: 8 }, (_, index) => ({
      id: `page-${index}`,
      slug: `page-${index}`,
      status: 'DRAFT' as const,
      canonicalPath: `lashglow/page-${index}`,
      title: oversized,
      pageType: 'PAGE' as const,
      summary: oversized,
      body: buildRichTextBody(oversized),
    }));
    store.links = Array.from({ length: 8 }, (_, index) => ({
      id: `link-${index}`,
      name: `link-${index}`,
      sourcePageId: 'page-0',
      targetPageId: `page-${index}`,
      linkType: 'RELATED',
      description: oversized,
    }));
    const context = await getBrandBrainContext({
      brandNameOrSlug: '\\"'.repeat(128) + 'lashglow',
      task: oversized,
      store,
    });

    expect(JSON.stringify(context).length).toBeLessThanOrEqual(
      BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT,
    );
    expect(context.contextCharacterCount).toBe(context.contextMarkdown.length);
    expect(context.brandSlug).toBe('lashglow');
    expect(context.pages.length).toBeGreaterThan(0);
    expect(context.links.length).toBeGreaterThan(0);
    expect(context.pages[0]).toMatchObject({
      id: 'page-0',
      canonicalPath: 'lashglow/page-0',
      pageType: 'PAGE',
    });
    expect(context.links[0]).toMatchObject({
      id: 'link-0',
      sourcePath: 'lashglow/page-0',
      targetPath: 'lashglow/page-0',
    });
  });

  it('reports truncation when field caps discard content', async () => {
    const store = new MockBrandBrainStore({
      pages: [
        {
          id: 'page-1',
          slug: 'overview',
          status: 'DRAFT',
          canonicalPath: 'lashglow/overview',
          title: 'Title '.repeat(200),
          pageType: 'PAGE',
          summary: 'Summary '.repeat(200),
          body: buildRichTextBody('Body '.repeat(200)),
        },
      ],
      links: [
        {
          id: 'link-1',
          name: 'related',
          sourcePageId: 'page-1',
          targetPageId: 'page-1',
          linkType: 'RELATED',
          description: 'Description '.repeat(200),
        },
      ],
    });

    const context = await getBrandBrainContext({
      brandNameOrSlug: 'Lashglow',
      store,
    });

    expect(context.truncated).toBe(true);
    expect(context.contextMarkdown).toContain('[Truncated]');
  });
  it.each([
    ['title', { title: 'T'.repeat(600) }],
    ['summary', { summary: 'S'.repeat(600) }],
    ['body', { body: buildRichTextBody('B'.repeat(1700)) }],
    ['description', { description: 'D'.repeat(600) }],
    ['task', { task: 'K'.repeat(600) }],
  ] as Array<
    [
      string,
      {
        title?: string;
        summary?: string;
        body?: BrandBrainExecutorPageRecord['body'];
        description?: string;
        task?: string;
      },
    ]
  >)('marks %s-only overflow as truncated', async (_field, values) => {
    const store = new MockBrandBrainStore({
      pages: [
        {
          id: 'page-1',
          slug: 'overview',
          status: 'DRAFT',
          canonicalPath: 'lashglow/overview',
          title: values.title ?? 'Title',
          pageType: 'PAGE',
          summary: values.summary ?? 'Summary',
          body: values.body ?? buildRichTextBody('Body'),
        },
      ],
      links: [
        {
          id: 'link-1',
          name: 'related',
          sourcePageId: 'page-1',
          targetPageId: 'page-1',
          linkType: 'RELATED',
          description: values.description ?? 'Description',
        },
      ],
    });

    const context = await getBrandBrainContext({
      brandNameOrSlug: 'Lashglow',
      task: values.task,
      store,
    });

    expect(context.truncated).toBe(true);
  });

  it('searches exact pages and body sections without relying only on summaries', async () => {
    const store = new MockBrandBrainStore();

    await seedOrUpdateBrandBrainFromBrief({ input: seedInput, store });

    const contentGuidelines = store.pages.find(
      (page) => page.canonicalPath === 'lashglow/content-guidelines',
    );

    expect(contentGuidelines).toBeDefined();

    const longOpening = Array.from(
      { length: 120 },
      (_, index) =>
        `Opening filler line ${index} keeps the important rule outside the compact context cap.`,
    ).join('\n');
    const longSectionMiddle = Array.from(
      { length: 120 },
      (_, index) =>
        `FTC section filler line ${index} still does not include the disclosure marker.`,
    ).join('\n');

    await store.updatePage({
      id: contentGuidelines?.id ?? '',
      patch: {
        summary: 'Messaging, claims, tone, and content constraints for agents.',
        body: buildRichTextBody(
          [
            '# Content Guidelines',
            '',
            '## Opening',
            longOpening,
            '',
            '## FTC disclosure rule',
            'This section starts with the heading that the model is likely to choose.',
            longSectionMiddle,
            'Creators must include #ApiSmokeTest disclosure in every sponsored caption.',
          ].join('\n'),
        ),
      },
    });

    const compactContext = await getBrandBrainContext({
      brandNameOrSlug: 'Lashglow',
      store,
    });

    expect(compactContext.contextMarkdown).toContain('[Truncated]');
    expect(compactContext.contextMarkdown).not.toContain('#ApiSmokeTest');

    const exactRead = await searchOrReadBrandBrain({
      input: {
        brandNameOrSlug: 'Lashglow',
        canonicalPath: 'content-guidelines',
      },
      store,
    });

    expect(exactRead.matches).toHaveLength(1);
    expect(exactRead.matches[0]).toMatchObject({
      canonicalPath: 'lashglow/content-guidelines',
      truncated: true,
    });
    expect(exactRead.matches[0].markdown).toContain('[Truncated]');

    const exactSectionRead = await searchOrReadBrandBrain({
      input: {
        brandNameOrSlug: 'Lashglow',
        canonicalPath: 'content-guidelines',
        sectionHeading: 'FTC disclosure rule',
      },
      store,
    });

    expect(exactSectionRead.matches).toHaveLength(1);
    expect(exactSectionRead.matches[0]).toMatchObject({
      canonicalPath: 'lashglow/content-guidelines',
      sectionHeading: 'FTC disclosure rule',
      truncated: true,
    });
    expect(exactSectionRead.matches[0].markdown).toContain(
      'This section starts with the heading',
    );
    expect(exactSectionRead.matches[0].markdown).toContain(
      '[Truncated middle]',
    );
    expect(exactSectionRead.matches[0].markdown).toContain('#ApiSmokeTest');

    const sectionSearch = await searchOrReadBrandBrain({
      input: {
        brandNameOrSlug: 'Lashglow',
        query: 'ApiSmokeTest',
      },
      store,
    });

    expect(sectionSearch.matches).toHaveLength(1);
    expect(sectionSearch.matches[0]).toMatchObject({
      canonicalPath: 'lashglow/content-guidelines',
      sectionHeading: 'FTC disclosure rule',
    });
    expect(sectionSearch.matches[0].markdown).toContain('#ApiSmokeTest');
    expect(sectionSearch.resultMarkdown).toContain('#ApiSmokeTest');
    expect(sectionSearch.resultMarkdown).not.toContain('status');
  });

  it('applies targeted page-body updates that can be recalled without duplicating the same fact', async () => {
    const store = new MockBrandBrainStore();

    await seedOrUpdateBrandBrainFromBrief({ input: seedInput, store });

    const result = await updateBrandBrainPageContent({
      input: {
        brandNameOrSlug: 'Lashglow',
        canonicalPath: 'content-guidelines',
        appendMarkdown:
          '- Required disclosure: creators must include #ApiSmokeTest in every sponsored caption.',
        actor: 'agent',
        occurredAt: '2026-07-08',
        reason: 'API smoke targeted update',
      },
      store,
    });

    expect(result).toMatchObject({
      brandSlug: 'lashglow',
      canonicalPath: 'lashglow/content-guidelines',
      updated: true,
      logAppended: true,
    });

    const recalled = await searchOrReadBrandBrain({
      input: { brandNameOrSlug: 'Lashglow', query: 'ApiSmokeTest' },
      store,
    });

    expect(recalled.matches[0].markdown).toContain('#ApiSmokeTest');

    const duplicate = await updateBrandBrainPageContent({
      input: {
        brandNameOrSlug: 'Lashglow',
        canonicalPath: 'content-guidelines',
        appendMarkdown:
          '- Required disclosure: creators must include #ApiSmokeTest in every sponsored caption.',
        actor: 'agent',
        occurredAt: '2026-07-08',
        reason: 'API smoke targeted update',
      },
      store,
    });

    expect(duplicate).toMatchObject({ updated: false, logAppended: false });

    const contentPage = store.pages.find(
      (page) => page.canonicalPath === 'lashglow/content-guidelines',
    );
    const logPage = store.pages.find(
      (page) => page.canonicalPath === 'lashglow/log',
    );

    expect(contentPage?.body?.markdown?.match(/#ApiSmokeTest/g)).toHaveLength(
      1,
    );
    expect(logPage?.body?.markdown).toContain('API smoke targeted update');
  });

  it('rejects targeted updates to internal pages and validates Log before writing target content', async () => {
    const store = new MockBrandBrainStore();

    await seedOrUpdateBrandBrainFromBrief({ input: seedInput, store });

    await expect(
      updateBrandBrainPageContent({
        input: {
          brandNameOrSlug: 'Lashglow',
          canonicalPath: 'log',
          appendMarkdown: 'Do not write directly to Log through this tool.',
          actor: 'agent',
        },
        store,
      }),
    ).rejects.toThrow('Use append-log behavior instead');

    const contentPageBefore = store.pages.find(
      (page) => page.canonicalPath === 'lashglow/content-guidelines',
    );
    const logPage = store.pages.find(
      (page) => page.canonicalPath === 'lashglow/log',
    );
    const contentBefore = contentPageBefore?.body?.markdown;

    await store.updatePage({
      id: logPage?.id ?? '',
      patch: {
        body: {
          markdown: null,
          blocknote: JSON.stringify([
            {
              id: 'existing-log-block',
              type: 'paragraph',
              props: {},
              content: [
                {
                  type: 'text',
                  text: 'Existing rich-text-only log entry',
                  styles: {},
                },
              ],
              children: [],
            },
          ]),
        },
      },
    });

    await expect(
      updateBrandBrainPageContent({
        input: {
          brandNameOrSlug: 'Lashglow',
          canonicalPath: 'content-guidelines',
          appendMarkdown: '- This should not be written before Log validation.',
          actor: 'agent',
        },
        store,
      }),
    ).rejects.toThrow('Cannot append Brand Brain log');

    expect(
      store.pages.find(
        (page) => page.canonicalPath === 'lashglow/content-guidelines',
      )?.body?.markdown,
    ).toBe(contentBefore);
  });

  it('reports missing recommended pages when a Brand Brain is incomplete', async () => {
    const store = new MockBrandBrainStore({
      pages: [
        {
          id: 'root',
          title: 'Lashglow',
          slug: 'lashglow',
          canonicalPath: 'lashglow',
          pageType: 'BRAND_ROOT',
          status: 'APPROVED',
          body: buildRichTextBody('# Lashglow\n\nDTC lash serum brand.'),
        },
      ],
    });

    const context = await getBrandBrainContext({
      brandNameOrSlug: 'Lashglow',
      store,
    });

    expect(context.pageCount).toBe(1);
    expect(context.hasRoot).toBe(true);
    expect(context.hasIndex).toBe(false);
    expect(context.hasLog).toBe(false);
    expect(context.missingRecommendedPaths).toContain('lashglow/index');
    expect(context.missingRecommendedPaths).toContain(
      'lashglow/content-guidelines',
    );
    expect(context.missingRecommendedPaths).not.toContain(
      'lashglow/creators-affiliates',
    );
    expect(context.contextMarkdown).toContain('## Missing Recommended Pages');
  });
});

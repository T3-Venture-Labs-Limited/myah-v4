import {
  type BrandBrainAgentPagePlan,
  assertNoDestructiveBrandBrainOperations,
  buildBrandBrainSeedLinkPlans,
  buildBrandBrainSeedPlan,
  formatBrandBrainAgentLogEntry,
  formatBrandBrainIndexMarkdown,
  getBrandBrainSeedPageTemplates,
  normalizeBrandSlug,
  normalizeBrandSocialChannel,
  normalizeBrandWebsiteUrl,
} from 'src/modules/myah-brand-brain/utils/brand-brain-agent-memory.util';
import { type BrandBrainPageRecord } from 'src/modules/myah-brand-brain/utils/brand-brain-record-wiki.util';

type BrandBrainSeedOperation = ReturnType<
  typeof buildBrandBrainSeedPlan
>['operations'][number];

const isBrandBrainPageOperation = (
  operation: BrandBrainSeedOperation,
): operation is BrandBrainAgentPagePlan =>
  operation.operation === 'createPage' ||
  operation.operation === 'fillMissingPage';

const seedInput = {
  brandName: 'Lash Glow!',
  websiteUrl: 'LashGlow.com/?utm_source=test&utm_campaign=demo',
  whatItIs: 'A beauty brand selling lash growth products.',
  primaryOffer: 'Starter lash serum bundle.',
  audience: 'Beauty shoppers who want fuller-looking lashes.',
  positioning: 'Premium but approachable lash care.',
  contentGuidelines: 'Avoid medical claims and guaranteed growth language.',
  actor: 'agent',
  occurredAt: '2026-07-07',
  products: [
    {
      name: 'Lash Serum',
      description: 'Daily serum for lash care routines.',
      url: 'https://lashglow.com/products/lash-serum?utm_medium=cpc',
      price: 'Placeholder until Shopify import.',
    },
  ],
  socialChannels: [
    { platform: 'Instagram', value: '@LashGlow' },
    {
      platform: 'TikTok',
      value: 'https://www.tiktok.com/@LashGlow?utm_source=test',
    },
  ],
  sourceNotes: [
    {
      label: 'User onboarding placeholder',
      sourceType: 'user-provided' as const,
      sourceUrl: 'lashglow.com?utm_source=agent',
      capturedAt: '2026-07-07T00:00:00.000Z',
      excerpt:
        'Brand details will be filled manually until Shopify import exists.',
      informedPaths: ['lash-glow/overview', 'lash-glow/products'],
      confidence: 'medium' as const,
    },
    {
      label: 'Duplicate source link target',
      sourceType: 'website' as const,
      capturedAt: '2026-07-07T00:00:00.000Z',
      informedPaths: ['lash-glow/products'],
    },
  ],
};

const visualBrandTerms = [
  'brand-assets',
  'typography',
  'font',
  'color palette',
  'colour palette',
  'visual assets',
];

describe('brand brain agent memory planner', () => {
  it('normalizes brand slugs defensively', () => {
    expect(normalizeBrandSlug(' Lash Glow! ')).toBe('lash-glow');
    expect(normalizeBrandSlug('Crème Déjà Vu')).toBe('creme-deja-vu');
    expect(normalizeBrandSlug('brain-brand-orbit-bloom')).toBe('orbit-bloom');
    expect(normalizeBrandSlug('brand-brain-orbit-bloom')).toBe('orbit-bloom');
    expect(() => normalizeBrandSlug(' !!! ')).toThrow(
      'Brand name must produce a non-empty slug.',
    );
  });

  it('normalizes website URLs without tracking parameters', () => {
    expect(
      normalizeBrandWebsiteUrl('LashGlow.com/?utm_source=test&utm_medium=cpc'),
    ).toBe('https://lashglow.com/');
    expect(
      normalizeBrandWebsiteUrl(
        'https://WWW.LashGlow.com/products/Lash-Serum?variant=1&utm_campaign=test',
      ),
    ).toBe('https://lashglow.com/products/Lash-Serum?variant=1');
    expect(normalizeBrandWebsiteUrl()).toBeUndefined();
  });

  it('normalizes social channels from handles and URLs', () => {
    expect(
      normalizeBrandSocialChannel({
        platform: 'Instagram',
        value: '@LashGlow',
      }),
    ).toEqual({
      platform: 'instagram',
      handle: 'LashGlow',
      displayLabel: '@LashGlow',
    });

    expect(
      normalizeBrandSocialChannel({
        platform: 'TikTok',
        value: 'https://www.tiktok.com/@LashGlow?utm_source=test',
      }),
    ).toEqual({
      platform: 'tiktok',
      handle: 'LashGlow',
      url: 'https://tiktok.com/@LashGlow',
      displayLabel: 'LashGlow',
    });
  });

  it('defines a business-context taxonomy without old visual-brand setup pages', () => {
    const templates = getBrandBrainSeedPageTemplates();
    const slugs = templates.map((template) => template.slug).filter(Boolean);

    expect(slugs).toEqual([
      'overview',
      'products',
      'offer',
      'audience',
      'positioning',
      'social-channels',
      'content-guidelines',
      'source-notes',
      'index',
      'log',
    ]);

    for (const visualBrandTerm of visualBrandTerms) {
      expect(slugs.join('\n')).not.toContain(visualBrandTerm);
    }
  });

  it('builds lowercase create plans for brand business memory pages', () => {
    const plan = buildBrandBrainSeedPlan({ input: seedInput });
    const pageOperations = plan.operations.filter(isBrandBrainPageOperation);

    expect(plan.brandSlug).toBe('lash-glow');
    expect(plan.normalizedWebsiteUrl).toBe('https://lashglow.com/');
    expect(pageOperations.map((operation) => operation.canonicalPath)).toEqual([
      'lash-glow',
      'lash-glow/overview',
      'lash-glow/products',
      'lash-glow/offer',
      'lash-glow/audience',
      'lash-glow/positioning',
      'lash-glow/social-channels',
      'lash-glow/content-guidelines',
      'lash-glow/source-notes',
      'lash-glow/index',
      'lash-glow/log',
    ]);

    expect(
      pageOperations.every(
        (operation) =>
          operation.canonicalPath === operation.canonicalPath.toLowerCase() &&
          !operation.canonicalPath.includes('//') &&
          !operation.canonicalPath.endsWith('/'),
      ),
    ).toBe(true);

    expect(JSON.stringify(plan.operations)).toContain(
      'Avoid medical claims and guaranteed growth language.',
    );
  });

  it('creates placeholders for unknown business fields instead of requiring Shopify import', () => {
    const plan = buildBrandBrainSeedPlan({
      input: {
        brandName: 'Placeholder Brand',
        actor: 'agent',
        occurredAt: '2026-07-07',
      },
    });
    const operationsText = JSON.stringify(plan.operations, null, 2);

    expect(operationsText).toContain('Unknown / not captured yet.');
    expect(operationsText).toContain('Business context placeholder');
    expect(operationsText).toContain('Products');
    expect(operationsText).not.toContain('Creators and Affiliates');
    expect(operationsText).not.toContain('creators-affiliates');
  });

  it('does not generate old visual-brand asset language in seed page content', () => {
    const plan = buildBrandBrainSeedPlan({ input: seedInput });
    const generatedText = JSON.stringify(
      plan.operations,
      null,
      2,
    ).toLowerCase();

    for (const visualBrandTerm of visualBrandTerms) {
      expect(generatedText).not.toContain(visualBrandTerm);
    }
  });

  it('formats deterministic index markdown from page records', () => {
    const markdown = formatBrandBrainIndexMarkdown({
      brandName: 'Lash Glow',
      brandSlug: 'lash-glow',
      pages: [
        {
          title: 'Products',
          canonicalPath: 'lash-glow/products',
          pageType: 'PAGE',
          sortOrder: 20,
        },
        {
          title: 'Log',
          canonicalPath: 'lash-glow/log',
          pageType: 'LOG',
          sortOrder: 110,
        },
        {
          title: 'Lash Glow',
          canonicalPath: 'lash-glow',
          pageType: 'BRAND_ROOT',
          sortOrder: 0,
        },
      ],
    });

    expect(markdown).toContain('# Lash Glow Brand Brain Index');
    expect(markdown).toContain('## Root');
    expect(markdown).toContain('[[lash-glow|Lash Glow]]');
    expect(markdown).toContain('## Business context');
    expect(markdown).toContain('[[lash-glow/products|Products]]');
    expect(markdown).toContain('## Sources and maintenance');
    expect(markdown).toContain('[[lash-glow/log|Log]]');
    expect(markdown).not.toContain(' / draft');
    expect(markdown).not.toContain(' / approved');
  });

  it('formats append-only log entries with source, reason, and changed paths', () => {
    expect(
      formatBrandBrainAgentLogEntry({
        action: 'update',
        summary: 'Updated audience notes',
        actor: 'agent',
        source: 'user conversation',
        reason: 'User clarified creator brief direction',
        changedPaths: ['lash-glow/audience'],
        occurredAt: '2026-07-07',
      }),
    ).toBe(
      [
        '## [2026-07-07] update | Updated audience notes',
        '- Actor: agent',
        '- Source: user conversation',
        '- Reason: User clarified creator brief direction',
        '- Changed paths: lash-glow/audience',
      ].join('\n'),
    );
  });

  it('returns fill-missing operations for existing pages instead of duplicate creates or destructive overwrites', () => {
    const existingPages: BrandBrainPageRecord[] = [
      {
        id: 'page_root',
        title: 'Lash Glow',
        slug: 'lash-glow',
        canonicalPath: 'lash-glow',
        parentPageId: null,
        pageType: 'BRAND_ROOT',
        status: 'APPROVED',
      },
      {
        id: 'page_products',
        title: 'Products',
        slug: 'products',
        canonicalPath: 'lash-glow/products',
        parentPageId: 'page_root',
        pageType: 'PAGE',
        status: 'DRAFT',
      },
    ];
    const plan = buildBrandBrainSeedPlan({ input: seedInput, existingPages });

    expect(
      plan.operations.find(
        (operation) =>
          operation.operation === 'fillMissingPage' &&
          operation.canonicalPath === 'lash-glow',
      ),
    ).toMatchObject({
      operation: 'fillMissingPage',
      existingPageId: 'page_root',
      mergeStrategy: 'fill-missing-fields-only',
      preserveExistingBody: true,
      seedBodyMarkdown: expect.stringContaining('A beauty brand'),
    });
    expect(
      plan.operations.find(
        (operation) =>
          operation.operation === 'fillMissingPage' &&
          operation.canonicalPath === 'lash-glow/products',
      ),
    ).toMatchObject({
      operation: 'fillMissingPage',
      existingPageId: 'page_products',
      mergeStrategy: 'fill-missing-fields-only',
      preserveExistingBody: true,
    });
    expect(JSON.stringify(plan.operations)).not.toContain('updatePage');
  });

  it('keeps Log page body skeletal and writes history only through appendLog', () => {
    const plan = buildBrandBrainSeedPlan({ input: seedInput });
    const logPageOperation = plan.operations.find(
      (operation) =>
        operation.operation === 'createPage' &&
        operation.canonicalPath === 'lash-glow/log',
    );
    const appendLogOperations = plan.operations.filter(
      (operation) => operation.operation === 'appendLog',
    );

    expect(logPageOperation).toMatchObject({
      operation: 'createPage',
      bodyMarkdown: expect.stringContaining(
        'Append-only Brand Brain update history',
      ),
    });
    expect(JSON.stringify(logPageOperation)).not.toContain('Initialized');
    expect(appendLogOperations).toHaveLength(1);
    expect(appendLogOperations[0]).toMatchObject({
      operation: 'appendLog',
      logPath: 'lash-glow/log',
      entryMarkdown: expect.stringContaining(
        'Prepared Lash Glow! Brand Brain seed plan',
      ),
    });
  });

  it('builds de-duplicated source citation link plans', () => {
    expect(
      buildBrandBrainSeedLinkPlans({
        brandSlug: 'lash-glow',
        sourceNotes: seedInput.sourceNotes,
      }),
    ).toEqual([
      {
        operation: 'upsertLink',
        sourcePath: 'lash-glow/source-notes',
        targetPath: 'lash-glow/overview',
        linkType: 'CITES',
        description: 'User onboarding placeholder informed lash-glow/overview.',
      },
      {
        operation: 'upsertLink',
        sourcePath: 'lash-glow/source-notes',
        targetPath: 'lash-glow/products',
        linkType: 'CITES',
        description: 'User onboarding placeholder informed lash-glow/products.',
      },
    ]);
  });

  it('rejects destructive operation plans', () => {
    expect(() =>
      assertNoDestructiveBrandBrainOperations([
        { operation: 'updatePage' },
        { operation: 'deletePage' },
      ]),
    ).toThrow('Brand Brain operations must not delete knowledge: deletePage');

    expect(() =>
      assertNoDestructiveBrandBrainOperations([
        { operation: 'updatePage' },
        { operation: 'appendLog' },
      ]),
    ).not.toThrow();
  });

  it('keeps planner output as markdown and does not fake rich-text GraphQL payloads', () => {
    const plan = buildBrandBrainSeedPlan({ input: seedInput });
    const overview = plan.operations.find(
      (operation) =>
        operation.operation === 'createPage' &&
        operation.canonicalPath === 'lash-glow/overview',
    );

    expect(overview).toMatchObject({
      operation: 'createPage',
      bodyMarkdown: expect.stringContaining('What the brand is'),
    });
    expect(JSON.stringify(overview)).not.toContain('blocknote');
  });
});

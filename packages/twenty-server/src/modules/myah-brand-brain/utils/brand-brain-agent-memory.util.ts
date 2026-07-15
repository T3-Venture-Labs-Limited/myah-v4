import {
  type BrandBrainPageRecord,
  type BrandBrainPageStatus,
  type BrandBrainPageType,
  buildCanonicalPath,
} from 'src/modules/myah-brand-brain/utils/brand-brain-record-wiki.util';

export type BrandBrainSourceType =
  | 'user-provided'
  | 'website'
  | 'shopify'
  | 'instagram'
  | 'x-twitter'
  | 'tiktok'
  | 'youtube'
  | 'other';

export type BrandBrainLinkType =
  | 'RELATED'
  | 'CITES'
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'SUPERSEDES'
  | 'DERIVED_FROM';

export type BrandBrainSocialChannelInput = {
  platform: string;
  value: string;
  displayLabel?: string;
};

export type NormalizedBrandBrainSocialChannel = {
  platform: string;
  handle?: string;
  url?: string;
  displayLabel: string;
};

export type BrandBrainProductInput = {
  name: string;
  description?: string;
  url?: string;
  price?: string;
};

export type BrandBrainSourceNoteInput = {
  label: string;
  sourceType: BrandBrainSourceType;
  sourceUrl?: string;
  capturedAt: string;
  excerpt?: string;
  informedPaths?: string[];
  confidence?: 'high' | 'medium' | 'low';
};

export type BrandBrainSeedInput = {
  brandName: string;
  websiteUrl?: string;
  whatItIs?: string;
  primaryOffer?: string;
  audience?: string;
  positioning?: string;
  contentGuidelines?: string;
  products?: BrandBrainProductInput[];
  socialChannels?: BrandBrainSocialChannelInput[];
  sourceNotes?: BrandBrainSourceNoteInput[];
  actor: string;
  occurredAt: string;
};

type BrandBrainAgentPagePlanBase = {
  existingPageId?: string;
  title: string;
  slug: string;
  canonicalPath: string;
  parentCanonicalPath?: string | null;
  pageType: BrandBrainPageType;
  status: BrandBrainPageStatus;
  summary: string;
  tags: string[];
  sortOrder: number;
};

export type BrandBrainAgentPageCreatePlan = BrandBrainAgentPagePlanBase & {
  operation: 'createPage';
  bodyMarkdown: string;
};

export type BrandBrainAgentPageFillMissingPlan = BrandBrainAgentPagePlanBase & {
  operation: 'fillMissingPage';
  existingPageId: string;
  mergeStrategy: 'fill-missing-fields-only';
  preserveExistingBody: true;
  seedBodyMarkdown: string;
};

export type BrandBrainAgentPagePlan =
  | BrandBrainAgentPageCreatePlan
  | BrandBrainAgentPageFillMissingPlan;

export type BrandBrainAgentLogPlan = {
  operation: 'appendLog';
  logPath: string;
  entryMarkdown: string;
};

export type BrandBrainAgentLinkPlan = {
  operation: 'upsertLink';
  sourcePath: string;
  targetPath: string;
  linkType: BrandBrainLinkType;
  description: string;
};

export type BrandBrainAgentOperation =
  | BrandBrainAgentPagePlan
  | BrandBrainAgentLogPlan
  | BrandBrainAgentLinkPlan;

export type BrandBrainSeedPlan = {
  brandSlug: string;
  normalizedWebsiteUrl?: string;
  socialChannels: NormalizedBrandBrainSocialChannel[];
  operations: BrandBrainAgentOperation[];
};

type BrandBrainSeedPageKey =
  | 'root'
  | 'overview'
  | 'products'
  | 'offer'
  | 'audience'
  | 'positioning'
  | 'social-channels'
  | 'content-guidelines'
  | 'source-notes'
  | 'index'
  | 'log';

type BrandBrainSeedPageTemplate = {
  key: BrandBrainSeedPageKey;
  title: string;
  slug: string;
  pageType: BrandBrainPageType;
  status: BrandBrainPageStatus;
  summary: string;
  sortOrder: number;
  tags: string[];
};

const UNKNOWN_PLACEHOLDER = 'Unknown / not captured yet.';

const SEED_PAGE_TEMPLATES: BrandBrainSeedPageTemplate[] = [
  {
    key: 'root',
    title: 'Brand Profile',
    slug: '',
    pageType: 'BRAND_ROOT',
    status: 'APPROVED',
    summary: 'Root business profile for this Brand Brain.',
    sortOrder: 0,
    tags: ['brand-profile'],
  },
  {
    key: 'overview',
    title: 'Overview',
    slug: 'overview',
    pageType: 'PAGE',
    status: 'DRAFT',
    summary: 'What the brand is and the core context agents should know.',
    sortOrder: 10,
    tags: ['brand-overview'],
  },
  {
    key: 'products',
    title: 'Products',
    slug: 'products',
    pageType: 'PAGE',
    status: 'DRAFT',
    summary: 'Products, services, bundles, and catalog notes.',
    sortOrder: 20,
    tags: ['products'],
  },
  {
    key: 'offer',
    title: 'Offer',
    slug: 'offer',
    pageType: 'PAGE',
    status: 'DRAFT',
    summary: 'Primary offer, pricing context, incentives, and funnel notes.',
    sortOrder: 30,
    tags: ['offer'],
  },
  {
    key: 'audience',
    title: 'Audience',
    slug: 'audience',
    pageType: 'PAGE',
    status: 'DRAFT',
    summary: 'Target customers, buyers, objections, and intent signals.',
    sortOrder: 40,
    tags: ['audience'],
  },
  {
    key: 'positioning',
    title: 'Positioning',
    slug: 'positioning',
    pageType: 'PAGE',
    status: 'DRAFT',
    summary: 'Market position, differentiators, and core messaging.',
    sortOrder: 50,
    tags: ['positioning'],
  },
  {
    key: 'social-channels',
    title: 'Social Channels',
    slug: 'social-channels',
    pageType: 'PAGE',
    status: 'DRAFT',
    summary: 'Known website and social channel handles for the brand.',
    sortOrder: 60,
    tags: ['social-channels'],
  },
  {
    key: 'content-guidelines',
    title: 'Content Guidelines',
    slug: 'content-guidelines',
    pageType: 'PLAYBOOK',
    status: 'DRAFT',
    summary: 'Messaging, claims, tone, and content constraints for agents.',
    sortOrder: 70,
    tags: ['content-guidelines'],
  },
  {
    key: 'source-notes',
    title: 'Source Notes',
    slug: 'source-notes',
    pageType: 'SOURCE',
    status: 'DRAFT',
    summary:
      'Raw-ish source notes and provenance used to compile the Brand Brain.',
    sortOrder: 80,
    tags: ['sources'],
  },
  {
    key: 'index',
    title: 'Index',
    slug: 'index',
    pageType: 'INDEX',
    status: 'APPROVED',
    summary: 'Automatically maintained Brand Brain index.',
    sortOrder: 90,
    tags: ['index'],
  },
  {
    key: 'log',
    title: 'Log',
    slug: 'log',
    pageType: 'LOG',
    status: 'APPROVED',
    summary: 'Append-only Brand Brain update history.',
    sortOrder: 100,
    tags: ['log'],
  },
];

const normalizePathSegment = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeCanonicalPath = (value: string): string =>
  value.split('/').map(normalizePathSegment).filter(Boolean).join('/');

const valueOrUnknown = (value?: string): string =>
  value?.trim() ? value.trim() : UNKNOWN_PLACEHOLDER;

const MODEL_GENERATED_BRAND_SLUG_PREFIXES = [
  'brain-brand-',
  'brand-brain-',
];

export const normalizeBrandSlug = (brandName: string): string => {
  const normalized = normalizePathSegment(brandName);

  if (!normalized) {
    throw new Error('Brand name must produce a non-empty slug.');
  }

  const prefixStripped = MODEL_GENERATED_BRAND_SLUG_PREFIXES.reduce(
    (value, prefix) => (value.startsWith(prefix) ? value.slice(prefix.length) : value),
    normalized,
  );

  if (!prefixStripped) {
    throw new Error('Brand name must produce a non-empty slug.');
  }

  return prefixStripped;
};

export const normalizeBrandWebsiteUrl = (
  websiteUrl?: string,
): string | undefined => {
  if (!websiteUrl?.trim()) {
    return undefined;
  }

  const valueWithProtocol = /^https?:\/\//i.test(websiteUrl.trim())
    ? websiteUrl.trim()
    : `https://${websiteUrl.trim()}`;
  const url = new URL(valueWithProtocol);

  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  Array.from(url.searchParams.keys()).forEach((key) => {
    if (key.toLowerCase().startsWith('utm_')) {
      url.searchParams.delete(key);
    }
  });

  if (!url.pathname) {
    url.pathname = '/';
  }

  return url.toString();
};

export const normalizeBrandSocialChannel = ({
  platform,
  value,
  displayLabel,
}: BrandBrainSocialChannelInput): NormalizedBrandBrainSocialChannel => {
  const normalizedPlatform = normalizePathSegment(platform);

  if (!normalizedPlatform) {
    throw new Error('Social channel platform is required.');
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error('Social channel value is required.');
  }

  const isUrl = /^https?:\/\//i.test(trimmedValue);

  if (isUrl) {
    const url = new URL(trimmedValue);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const handle = pathParts[0]?.replace(/^@/, '');

    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    Array.from(url.searchParams.keys()).forEach((key) => {
      if (key.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    });

    return {
      platform: normalizedPlatform,
      handle,
      url: url.toString(),
      displayLabel: displayLabel?.trim() || handle || url.toString(),
    };
  }

  const handle = trimmedValue.replace(/^@/, '');

  return {
    platform: normalizedPlatform,
    handle,
    displayLabel: displayLabel?.trim() || `@${handle}`,
  };
};

export const getBrandBrainSeedPageTemplates =
  (): BrandBrainSeedPageTemplate[] => [...SEED_PAGE_TEMPLATES];

const pathForTemplate = ({
  brandSlug,
  template,
}: {
  brandSlug: string;
  template: BrandBrainSeedPageTemplate;
}): string =>
  template.key === 'root'
    ? brandSlug
    : buildCanonicalPath({
        parentCanonicalPath: brandSlug,
        slug: template.slug,
      });

const parentPathForTemplate = ({
  brandSlug,
  template,
}: {
  brandSlug: string;
  template: BrandBrainSeedPageTemplate;
}): string | null => (template.key === 'root' ? null : brandSlug);

const productMarkdown = (products: BrandBrainProductInput[] = []): string => {
  if (products.length === 0) {
    return `- ${UNKNOWN_PLACEHOLDER}`;
  }

  return products
    .map((product) =>
      [
        `## ${product.name}`,
        `- Description: ${valueOrUnknown(product.description)}`,
        `- URL: ${valueOrUnknown(normalizeBrandWebsiteUrl(product.url))}`,
        `- Price/context: ${valueOrUnknown(product.price)}`,
      ].join('\n'),
    )
    .join('\n\n');
};

const socialMarkdown = ({
  websiteUrl,
  channels,
}: {
  websiteUrl?: string;
  channels: NormalizedBrandBrainSocialChannel[];
}): string =>
  [
    `- Website: ${valueOrUnknown(websiteUrl)}`,
    '',
    '## Social channels',
    channels.length > 0
      ? channels
          .map((channel) =>
            [
              `- Platform: ${channel.platform}`,
              `  - Handle: ${valueOrUnknown(channel.handle)}`,
              `  - URL: ${valueOrUnknown(channel.url)}`,
              `  - Label: ${channel.displayLabel}`,
            ].join('\n'),
          )
          .join('\n')
      : `- ${UNKNOWN_PLACEHOLDER}`,
  ].join('\n');

const sourceNotesMarkdown = (
  sourceNotes: BrandBrainSourceNoteInput[] = [],
): string => {
  if (sourceNotes.length === 0) {
    return [
      `- ${UNKNOWN_PLACEHOLDER}`,
      '- Add source label, source type, source URL, captured timestamp, excerpt, confidence, and informed paths when available.',
    ].join('\n');
  }

  return sourceNotes
    .map((sourceNote) =>
      [
        `## ${sourceNote.label}`,
        `- Type: ${sourceNote.sourceType}`,
        `- URL: ${valueOrUnknown(normalizeBrandWebsiteUrl(sourceNote.sourceUrl))}`,
        `- Captured at: ${sourceNote.capturedAt}`,
        `- Confidence: ${sourceNote.confidence ?? 'medium'}`,
        `- Informed paths: ${(sourceNote.informedPaths ?? []).join(', ') || UNKNOWN_PLACEHOLDER}`,
        `- Excerpt: ${valueOrUnknown(sourceNote.excerpt)}`,
      ].join('\n'),
    )
    .join('\n\n');
};

const buildBodyMarkdown = ({
  input,
  brandSlug,
  websiteUrl,
  socialChannels,
  template,
}: {
  input: BrandBrainSeedInput;
  brandSlug: string;
  websiteUrl?: string;
  socialChannels: NormalizedBrandBrainSocialChannel[];
  template: BrandBrainSeedPageTemplate;
}): string => {
  const heading = `# ${template.title === 'Brand Profile' ? input.brandName : template.title}`;

  switch (template.key) {
    case 'root':
      return [
        heading,
        '',
        `- Brand name: ${input.brandName}`,
        `- Website: ${valueOrUnknown(websiteUrl)}`,
        `- What it is: ${valueOrUnknown(input.whatItIs)}`,
        `- Primary offer: ${valueOrUnknown(input.primaryOffer)}`,
        `- Current status: Business context placeholder until user onboarding, website research, or Shopify import fills this in.`,
      ].join('\n');
    case 'overview':
      return [
        heading,
        '',
        `- Brand: ${input.brandName}`,
        `- Website: ${valueOrUnknown(websiteUrl)}`,
        `- What the brand is: ${valueOrUnknown(input.whatItIs)}`,
        `- Important context: ${UNKNOWN_PLACEHOLDER}`,
      ].join('\n');
    case 'products':
      return [heading, '', productMarkdown(input.products)].join('\n');
    case 'offer':
      return [
        heading,
        '',
        `- Primary offer: ${valueOrUnknown(input.primaryOffer)}`,
        `- Incentives/promotions: ${UNKNOWN_PLACEHOLDER}`,
        `- Purchase path: ${valueOrUnknown(websiteUrl)}`,
      ].join('\n');
    case 'audience':
      return [
        heading,
        '',
        `- Target audience: ${valueOrUnknown(input.audience)}`,
        `- Buyer intent signals: ${UNKNOWN_PLACEHOLDER}`,
        `- Common objections: ${UNKNOWN_PLACEHOLDER}`,
      ].join('\n');
    case 'positioning':
      return [
        heading,
        '',
        `- Positioning: ${valueOrUnknown(input.positioning)}`,
        `- Differentiators: ${UNKNOWN_PLACEHOLDER}`,
        `- Competitors/alternatives: ${UNKNOWN_PLACEHOLDER}`,
      ].join('\n');
    case 'social-channels':
      return [
        heading,
        '',
        socialMarkdown({ websiteUrl, channels: socialChannels }),
      ].join('\n');
    case 'content-guidelines':
      return [
        heading,
        '',
        `- Captured brand/content rules: ${valueOrUnknown(input.contentGuidelines)}`,
        '- Claims to avoid or qualify: Unknown / not captured yet.',
        '- Tone and wording preferences: Unknown / not captured yet.',
        '- Creator brief constraints: Unknown / not captured yet.',
      ].join('\n');
    case 'source-notes':
      return [heading, '', sourceNotesMarkdown(input.sourceNotes)].join('\n');
    case 'index':
      return formatBrandBrainIndexMarkdown({
        brandName: input.brandName,
        brandSlug,
        pages: SEED_PAGE_TEMPLATES.map((seedTemplate) => ({
          id: pathForTemplate({ brandSlug, template: seedTemplate }),
          title:
            seedTemplate.key === 'root' ? input.brandName : seedTemplate.title,
          slug: seedTemplate.key === 'root' ? brandSlug : seedTemplate.slug,
          canonicalPath: pathForTemplate({ brandSlug, template: seedTemplate }),
          pageType: seedTemplate.pageType,
          status: seedTemplate.status,
          sortOrder: seedTemplate.sortOrder,
          parentPageId: parentPathForTemplate({
            brandSlug,
            template: seedTemplate,
          }),
        })),
      });
    case 'log':
      return [
        heading,
        '',
        'Append-only Brand Brain update history. Entries are added through appendLog operations so seed plans do not overwrite or duplicate existing history.',
      ].join('\n');
  }
};

const buildSummary = ({
  input,
  template,
}: {
  input: BrandBrainSeedInput;
  template: BrandBrainSeedPageTemplate;
}): string => {
  if (template.key === 'root') {
    return `Root business profile for ${input.brandName}.`;
  }

  return template.summary;
};

const existingPageForPath = ({
  canonicalPath,
  existingPages,
}: {
  canonicalPath: string;
  existingPages: BrandBrainPageRecord[];
}): BrandBrainPageRecord | undefined =>
  existingPages.find(
    (page) => normalizeCanonicalPath(page.canonicalPath) === canonicalPath,
  );

export const formatBrandBrainIndexMarkdown = ({
  brandName,
  brandSlug,
  pages,
}: {
  brandName: string;
  brandSlug: string;
  pages: Array<
    Pick<
      BrandBrainPageRecord,
      'title' | 'canonicalPath' | 'pageType' | 'sortOrder'
    >
  >;
}): string => {
  const sortedPages = [...pages].sort((leftPage, rightPage) => {
    const leftSortOrder = leftPage.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightSortOrder = rightPage.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (leftSortOrder !== rightSortOrder) {
      return leftSortOrder - rightSortOrder;
    }

    return leftPage.canonicalPath.localeCompare(rightPage.canonicalPath);
  });
  const pageLine = (page: (typeof sortedPages)[number]) =>
    `- [[${page.canonicalPath}|${page.title}]] — ${page.pageType.toLowerCase()}`;

  return [
    `# ${brandName} Brand Brain Index`,
    '',
    '## Root',
    ...sortedPages
      .filter((page) => page.canonicalPath === brandSlug)
      .map(pageLine),
    '',
    '## Business context',
    ...sortedPages
      .filter(
        (page) =>
          page.canonicalPath.startsWith(`${brandSlug}/`) &&
          !['INDEX', 'LOG', 'SOURCE'].includes(page.pageType),
      )
      .map(pageLine),
    '',
    '## Sources and maintenance',
    ...sortedPages
      .filter((page) => ['INDEX', 'LOG', 'SOURCE'].includes(page.pageType))
      .map(pageLine),
  ].join('\n');
};

export const formatBrandBrainAgentLogEntry = ({
  action,
  summary,
  actor,
  source,
  reason,
  changedPaths,
  occurredAt,
}: {
  action: 'seed' | 'create' | 'update' | 'supersede' | 'archive';
  summary: string;
  actor: string;
  source?: string;
  reason?: string;
  changedPaths?: string[];
  occurredAt: string;
}): string =>
  [
    `## [${occurredAt}] ${action} | ${summary}`,
    `- Actor: ${actor}`,
    source ? `- Source: ${source}` : '',
    reason ? `- Reason: ${reason}` : '',
    changedPaths?.length ? `- Changed paths: ${changedPaths.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

export const buildBrandBrainSeedPlan = ({
  input,
  existingPages = [],
}: {
  input: BrandBrainSeedInput;
  existingPages?: BrandBrainPageRecord[];
}): BrandBrainSeedPlan => {
  const brandSlug = normalizeBrandSlug(input.brandName);
  const normalizedWebsiteUrl = normalizeBrandWebsiteUrl(input.websiteUrl);
  const socialChannels = (input.socialChannels ?? []).map(
    normalizeBrandSocialChannel,
  );
  const pageOperations: BrandBrainAgentPagePlan[] = SEED_PAGE_TEMPLATES.map(
    (template) => {
      const canonicalPath = pathForTemplate({ brandSlug, template });
      const existingPage = existingPageForPath({
        canonicalPath,
        existingPages,
      });
      const commonPlanFields = {
        existingPageId: existingPage?.id,
        title: template.key === 'root' ? input.brandName : template.title,
        slug: template.key === 'root' ? brandSlug : template.slug,
        canonicalPath,
        parentCanonicalPath: parentPathForTemplate({ brandSlug, template }),
        pageType: template.pageType,
        status: template.status,
        summary: buildSummary({ input, template }),
        tags: template.tags,
        sortOrder: template.sortOrder,
      };
      const seedBodyMarkdown = buildBodyMarkdown({
        input,
        brandSlug,
        websiteUrl: normalizedWebsiteUrl,
        socialChannels,
        template,
      });

      if (existingPage) {
        return {
          ...commonPlanFields,
          operation: 'fillMissingPage',
          existingPageId: existingPage.id,
          mergeStrategy: 'fill-missing-fields-only',
          preserveExistingBody: true,
          seedBodyMarkdown,
        };
      }

      return {
        ...commonPlanFields,
        operation: 'createPage',
        bodyMarkdown: seedBodyMarkdown,
      };
    },
  );
  const linkOperations = buildBrandBrainSeedLinkPlans({
    brandSlug,
    sourceNotes: input.sourceNotes ?? [],
  });
  const logOperation: BrandBrainAgentLogPlan = {
    operation: 'appendLog',
    logPath: `${brandSlug}/log`,
    entryMarkdown: formatBrandBrainAgentLogEntry({
      action: 'seed',
      summary: `Prepared ${input.brandName} Brand Brain seed plan`,
      actor: input.actor,
      source: 'agent-planner',
      reason: 'Create direct-write business context memory structure',
      changedPaths: pageOperations.map((operation) => operation.canonicalPath),
      occurredAt: input.occurredAt,
    }),
  };

  return {
    brandSlug,
    normalizedWebsiteUrl,
    socialChannels,
    operations: [...pageOperations, ...linkOperations, logOperation],
  };
};

export const buildBrandBrainSeedLinkPlans = ({
  brandSlug,
  sourceNotes,
}: {
  brandSlug: string;
  sourceNotes: BrandBrainSourceNoteInput[];
}): BrandBrainAgentLinkPlan[] => {
  const seenLinks = new Set<string>();

  return sourceNotes.flatMap((sourceNote) =>
    (sourceNote.informedPaths ?? []).flatMap((targetPath) => {
      const normalizedTargetPath = normalizeCanonicalPath(targetPath);
      const sourcePath = `${brandSlug}/source-notes`;
      const key = `${sourcePath}::${normalizedTargetPath}::CITES`;

      if (!normalizedTargetPath || seenLinks.has(key)) {
        return [];
      }

      seenLinks.add(key);

      return [
        {
          operation: 'upsertLink' as const,
          sourcePath,
          targetPath: normalizedTargetPath,
          linkType: 'CITES' as const,
          description: `${sourceNote.label} informed ${normalizedTargetPath}.`,
        },
      ];
    }),
  );
};

export const assertNoDestructiveBrandBrainOperations = (
  operations: Array<{ operation: string }>,
): void => {
  const destructiveOperation = operations.find((operation) =>
    /delete|destroy|drop/i.test(operation.operation),
  );

  if (destructiveOperation) {
    throw new Error(
      `Brand Brain operations must not delete knowledge: ${destructiveOperation.operation}`,
    );
  }
};

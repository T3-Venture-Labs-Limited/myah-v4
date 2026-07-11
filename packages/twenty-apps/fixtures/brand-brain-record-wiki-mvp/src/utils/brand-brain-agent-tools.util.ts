import {
  type BrandBrainExecutorAppliedOperation,
  type BrandBrainExecutorPageRecord,
  type BrandBrainExecutorSkippedOperation,
  type BrandBrainExecutorStore,
  applyBrandBrainSeedPlan,
  buildRichTextBody,
} from 'src/utils/brand-brain-agent-executor.util';
import {
  type BrandBrainSeedInput,
  formatBrandBrainAgentLogEntry,
  normalizeBrandSlug,
} from 'src/utils/brand-brain-agent-memory.util';

const BRAND_BRAIN_RECOMMENDED_PAGE_KEYS = [
  '',
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
] as const;

export const BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT = 12000;
const MAX_CONTEXT_PAGES = 40;
const MAX_CONTEXT_LINKS = 40;
const CONTEXT_METADATA_CHARACTER_LIMIT = 400;
const BODY_CHARACTER_LIMIT_PER_PAGE = 1600;
const BODY_CHARACTER_LIMIT_PER_SEARCH_RESULT = 2400;
const DEFAULT_SEARCH_RESULT_LIMIT = 5;
const MAX_SEARCH_RESULT_LIMIT = 10;

export type BrandBrainSeedOrUpdateToolResult = {
  brandSlug: string;
  pagesCreated: number;
  pagesFilled: number;
  linksCreated: number;
  linksUpdated: number;
  indexRefreshed: boolean;
  logAppended: boolean;
  logAppendSkippedDuplicate: boolean;
  createdPaths: string[];
  filledPaths: string[];
  changedPaths: string[];
  skippedOperations: BrandBrainExecutorSkippedOperation[];
  summaryMarkdown: string;
};

export type BrandBrainContextPage = {
  id: string;
  title: string;
  canonicalPath: string;
  pageType: BrandBrainExecutorPageRecord['pageType'];
  summary?: string | null;
  markdown?: string | null;
};

export type BrandBrainContextLink = {
  id: string;
  sourcePath?: string;
  targetPath?: string;
  linkType: string;
  description?: string | null;
};

export type BrandBrainContextToolResult = {
  brandSlug: string;
  task?: string;
  pageCount: number;
  linkCount: number;
  hasRoot: boolean;
  hasIndex: boolean;
  hasLog: boolean;
  missingRecommendedPaths: string[];
  pages: BrandBrainContextPage[];
  links: BrandBrainContextLink[];
  contextMarkdown: string;
  truncated: boolean;
  truncatedPageCount: number;
  truncatedLinkCount: number;
  contextCharacterCount: number;
  contextCharacterLimit: number;
};

export type BrandBrainSearchOrReadInput = {
  brandNameOrSlug: string;
  canonicalPath?: string;
  sectionHeading?: string;
  query?: string;
  maxResults?: number;
};

export type BrandBrainSearchOrReadMatch = {
  id: string;
  title: string;
  canonicalPath: string;
  pageType: BrandBrainExecutorPageRecord['pageType'];
  summary?: string | null;
  sectionHeading?: string;
  markdown: string | null;
  truncated: boolean;
};

export type BrandBrainSearchOrReadToolResult = {
  brandSlug: string;
  canonicalPath?: string;
  query?: string;
  matchCount: number;
  matches: BrandBrainSearchOrReadMatch[];
  resultMarkdown: string;
};

export type BrandBrainUpdatePageContentInput = {
  brandNameOrSlug: string;
  canonicalPath: string;
  appendMarkdown: string;
  actor: string;
  occurredAt?: string;
  reason?: string;
};

export type BrandBrainUpdatePageContentToolResult = {
  brandSlug: string;
  canonicalPath: string;
  updated: boolean;
  logAppended: boolean;
  summaryMarkdown: string;
};

const normalizeCanonicalPath = (value: string): string =>
  value
    .split('/')
    .map((segment) =>
      segment
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .filter(Boolean)
    .join('/');

const isBrandPath = ({
  brandSlug,
  canonicalPath,
}: {
  brandSlug: string;
  canonicalPath: string;
}): boolean => {
  const normalizedPath = normalizeCanonicalPath(canonicalPath);

  return (
    normalizedPath === brandSlug || normalizedPath.startsWith(`${brandSlug}/`)
  );
};

const unique = (values: string[]): string[] => Array.from(new Set(values));

const brandScopedPath = ({
  brandSlug,
  canonicalPath,
}: {
  brandSlug: string;
  canonicalPath: string;
}): string => {
  const normalizedPath = normalizeCanonicalPath(canonicalPath);

  if (!normalizedPath) {
    throw new Error('Brand Brain canonicalPath must produce a non-empty path.');
  }

  if (
    normalizedPath === brandSlug ||
    normalizedPath.startsWith(`${brandSlug}/`)
  ) {
    return normalizedPath;
  }

  return `${brandSlug}/${normalizedPath}`;
};

const capMarkdown = ({
  markdown,
  limit,
}: {
  markdown: string;
  limit: number;
}): { markdown: string; truncated: boolean } => {
  if (markdown.length <= limit) {
    return { markdown, truncated: false };
  }

  return {
    markdown: `${markdown.slice(0, limit).trim()}\n\n[Truncated]`,
    truncated: true,
  };
};

const capMarkdownHeadAndTail = ({
  markdown,
  limit,
}: {
  markdown: string;
  limit: number;
}): { markdown: string; truncated: boolean } => {
  if (markdown.length <= limit) {
    return { markdown, truncated: false };
  }

  const headLimit = Math.floor(limit * 0.55);
  const tailLimit = limit - headLimit;
  const head = markdown.slice(0, headLimit).trim();
  const tail = markdown.slice(Math.max(0, markdown.length - tailLimit)).trim();

  return {
    markdown: `${head}\n\n[Truncated middle]\n\n${tail}`,
    truncated: true,
  };
};

const capMarkdownAroundQuery = ({
  markdown,
  query,
  limit,
}: {
  markdown: string;
  query?: string;
  limit: number;
}): { markdown: string; truncated: boolean } => {
  if (!query?.trim() || markdown.length <= limit) {
    return capMarkdown({ markdown, limit });
  }

  const queryIndex = markdown.toLowerCase().indexOf(query.trim().toLowerCase());

  if (queryIndex === -1) {
    return capMarkdown({ markdown, limit });
  }

  const halfWindow = Math.floor(limit / 2);
  const start = Math.max(0, queryIndex - halfWindow);
  const end = Math.min(markdown.length, start + limit);
  const excerpt = markdown.slice(start, end).trim();
  const prefix = start > 0 ? '[Truncated before]\n' : '';
  const suffix = end < markdown.length ? '\n\n[Truncated after]' : '';

  return {
    markdown: `${prefix}${excerpt}${suffix}`,
    truncated: start > 0 || end < markdown.length,
  };
};

type MarkdownSection = {
  heading?: string;
  markdown: string;
};

const splitMarkdownSections = (markdown: string): MarkdownSection[] => {
  const sections: MarkdownSection[] = [];
  let activeHeading: string | undefined;
  let activeLines: string[] = [];

  const flush = () => {
    const sectionMarkdown = activeLines.join('\n').trim();

    if (sectionMarkdown) {
      sections.push({ heading: activeHeading, markdown: sectionMarkdown });
    }
  };

  for (const line of markdown.split('\n')) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());

    if (headingMatch) {
      flush();
      activeHeading = headingMatch[2].trim();
      activeLines = [line];
    } else {
      activeLines.push(line);
    }
  }

  flush();

  return sections.length > 0 ? sections : [{ markdown }];
};

const textMatchesQuery = ({
  text,
  query,
}: {
  text?: string | null;
  query: string;
}): boolean => text?.toLowerCase().includes(query.toLowerCase()) ?? false;

const hasBlockNoteOnlyContent = (
  body?: BrandBrainExecutorPageRecord['body'] | null,
): boolean => {
  if (body?.markdown?.trim() || !body?.blocknote?.trim()) {
    return false;
  }

  try {
    const parsed = JSON.parse(body.blocknote) as Array<{ content?: unknown[] }>;

    return (
      Array.isArray(parsed) &&
      parsed.some((block) => (block.content ?? []).length > 0)
    );
  } catch {
    return true;
  }
};

const appendMarkdownOnce = ({
  existingMarkdown,
  appendMarkdown,
  heading,
}: {
  existingMarkdown?: string | null;
  appendMarkdown: string;
  heading?: string;
}): { markdown: string; changed: boolean } => {
  const normalizedAppendMarkdown = appendMarkdown.trim();
  const baseMarkdown = existingMarkdown?.trim() ?? '';

  if (!normalizedAppendMarkdown) {
    throw new Error('appendMarkdown must be non-empty.');
  }

  if (baseMarkdown.includes(normalizedAppendMarkdown)) {
    return { markdown: baseMarkdown, changed: false };
  }

  const addition = heading
    ? [`## ${heading}`, normalizedAppendMarkdown].join('\n')
    : normalizedAppendMarkdown;

  return {
    markdown: baseMarkdown ? `${baseMarkdown}\n\n${addition}` : addition,
    changed: true,
  };
};

const operationPath = (
  operation: BrandBrainExecutorAppliedOperation,
): string | undefined => {
  if (
    operation.operation === 'createPage' ||
    operation.operation === 'fillMissingPage' ||
    operation.operation === 'refreshIndex' ||
    operation.operation === 'appendLog'
  ) {
    return operation.canonicalPath;
  }

  return undefined;
};

const summarizeSeedOrUpdate = ({
  brandSlug,
  operations,
}: {
  brandSlug: string;
  operations: BrandBrainExecutorAppliedOperation[];
}): string => {
  const count = (
    operationName: BrandBrainExecutorAppliedOperation['operation'],
  ) =>
    operations.filter((operation) => operation.operation === operationName)
      .length;

  return [
    `# Brand Brain updated for \`${brandSlug}\``,
    '',
    `- Pages created: ${count('createPage')}`,
    `- Pages filled: ${count('fillMissingPage')}`,
    `- Index refreshed: ${count('refreshIndex') > 0 ? 'yes' : 'no'}`,
    `- Links created: ${count('createLink')}`,
    `- Links updated: ${count('updateLink')}`,
    `- Log appended: ${operations.some((operation) => operation.operation === 'appendLog' && !operation.skippedDuplicate) ? 'yes' : 'no'}`,
  ].join('\n');
};

export const seedOrUpdateBrandBrainFromBrief = async ({
  input,
  store,
}: {
  input: BrandBrainSeedInput;
  store: BrandBrainExecutorStore;
}): Promise<BrandBrainSeedOrUpdateToolResult> => {
  const result = await applyBrandBrainSeedPlan({ input, store });
  const createdPaths = result.appliedOperations
    .filter((operation) => operation.operation === 'createPage')
    .map((operation) => operation.canonicalPath);
  const filledPaths = result.appliedOperations
    .filter((operation) => operation.operation === 'fillMissingPage')
    .map((operation) => operation.canonicalPath);
  const changedPaths = unique(
    result.appliedOperations
      .map(operationPath)
      .filter((path): path is string => Boolean(path)),
  );
  const appendLogOperations = result.appliedOperations.filter(
    (operation) => operation.operation === 'appendLog',
  );

  return {
    brandSlug: result.brandSlug,
    pagesCreated: createdPaths.length,
    pagesFilled: filledPaths.length,
    linksCreated: result.appliedOperations.filter(
      (operation) => operation.operation === 'createLink',
    ).length,
    linksUpdated: result.appliedOperations.filter(
      (operation) => operation.operation === 'updateLink',
    ).length,
    indexRefreshed: result.appliedOperations.some(
      (operation) => operation.operation === 'refreshIndex',
    ),
    logAppended: appendLogOperations.some(
      (operation) => !operation.skippedDuplicate,
    ),
    logAppendSkippedDuplicate: appendLogOperations.some(
      (operation) => operation.skippedDuplicate,
    ),
    createdPaths,
    filledPaths,
    changedPaths,
    skippedOperations: result.skippedOperations,
    summaryMarkdown: summarizeSeedOrUpdate({
      brandSlug: result.brandSlug,
      operations: result.appliedOperations,
    }),
  };
};

const recommendedPathsForBrand = (brandSlug: string): string[] =>
  BRAND_BRAIN_RECOMMENDED_PAGE_KEYS.map((key) =>
    key ? `${brandSlug}/${key}` : brandSlug,
  );

const pageOrder = ({
  brandSlug,
  canonicalPath,
}: {
  brandSlug: string;
  canonicalPath: string;
}): number => {
  const recommendedPaths = recommendedPathsForBrand(brandSlug);
  const index = recommendedPaths.indexOf(normalizeCanonicalPath(canonicalPath));

  return index === -1 ? recommendedPaths.length : index;
};

const truncateMarkdown = (markdown: string): { markdown: string; truncated: boolean } =>
  markdown.length > BODY_CHARACTER_LIMIT_PER_PAGE
    ? {
        markdown: `${markdown.slice(0, BODY_CHARACTER_LIMIT_PER_PAGE).trim()}\n\n[Truncated]`,
        truncated: true,
      }
    : { markdown, truncated: false };

const pageMarkdown = (
  page: BrandBrainExecutorPageRecord,
): { markdown: string | null; truncated: boolean } => {
  if (page.body?.markdown?.trim()) {
    return truncateMarkdown(page.body.markdown.trim());
  }

  if (page.body?.blocknote?.trim()) {
    return {
      markdown: '[BlockNote content exists but markdown mirror is empty]',
      truncated: false,
    };
  }

  return { markdown: null, truncated: false };
};

const capContextMetadata = (value: string): {
  value: string;
  truncated: boolean;
} => {
  const capped = capMarkdown({
    markdown: value,
    limit: CONTEXT_METADATA_CHARACTER_LIMIT,
  });

  return { value: capped.markdown, truncated: capped.truncated };
};

const buildContextMarkdown = ({
  brandSlug,
  task,
  pages,
  links,
  missingRecommendedPaths,
}: {
  brandSlug: string;
  task?: string;
  pages: BrandBrainContextPage[];
  links: BrandBrainContextLink[];
  missingRecommendedPaths: string[];
}): string => {
  const rootLines = [`# Brand Brain Context: ${brandSlug}`];

  if (task?.trim()) {
    rootLines.push('', '## Task', task.trim());
  }

  rootLines.push(
    '',
    '## Available Pages',
    ...pages.map(
      (page) =>
        `- ${page.canonicalPath} (${page.pageType})${
          page.summary ? ` — ${page.summary}` : ''
        }`,
    ),
  );

  if (missingRecommendedPaths.length > 0) {
    rootLines.push(
      '',
      '## Missing Recommended Pages',
      ...missingRecommendedPaths.map((path) => `- ${path}`),
    );
  }

  const detailedPages = pages.filter(
    (page) => !['INDEX', 'LOG'].includes(page.pageType),
  );

  for (const page of detailedPages) {
    rootLines.push('', `## ${page.canonicalPath}`);

    if (page.summary) {
      rootLines.push(`Summary: ${page.summary}`);
    }

    if (page.markdown) {
      rootLines.push('', page.markdown);
    } else {
      rootLines.push('', '[No body captured]');
    }
  }

  const logPage = pages.find((page) => page.pageType === 'LOG');

  if (logPage?.markdown) {
    rootLines.push('', '## Recent Log', logPage.markdown);
  }

  if (links.length > 0) {
    rootLines.push(
      '',
      '## Links',
      ...links.map(
        (link) =>
          `- ${link.sourcePath ?? link.id} ${link.linkType.toLowerCase()} ${
            link.targetPath ?? 'unknown target'
          }${link.description ? ` — ${link.description}` : ''}`,
      ),
    );
  }

  return rootLines.join('\n');
};

export const getBrandBrainContext = async ({
  brandNameOrSlug,
  task,
  store,
}: {
  brandNameOrSlug: string;
  task?: string;
  store: BrandBrainExecutorStore;
}): Promise<BrandBrainContextToolResult> => {
  const brandSlug = normalizeBrandSlug(brandNameOrSlug);
  const rawPages = await store.listPagesByBrandSlug({ brandSlug });
  const brandPages = rawPages
    .filter((page) =>
      isBrandPath({ brandSlug, canonicalPath: page.canonicalPath }),
    )
    .sort((left, right) => {
      const orderDelta =
        pageOrder({ brandSlug, canonicalPath: left.canonicalPath }) -
        pageOrder({ brandSlug, canonicalPath: right.canonicalPath });

      return orderDelta === 0
        ? left.canonicalPath.localeCompare(right.canonicalPath)
        : orderDelta;
    });
  const pagesById = new Map(brandPages.map((page) => [page.id, page]));
  const rawLinks = await store.listLinksByBrandSlug({ brandSlug });
  const brandLinks = rawLinks
    .map((link): BrandBrainContextLink | null => {
      const sourcePage = pagesById.get(link.sourcePageId);
      const targetPage = pagesById.get(link.targetPageId);

      if (!sourcePage && !targetPage) {
        return null;
      }

      return {
        id: link.id,
        sourcePath: sourcePage?.canonicalPath,
        targetPath: targetPage?.canonicalPath,
        linkType: link.linkType,
        description: link.description,
      };
    })
    .filter((link): link is BrandBrainContextLink => Boolean(link));
  const totalPageCount = brandPages.length;
  const totalLinkCount = brandLinks.length;
  const pages: BrandBrainContextPage[] = brandPages
    .slice(0, MAX_CONTEXT_PAGES)
    .map((page) => {
      const title = capMarkdown({
        markdown: page.title,
        limit: CONTEXT_METADATA_CHARACTER_LIMIT,
      });
      const summary = page.summary
        ? capMarkdown({
            markdown: page.summary,
            limit: CONTEXT_METADATA_CHARACTER_LIMIT,
          })
        : { markdown: page.summary, truncated: false };
      const markdown = page.pageType === 'INDEX' ? { markdown: null, truncated: false } : pageMarkdown(page);

      return {
        value: {
          id: page.id,
          title: title.markdown,
          canonicalPath: normalizeCanonicalPath(page.canonicalPath),
          pageType: page.pageType,
          summary: summary.markdown,
          markdown: markdown.markdown,
        },
        truncated: title.truncated || summary.truncated || markdown.truncated,
      };
    });
  const links = brandLinks.slice(0, MAX_CONTEXT_LINKS).map((link) => {
    const description = link.description
      ? capMarkdown({
          markdown: link.description,
          limit: CONTEXT_METADATA_CHARACTER_LIMIT,
        })
      : { markdown: link.description, truncated: false };

    return {
      value: {
        ...link,
        description: description.markdown,
      },
      truncated: description.truncated,
    };
  });
  const contextPages = pages.map(({ value }) => value);
  const contextLinks = links.map(({ value }) => value);
  const contentWasTruncated =
    pages.some(({ truncated }) => truncated) ||
    links.some(({ truncated }) => truncated);
  const existingPaths = new Set(contextPages.map((page) => page.canonicalPath));
  const missingRecommendedPaths = recommendedPathsForBrand(brandSlug).filter(
    (path) => !existingPaths.has(path),
  );
  const hasPath = (path: string): boolean => existingPaths.has(path);

  const uncappedContextMarkdown = buildContextMarkdown({
    brandSlug,
    task: task?.slice(0, CONTEXT_METADATA_CHARACTER_LIMIT),
    pages: contextPages,
    links: contextLinks,
    missingRecommendedPaths,
  });
  const boundedTask = task
    ? capMarkdown({
        markdown: task,
        limit: CONTEXT_METADATA_CHARACTER_LIMIT,
      })
    : { markdown: task, truncated: false };
  const boundedContext = capMarkdownHeadAndTail({
    markdown: uncappedContextMarkdown,
    limit: BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT - 32,
  });

  let result = {
    brandSlug,
    task: boundedTask.markdown,
    pageCount: contextPages.length,
    linkCount: contextLinks.length,
    hasRoot: hasPath(brandSlug),
    hasIndex: hasPath(`${brandSlug}/index`),
    hasLog: hasPath(`${brandSlug}/log`),
    missingRecommendedPaths,
    pages: contextPages,
    links: contextLinks,
    contextMarkdown: boundedContext.markdown,
    truncated:
      contentWasTruncated ||
      boundedTask.truncated ||
      boundedContext.truncated ||
      totalPageCount > contextPages.length ||
      totalLinkCount > contextLinks.length,
    truncatedPageCount: Math.max(0, totalPageCount - contextPages.length),
    truncatedLinkCount: Math.max(0, totalLinkCount - contextLinks.length),
    contextCharacterLimit: BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT,
  };

  if (JSON.stringify(result).length > BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT) {
    result = {
      ...result,
      pages: result.pages.map((page) => ({
        ...page,
        title: page.title.slice(0, 64),
        markdown: null,
        summary: null,
      })),
      links: result.links.map((link) => ({ ...link, description: null })),
      truncated: true,
    };
  }
  if (
    JSON.stringify({ ...result, contextMarkdown: '' }).length >
    BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT
  ) {
    result = {
      ...result,
      task: undefined,
      pages: [],
      links: [],
      missingRecommendedPaths: [],
      truncated: true,
    };
  }

  let markdownLimit = result.contextMarkdown.length;
  while (
    JSON.stringify(result).length > BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT &&
    markdownLimit > 0
  ) {
    markdownLimit = Math.max(0, markdownLimit - 500);
    const compactMarkdown = capMarkdownHeadAndTail({
      markdown: result.contextMarkdown,
      limit: markdownLimit,
    });
    result = {
      ...result,
      contextMarkdown: compactMarkdown.markdown,
      truncated: true,
      contextCharacterCount: compactMarkdown.markdown.length,
    };
  }
  const resultOverhead = JSON.stringify({
    ...result,
    contextMarkdown: '',
  }).length;
  if (resultOverhead + result.contextMarkdown.length > BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT) {
    const markdownLimit = Math.max(
      0,
      BRAND_BRAIN_CONTEXT_CHARACTER_LIMIT - resultOverhead,
    );
    result = {
      ...result,
      contextMarkdown: result.contextMarkdown.slice(0, markdownLimit),
      truncated: true,
      contextCharacterCount: markdownLimit,
    };
  }

  return result;
};

const buildSearchResultMarkdown = ({
  brandSlug,
  matches,
}: {
  brandSlug: string;
  matches: BrandBrainSearchOrReadMatch[];
}): string =>
  [
    `# Brand Brain Search/Read: ${brandSlug}`,
    '',
    `Matches: ${matches.length}`,
    ...matches.flatMap((match) => [
      '',
      `## ${match.canonicalPath}${
        match.sectionHeading ? ` / ${match.sectionHeading}` : ''
      }`,
      match.summary ? `Summary: ${match.summary}` : '',
      match.markdown ?? '[No markdown captured]',
    ]),
  ]
    .filter((line) => line !== '')
    .join('\n');

const matchFromPageMarkdown = ({
  page,
  markdown,
  sectionHeading,
  query,
  preserveTail,
}: {
  page: BrandBrainExecutorPageRecord;
  markdown: string;
  sectionHeading?: string;
  query?: string;
  preserveTail?: boolean;
}): BrandBrainSearchOrReadMatch => {
  const capped = query
    ? capMarkdownAroundQuery({
        markdown,
        query,
        limit: BODY_CHARACTER_LIMIT_PER_SEARCH_RESULT,
      })
    : preserveTail
      ? capMarkdownHeadAndTail({
          markdown,
          limit: BODY_CHARACTER_LIMIT_PER_SEARCH_RESULT,
        })
      : capMarkdown({
          markdown,
          limit: BODY_CHARACTER_LIMIT_PER_SEARCH_RESULT,
        });

  return {
    id: page.id,
    title: page.title,
    canonicalPath: normalizeCanonicalPath(page.canonicalPath),
    pageType: page.pageType,
    summary: page.summary,
    sectionHeading,
    markdown: capped.markdown,
    truncated: capped.truncated,
  };
};

export const searchOrReadBrandBrain = async ({
  input,
  store,
}: {
  input: BrandBrainSearchOrReadInput;
  store: BrandBrainExecutorStore;
}): Promise<BrandBrainSearchOrReadToolResult> => {
  const brandSlug = normalizeBrandSlug(input.brandNameOrSlug);
  if (!input.canonicalPath?.trim() && !input.query?.trim()) {
    throw new Error('Brand Brain search/read requires canonicalPath or query.');
  }

  const maxResults = Math.min(
    MAX_SEARCH_RESULT_LIMIT,
    Math.max(1, input.maxResults ?? DEFAULT_SEARCH_RESULT_LIMIT),
  );
  const rawPages = await store.listPagesByBrandSlug({ brandSlug });
  const brandPages = rawPages
    .filter((page) =>
      isBrandPath({ brandSlug, canonicalPath: page.canonicalPath }),
    )
    .sort((left, right) =>
      normalizeCanonicalPath(left.canonicalPath).localeCompare(
        normalizeCanonicalPath(right.canonicalPath),
      ),
    );
  const canonicalPath = input.canonicalPath
    ? brandScopedPath({ brandSlug, canonicalPath: input.canonicalPath })
    : undefined;
  const query = input.query?.trim();
  const matches: BrandBrainSearchOrReadMatch[] = [];

  if (canonicalPath) {
    const page = brandPages.find(
      (candidate) => normalizeCanonicalPath(candidate.canonicalPath) === canonicalPath,
    );

    if (page) {
      const markdown = page.body?.markdown?.trim() ?? '';
      const requestedSectionHeading = input.sectionHeading?.trim().toLowerCase();
      const matchedSection = requestedSectionHeading
        ? splitMarkdownSections(markdown).find(
            (section) =>
              section.heading?.toLowerCase() === requestedSectionHeading,
          )
        : query
          ? splitMarkdownSections(markdown).find((section) =>
              textMatchesQuery({ text: section.markdown, query }),
            )
          : undefined;

      matches.push(
        matchFromPageMarkdown({
          page,
          markdown: matchedSection?.markdown ?? markdown,
          sectionHeading: matchedSection?.heading,
          query,
          preserveTail: Boolean(matchedSection && requestedSectionHeading),
        }),
      );
    }
  } else if (query) {
    for (const page of brandPages) {
      if (['INDEX', 'LOG'].includes(page.pageType)) {
        continue;
      }

      const markdown = page.body?.markdown?.trim() ?? '';
      const matchedSection = splitMarkdownSections(markdown).find((section) =>
        textMatchesQuery({ text: section.markdown, query }),
      );

      if (matchedSection) {
        matches.push(
          matchFromPageMarkdown({
            page,
            markdown: matchedSection.markdown,
            sectionHeading: matchedSection.heading,
            query,
          }),
        );
      } else if (
        textMatchesQuery({ text: page.title, query }) ||
        textMatchesQuery({ text: page.summary, query }) ||
        textMatchesQuery({ text: page.canonicalPath, query })
      ) {
        matches.push(matchFromPageMarkdown({ page, markdown, query }));
      }

      if (matches.length >= maxResults) {
        break;
      }
    }
  }

  const limitedMatches = matches.slice(0, maxResults);

  return {
    brandSlug,
    canonicalPath,
    query,
    matchCount: limitedMatches.length,
    matches: limitedMatches,
    resultMarkdown: buildSearchResultMarkdown({
      brandSlug,
      matches: limitedMatches,
    }),
  };
};

export const updateBrandBrainPageContent = async ({
  input,
  store,
}: {
  input: BrandBrainUpdatePageContentInput;
  store: BrandBrainExecutorStore;
}): Promise<BrandBrainUpdatePageContentToolResult> => {
  const brandSlug = normalizeBrandSlug(input.brandNameOrSlug);
  const canonicalPath = brandScopedPath({
    brandSlug,
    canonicalPath: input.canonicalPath,
  });
  const rawPages = await store.listPagesByBrandSlug({ brandSlug });
  const brandPages = rawPages.filter((page) =>
    isBrandPath({ brandSlug, canonicalPath: page.canonicalPath }),
  );
  const targetPage = brandPages.find(
    (page) => normalizeCanonicalPath(page.canonicalPath) === canonicalPath,
  );

  if (!targetPage) {
    throw new Error(`Brand Brain page not found: ${canonicalPath}`);
  }

  if (['INDEX', 'LOG'].includes(targetPage.pageType)) {
    throw new Error(
      `Cannot update internal Brand Brain ${targetPage.pageType} page ${canonicalPath}. Use append-log behavior instead.`,
    );
  }

  if (hasBlockNoteOnlyContent(targetPage.body)) {
    throw new Error(
      `Cannot update Brand Brain page ${canonicalPath}: markdown is empty but blocknote has content.`,
    );
  }

  const pageAppend = appendMarkdownOnce({
    existingMarkdown: targetPage.body?.markdown,
    appendMarkdown: input.appendMarkdown,
    heading: 'Agent updates',
  });

  if (!pageAppend.changed) {
    return {
      brandSlug,
      canonicalPath,
      updated: false,
      logAppended: false,
      summaryMarkdown: `# Brand Brain page unchanged for \`${canonicalPath}\`\n\nThe requested content already exists.`,
    };
  }

  const logPath = `${brandSlug}/log`;
  const logPage = brandPages.find(
    (page) => normalizeCanonicalPath(page.canonicalPath) === logPath,
  );
  const logEntry = formatBrandBrainAgentLogEntry({
    action: 'update',
    summary: `Updated ${canonicalPath}`,
    actor: input.actor,
    source: 'brand-brain-update-page-content',
    reason: input.reason,
    changedPaths: [canonicalPath],
    occurredAt: input.occurredAt ?? new Date().toISOString().slice(0, 10),
  });
  let logAppend: { markdown: string; changed: boolean } | undefined;

  if (logPage) {
    if (hasBlockNoteOnlyContent(logPage.body)) {
      throw new Error(
        `Cannot append Brand Brain log ${logPath}: markdown is empty but blocknote has content.`,
      );
    }

    logAppend = appendMarkdownOnce({
      existingMarkdown: logPage.body?.markdown,
      appendMarkdown: logEntry,
    });
  }

  await store.updatePage({
    id: targetPage.id,
    patch: { body: buildRichTextBody(pageAppend.markdown) },
  });

  let logAppended = false;

  if (logPage && logAppend?.changed) {
    await store.updatePage({
      id: logPage.id,
      patch: { body: buildRichTextBody(logAppend.markdown) },
    });
    logAppended = true;
  }

  return {
    brandSlug,
    canonicalPath,
    updated: true,
    logAppended,
    summaryMarkdown: `# Brand Brain page updated\n\n- Path: ${canonicalPath}\n- Log appended: ${logAppended ? 'yes' : 'no'}`,
  };
};

export type BrandBrainPageStatus = 'DRAFT' | 'APPROVED' | 'STALE' | 'ARCHIVED';

export type BrandBrainPageType =
  | 'BRAND_ROOT'
  | 'FOLDER'
  | 'PAGE'
  | 'INDEX'
  | 'LOG'
  | 'SOURCE'
  | 'PROMPT'
  | 'PLAYBOOK';

export type BrandBrainPageRecord = {
  id: string;
  title: string;
  slug: string;
  canonicalPath: string;
  idPath?: string | null;
  parentPageId?: string | null;
  pageType: BrandBrainPageType;
  status: BrandBrainPageStatus;
  aliases?: string[] | null;
  sortOrder?: number | null;
};

export type BrandBrainPageCreateInput = {
  title: string;
  slug: string;
  parentPageId?: string | null;
  canonicalPath: string;
  aliases?: string[] | null;
};

export type PathResolutionResult = {
  page: BrandBrainPageRecord;
  ancestors: BrandBrainPageRecord[];
};

export type LogAppendInput = {
  summary: string;
  actor: string;
  targetPageIds?: string[];
  source?: string;
  reason?: string;
  occurredAt: string;
};

const normalizePath = (path: string): string =>
  path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');

export const normalizeSlug = (slug: string): string =>
  slug.trim().toLowerCase().replace(/\s+/g, '-');

export const buildCanonicalPath = ({
  parentCanonicalPath,
  slug,
}: {
  parentCanonicalPath?: string | null;
  slug: string;
}): string => {
  const normalizedSlug = normalizeSlug(slug);
  const normalizedParentPath = parentCanonicalPath
    ? normalizePath(parentCanonicalPath)
    : '';

  return normalizePath(
    [normalizedParentPath, normalizedSlug].filter(Boolean).join('/'),
  );
};

export const buildIdPath = ({
  parentIdPath,
  id,
}: {
  parentIdPath?: string | null;
  id: string;
}): string => normalizePath([parentIdPath, id].filter(Boolean).join('/'));

const buildPageById = (pages: BrandBrainPageRecord[]) =>
  new Map(pages.map((page) => [page.id, page]));

export const getAncestors = ({
  page,
  pages,
}: {
  page: BrandBrainPageRecord;
  pages: BrandBrainPageRecord[];
}): BrandBrainPageRecord[] => {
  const pageById = buildPageById(pages);
  const ancestors: BrandBrainPageRecord[] = [];
  const visited = new Set<string>();
  let currentParentId = page.parentPageId;

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      throw new Error(
        `Cycle detected in Brand Brain hierarchy at ${currentParentId}`,
      );
    }

    visited.add(currentParentId);
    const parentPage = pageById.get(currentParentId);

    if (!parentPage) {
      break;
    }

    ancestors.unshift(parentPage);
    currentParentId = parentPage.parentPageId;
  }

  return ancestors;
};

export const resolveBrandBrainPath = ({
  canonicalPath,
  pages,
}: {
  canonicalPath: string;
  pages: BrandBrainPageRecord[];
}): PathResolutionResult | null => {
  const normalizedPath = normalizePath(canonicalPath);
  const page = pages.find(
    (candidatePage) =>
      normalizePath(candidatePage.canonicalPath) === normalizedPath,
  );

  if (!page) {
    return null;
  }

  return { page, ancestors: getAncestors({ page, pages }) };
};

export const resolveBrandBrainIdPath = ({
  idPath,
  pages,
}: {
  idPath: string;
  pages: BrandBrainPageRecord[];
}): PathResolutionResult | null => {
  const normalizedIdPath = normalizePath(idPath);
  const page = pages.find(
    (candidatePage) =>
      normalizePath(candidatePage.idPath ?? '') === normalizedIdPath,
  );

  if (!page) {
    return null;
  }

  return { page, ancestors: getAncestors({ page, pages }) };
};

export const listBrandBrainChildren = ({
  parentPageId,
  pages,
}: {
  parentPageId?: string | null;
  pages: BrandBrainPageRecord[];
}): BrandBrainPageRecord[] =>
  pages
    .filter((page) => (page.parentPageId ?? null) === (parentPageId ?? null))
    .sort((leftPage, rightPage) => {
      const leftSortOrder = leftPage.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightSortOrder = rightPage.sortOrder ?? Number.MAX_SAFE_INTEGER;

      if (leftSortOrder !== rightSortOrder) {
        return leftSortOrder - rightSortOrder;
      }

      return leftPage.title.localeCompare(rightPage.title);
    });

export const findDuplicateSiblingSlug = ({
  input,
  pages,
}: {
  input: BrandBrainPageCreateInput;
  pages: BrandBrainPageRecord[];
}): BrandBrainPageRecord | null => {
  const normalizedSlug = normalizeSlug(input.slug);

  return (
    pages.find(
      (page) =>
        (page.parentPageId ?? null) === (input.parentPageId ?? null) &&
        normalizeSlug(page.slug) === normalizedSlug,
    ) ?? null
  );
};

export const findDuplicateCanonicalPath = ({
  input,
  pages,
}: {
  input: Pick<BrandBrainPageCreateInput, 'canonicalPath'>;
  pages: BrandBrainPageRecord[];
}): BrandBrainPageRecord | null => {
  const normalizedPath = normalizePath(input.canonicalPath);

  return (
    pages.find(
      (page) => normalizePath(page.canonicalPath) === normalizedPath,
    ) ?? null
  );
};

export const findAliasConflict = ({
  input,
  pages,
}: {
  input: BrandBrainPageCreateInput;
  pages: BrandBrainPageRecord[];
}): BrandBrainPageRecord | null => {
  const requestedCanonicalPath = normalizePath(
    input.canonicalPath.toLowerCase(),
  );
  const requestedAliases = new Set(
    (input.aliases ?? []).map((value) => normalizePath(value.toLowerCase())),
  );

  return (
    pages.find((page) => {
      const candidateAliases = (page.aliases ?? []).map((value) =>
        normalizePath(value.toLowerCase()),
      );
      const candidatePaths = [page.canonicalPath, ...candidateAliases].map(
        (value) => normalizePath(value.toLowerCase()),
      );

      return (
        candidateAliases.includes(requestedCanonicalPath) ||
        candidatePaths.some((candidatePath) =>
          requestedAliases.has(candidatePath),
        )
      );
    }) ?? null
  );
};

export const validateBrandBrainPageCreate = ({
  input,
  pages,
}: {
  input: BrandBrainPageCreateInput;
  pages: BrandBrainPageRecord[];
}): string[] => {
  const errors: string[] = [];

  if (!input.title.trim()) {
    errors.push('Title is required.');
  }

  if (!normalizeSlug(input.slug)) {
    errors.push('Slug is required.');
  }

  const duplicateSiblingSlug = findDuplicateSiblingSlug({ input, pages });

  if (duplicateSiblingSlug) {
    errors.push(`Sibling slug already exists on ${duplicateSiblingSlug.id}.`);
  }

  const duplicateCanonicalPath = findDuplicateCanonicalPath({ input, pages });

  if (duplicateCanonicalPath) {
    errors.push(
      `Canonical path already exists on ${duplicateCanonicalPath.id}.`,
    );
  }

  const aliasConflict = findAliasConflict({ input, pages });

  if (aliasConflict) {
    errors.push(`Alias conflicts with ${aliasConflict.id}.`);
  }

  return errors;
};

export const formatBrandBrainLogAppendEntry = ({
  summary,
  actor,
  targetPageIds = [],
  source,
  reason,
  occurredAt,
}: LogAppendInput): string => {
  const targetSuffix =
    targetPageIds.length > 0 ? `- Targets: ${targetPageIds.join(', ')}` : '';
  const sourceSuffix = source ? `- Source: ${source}` : '';
  const reasonSuffix = reason ? `- Reason: ${reason}` : '';

  return [
    `## [${occurredAt}] update | ${summary}`,
    `- Actor: ${actor}`,
    targetSuffix,
    sourceSuffix,
    reasonSuffix,
  ]
    .filter(Boolean)
    .join('\n');
};

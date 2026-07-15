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

export type BrandBrainPageRecord = { id: string; title: string; slug: string; canonicalPath: string; idPath?: string | null; parentPageId?: string | null; pageType: BrandBrainPageType; status: BrandBrainPageStatus; aliases?: string[] | null; sortOrder?: number | null };
export type BrandBrainPageCreateInput = { title: string; slug: string; parentPageId?: string | null; canonicalPath: string; aliases?: string[] | null };
export type PathResolutionResult = { page: BrandBrainPageRecord; ancestors: BrandBrainPageRecord[] };
export type LogAppendInput = { summary: string; actor: string; targetPageIds?: string[]; source?: string; reason?: string; occurredAt: string };

const normalizePath = (path: string): string => path.split('/').map((segment) => segment.trim()).filter(Boolean).join('/');
export const normalizeSlug = (slug: string): string => slug.trim().toLowerCase().replace(/\s+/g, '-');
export const buildCanonicalPath = ({ parentCanonicalPath, slug }: { parentCanonicalPath?: string | null; slug: string }): string => {
  const normalizedParentPath = parentCanonicalPath ? normalizePath(parentCanonicalPath) : '';
  return normalizePath([normalizedParentPath, normalizeSlug(slug)].filter(Boolean).join('/'));
};
export const buildIdPath = ({ parentIdPath, id }: { parentIdPath?: string | null; id: string }): string => normalizePath([parentIdPath, id].filter(Boolean).join('/'));
const buildPageById = (pages: BrandBrainPageRecord[]) => new Map(pages.map((page) => [page.id, page]));

export const getAncestors = ({ page, pages }: { page: BrandBrainPageRecord; pages: BrandBrainPageRecord[] }): BrandBrainPageRecord[] => {
  const pageById = buildPageById(pages);
  const ancestors: BrandBrainPageRecord[] = [];
  const visited = new Set<string>();
  let currentParentId = page.parentPageId;
  while (currentParentId) {
    if (visited.has(currentParentId)) throw new Error(`Cycle detected in Brand Brain hierarchy at ${currentParentId}`);
    visited.add(currentParentId);
    const parentPage = pageById.get(currentParentId);
    if (!parentPage) break;
    ancestors.unshift(parentPage);
    currentParentId = parentPage.parentPageId;
  }
  return ancestors;
};

export const resolveBrandBrainPath = ({ canonicalPath, pages }: { canonicalPath: string; pages: BrandBrainPageRecord[] }): PathResolutionResult | null => {
  const page = pages.find((candidatePage) => normalizePath(candidatePage.canonicalPath) === normalizePath(canonicalPath));
  return page ? { page, ancestors: getAncestors({ page, pages }) } : null;
};
export const resolveBrandBrainIdPath = ({ idPath, pages }: { idPath: string; pages: BrandBrainPageRecord[] }): PathResolutionResult | null => {
  const page = pages.find((candidatePage) => normalizePath(candidatePage.idPath ?? '') === normalizePath(idPath));
  return page ? { page, ancestors: getAncestors({ page, pages }) } : null;
};
export const listBrandBrainChildren = ({ parentPageId, pages }: { parentPageId?: string | null; pages: BrandBrainPageRecord[] }): BrandBrainPageRecord[] => pages.filter((page) => (page.parentPageId ?? null) === (parentPageId ?? null)).sort((leftPage, rightPage) => {
  const leftSortOrder = leftPage.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const rightSortOrder = rightPage.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return leftSortOrder === rightSortOrder ? leftPage.title.localeCompare(rightPage.title) : leftSortOrder - rightSortOrder;
});
export const findDuplicateSiblingSlug = ({ input, pages }: { input: BrandBrainPageCreateInput; pages: BrandBrainPageRecord[] }): BrandBrainPageRecord | null => pages.find((page) => (page.parentPageId ?? null) === (input.parentPageId ?? null) && normalizeSlug(page.slug) === normalizeSlug(input.slug)) ?? null;
export const findDuplicateCanonicalPath = ({ input, pages }: { input: Pick<BrandBrainPageCreateInput, 'canonicalPath'>; pages: BrandBrainPageRecord[] }): BrandBrainPageRecord | null => pages.find((page) => normalizePath(page.canonicalPath) === normalizePath(input.canonicalPath)) ?? null;
export const findAliasConflict = ({ input, pages }: { input: BrandBrainPageCreateInput; pages: BrandBrainPageRecord[] }): BrandBrainPageRecord | null => {
  const requestedCanonicalPath = normalizePath(input.canonicalPath.toLowerCase());
  const requestedAliases = new Set((input.aliases ?? []).map((value) => normalizePath(value.toLowerCase())));
  return pages.find((page) => {
    const candidateAliases = (page.aliases ?? []).map((value) => normalizePath(value.toLowerCase()));
    const candidatePaths = [page.canonicalPath, ...candidateAliases].map((value) => normalizePath(value.toLowerCase()));
    return candidateAliases.includes(requestedCanonicalPath) || candidatePaths.some((candidatePath) => requestedAliases.has(candidatePath));
  }) ?? null;
};
export const validateBrandBrainPageCreate = ({ input, pages }: { input: BrandBrainPageCreateInput; pages: BrandBrainPageRecord[] }): string[] => {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push('Title is required.');
  if (!normalizeSlug(input.slug)) errors.push('Slug is required.');
  const duplicateSiblingSlug = findDuplicateSiblingSlug({ input, pages });
  if (duplicateSiblingSlug) errors.push(`Sibling slug already exists on ${duplicateSiblingSlug.id}.`);
  const duplicateCanonicalPath = findDuplicateCanonicalPath({ input, pages });
  if (duplicateCanonicalPath) errors.push(`Canonical path already exists on ${duplicateCanonicalPath.id}.`);
  const aliasConflict = findAliasConflict({ input, pages });
  if (aliasConflict) errors.push(`Alias conflicts with ${aliasConflict.id}.`);
  return errors;
};
export const formatBrandBrainLogAppendEntry = ({ summary, actor, targetPageIds = [], source, reason, occurredAt }: LogAppendInput): string => [
  `## [${occurredAt}] update | ${summary}`,
  `- Actor: ${actor}`,
  targetPageIds.length > 0 ? `- Targets: ${targetPageIds.join(', ')}` : '',
  source ? `- Source: ${source}` : '',
  reason ? `- Reason: ${reason}` : '',
].filter(Boolean).join('\n');

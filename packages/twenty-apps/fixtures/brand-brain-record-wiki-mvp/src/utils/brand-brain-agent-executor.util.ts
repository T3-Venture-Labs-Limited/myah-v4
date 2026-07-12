import {
  type BrandBrainAgentLinkPlan,
  type BrandBrainAgentLogPlan,
  type BrandBrainAgentPageFillMissingPlan,
  type BrandBrainAgentPagePlan,
  type BrandBrainLinkType,
  type BrandBrainSeedInput,
  assertNoDestructiveBrandBrainOperations,
  buildBrandBrainSeedPlan,
  formatBrandBrainIndexMarkdown,
  normalizeBrandSlug,
} from 'src/utils/brand-brain-agent-memory.util';
import { type BrandBrainPageRecord } from 'src/utils/brand-brain-record-wiki.util';

export type BrandBrainRichTextBody = {
  markdown?: string | null;
  blocknote?: string | null;
};

export type BrandBrainExecutorPageRecord = BrandBrainPageRecord & {
  body?: BrandBrainRichTextBody | null;
  summary?: string | null;
  tags?: string[] | null;
};

export type BrandBrainExecutorLinkRecord = {
  id: string;
  name: string;
  sourcePageId: string;
  targetPageId: string;
  linkType: BrandBrainLinkType;
  description?: string | null;
};

export type BrandBrainExecutorPageCreateInput = {
  title: string;
  slug: string;
  canonicalPath: string;
  idPath?: string | null;
  parentPageId?: string | null;
  pageType: BrandBrainExecutorPageRecord['pageType'];
  status: BrandBrainExecutorPageRecord['status'];
  body?: BrandBrainRichTextBody | null;
  summary?: string | null;
  tags?: string[] | null;
  sortOrder?: number | null;
};

export type BrandBrainExecutorPageUpdatePatch = Partial<
  Pick<
    BrandBrainExecutorPageCreateInput,
    | 'title'
    | 'slug'
    | 'idPath'
    | 'parentPageId'
    | 'pageType'
    | 'status'
    | 'body'
    | 'summary'
    | 'tags'
    | 'sortOrder'
  >
>;

export type BrandBrainExecutorLinkCreateInput = {
  name: string;
  sourcePageId: string;
  targetPageId: string;
  linkType: BrandBrainLinkType;
  description: string;
};

export type BrandBrainExecutorLinkUpdatePatch = Partial<
  Pick<BrandBrainExecutorLinkCreateInput, 'name' | 'description'>
>;

export type BrandBrainExecutorStore = {
  listPagesByBrandSlug: (params: {
    brandSlug: string;
  }) => Promise<BrandBrainExecutorPageRecord[]>;
  createPage: (
    input: BrandBrainExecutorPageCreateInput,
  ) => Promise<BrandBrainExecutorPageRecord>;
  updatePage: (params: {
    id: string;
    patch: BrandBrainExecutorPageUpdatePatch;
  }) => Promise<BrandBrainExecutorPageRecord>;
  listLinksByBrandSlug: (params: {
    brandSlug: string;
  }) => Promise<BrandBrainExecutorLinkRecord[]>;
  createLink: (
    input: BrandBrainExecutorLinkCreateInput,
  ) => Promise<BrandBrainExecutorLinkRecord>;
  updateLink: (params: {
    id: string;
    patch: BrandBrainExecutorLinkUpdatePatch;
  }) => Promise<BrandBrainExecutorLinkRecord>;
};

export type BrandBrainExecutorAppliedOperation =
  | {
      operation: 'createPage';
      canonicalPath: string;
      pageId: string;
    }
  | {
      operation: 'fillMissingPage';
      canonicalPath: string;
      pageId: string;
      patchedFields: string[];
    }
  | {
      operation: 'refreshIndex';
      canonicalPath: string;
      pageId: string;
    }
  | {
      operation: 'appendLog';
      canonicalPath: string;
      pageId: string;
      skippedDuplicate?: true;
    }
  | {
      operation: 'createLink';
      sourcePath: string;
      targetPath: string;
      linkId: string;
    }
  | {
      operation: 'updateLink';
      sourcePath: string;
      targetPath: string;
      linkId: string;
      patchedFields: string[];
    };

export type BrandBrainExecutorSkippedOperation = {
  operation: string;
  reason: string;
  sourcePath?: string;
  targetPath?: string;
};

export type BrandBrainExecutorResult = {
  brandSlug: string;
  appliedOperations: BrandBrainExecutorAppliedOperation[];
  skippedOperations: BrandBrainExecutorSkippedOperation[];
  finalPages: BrandBrainExecutorPageRecord[];
};

type BlockNoteTextContent = {
  type: 'text';
  text: string;
  styles: Record<string, never>;
};

type BlockNoteParagraph = {
  id: string;
  type: 'paragraph';
  props: Record<string, never>;
  content: BlockNoteTextContent[];
  children: [];
};

const normalizeCanonicalPathForExecutor = (value: string): string =>
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

const stableBlockId = ({
  line,
  index,
}: {
  line: string;
  index: number;
}): string => {
  let hash = 0;

  for (
    let characterIndex = 0;
    characterIndex < line.length;
    characterIndex += 1
  ) {
    hash = (hash * 31 + line.charCodeAt(characterIndex)) >>> 0;
  }

  return `bb-${index}-${hash.toString(16)}`;
};

export const markdownToBlockNoteJson = (markdown: string): string => {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const nonEmptyLines = lines.length > 0 ? lines : [''];
  const blocks: BlockNoteParagraph[] = nonEmptyLines.map((line, index) => ({
    id: stableBlockId({ line, index }),
    type: 'paragraph',
    props: {},
    content: line
      ? [
          {
            type: 'text',
            text: line,
            styles: {},
          },
        ]
      : [],
    children: [],
  }));

  return JSON.stringify(blocks);
};

export const buildRichTextBody = (
  markdown: string,
): BrandBrainRichTextBody => ({
  markdown,
  blocknote: markdownToBlockNoteJson(markdown),
});

const isMissingValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
};

const exactBrandPathMatch = ({
  brandSlug,
  canonicalPath,
}: {
  brandSlug: string;
  canonicalPath: string;
}): boolean => {
  const normalizedPath = normalizeCanonicalPathForExecutor(canonicalPath);

  return (
    normalizedPath === brandSlug || normalizedPath.startsWith(`${brandSlug}/`)
  );
};

const buildPageMap = (pages: BrandBrainExecutorPageRecord[]) =>
  new Map(
    pages.map((page) => [
      normalizeCanonicalPathForExecutor(page.canonicalPath),
      page,
    ]),
  );

const detectDuplicateCanonicalPaths = (
  pages: BrandBrainExecutorPageRecord[],
): string[] => {
  const pageIdsByPath = new Map<string, string[]>();

  for (const page of pages) {
    const normalizedPath = normalizeCanonicalPathForExecutor(
      page.canonicalPath,
    );
    const existingIds = pageIdsByPath.get(normalizedPath) ?? [];
    pageIdsByPath.set(normalizedPath, [...existingIds, page.id]);
  }

  return Array.from(pageIdsByPath.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([path, ids]) => `${path}: ${ids.join(', ')}`);
};

const appendMarkdown = ({
  existingMarkdown,
  entryMarkdown,
}: {
  existingMarkdown?: string | null;
  entryMarkdown: string;
}): string => {
  if (!existingMarkdown?.trim()) {
    return entryMarkdown;
  }

  if (existingMarkdown.includes(entryMarkdown)) {
    return existingMarkdown;
  }

  return `${existingMarkdown.trim()}\n\n${entryMarkdown}`;
};

const blocknoteHasContent = (blocknote?: string | null): boolean => {
  if (!blocknote?.trim()) {
    return false;
  }

  try {
    const parsed = JSON.parse(blocknote) as Array<{ content?: unknown[] }>;

    return (
      Array.isArray(parsed) &&
      parsed.some((block) => (block.content ?? []).length > 0)
    );
  } catch {
    return true;
  }
};

const markdownForAppendOnlyLog = (
  page: BrandBrainExecutorPageRecord,
): string => {
  if (page.body?.markdown?.trim()) {
    return page.body.markdown;
  }

  if (blocknoteHasContent(page.body?.blocknote)) {
    throw new Error(
      `Cannot append Brand Brain log ${page.canonicalPath}: markdown is empty but blocknote has content. Refusing to overwrite rich text history.`,
    );
  }

  return '';
};

const computeIdPath = ({
  pageId,
  parentPage,
}: {
  pageId: string;
  parentPage?: BrandBrainExecutorPageRecord | null;
}): string => [parentPage?.idPath, pageId].filter(Boolean).join('/');

const buildLinkName = ({
  sourcePath,
  targetPath,
  linkType,
}: {
  sourcePath: string;
  targetPath: string;
  linkType: BrandBrainLinkType;
}): string => `${sourcePath} ${linkType.toLowerCase()} ${targetPath}`;

const buildFillMissingPatch = ({
  operation,
  existingPage,
  parentPage,
}: {
  operation: BrandBrainAgentPageFillMissingPlan;
  existingPage: BrandBrainExecutorPageRecord;
  parentPage?: BrandBrainExecutorPageRecord | null;
}): BrandBrainExecutorPageUpdatePatch => {
  const patch: BrandBrainExecutorPageUpdatePatch = {};
  const expectedIdPath = computeIdPath({
    pageId: existingPage.id,
    parentPage: parentPage ?? null,
  });

  if (isMissingValue(existingPage.title)) {
    patch.title = operation.title;
  }

  if (isMissingValue(existingPage.slug)) {
    patch.slug = operation.slug;
  }

  if (isMissingValue(existingPage.parentPageId) && parentPage) {
    patch.parentPageId = parentPage.id;
  }

  if (isMissingValue(existingPage.idPath) && expectedIdPath) {
    patch.idPath = expectedIdPath;
  }

  if (isMissingValue(existingPage.pageType)) {
    patch.pageType = operation.pageType;
  }

  if (isMissingValue(existingPage.status)) {
    patch.status = operation.status;
  }

  if (isMissingValue(existingPage.summary)) {
    patch.summary = operation.summary;
  }

  if (isMissingValue(existingPage.tags)) {
    patch.tags = operation.tags;
  }

  if (isMissingValue(existingPage.sortOrder)) {
    patch.sortOrder = operation.sortOrder;
  }

  return patch;
};

const hasPatch = (patch: Record<string, unknown>): boolean =>
  Object.keys(patch).length > 0;

const pageRecordsForIndex = (pages: BrandBrainExecutorPageRecord[]) =>
  pages.map((page) => ({
    title: page.title,
    canonicalPath: normalizeCanonicalPathForExecutor(page.canonicalPath),
    pageType: page.pageType,
    status: page.status,
    sortOrder: page.sortOrder,
  }));

const applyPageOperation = async ({
  operation,
  store,
  pagesByPath,
  appliedOperations,
}: {
  operation: BrandBrainAgentPagePlan;
  store: BrandBrainExecutorStore;
  pagesByPath: Map<string, BrandBrainExecutorPageRecord>;
  appliedOperations: BrandBrainExecutorAppliedOperation[];
}): Promise<void> => {
  const parentPage = operation.parentCanonicalPath
    ? pagesByPath.get(
        normalizeCanonicalPathForExecutor(operation.parentCanonicalPath),
      )
    : null;

  if (operation.parentCanonicalPath && !parentPage) {
    throw new Error(
      `Cannot apply Brand Brain page operation for ${operation.canonicalPath}: missing parent ${operation.parentCanonicalPath}`,
    );
  }

  if (operation.operation === 'createPage') {
    const createdPage = await store.createPage({
      title: operation.title,
      slug: operation.slug,
      canonicalPath: operation.canonicalPath,
      parentPageId: parentPage?.id ?? null,
      pageType: operation.pageType,
      status: operation.status,
      body: buildRichTextBody(operation.bodyMarkdown),
      summary: operation.summary,
      tags: operation.tags,
      sortOrder: operation.sortOrder,
    });
    const expectedIdPath = computeIdPath({
      pageId: createdPage.id,
      parentPage,
    });
    const pageWithIdPath = expectedIdPath
      ? await store.updatePage({
          id: createdPage.id,
          patch: { idPath: expectedIdPath },
        })
      : createdPage;

    pagesByPath.set(
      normalizeCanonicalPathForExecutor(operation.canonicalPath),
      pageWithIdPath,
    );
    appliedOperations.push({
      operation: 'createPage',
      canonicalPath: operation.canonicalPath,
      pageId: pageWithIdPath.id,
    });

    return;
  }

  const existingPage = pagesByPath.get(
    normalizeCanonicalPathForExecutor(operation.canonicalPath),
  );

  if (!existingPage) {
    throw new Error(
      `Cannot fill Brand Brain page ${operation.canonicalPath}: existing page not found`,
    );
  }

  const patch = buildFillMissingPatch({
    operation,
    existingPage,
    parentPage,
  });

  if (!hasPatch(patch)) {
    appliedOperations.push({
      operation: 'fillMissingPage',
      canonicalPath: operation.canonicalPath,
      pageId: existingPage.id,
      patchedFields: [],
    });

    return;
  }

  const updatedPage = await store.updatePage({ id: existingPage.id, patch });
  pagesByPath.set(
    normalizeCanonicalPathForExecutor(operation.canonicalPath),
    updatedPage,
  );
  appliedOperations.push({
    operation: 'fillMissingPage',
    canonicalPath: operation.canonicalPath,
    pageId: updatedPage.id,
    patchedFields: Object.keys(patch),
  });
};

const refreshIndex = async ({
  brandName,
  brandSlug,
  store,
  pagesByPath,
  appliedOperations,
}: {
  brandName: string;
  brandSlug: string;
  store: BrandBrainExecutorStore;
  pagesByPath: Map<string, BrandBrainExecutorPageRecord>;
  appliedOperations: BrandBrainExecutorAppliedOperation[];
}): Promise<void> => {
  const indexPath = `${brandSlug}/index`;
  const indexPage = pagesByPath.get(indexPath);

  if (!indexPage) {
    throw new Error(`Cannot refresh Brand Brain index: missing ${indexPath}`);
  }

  const finalPages = Array.from(pagesByPath.values()).filter((page) =>
    exactBrandPathMatch({ brandSlug, canonicalPath: page.canonicalPath }),
  );
  const indexMarkdown = formatBrandBrainIndexMarkdown({
    brandName,
    brandSlug,
    pages: pageRecordsForIndex(finalPages),
  });

  if (indexPage.body?.markdown === indexMarkdown) {
    return;
  }

  const updatedPage = await store.updatePage({
    id: indexPage.id,
    patch: { body: buildRichTextBody(indexMarkdown) },
  });
  pagesByPath.set(indexPath, updatedPage);
  appliedOperations.push({
    operation: 'refreshIndex',
    canonicalPath: indexPath,
    pageId: indexPage.id,
  });
};

const applyLinkOperation = async ({
  operation,
  store,
  pagesByPath,
  links,
  appliedOperations,
  skippedOperations,
}: {
  operation: BrandBrainAgentLinkPlan;
  store: BrandBrainExecutorStore;
  pagesByPath: Map<string, BrandBrainExecutorPageRecord>;
  links: BrandBrainExecutorLinkRecord[];
  appliedOperations: BrandBrainExecutorAppliedOperation[];
  skippedOperations: BrandBrainExecutorSkippedOperation[];
}): Promise<void> => {
  const sourcePage = pagesByPath.get(
    normalizeCanonicalPathForExecutor(operation.sourcePath),
  );
  const targetPage = pagesByPath.get(
    normalizeCanonicalPathForExecutor(operation.targetPath),
  );

  if (!sourcePage || !targetPage) {
    skippedOperations.push({
      operation: 'upsertLink',
      reason: !sourcePage ? 'missing source page' : 'missing target page',
      sourcePath: operation.sourcePath,
      targetPath: operation.targetPath,
    });

    return;
  }

  const existingLink = links.find(
    (link) =>
      link.sourcePageId === sourcePage.id &&
      link.targetPageId === targetPage.id &&
      link.linkType === operation.linkType,
  );
  const name = buildLinkName(operation);

  if (!existingLink) {
    const createdLink = await store.createLink({
      name,
      sourcePageId: sourcePage.id,
      targetPageId: targetPage.id,
      linkType: operation.linkType,
      description: operation.description,
    });

    links.push(createdLink);
    appliedOperations.push({
      operation: 'createLink',
      sourcePath: operation.sourcePath,
      targetPath: operation.targetPath,
      linkId: createdLink.id,
    });

    return;
  }

  const patch: BrandBrainExecutorLinkUpdatePatch = {};

  if (isMissingValue(existingLink.name)) {
    patch.name = name;
  }

  if (isMissingValue(existingLink.description)) {
    patch.description = operation.description;
  }

  if (!hasPatch(patch)) {
    return;
  }

  const updatedLink = await store.updateLink({ id: existingLink.id, patch });
  const existingLinkIndex = links.findIndex(
    (link) => link.id === existingLink.id,
  );
  links.splice(existingLinkIndex, 1, updatedLink);
  appliedOperations.push({
    operation: 'updateLink',
    sourcePath: operation.sourcePath,
    targetPath: operation.targetPath,
    linkId: updatedLink.id,
    patchedFields: Object.keys(patch),
  });
};

const appendLog = async ({
  operation,
  store,
  pagesByPath,
  appliedOperations,
}: {
  operation: BrandBrainAgentLogPlan;
  store: BrandBrainExecutorStore;
  pagesByPath: Map<string, BrandBrainExecutorPageRecord>;
  appliedOperations: BrandBrainExecutorAppliedOperation[];
}): Promise<void> => {
  const logPage = pagesByPath.get(
    normalizeCanonicalPathForExecutor(operation.logPath),
  );

  if (!logPage) {
    throw new Error(
      `Cannot append Brand Brain log: missing ${operation.logPath}`,
    );
  }

  const existingMarkdown = markdownForAppendOnlyLog(logPage);
  const nextMarkdown = appendMarkdown({
    existingMarkdown,
    entryMarkdown: operation.entryMarkdown,
  });

  if (nextMarkdown === existingMarkdown) {
    appliedOperations.push({
      operation: 'appendLog',
      canonicalPath: operation.logPath,
      pageId: logPage.id,
      skippedDuplicate: true,
    });

    return;
  }

  const updatedPage = await store.updatePage({
    id: logPage.id,
    patch: { body: buildRichTextBody(nextMarkdown) },
  });
  pagesByPath.set(
    normalizeCanonicalPathForExecutor(operation.logPath),
    updatedPage,
  );
  appliedOperations.push({
    operation: 'appendLog',
    canonicalPath: operation.logPath,
    pageId: logPage.id,
  });
};

export const applyBrandBrainSeedPlan = async ({
  input,
  store,
}: {
  input: BrandBrainSeedInput;
  store: BrandBrainExecutorStore;
}): Promise<BrandBrainExecutorResult> => {
  const brandSlug = normalizeBrandSlug(input.brandName);
  const existingPages = (
    await store.listPagesByBrandSlug({ brandSlug })
  ).filter((page) =>
    exactBrandPathMatch({ brandSlug, canonicalPath: page.canonicalPath }),
  );
  const duplicatePaths = detectDuplicateCanonicalPaths(existingPages);

  if (duplicatePaths.length > 0) {
    throw new Error(
      `Duplicate Brand Brain canonical paths detected: ${duplicatePaths.join('; ')}`,
    );
  }

  const plan = buildBrandBrainSeedPlan({ input, existingPages });

  assertNoDestructiveBrandBrainOperations(plan.operations);

  const pagesByPath = buildPageMap(existingPages);
  const appliedOperations: BrandBrainExecutorAppliedOperation[] = [];
  const skippedOperations: BrandBrainExecutorSkippedOperation[] = [];

  for (const operation of plan.operations) {
    if (
      operation.operation === 'createPage' ||
      operation.operation === 'fillMissingPage'
    ) {
      await applyPageOperation({
        operation,
        store,
        pagesByPath,
        appliedOperations,
      });
    }
  }

  await refreshIndex({
    brandName: input.brandName,
    brandSlug,
    store,
    pagesByPath,
    appliedOperations,
  });

  const links = await store.listLinksByBrandSlug({ brandSlug });

  for (const operation of plan.operations) {
    if (operation.operation === 'upsertLink') {
      await applyLinkOperation({
        operation,
        store,
        pagesByPath,
        links,
        appliedOperations,
        skippedOperations,
      });
    }
  }

  for (const operation of plan.operations) {
    if (operation.operation === 'appendLog') {
      await appendLog({ operation, store, pagesByPath, appliedOperations });
    }
  }

  return {
    brandSlug,
    appliedOperations,
    skippedOperations,
    finalPages: Array.from(pagesByPath.values()).filter((page) =>
      exactBrandPathMatch({ brandSlug, canonicalPath: page.canonicalPath }),
    ),
  };
};

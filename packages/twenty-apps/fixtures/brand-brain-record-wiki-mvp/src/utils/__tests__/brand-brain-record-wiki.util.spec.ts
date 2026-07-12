import { describe, expect, it } from 'vitest';

import {
  type BrandBrainPageRecord,
  buildCanonicalPath,
  buildIdPath,
  findAliasConflict,
  findDuplicateCanonicalPath,
  findDuplicateSiblingSlug,
  formatBrandBrainLogAppendEntry,
  listBrandBrainChildren,
  normalizeSlug,
  resolveBrandBrainIdPath,
  resolveBrandBrainPath,
  validateBrandBrainPageCreate,
} from 'src/utils/brand-brain-record-wiki.util';

const pages: BrandBrainPageRecord[] = [
  {
    id: 'kp_lashglow',
    title: 'Lashglow',
    slug: 'lashglow',
    canonicalPath: 'lashglow',
    idPath: 'kp_lashglow',
    parentPageId: null,
    pageType: 'BRAND_ROOT',
    status: 'APPROVED',
    sortOrder: 0,
  },
  {
    id: 'kp_products',
    title: 'Products',
    slug: 'products',
    canonicalPath: 'lashglow/products',
    idPath: 'kp_lashglow/kp_products',
    parentPageId: 'kp_lashglow',
    pageType: 'FOLDER',
    status: 'APPROVED',
    sortOrder: 2,
  },
  {
    id: 'kp_outreach',
    title: 'Outreach',
    slug: 'outreach',
    canonicalPath: 'lashglow/outreach',
    idPath: 'kp_lashglow/kp_outreach',
    parentPageId: 'kp_lashglow',
    pageType: 'FOLDER',
    status: 'APPROVED',
    sortOrder: 1,
  },
  {
    id: 'kp_lash_serum',
    title: 'Lash Serum',
    slug: 'lash-serum',
    canonicalPath: 'lashglow/products/lash-serum',
    idPath: 'kp_lashglow/kp_products/kp_lash_serum',
    parentPageId: 'kp_products',
    pageType: 'PAGE',
    status: 'APPROVED',
    aliases: ['lashglow/catalog/lash-serum-alt'],
    sortOrder: 0,
  },
];

describe('brand brain record wiki utilities', () => {
  it('normalizes slug and builds readable paths', () => {
    expect(normalizeSlug(' Products ')).toBe('products');
    expect(
      buildCanonicalPath({
        parentCanonicalPath: 'lashglow/',
        slug: ' Lash Serum ',
      }),
    ).toBe('lashglow/lash-serum');
    expect(
      buildIdPath({ parentIdPath: 'kp_lashglow', id: 'kp_products' }),
    ).toBe('kp_lashglow/kp_products');
  });

  it('resolves readable canonical paths with ancestors', () => {
    const result = resolveBrandBrainPath({
      canonicalPath: '/lashglow/products/lash-serum/',
      pages,
    });

    expect(result?.page.id).toBe('kp_lash_serum');
    expect(result?.ancestors.map((ancestor) => ancestor.id)).toEqual([
      'kp_lashglow',
      'kp_products',
    ]);
  });

  it('resolves machine-stable ID paths with ancestors', () => {
    const result = resolveBrandBrainIdPath({
      idPath: 'kp_lashglow/kp_products/kp_lash_serum',
      pages,
    });

    expect(result?.page.canonicalPath).toBe('lashglow/products/lash-serum');
    expect(result?.ancestors.map((ancestor) => ancestor.title)).toEqual([
      'Lashglow',
      'Products',
    ]);
  });

  it('returns null for missing readable and ID paths', () => {
    expect(
      resolveBrandBrainPath({ canonicalPath: 'missing/path', pages }),
    ).toBeNull();
    expect(
      resolveBrandBrainIdPath({ idPath: 'missing/id/path', pages }),
    ).toBeNull();
  });

  it('throws on hierarchy cycles instead of hanging resolution', () => {
    const cyclicPages: BrandBrainPageRecord[] = [
      {
        ...pages[0],
        parentPageId: 'kp_lash_serum',
      },
      ...pages.slice(1),
    ];

    expect(() =>
      resolveBrandBrainPath({
        canonicalPath: 'lashglow/products/lash-serum',
        pages: cyclicPages,
      }),
    ).toThrow('Cycle detected in Brand Brain hierarchy');
  });

  it('lists children by sort order then title', () => {
    expect(
      listBrandBrainChildren({ parentPageId: 'kp_lashglow', pages }).map(
        (page) => page.id,
      ),
    ).toEqual(['kp_outreach', 'kp_products']);
  });

  it('detects duplicate sibling slugs but allows same slug in another parent', () => {
    expect(
      findDuplicateSiblingSlug({
        input: {
          title: 'Duplicate',
          slug: 'Products',
          parentPageId: 'kp_lashglow',
          canonicalPath: 'lashglow/products-2',
        },
        pages,
      })?.id,
    ).toBe('kp_products');

    expect(
      findDuplicateSiblingSlug({
        input: {
          title: 'Allowed',
          slug: 'Products',
          parentPageId: 'kp_outreach',
          canonicalPath: 'lashglow/outreach/products',
        },
        pages,
      }),
    ).toBeNull();
  });

  it('detects duplicate canonical paths and alias conflicts', () => {
    expect(
      findDuplicateCanonicalPath({
        input: { canonicalPath: 'lashglow/products/lash-serum' },
        pages,
      })?.id,
    ).toBe('kp_lash_serum');

    expect(
      findAliasConflict({
        input: {
          title: 'Alias collision',
          slug: 'new-page',
          canonicalPath: 'lashglow/new-page',
          aliases: ['lashglow/catalog/lash-serum-alt'],
        },
        pages,
      })?.id,
    ).toBe('kp_lash_serum');

    expect(
      findAliasConflict({
        input: {
          title: 'Canonical path collides with alias',
          slug: 'lash-serum-alt',
          canonicalPath: 'lashglow/catalog/lash-serum-alt',
        },
        pages,
      })?.id,
    ).toBe('kp_lash_serum');
  });

  it('validates page creation without silently allowing wiki path conflicts', () => {
    expect(
      validateBrandBrainPageCreate({
        input: {
          title: '',
          slug: 'products',
          parentPageId: 'kp_lashglow',
          canonicalPath: 'lashglow/products',
          aliases: ['lashglow/catalog/lash-serum-alt'],
        },
        pages,
      }),
    ).toEqual([
      'Title is required.',
      'Sibling slug already exists on kp_products.',
      'Canonical path already exists on kp_products.',
      'Alias conflicts with kp_lash_serum.',
    ]);
  });

  it('formats V1 log append entries for the special Log page body', () => {
    expect(
      formatBrandBrainLogAppendEntry({
        occurredAt: '2026-07-06',
        summary: 'Added Lashglow product note',
        actor: 'agent',
        targetPageIds: ['kp_lash_serum'],
        source: 'agent-observation',
        reason: 'Useful product context for future affiliate and creator work',
      }),
    ).toBe(
      [
        '## [2026-07-06] update | Added Lashglow product note',
        '- Actor: agent',
        '- Targets: kp_lash_serum',
        '- Source: agent-observation',
        '- Reason: Useful product context for future affiliate and creator work',
      ].join('\n'),
    );
  });
});

import type * as Linaria from '@linaria/react';

type RecordIndexSurfaceStyleTestGlobal = typeof globalThis & {
  __recordIndexSurfaceStyledTemplates?: string[];
};

jest.mock('@linaria/react', () => {
  const actual = jest.requireActual<typeof Linaria>('@linaria/react');
  const styled = new Proxy(actual.styled, {
    get: (target, property, receiver) => {
      const styledTag = Reflect.get(target, property, receiver);

      if (typeof styledTag !== 'function') {
        return styledTag;
      }

      return (
        strings: TemplateStringsArray,
        ...interpolations: readonly unknown[]
      ) => {
        const template = strings.reduce(
          (result, string, index) =>
            `${result}${string}${String(interpolations[index] ?? '')}`,
          '',
        );
        const testGlobal = globalThis as RecordIndexSurfaceStyleTestGlobal;
        testGlobal.__recordIndexSurfaceStyledTemplates ??= [];
        testGlobal.__recordIndexSurfaceStyledTemplates.push(template);

        return styledTag(strings, ...interpolations);
      };
    },
  });

  return { ...actual, styled };
});

jest.mock(
  '@/object-record/record-index/components/RecordIndexContainer',
  () => ({
    RecordIndexContainer: () => null,
  }),
);

import '@/object-record/record-index/components/RecordIndexSurface';

describe('RecordIndexSurface containment', () => {
  it('lets an embedded flex item shrink while preserving table-wide overflow', () => {
    const templates = (globalThis as RecordIndexSurfaceStyleTestGlobal)
      .__recordIndexSurfaceStyledTemplates;
    const indexContainerTemplate = templates?.find(
      (template) =>
        template.includes('display: flex;') &&
        template.includes('flex: 1;') &&
        template.includes('min-height: 0;') &&
        !template.includes('flex-direction:'),
    );

    expect(indexContainerTemplate).toContain('min-width: 0;');
    expect(indexContainerTemplate).toContain('width: 100%;');
    expect(indexContainerTemplate).not.toContain('overflow: hidden;');
  });
});

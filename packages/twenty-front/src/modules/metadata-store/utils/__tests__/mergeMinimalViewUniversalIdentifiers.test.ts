import { mergeMinimalViewUniversalIdentifiers } from '@/metadata-store/utils/mergeMinimalViewUniversalIdentifiers';
import { ViewType } from 'twenty-shared/types';

describe('mergeMinimalViewUniversalIdentifiers', () => {
  it('hydrates an identifier into a previously cached View', () => {
    const cachedView = {
      id: 'runtime-view-id',
      name: 'Campaign Influencers',
      objectMetadataId: 'campaign-creator-object',
      type: ViewType.TABLE_WIDGET,
    };

    expect(
      mergeMinimalViewUniversalIdentifiers({
        currentViews: [cachedView] as never,
        minimalViews: [
          {
            id: 'runtime-view-id',
            objectMetadataId: 'campaign-creator-object',
            type: ViewType.TABLE_WIDGET,
            key: null,
            universalIdentifier: 'b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b',
          },
        ] as never,
      }),
    ).toEqual([
      {
        ...cachedView,
        universalIdentifier: 'b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b',
      },
    ]);
  });

  it('leaves cached Views unchanged when minimal metadata has no match', () => {
    const cachedView = {
      id: 'other-view-id',
      name: 'Other View',
      objectMetadataId: 'campaign-creator-object',
      type: ViewType.TABLE,
    };

    expect(
      mergeMinimalViewUniversalIdentifiers({
        currentViews: [cachedView] as never,
        minimalViews: [] as never,
      }),
    ).toEqual([cachedView]);
  });
});

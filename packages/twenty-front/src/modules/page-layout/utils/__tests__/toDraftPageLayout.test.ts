import { type PageLayout } from '@/page-layout/types/PageLayout';
import { toDraftPageLayout } from '@/page-layout/utils/toDraftPageLayout';
import { PageLayoutType } from '~/generated-metadata/graphql';

describe('toDraftPageLayout', () => {
  it('retains the source-controlled layout identity', () => {
    const pageLayout: PageLayout = {
      createdAt: '2026-07-31T00:00:00.000Z',
      id: 'workspace-layout-id',
      universalIdentifier: 'source-controlled-layout-id',
      name: 'Campaign Record Page',
      type: PageLayoutType.RECORD_PAGE,
      objectMetadataId: 'campaign-object-id',
      tabs: [],
      updatedAt: '2026-07-31T00:00:00.000Z',
      defaultTabToFocusOnMobileAndSidePanelId: null,
    };

    expect(toDraftPageLayout(pageLayout)).toMatchObject({
      id: 'workspace-layout-id',
      universalIdentifier: 'source-controlled-layout-id',
    });
  });
});

import { MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

describe('MYAH Campaign page layout', () => {
  it('places Influencers immediately after Tasks and uses CampaignCreator rows', () => {
    const tabs = Object.values(MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs);
    expect(tabs.map(({ title }) => title)).toEqual([
      'Campaign information',
      'Tasks',
      'Influencers',
      'Notes',
      'Agent',
      'Operations',
    ]);
    const influencers = MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.influencers.widgets.influencers;
    expect(influencers.type).toBe(WidgetType.RECORD_TABLE);
    expect(influencers.objectUniversalIdentifier).toBe(
      MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    );
  });

  it('keeps Creator Lists in Campaign information', () => {
    expect(
      MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.overview.widgets.creatorLists.title,
    ).toBe('Creator Lists');
  });
});

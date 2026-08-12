import { MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

describe('MYAH Campaign page layout', () => {
  it('places Influencers immediately after Tasks and uses CampaignCreator rows', () => {
    const tabs = Object.values(MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs);
    const { influencers } =
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.influencers.widgets;
    expect(tabs.map(({ title }) => title)).toEqual([
      'Home',
      'Outreach',
      'Tasks',
      'Influencers',
      'Notes',
      'Agent',
      'Operations',
    ]);
    expect(influencers.type).toBe(WidgetType.FIELD);
    expect(influencers.fieldUniversalIdentifier).toBe(
      MYAH_STANDARD_OBJECTS.campaign.fields.campaignCreators
        .universalIdentifier,
    );
    expect(influencers.viewUniversalIdentifier).toBe(
      MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
        .universalIdentifier,
    );
  });

  it('keeps Creator Lists in Campaign Home', () => {
    expect(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.home.widgets.creatorLists
        .title,
    ).toBe('Creator Lists');
  });
});

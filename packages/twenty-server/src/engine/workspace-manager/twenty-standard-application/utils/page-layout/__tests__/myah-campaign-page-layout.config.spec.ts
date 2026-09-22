import {
  ALL_STANDARD_PAGE_LAYOUTS,
  MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG,
  MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG,
  MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG,
  MYAH_CREATOR_PAGE_LAYOUT_CONFIG,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-page-layout.config';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

describe('MYAH retained page layouts', () => {
  it('keeps stable Creator, Creator List, and Campaign identifiers without Brand Brain', () => {
    expect(MYAH_CREATOR_PAGE_LAYOUT_CONFIG.universalIdentifier).toBe(
      '65e152d0-e162-4ece-8b84-e6e223065a14',
    );
    expect(MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG.universalIdentifier).toBe(
      'c8952254-5bf9-43a5-baab-98666f9b444d',
    );
    expect(MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.universalIdentifier).toBe(
      'ad261155-3c89-436d-8898-3e52d8b37632',
    );
    expect(ALL_STANDARD_PAGE_LAYOUTS).not.toHaveProperty(
      'brandBrainPageRecordPage',
    );
  });

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

  it('does not include Creator Lists in Campaign Home', () => {
    expect(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.home.widgets,
    ).not.toHaveProperty('creatorLists');
  });

  it('reuses Campaign Home without an empty audience override', () => {
    expect(MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.home).toBe(
      MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.home,
    );
  });
});

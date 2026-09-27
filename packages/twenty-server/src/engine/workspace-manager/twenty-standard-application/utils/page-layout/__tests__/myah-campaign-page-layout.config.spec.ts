import {
  MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG,
  MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

describe('MYAH Campaign page layout', () => {
  it('opens Influencers as the operational home while preserving native campaign destinations and stable IDs', () => {
    const tabs = Object.values(MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs);
    const { influencers } =
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.influencers.widgets;
    expect(tabs.map(({ title }) => title)).toEqual([
      'Campaign',
      'Influencers',
      'Outreach',
      'Agent',
      'Settings',
      'Tasks',
      'Notes',
    ]);
    expect(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.defaultTabUniversalIdentifier,
    ).toBe('04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596');
    expect(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.home.universalIdentifier,
    ).toBe('8482a6bc-bc2a-4f2d-8296-6d951f681c4f');
    expect(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.tasks.widgets.tasks.type,
    ).toBe(WidgetType.TASKS);
    expect(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.notes.widgets.notes.type,
    ).toBe(WidgetType.NOTES);
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

  it('preserves the pinned Campaign fields widget and Home identity', () => {
    expect(MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.home).toMatchObject({
      universalIdentifier:
        MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.home.universalIdentifier,
      widgets: MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.home.widgets,
    });
    // Desktop native layout pins the first sorted tab and activates the first remaining tab.
    const [pinned, firstActive] = Object.values(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs,
    ).sort((a, b) => a.position - b.position);
    expect(pinned.universalIdentifier).toBe(
      '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
    );
    expect(firstActive.universalIdentifier).toBe(
      '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    );
  });
});

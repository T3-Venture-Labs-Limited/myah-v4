import { PageLayoutTabLayoutMode } from 'twenty-shared/types';

import { STANDARD_PAGE_LAYOUTS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-page-layout.constant';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { GRID_POSITIONS, CANVAS_LAYOUT_POSITIONS, VERTICAL_LIST_LAYOUT_POSITIONS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-page-layout-tabs.template';
import { type StandardPageLayoutConfig } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-page-layout-config.type';

export const MYAH_BRAND_BRAIN_PAGE_LAYOUT_CONFIG = {
  name: 'Brand Brain Page Record Page',
  type: PageLayoutType.RECORD_PAGE,
  universalIdentifier: 'c8e159f8-1815-4138-9203-c29f59703386',
  objectUniversalIdentifier: '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
  defaultTabUniversalIdentifier: null,
  tabs: {
    fields: {
      universalIdentifier: '221532a5-ac54-4a46-ae75-88e095f4633f',
      title: 'Fields',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: 'ca066d67-d7a5-4951-9674-8a25d5710387',
          title: 'Fields',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
        },
      },
    },
    timeline: {
      universalIdentifier: '74e295f0-ea2e-4c47-b1b4-6d9a77f8ebc9',
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        timeline: {
          universalIdentifier: '10aef0fb-a7dd-49d2-b818-5f167ba29091',
          title: 'Timeline',
          type: WidgetType.TIMELINE,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    notes: {
      universalIdentifier: '14a3d605-51dc-4197-99b6-1f8415316ac1',
      title: 'Notes',
      position: 30,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        notes: {
          universalIdentifier: '8c7fb069-9866-4333-895b-5e5ad5d2d835',
          title: 'Notes',
          type: WidgetType.NOTES,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
  },
} as const satisfies StandardPageLayoutConfig;

export const ALL_STANDARD_PAGE_LAYOUTS = {
  ...STANDARD_PAGE_LAYOUTS,
  brandBrainPageRecordPage: MYAH_BRAND_BRAIN_PAGE_LAYOUT_CONFIG,
} as const;

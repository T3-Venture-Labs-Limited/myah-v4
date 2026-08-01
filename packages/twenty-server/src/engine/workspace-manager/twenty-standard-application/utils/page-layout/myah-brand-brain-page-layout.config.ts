import { PageLayoutTabLayoutMode } from 'twenty-shared/types';

import { STANDARD_PAGE_LAYOUTS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-page-layout.constant';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import {
  GRID_POSITIONS,
  CANVAS_LAYOUT_POSITIONS,
  VERTICAL_LIST_LAYOUT_POSITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-page-layout-tabs.template';
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

export const MYAH_CREATOR_PAGE_LAYOUT_CONFIG = {
  name: 'Creator Record Page',
  type: PageLayoutType.RECORD_PAGE,
  universalIdentifier: '65e152d0-e162-4ece-8b84-e6e223065a14',
  objectUniversalIdentifier: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
  defaultTabUniversalIdentifier: '551208dc-215c-4a16-bd6f-500e0d4f9128',
  tabs: {
    home: {
      universalIdentifier: '551208dc-215c-4a16-bd6f-500e0d4f9128',
      title: 'Home',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: '9b6cb66e-3a74-4c7a-9a52-481fb9497c2e',
          title: 'Creator details',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
        },
      },
    },
    timeline: {
      universalIdentifier: 'e5251ece-e1a7-468a-979b-5f174a3884bf',
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        timeline: {
          universalIdentifier: '8e82ee16-5e12-4f6f-bf42-e8daed7cb619',
          title: 'Timeline',
          type: WidgetType.TIMELINE,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    tasks: {
      universalIdentifier: '4e2d9bed-db7d-4f42-a7f3-6bdc55a797e2',
      title: 'Tasks',
      position: 30,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        tasks: {
          universalIdentifier: '9a965ec0-9fca-4b88-bd4d-78930ce870ce',
          title: 'Tasks',
          type: WidgetType.TASKS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    notes: {
      universalIdentifier: '896a70bf-17a6-4689-8a99-3ab4c51e912b',
      title: 'Notes',
      position: 40,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        notes: {
          universalIdentifier: '02b3dd33-16d2-4334-9ba7-5ecba705d797',
          title: 'Notes',
          type: WidgetType.NOTES,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    files: {
      universalIdentifier: 'be53f49d-9389-4c0b-b42c-003ca6c8213e',
      title: 'Files',
      position: 50,
      icon: 'IconFile',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        files: {
          universalIdentifier: 'acc7a6b4-55c2-45c9-a609-c8f84ef9c4d7',
          title: 'Files',
          type: WidgetType.FILES,
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
  creatorRecordPage: MYAH_CREATOR_PAGE_LAYOUT_CONFIG,
} as const;

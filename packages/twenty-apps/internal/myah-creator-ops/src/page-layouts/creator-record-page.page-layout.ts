import { PageLayoutTabLayoutMode, definePageLayout } from 'twenty-sdk/define';

import {
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
  CREATOR_RECORD_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS,
  CREATOR_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  CREATOR_RECORD_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: CREATOR_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  name: 'Creator Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS.home,
      title: 'Home',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier:
            CREATOR_RECORD_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS.fields,
          title: 'Creator details',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier:
              CREATOR_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
          },
        },
      ],
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS.timeline,
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier:
            CREATOR_RECORD_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS.timeline,
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: { configurationType: 'TIMELINE' },
        },
      ],
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS.tasks,
      title: 'Tasks',
      position: 30,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier:
            CREATOR_RECORD_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS.tasks,
          title: 'Tasks',
          type: 'TASKS',
          configuration: { configurationType: 'TASKS' },
        },
      ],
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS.notes,
      title: 'Notes',
      position: 40,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier:
            CREATOR_RECORD_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS.notes,
          title: 'Notes',
          type: 'NOTES',
          configuration: { configurationType: 'NOTES' },
        },
      ],
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS.files,
      title: 'Files',
      position: 50,
      icon: 'IconFile',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier:
            CREATOR_RECORD_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS.files,
          title: 'Files',
          type: 'FILES',
          configuration: { configurationType: 'FILES' },
        },
      ],
    },
  ],
});

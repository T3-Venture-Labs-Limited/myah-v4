import { PageLayoutTabLayoutMode, definePageLayout } from 'twenty-sdk/define';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
import { BRAND_BRAIN_PAGE_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER } from 'src/views/brand-brain-page-record-page-fields.view';
export default definePageLayout({
  universalIdentifier: 'c8e159f8-1815-4138-9203-c29f59703386',
  name: 'Brand Brain Page Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      universalIdentifier: '221532a5-ac54-4a46-ae75-88e095f4633f',
      title: 'Fields',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: 'ca066d67-d7a5-4951-9674-8a25d5710387',
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier:
              BRAND_BRAIN_PAGE_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
          },
        },
      ],
    },
    {
      universalIdentifier: '74e295f0-ea2e-4c47-b1b4-6d9a77f8ebc9',
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '10aef0fb-a7dd-49d2-b818-5f167ba29091',
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: { configurationType: 'TIMELINE' },
        },
      ],
    },
    {
      universalIdentifier: '14a3d605-51dc-4197-99b6-1f8415316ac1',
      title: 'Notes',
      position: 30,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '8c7fb069-9866-4333-895b-5e5ad5d2d835',
          title: 'Notes',
          type: 'NOTES',
          configuration: { configurationType: 'NOTES' },
        },
      ],
    },
  ],
});

import { ViewType, defineView } from 'twenty-sdk/define';
import {
  BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_PAGE_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/objects/brand-brain-page.object';
export const ALL_BRAND_BRAIN_PAGES_VIEW_UNIVERSAL_IDENTIFIER =
  '914bd2ad-17e0-48f2-a6da-38f94b92be9d';
export default defineView({
  universalIdentifier: ALL_BRAND_BRAIN_PAGES_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'All Brand Brain',
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  icon: 'IconNotebook',
  position: 0,
  fields: [
    {
      universalIdentifier: '7c821735-92b0-417a-a4c6-b1c2d940a813',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 0,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: 'fa092416-394c-4d01-8252-452249e445c2',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
      size: 260,
    },
    {
      universalIdentifier: 'b57ef565-d393-4777-921c-5aa0a2166033',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_PAGE_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: '3a621e09-bc66-4881-aa7c-d1ed0086de82',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 300,
    },
  ],
});

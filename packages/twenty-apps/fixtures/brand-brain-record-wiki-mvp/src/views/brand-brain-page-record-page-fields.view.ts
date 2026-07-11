import { ViewType, defineView } from 'twenty-sdk/define';

import {
  BRAND_BRAIN_PAGE_CHILD_PAGES_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_PARENT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/fields/child-pages-on-brand-brain-page.field';
import { BRAND_BRAIN_PAGE_SOURCE_LINKS_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/source-page-links-on-brand-brain-page.field';
import { BRAND_BRAIN_PAGE_TARGET_LINKS_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/target-page-links-on-brand-brain-page.field';
import {
  BRAND_BRAIN_PAGE_BODY_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_ID_PATH_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_PAGE_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_SLUG_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/objects/brand-brain-page.object';

export const BRAND_BRAIN_PAGE_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER =
  '2774101b-3c0b-485b-91f5-b92d30bdcb6e';

export default defineView({
  universalIdentifier:
    BRAND_BRAIN_PAGE_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Brand Brain Page Record Fields',
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.FIELDS_WIDGET,
  fields: [
    {
      universalIdentifier: 'cecbfcb2-318d-48b0-ab64-59a25fb213e5',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier: 'cb99eb49-2960-4b98-b4f0-ef70add64f79',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_SLUG_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier: '668d5313-ddc4-4815-93f9-d8f60b4fa550',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
    },
    {
      universalIdentifier: 'c42cf06d-eaae-4bfe-8108-20887dd0d8c4',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_ID_PATH_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
    },
    {
      universalIdentifier: 'f0b70304-4119-4a91-aef6-9d7108a332fe',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_PAGE_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
    },
    {
      universalIdentifier: '5658f977-d711-46ce-8563-a73dbe6a8d0b',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 5,
      isVisible: true,
    },
    {
      universalIdentifier: '79c4d8b0-f4bb-43ff-bb06-c4d374be9130',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_BODY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 6,
      isVisible: true,
    },
    {
      universalIdentifier: 'c3bde970-bc8e-41d5-bad0-b710c548496d',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_PARENT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 7,
      isVisible: true,
    },
    {
      universalIdentifier: '16f5c397-468a-47c0-b704-a850d11e87a0',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_CHILD_PAGES_FIELD_UNIVERSAL_IDENTIFIER,
      position: 8,
      isVisible: true,
    },
    {
      universalIdentifier: 'cbdac244-5a78-4ff0-a28a-011b444b9412',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_SOURCE_LINKS_FIELD_UNIVERSAL_IDENTIFIER,
      position: 9,
      isVisible: true,
    },
    {
      universalIdentifier: '4f02dd57-6875-449b-a0c5-e6ca23f8f53b',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_PAGE_TARGET_LINKS_FIELD_UNIVERSAL_IDENTIFIER,
      position: 10,
      isVisible: true,
    },
  ],
});

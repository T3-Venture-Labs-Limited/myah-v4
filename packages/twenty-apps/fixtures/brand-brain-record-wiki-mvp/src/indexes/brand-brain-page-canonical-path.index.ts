import { defineIndex } from 'twenty-sdk/define';
import {
  BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/objects/brand-brain-page.object';
export default defineIndex({
  universalIdentifier: 'b75fa72e-7365-4da0-a910-b6ef96f306c2',
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: '30cf8266-372a-44b7-bdf5-f1188b168d6a',
      fieldUniversalIdentifier:
        BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER,
    },
  ],
});

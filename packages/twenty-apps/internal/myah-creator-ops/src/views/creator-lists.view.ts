import { ViewType, defineView } from 'twenty-sdk/define';

import {
  CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LISTS_VIEW_UNIVERSAL_IDENTIFIER,
  CREATOR_LISTS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: CREATOR_LISTS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Creator Lists',
  icon: 'IconListDetails',
  objectUniversalIdentifier: CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  position: 0,
  fields: [
    {
      universalIdentifier: CREATOR_LISTS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.name,
      fieldMetadataUniversalIdentifier: CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.name,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: CREATOR_LISTS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.source,
      fieldMetadataUniversalIdentifier: CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.source,
      position: 1,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATOR_LISTS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.description,
      fieldMetadataUniversalIdentifier: CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.description,
      position: 2,
      isVisible: true,
      size: 220,
    },
  ],
});

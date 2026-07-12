import { FieldType, RelationType, defineObject } from 'twenty-sdk/define';

import {
  OFFER_FIELD_UNIVERSAL_IDENTIFIERS,
  OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS,
  PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'promotedAsset',
  namePlural: 'promotedAssets',
  labelSingular: 'Promoted Asset',
  labelPlural: 'Promoted Assets',
  description: 'A product, app, offer, or asset promoted by creators',
  icon: 'IconPackage',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    { universalIdentifier: PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS.name, type: FieldType.TEXT, name: 'name', label: 'Name', icon: 'IconTag', defaultValue: "''" },
    { universalIdentifier: PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS.assetType, type: FieldType.TEXT, name: 'assetType', label: 'Asset type', icon: 'IconCategory', isNullable: true },
    { universalIdentifier: PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS.url, type: FieldType.TEXT, name: 'url', label: 'URL', icon: 'IconLink', isNullable: true },
    { universalIdentifier: PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS.description, type: FieldType.TEXT, name: 'description', label: 'Description', icon: 'IconFileDescription', isNullable: true },
    {
      universalIdentifier: PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS.offers,
      type: FieldType.RELATION,
      name: 'offers',
      label: 'Offers',
      icon: 'IconGift',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OFFER_FIELD_UNIVERSAL_IDENTIFIERS.promotedAsset,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});

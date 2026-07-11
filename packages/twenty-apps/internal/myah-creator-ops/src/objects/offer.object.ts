import {
  FieldType,
  OnDeleteAction,
  RelationType,
  defineObject,
} from 'twenty-sdk/define';

import {
  CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  OFFER_FIELD_UNIVERSAL_IDENTIFIERS,
  OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS,
  PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'offer',
  namePlural: 'offers',
  labelSingular: 'Offer',
  labelPlural: 'Offers',
  description: 'Commercial terms for creator promotion',
  icon: 'IconGift',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    OFFER_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    { universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.name, type: FieldType.TEXT, name: 'name', label: 'Name', icon: 'IconTag', defaultValue: "''" },
    {
      universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.campaign,
      type: FieldType.RELATION,
      name: 'campaign',
      label: 'Campaign',
      icon: 'IconTargetArrow',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.offers,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'campaignId',
      },
    },
    {
      universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.promotedAsset,
      type: FieldType.RELATION,
      name: 'promotedAsset',
      label: 'Promoted Asset',
      icon: 'IconPackage',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS.offers,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'promotedAssetId',
      },
    },
    { universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.termsSummary, type: FieldType.TEXT, name: 'termsSummary', label: 'Terms summary', icon: 'IconFileDollar', isNullable: true },
    { universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.commissionRate, type: FieldType.NUMBER, name: 'commissionRate', label: 'Commission rate', icon: 'IconPercentage', isNullable: true },
    { universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.fixedFee, type: FieldType.NUMBER, name: 'fixedFee', label: 'Fixed fee', icon: 'IconCash', isNullable: true },
    { universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.cpaAmount, type: FieldType.NUMBER, name: 'cpaAmount', label: 'CPA amount', icon: 'IconReceipt', isNullable: true },
    { universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.giftedProductNotes, type: FieldType.TEXT, name: 'giftedProductNotes', label: 'Gifted product notes', icon: 'IconPackageExport', isNullable: true },
    { universalIdentifier: OFFER_FIELD_UNIVERSAL_IDENTIFIERS.usageRightsNotes, type: FieldType.TEXT, name: 'usageRightsNotes', label: 'Usage rights notes', icon: 'IconLicense', isNullable: true },
  ],
});

export type LegacyCreatorReferenceKind = 'FILTER' | 'SORT' | 'TEMPLATE' | 'API';

export type LegacyCreatorReferenceCompatibility =
  | { status: 'SUPPORTED' | 'PRESERVED'; fieldName: string }
  | {
      status: 'REPAIR_REQUIRED';
      fieldName: string;
      kind: LegacyCreatorReferenceKind;
      reason: string;
    };

const RETAINED_CREATOR_FIELDS = new Set([
  'name',
  'email',
  'phone',
  'location',
  'language',
  'owner',
  'source',
  'sourceUrl',
  'importSource',
  'lastImportedAt',
]);

const SOCIAL_IDENTITY_FIELD_PATTERN =
  /^(instagram|tiktok|youtube|twitter|twitch|patreon)/u;

export const getLegacyCreatorReferenceCompatibility = ({
  fieldName,
  kind,
  retirementRequested,
}: {
  fieldName: string;
  kind: LegacyCreatorReferenceKind;
  retirementRequested: boolean;
}): LegacyCreatorReferenceCompatibility => {
  if (RETAINED_CREATOR_FIELDS.has(fieldName)) {
    return { status: 'SUPPORTED', fieldName };
  }

  if (!retirementRequested) {
    return { status: 'PRESERVED', fieldName };
  }

  return {
    status: 'REPAIR_REQUIRED',
    fieldName,
    kind,
    reason: SOCIAL_IDENTITY_FIELD_PATTERN.test(fieldName)
      ? 'multiple SocialProfiles have no exact scalar replacement'
      : 'no exact structured replacement exists',
  };
};

export const requireSupportedLegacyCreatorReference = (
  compatibility: LegacyCreatorReferenceCompatibility,
): void => {
  if (compatibility.status !== 'REPAIR_REQUIRED') {
    return;
  }

  throw new Error(
    `Unsupported legacy Creator ${compatibility.kind.toLowerCase()} reference "${compatibility.fieldName}": ${compatibility.reason}`,
  );
};

import { normalizeCreatorImportHeader } from '@/myah/creator-crm/spreadsheet-import/utils/normalizeCreatorImportHeader';
import {
  normalizeCreatorSocialProfileUrl,
  type CreatorSocialProvider,
} from '@/myah/creator-crm/spreadsheet-import/utils/normalizeCreatorSocialProfileUrl';
import {
  type CreatorImportClassification,
  type CreatorSpreadsheetImportSession,
  type ExistingCreatorSocialProfile,
} from '@/myah/creator-crm/spreadsheet-import/types/CreatorSpreadsheetImportSession';
import { type SpreadsheetImportFields } from '@/spreadsheet-import/types/SpreadsheetImportFields';
import { type SpreadsheetImportHeaderAlias } from '@/spreadsheet-import/types/SpreadsheetImportHeaderProfile';
import { type ImportedStructuredRow } from '@/spreadsheet-import/types/SpreadsheetImportImportedStructuredRow';

const INFLUENCER_CLUB_PROFILE_KEY = 'influencer-club';
const INFLUENCER_CLUB_PROFILE_LABEL = 'Influencer Club CSV';

const HEADER_DESTINATIONS = {
  email: { fieldName: 'email' },
  first_name: { fieldName: 'name' },
  location: { fieldName: 'location' },
  gender: { fieldName: 'gender' },
  contact_phone_number: { fieldName: 'phone' },
  instagram_link: {
    fieldName: 'instagramLink',
    compositeSubFieldKey: 'primaryLinkUrl',
  },
  tiktok_link: {
    fieldName: 'tiktokLink',
    compositeSubFieldKey: 'primaryLinkUrl',
  },
  youtube_link: {
    fieldName: 'youtubeLink',
    compositeSubFieldKey: 'primaryLinkUrl',
  },
  twitter_link: {
    fieldName: 'twitterLink',
    compositeSubFieldKey: 'primaryLinkUrl',
  },
} as const;

type HeaderDestinationKey = keyof typeof HEADER_DESTINATIONS;

type CreatorFieldMetadata = {
  id: string;
  name: string;
};

type BuildCreatorSpreadsheetImportSessionArgs = {
  availableFieldMetadataItems: readonly CreatorFieldMetadata[];
  spreadsheetImportFields: SpreadsheetImportFields;
  queryExistingCreators: () => Promise<ExistingCreatorSocialProfile[]>;
};

const SOURCE_HEADER_DESTINATION_KEYS = {
  email: 'email',
  email_address: 'email',
  first_name: 'first_name',
  location: 'location',
  gender: 'gender',
  contact_phone_number: 'contact_phone_number',
  phone_number: 'contact_phone_number',
  phone: 'contact_phone_number',
  instagram_link: 'instagram_link',
  instagram_url: 'instagram_link',
  tiktok_link: 'tiktok_link',
  tiktok_url: 'tiktok_link',
  youtube_link: 'youtube_link',
  youtube_url: 'youtube_link',
  twitter_link: 'twitter_link',
  twitter_url: 'twitter_link',
  x_link: 'twitter_link',
  x_url: 'twitter_link',
} as const satisfies Readonly<Record<string, HeaderDestinationKey>>;

const INFLUENCER_CLUB_PROFILE_HEADER_DESTINATION_KEYS = {
  email: 'email',
  first_name: 'first_name',
  location: 'location',
  gender: 'gender',
  contact_phone_number: 'contact_phone_number',
  instagram_link: 'instagram_link',
  tiktok_link: 'tiktok_link',
  youtube_link: 'youtube_link',
  twitter_link: 'twitter_link',
  x_link: 'twitter_link',
  x_url: 'twitter_link',
} as const satisfies Readonly<Record<string, HeaderDestinationKey>>;

const SOCIAL_DESTINATIONS: ReadonlyArray<{
  destinationKey: HeaderDestinationKey;
  fieldName: keyof ExistingCreatorSocialProfile;
  provider: CreatorSocialProvider;
}> = [
  {
    destinationKey: 'instagram_link',
    fieldName: 'instagramLink',
    provider: 'instagram',
  },
  {
    destinationKey: 'tiktok_link',
    fieldName: 'tiktokLink',
    provider: 'tiktok',
  },
  {
    destinationKey: 'youtube_link',
    fieldName: 'youtubeLink',
    provider: 'youtube',
  },
  {
    destinationKey: 'twitter_link',
    fieldName: 'twitterLink',
    provider: 'twitter',
  },
];

const GENDER_OPTION_ALIASES = {
  female: 'FEMALE',
  male: 'MALE',
  'non-binary': 'NON_BINARY',
  non_binary: 'NON_BINARY',
  other: 'OTHER',
  unknown: 'UNKNOWN',
} as const;

const PROFILE_DESTINATION_KEYS = new Set<HeaderDestinationKey>([
  'email',
  'first_name',
  'location',
  'gender',
  'contact_phone_number',
  'instagram_link',
  'tiktok_link',
  'youtube_link',
  'twitter_link',
]);

export const buildCreatorSpreadsheetImportSession = ({
  availableFieldMetadataItems,
  spreadsheetImportFields,
  queryExistingCreators,
}: BuildCreatorSpreadsheetImportSessionArgs): CreatorSpreadsheetImportSession => {
  const fieldMetadataById = new Map(
    availableFieldMetadataItems.map((fieldMetadataItem) => [
      fieldMetadataItem.id,
      fieldMetadataItem,
    ]),
  );

  const fieldByDestinationKey = new Map<
    HeaderDestinationKey,
    SpreadsheetImportFields[number]
  >();

  for (const [destinationKey, destination] of Object.entries(
    HEADER_DESTINATIONS,
  ) as [
    HeaderDestinationKey,
    (typeof HEADER_DESTINATIONS)[HeaderDestinationKey],
  ][]) {
    const field = spreadsheetImportFields.find((spreadsheetImportField) => {
      const fieldMetadataItem = fieldMetadataById.get(
        spreadsheetImportField.fieldMetadataItemId,
      );

      return (
        fieldMetadataItem?.name === destination.fieldName &&
        ('compositeSubFieldKey' in destination
          ? spreadsheetImportField.compositeSubFieldKey ===
            destination.compositeSubFieldKey
          : !spreadsheetImportField.isCompositeSubField)
      );
    });

    if (field) {
      fieldByDestinationKey.set(destinationKey, field);
    }
  }

  const headerAliases: Record<string, SpreadsheetImportHeaderAlias> = {};

  for (const [sourceHeader, destinationKey] of Object.entries(
    SOURCE_HEADER_DESTINATION_KEYS,
  )) {
    const field = fieldByDestinationKey.get(destinationKey);

    if (!field) {
      continue;
    }

    const alias: SpreadsheetImportHeaderAlias = {
      fieldKey: field.key,
      ...(destinationKey === 'gender'
        ? { selectOptionAliases: GENDER_OPTION_ALIASES }
        : {}),
    };

    headerAliases[normalizeCreatorImportHeader(sourceHeader)] = alias;
  }

  const headerProfile = {
    key: INFLUENCER_CLUB_PROFILE_KEY,
    label: INFLUENCER_CLUB_PROFILE_LABEL,
    isDetected: (headerValues: unknown[]) => {
      if (headerValues.length !== 9) {
        return false;
      }

      const detectedDestinations = new Set(
        headerValues.flatMap((headerValue) => {
          if (typeof headerValue !== 'string') {
            return [];
          }

          const destinationKey =
            INFLUENCER_CLUB_PROFILE_HEADER_DESTINATION_KEYS[
              normalizeCreatorImportHeader(
                headerValue,
              ) as keyof typeof INFLUENCER_CLUB_PROFILE_HEADER_DESTINATION_KEYS
            ];

          return destinationKey ? [destinationKey] : [];
        }),
      );

      return (
        detectedDestinations.size === PROFILE_DESTINATION_KEYS.size &&
        [...PROFILE_DESTINATION_KEYS].every((destinationKey) =>
          detectedDestinations.has(destinationKey),
        )
      );
    },
  };

  const recognizedMappingsByFieldKey = new Map<string, HeaderDestinationKey>();
  const socialDestinationByFieldKey = new Map(
    SOCIAL_DESTINATIONS.flatMap((socialDestination) => {
      const field = fieldByDestinationKey.get(socialDestination.destinationKey);
      return field ? [[field.key, socialDestination] as const] : [];
    }),
  );
  const importSourceField = spreadsheetImportFields.find(
    (field) =>
      fieldMetadataById.get(field.fieldMetadataItemId)?.name ===
        'importSource' && !field.isCompositeSubField,
  );
  const lastImportedAtField = spreadsheetImportFields.find(
    (field) =>
      fieldMetadataById.get(field.fieldMetadataItemId)?.name ===
        'lastImportedAt' && !field.isCompositeSubField,
  );

  let existingCreatorIdsByIdentity = new Map<string, Set<string>>();
  let classificationsByRowId = new Map<string, CreatorImportClassification>();
  const excludedConflictRowIds = new Set<string>();
  let rowIdSequence = 0;
  let shouldAddProvenance = false;
  let hasRecognizedSocialIdentityMapping = false;
  let submissionImportedAt: string | undefined;

  const replaceExistingCreatorIndex = (
    existingCreators: readonly ExistingCreatorSocialProfile[],
  ) => {
    const nextIndex = new Map<string, Set<string>>();

    for (const creator of existingCreators) {
      for (const socialDestination of SOCIAL_DESTINATIONS) {
        const socialLink = creator[socialDestination.fieldName];
        const storedUrl =
          typeof socialLink === 'object' && socialLink
            ? socialLink.primaryLinkUrl
            : undefined;

        if (!storedUrl) {
          continue;
        }

        const canonicalUrl = normalizeCreatorSocialProfileUrl(
          socialDestination.provider,
          storedUrl,
        );

        if (!canonicalUrl) {
          continue;
        }

        const identity = `${socialDestination.provider}:${canonicalUrl}`;
        const creatorIds = nextIndex.get(identity) ?? new Set<string>();
        creatorIds.add(creator.id);
        nextIndex.set(identity, creatorIds);
      }
    }

    existingCreatorIdsByIdentity = nextIndex;
  };

  const normalizeRows = (
    rows: readonly ImportedStructuredRow[],
  ): ImportedStructuredRow[] =>
    rows.map((row) => {
      const normalizedRow = { ...row };

      for (const [fieldKey, destinationKey] of recognizedMappingsByFieldKey) {
        const currentValue = normalizedRow[fieldKey];

        if (typeof currentValue !== 'string') {
          continue;
        }

        const trimmedValue = currentValue.trim();

        if (destinationKey === 'email') {
          normalizedRow[fieldKey] = trimmedValue
            ? trimmedValue.toLocaleLowerCase()
            : undefined;
        } else if (destinationKey === 'gender') {
          normalizedRow[fieldKey] = trimmedValue
            ? (GENDER_OPTION_ALIASES[
                trimmedValue.toLocaleLowerCase() as keyof typeof GENDER_OPTION_ALIASES
              ] ?? trimmedValue)
            : undefined;
        } else {
          const socialDestination = socialDestinationByFieldKey.get(fieldKey);
          const normalizedSocialUrl = socialDestination
            ? normalizeCreatorSocialProfileUrl(
                socialDestination.provider,
                trimmedValue,
              )
            : undefined;

          normalizedRow[fieldKey] = socialDestination
            ? (normalizedSocialUrl ?? trimmedValue) || undefined
            : trimmedValue || undefined;
        }
      }

      if (shouldAddProvenance) {
        if (importSourceField) {
          normalizedRow[importSourceField.key] = INFLUENCER_CLUB_PROFILE_LABEL;
        }
        if (lastImportedAtField && submissionImportedAt) {
          normalizedRow[lastImportedAtField.key] = submissionImportedAt;
        }
      }

      return normalizedRow;
    });

  const tableHook: CreatorSpreadsheetImportSession['tableHook'] = (
    rows,
    addError,
  ) => {
    const normalizedRows = normalizeRows(rows);

    for (const row of normalizedRows) {
      if (row.__index === undefined || row.__index === null) {
        row.__index = `creator-import-${rowIdSequence++}`;
      }
    }

    const identitiesByRow = normalizedRows.map((row) => {
      const identities: Array<{
        fieldKey: string;
        identity: string;
      }> = [];

      for (const fieldKey of recognizedMappingsByFieldKey.keys()) {
        const socialDestination = socialDestinationByFieldKey.get(fieldKey);
        if (!socialDestination) {
          continue;
        }
        const value = row[fieldKey];

        if (typeof value !== 'string' || value.length === 0) {
          continue;
        }

        const canonicalUrl = normalizeCreatorSocialProfileUrl(
          socialDestination.provider,
          value,
        );

        if (canonicalUrl) {
          identities.push({
            fieldKey,
            identity: `${socialDestination.provider}:${canonicalUrl}`,
          });
        }
      }

      return identities;
    });

    const rowIndexesByIdentity = new Map<string, number[]>();

    identitiesByRow.forEach((identities, rowIndex) => {
      for (const { identity } of identities) {
        const rowIndexes = rowIndexesByIdentity.get(identity) ?? [];
        rowIndexes.push(rowIndex);
        rowIndexesByIdentity.set(identity, rowIndexes);
      }
    });

    const nextClassificationsByRowId = new Map<
      string,
      CreatorImportClassification
    >();

    normalizedRows.forEach((row, rowIndex) => {
      for (const [fieldKey, destinationKey] of recognizedMappingsByFieldKey) {
        const value = row[fieldKey];
        if (
          destinationKey === 'first_name' &&
          (typeof value !== 'string' || value.length === 0)
        ) {
          addError(rowIndex, fieldKey, {
            level: 'error',
            message: 'Enter a Creator Name',
          });
          continue;
        }

        if (typeof value !== 'string' || value.length === 0) {
          continue;
        }

        if (
          destinationKey === 'email' &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
        ) {
          addError(rowIndex, fieldKey, {
            level: 'error',
            message: 'Enter a valid email address',
          });
        } else if (destinationKey === 'contact_phone_number') {
          const digitCount = value.replace(/\D/gu, '').length;
          if (
            !/^\+?[\d()\s-]+$/u.test(value) ||
            digitCount < 7 ||
            digitCount > 15
          ) {
            addError(rowIndex, fieldKey, {
              level: 'error',
              message: 'Enter a valid phone number',
            });
          }
        } else if (
          destinationKey === 'gender' &&
          !Object.values(GENDER_OPTION_ALIASES).includes(
            value as (typeof GENDER_OPTION_ALIASES)[keyof typeof GENDER_OPTION_ALIASES],
          )
        ) {
          addError(rowIndex, fieldKey, {
            level: 'error',
            message: 'Select a valid gender',
          });
        } else {
          const socialDestination = socialDestinationByFieldKey.get(fieldKey);
          if (
            socialDestination &&
            !normalizeCreatorSocialProfileUrl(socialDestination.provider, value)
          ) {
            addError(rowIndex, fieldKey, {
              level: 'error',
              message: 'Enter a valid social profile URL',
            });
          }
        }
      }

      const identities = identitiesByRow[rowIndex];
      const matchedCreatorIds = new Set<string>();
      const matchedFieldKeys = new Set<string>();
      let hasAmbiguousExistingIdentity = false;
      let hasSameFileDuplicate = false;

      for (const { fieldKey, identity } of identities) {
        const duplicateRowIndexes = rowIndexesByIdentity.get(identity) ?? [];
        if (duplicateRowIndexes.length > 1) {
          hasSameFileDuplicate = true;
          matchedFieldKeys.add(fieldKey);
          addError(rowIndex, fieldKey, {
            level: 'error',
            message: 'Social profile appears in more than one imported row',
          });
        }

        const existingCreatorIds = existingCreatorIdsByIdentity.get(identity);
        if (!existingCreatorIds) {
          continue;
        }

        matchedFieldKeys.add(fieldKey);
        if (existingCreatorIds.size > 1) {
          hasAmbiguousExistingIdentity = true;
        }
        existingCreatorIds.forEach((creatorId) =>
          matchedCreatorIds.add(creatorId),
        );
      }

      let classification: CreatorImportClassification;

      if (
        hasSameFileDuplicate ||
        hasAmbiguousExistingIdentity ||
        matchedCreatorIds.size > 1
      ) {
        classification = {
          kind: 'conflict',
          matchedFieldKeys: [...matchedFieldKeys],
        };

        if (!hasSameFileDuplicate) {
          for (const fieldKey of matchedFieldKeys) {
            addError(rowIndex, fieldKey, {
              level: 'error',
              message: 'Social profiles match different or ambiguous Creators',
            });
          }
        }
      } else if (matchedCreatorIds.size === 1) {
        const [creatorId] = matchedCreatorIds;
        classification = {
          kind: 'existing',
          creatorId,
          matchedFieldKeys: [...matchedFieldKeys],
        };

        for (const fieldKey of matchedFieldKeys) {
          addError(rowIndex, fieldKey, {
            level: 'error',
            message: 'Creator already exists for this social profile',
          });
        }
      } else {
        classification = { kind: 'create' };
      }

      const priorClassification = classificationsByRowId.get(
        String(row.__index),
      );
      nextClassificationsByRowId.set(
        String(row.__index),
        priorClassification?.kind === 'conflict'
          ? priorClassification
          : classification,
      );
    });

    const currentRowIds = new Set(
      normalizedRows.map((row) => String(row.__index)),
    );
    for (const currentRowId of currentRowIds) {
      excludedConflictRowIds.delete(currentRowId);
    }
    for (const [rowId, classification] of classificationsByRowId) {
      if (classification.kind === 'conflict' && !currentRowIds.has(rowId)) {
        excludedConflictRowIds.add(rowId);
      }
    }

    classificationsByRowId = nextClassificationsByRowId;

    return normalizedRows;
  };

  const matchColumnsStepHook: CreatorSpreadsheetImportSession['matchColumnsStepHook'] =
    async (rows, rawRows, columns, activeHeaderProfileKey) => {
      recognizedMappingsByFieldKey.clear();
      classificationsByRowId = new Map();
      excludedConflictRowIds.clear();
      hasRecognizedSocialIdentityMapping = false;

      for (const column of columns) {
        if (!('value' in column)) {
          continue;
        }

        const normalizedHeader = normalizeCreatorImportHeader(column.header);
        const alias = headerAliases[normalizedHeader];
        if (alias?.fieldKey !== column.value) {
          continue;
        }

        const destinationKey =
          SOURCE_HEADER_DESTINATION_KEYS[
            normalizedHeader as keyof typeof SOURCE_HEADER_DESTINATION_KEYS
          ];
        if (destinationKey) {
          recognizedMappingsByFieldKey.set(column.value, destinationKey);
          hasRecognizedSocialIdentityMapping ||=
            socialDestinationByFieldKey.has(column.value);
        }
      }

      shouldAddProvenance =
        activeHeaderProfileKey === INFLUENCER_CLUB_PROFILE_KEY;
      submissionImportedAt = undefined;

      const rowsWithPreservedSourceValues = rows.map((row, rowIndex) => {
        const preservedRow: ImportedStructuredRow = {
          ...row,
          __index: row.__index ?? `creator-import-source-${rowIndex}`,
        };

        for (const column of columns) {
          if (
            !('value' in column) ||
            recognizedMappingsByFieldKey.get(column.value) !== 'gender' ||
            preservedRow[column.value] !== undefined
          ) {
            continue;
          }

          const rawValue = rawRows[rowIndex]?.[column.index];
          if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
            preservedRow[column.value] = rawValue;
          }
        }

        return preservedRow;
      });

      if (hasRecognizedSocialIdentityMapping) {
        await queryExistingCreators().then(replaceExistingCreatorIndex);
      }

      return normalizeRows(rowsWithPreservedSourceValues);
    };

  return {
    spreadsheetImportFields,
    headerAliases,
    headerProfile,
    matchColumnsStepHook,
    tableHook,
    beforeSubmitHook: async () => {
      if (hasRecognizedSocialIdentityMapping) {
        await queryExistingCreators().then(replaceExistingCreatorIndex);
      }
      submissionImportedAt = new Date().toISOString();
    },
    getSubmissionBlockReason: (rows) => {
      const hasConflict = rows.some(
        (row) =>
          classificationsByRowId.get(String(row.__index))?.kind === 'conflict',
      );

      return hasConflict
        ? 'Remove conflicting Creator rows before importing'
        : undefined;
    },
    getSummary: (rows) => {
      let existing = 0;
      let conflicts = excludedConflictRowIds.size;

      for (const row of rows) {
        const classification = classificationsByRowId.get(String(row.__index));
        if (classification?.kind === 'existing') {
          existing += 1;
        } else if (classification?.kind === 'conflict') {
          conflicts += 1;
        }
      }

      return { existing, conflicts };
    },
  };
};

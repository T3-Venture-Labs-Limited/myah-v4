type RelationEmptyStateSettings =
  | {
      emptyStateLabel?: string;
      emptyStateWhenBooleanFieldIsFalse?: string;
    }
  | null
  | undefined;

type GetRelationEmptyStateLabelArgs = {
  fieldValue: unknown;
  booleanFieldValue: unknown;
  settings: RelationEmptyStateSettings;
};

export const getRelationEmptyStateLabel = ({
  fieldValue,
  booleanFieldValue,
  settings,
}: GetRelationEmptyStateLabelArgs): string | undefined => {
  if (
    !Array.isArray(fieldValue) ||
    fieldValue.length !== 0 ||
    settings?.emptyStateLabel === undefined
  ) {
    return undefined;
  }

  if (
    settings.emptyStateWhenBooleanFieldIsFalse !== undefined &&
    booleanFieldValue !== false
  ) {
    return undefined;
  }

  return settings.emptyStateLabel;
};

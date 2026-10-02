import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

export const READ_ONLY_DATA_MODEL_MUTATION_PATHS = [
  SettingsPath.NewObject,
  SettingsPath.ObjectNewFieldSelect,
  SettingsPath.ObjectNewFieldConfigure,
  SettingsPath.ObjectNewIndex,
  SettingsPath.ObjectFieldEdit,
] as const;

export const getReadOnlyDataModelRedirectPath = (
  objectNamePlural?: string,
): string =>
  objectNamePlural
    ? getSettingsPath(SettingsPath.ObjectDetail, { objectNamePlural })
    : getSettingsPath(SettingsPath.Objects);

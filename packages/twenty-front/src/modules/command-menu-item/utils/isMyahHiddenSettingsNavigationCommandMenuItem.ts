import {
  EngineComponentKey,
  type CommandMenuItemFieldsFragment,
} from '~/generated-metadata/graphql';

// MYAH-475: hide the broken Roles shortcut, not the role/permission system.
const MYAH_HIDDEN_SETTINGS_NAVIGATION_PATHS = new Set(['/settings/roles']);

export const isMyahHiddenSettingsNavigationCommandMenuItem = (
  item: Pick<CommandMenuItemFieldsFragment, 'engineComponentKey' | 'payload'>,
): boolean =>
  item.engineComponentKey === EngineComponentKey.NAVIGATION &&
  item.payload != null &&
  'path' in item.payload &&
  MYAH_HIDDEN_SETTINGS_NAVIGATION_PATHS.has(item.payload.path);

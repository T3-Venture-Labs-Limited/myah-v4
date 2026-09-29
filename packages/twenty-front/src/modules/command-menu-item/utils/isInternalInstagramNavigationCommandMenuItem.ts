import { isObjectMetadataCommandMenuItemPayload } from '@/command-menu-item/engine-command/utils/isObjectMetadataCommandMenuItemPayload';
import {
  EngineComponentKey,
  type CommandMenuItemFieldsFragment,
} from '~/generated-metadata/graphql';

export const isInternalInstagramNavigationCommandMenuItem = (
  item: Pick<CommandMenuItemFieldsFragment, 'engineComponentKey' | 'payload'>,
  instagramObjectMetadataIds: ReadonlySet<string>,
): boolean =>
  item.engineComponentKey === EngineComponentKey.NAVIGATION &&
  item.payload != null &&
  isObjectMetadataCommandMenuItemPayload(item.payload) &&
  instagramObjectMetadataIds.has(item.payload.objectMetadataItemId);

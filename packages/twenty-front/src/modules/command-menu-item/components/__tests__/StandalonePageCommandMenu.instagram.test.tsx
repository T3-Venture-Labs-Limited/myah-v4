import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { CommandMenuContext } from '@/command-menu-item/contexts/CommandMenuContext';
import { StandalonePageCommandMenu } from '@/command-menu-item/components/StandalonePageCommandMenu';
import { commandMenuItemsSelector } from '@/command-menu-item/states/commandMenuItemsSelector';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { objectMetadataItemsWithFieldsSelector } from '@/object-metadata/states/objectMetadataItemsWithFieldsSelector';
import { currentPageLayoutIdState } from '@/page-layout/states/currentPageLayoutIdState';
import {
  CommandMenuItemAvailabilityType,
  EngineComponentKey,
  type CommandMenuItemFieldsFragment,
} from '~/generated-metadata/graphql';

const objectMetadataItems = [
  { id: 'account', nameSingular: 'myahInstagramAccount' },
  { id: 'draft', nameSingular: 'myahInstagramReplyDraft' },
  { id: 'creator', nameSingular: 'creator' },
];
const nav = (label: string, objectMetadataItemId: string) =>
  ({
    id: label,
    label,
    position: 1,
    isPinned: true,
    availabilityType: CommandMenuItemAvailabilityType.GLOBAL,
    engineComponentKey: EngineComponentKey.NAVIGATION,
    availabilityObjectMetadataId: null,
    conditionalAvailabilityExpression: null,
    pageLayoutId: null,
    payload: {
      __typename: 'ObjectMetadataCommandMenuItemPayload',
      objectMetadataItemId,
    },
  }) as CommandMenuItemFieldsFragment;
const mockItems = [
  nav('Renamed account shortcut', 'account'),
  nav('Renamed draft shortcut', 'draft'),
  nav('Go to Creators', 'creator'),
  {
    ...nav('Message on Instagram', 'creator'),
    engineComponentKey: EngineComponentKey.MESSAGE_ON_INSTAGRAM,
  },
];

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: unknown) => {
    if (state === commandMenuItemsSelector) return mockItems;
    if (state === objectMetadataItemsWithFieldsSelector)
      return objectMetadataItems;
    if (state === currentWorkspaceState) return { featureFlags: [] };
    if (state === currentUserWorkspaceState) return { permissionFlags: [] };
    if (state === currentUserState) return {};
    if (state === currentPageLayoutIdState) return null;
    if (state === isLayoutCustomizationModeEnabledState) return false;
    throw new Error('Unexpected standalone menu state');
  },
}));
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => ({ get: () => ({ canRead: true, canUpdate: true }) }),
}));
jest.mock('twenty-ui/utilities', () => ({
  ...jest.requireActual('twenty-ui/utilities'),
  useIsMobile: () => false,
}));
jest.mock(
  '@/command-menu-item/display/components/PinnedCommandMenuItemButtons',
  () => ({
    PinnedCommandMenuItemButtons: () => {
      const { commandMenuItems } = useContext(CommandMenuContext);
      return commandMenuItems
        .filter((item) => item.isPinned)
        .map((item) => <button key={item.id}>{item.label}</button>);
    },
  }),
);
jest.mock(
  '@/command-menu-item/edit/components/CommandMenuItemEditButton',
  () => ({
    CommandMenuItemEditButton: () => null,
  }),
);

it('omits customized pinned Instagram record navigation from the standalone header', () => {
  render(<StandalonePageCommandMenu />);
  expect(
    screen.getAllByRole('button').map((button) => button.textContent),
  ).toEqual(['Go to Creators', 'Message on Instagram']);
});

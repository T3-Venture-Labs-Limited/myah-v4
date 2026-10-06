import { isMyahHiddenSettingsNavigationCommandMenuItem } from '@/command-menu-item/utils/isMyahHiddenSettingsNavigationCommandMenuItem';
import {
  EngineComponentKey,
  type CommandMenuItemFieldsFragment,
} from '~/generated-metadata/graphql';

type NavigationItem = Pick<
  CommandMenuItemFieldsFragment,
  'engineComponentKey' | 'payload'
>;

it('hides navigation to the broken Roles settings path', () => {
  expect(
    isMyahHiddenSettingsNavigationCommandMenuItem({
      engineComponentKey: EngineComponentKey.NAVIGATION,
      payload: {
        __typename: 'PathCommandMenuItemPayload',
        path: '/settings/roles',
      },
    }),
  ).toBe(true);
});

it('hides Roles navigation from raw live metadata payloads without a typename', () => {
  expect(
    isMyahHiddenSettingsNavigationCommandMenuItem({
      engineComponentKey: EngineComponentKey.NAVIGATION,
      payload: { path: '/settings/roles' } as NavigationItem['payload'],
    }),
  ).toBe(true);
});

it.each<NavigationItem>([
  {
    engineComponentKey: EngineComponentKey.NAVIGATION,
    payload: { path: '/settings/members' } as NavigationItem['payload'],
  },
  {
    engineComponentKey: EngineComponentKey.NAVIGATION,
    payload: {
      __typename: 'PathCommandMenuItemPayload',
      path: '/settings/members',
    },
  },
  {
    engineComponentKey: EngineComponentKey.NAVIGATION,
    payload: {
      __typename: 'ObjectMetadataCommandMenuItemPayload',
      objectMetadataItemId: 'creator',
    },
  },
  { engineComponentKey: EngineComponentKey.NAVIGATION, payload: null },
  {
    engineComponentKey: EngineComponentKey.MESSAGE_ON_INSTAGRAM,
    payload: {
      __typename: 'PathCommandMenuItemPayload',
      path: '/settings/roles',
    },
  },
])('preserves unrelated commands: %j', (item) => {
  expect(isMyahHiddenSettingsNavigationCommandMenuItem(item)).toBe(false);
});

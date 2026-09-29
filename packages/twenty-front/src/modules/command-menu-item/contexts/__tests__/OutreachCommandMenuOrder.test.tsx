import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { ContextStorePageType } from 'twenty-shared/types';
import { EMPTY_COMMAND_MENU_CONTEXT_API } from '@/command-menu-item/constants/EmptyCommandMenuContextApi';
import { CommandMenuContextProviderContent } from '@/command-menu-item/contexts/CommandMenuContextProviderContent';
import { SidePanelCommandMenuItemDisplayPage } from '@/command-menu-item/display/components/SidePanelCommandMenuItemDisplayPage';
import { commandMenuItemsDraftState } from '@/command-menu-item/edit/states/commandMenuItemsDraftState';
import { commandMenuItemsSelector } from '@/command-menu-item/states/commandMenuItemsSelector';
import { commandMenuPinnedInlineLayoutState } from '@/command-menu-item/display/states/commandMenuPinnedInlineLayoutState';
import { currentPageLayoutIdState } from '@/page-layout/states/currentPageLayoutIdState';
import { objectMetadataItemsWithFieldsSelector } from '@/object-metadata/states/objectMetadataItemsWithFieldsSelector';
import { sidePanelSearchState } from '@/side-panel/states/sidePanelSearchState';
import {
  CommandMenuItemAvailabilityType,
  EngineComponentKey,
  type CommandMenuItemFieldsFragment,
} from '~/generated-metadata/graphql';

let mockItems: CommandMenuItemFieldsFragment[] = [];
let mockObjectMetadataItems = [
  { id: 'account', nameSingular: 'myahInstagramAccount' },
  { id: 'draft', nameSingular: 'myahInstagramReplyDraft' },
  { id: 'creator', nameSingular: 'creator' },
];
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: unknown) => {
    if (state === commandMenuItemsSelector) return mockItems;
    if (state === commandMenuItemsDraftState) return null;
    if (state === currentPageLayoutIdState) return null;
    if (state === objectMetadataItemsWithFieldsSelector)
      return mockObjectMetadataItems;
    if (state === sidePanelSearchState) return '';
    if (state === commandMenuPinnedInlineLayoutState)
      return { containerWidth: 0, commandMenuItemWidthsByKey: {} };
    throw new Error('Unexpected menu state');
  },
}));
jest.mock(
  '@/side-panel/pages/root/hooks/useFilterCommandMenuItemsWithSidePanelSearch',
  () => ({
    useFilterCommandMenuItemsWithSidePanelSearch: () => ({
      filterCommandMenuItemsWithSidePanelSearch: (
        items: CommandMenuItemFieldsFragment[],
      ) => items,
    }),
  }),
);
jest.mock('@/side-panel/components/SidePanelList', () => ({
  SidePanelList: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/side-panel/components/SidePanelGroup', () => ({
  SidePanelGroup: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
jest.mock(
  '@/command-menu-item/display/components/CommandMenuItemRenderer',
  () => ({
    CommandMenuItemRenderer: ({
      item,
    }: {
      item: CommandMenuItemFieldsFragment;
    }) => <button>{item.label}</button>,
  }),
);

const item = (
  label: string,
  position: number,
  conditionalAvailabilityExpression: string | null = null,
  availabilityType = CommandMenuItemAvailabilityType.GLOBAL,
  isPinned = false,
): CommandMenuItemFieldsFragment =>
  ({
    id: label,
    label,
    position,
    conditionalAvailabilityExpression,
    availabilityType,
    isPinned,
    availabilityObjectMetadataId: null,
    pageLayoutId: null,
  }) as CommandMenuItemFieldsFragment;

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockItems = [
    item('Search records', 41),
    item('Compose Campaign', 40.3, 'featureFlags.IS_EMAIL_GROUP_ENABLED'),
    item(
      'Contextual record action',
      2,
      null,
      CommandMenuItemAvailabilityType.RECORD_SELECTION,
      true,
    ),
    item('Message on Instagram', 40.2),
    item('Compose Email', 40.1, 'permissionFlags.SEND_EMAIL_TOOL'),
  ];
});

it.each(['desktop', 'mobile'])(
  'renders filtered %s menu with individual outreach first and contextual actions intact',
  (viewport) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: viewport === 'mobile' ? 390 : 1440,
    });
    render(
      <I18nProvider i18n={i18n}>
        <CommandMenuContextProviderContent
          displayType="listItem"
          containerType="command-menu-list"
          commandMenuContextApi={{
            ...EMPTY_COMMAND_MENU_CONTEXT_API,
            pageType: ContextStorePageType.Index,
            objectMetadataItem: { id: 'creator' },
            numberOfSelectedRecords: 1,
            permissionFlags: { SEND_EMAIL_TOOL: true },
            featureFlags: { IS_EMAIL_GROUP_ENABLED: true },
          }}
          isInPreviewMode={false}
        >
          <SidePanelCommandMenuItemDisplayPage />
        </CommandMenuContextProviderContent>
      </I18nProvider>,
    );
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual([
      'Contextual record action',
      'Compose Email',
      'Message on Instagram',
      'Compose Campaign',
      'Search records',
    ]);
  },
);

const instagramObjectActions = () =>
  [
    ...[
      [
        'Create new Myah Instagram account',
        EngineComponentKey.CREATE_NEW_RECORD,
      ],
      ['Import Myah Instagram accounts', EngineComponentKey.IMPORT_RECORDS],
      [
        'See deleted Myah Instagram accounts',
        EngineComponentKey.SEE_DELETED_RECORDS,
      ],
    ].map(([label, engineComponentKey], index) => ({
      ...item(
        label,
        index,
        null,
        CommandMenuItemAvailabilityType.GLOBAL_OBJECT_CONTEXT,
      ),
      engineComponentKey,
    })),
    ...[
      ['Go to Myah Instagram accounts', 'account'],
      ['Go to Myah Instagram message drafts', 'draft'],
      ['Go to Creators', 'creator'],
    ].map(([label, objectMetadataItemId], index) => ({
      ...item(label, index + 10),
      engineComponentKey: EngineComponentKey.NAVIGATION,
      payload: {
        __typename: 'ObjectMetadataCommandMenuItemPayload',
        objectMetadataItemId,
      },
    })),
    {
      ...item('Message on Instagram', 40.2),
      engineComponentKey: EngineComponentKey.MESSAGE_ON_INSTAGRAM,
    },
  ] as CommandMenuItemFieldsFragment[];

it.each(['desktop', 'mobile'])(
  'shows only the Instagram messaging command among Instagram actions on %s',
  (viewport) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: viewport === 'mobile' ? 390 : 1440,
    });
    mockItems = instagramObjectActions();
    render(
      <I18nProvider i18n={i18n}>
        <CommandMenuContextProviderContent
          displayType="listItem"
          containerType="command-menu-list"
          commandMenuContextApi={{
            ...EMPTY_COMMAND_MENU_CONTEXT_API,
            pageType: ContextStorePageType.Index,
            objectMetadataItem: {
              id: 'account',
              nameSingular: 'myahInstagramAccount',
            },
          }}
          isInPreviewMode={false}
        >
          <SidePanelCommandMenuItemDisplayPage />
        </CommandMenuContextProviderContent>
      </I18nProvider>,
    );
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Go to Creators', 'Message on Instagram']);
  },
);

it('keeps unrelated object commands while hiding internal Instagram navigation', () => {
  mockItems = instagramObjectActions().map((command) =>
    command.engineComponentKey === EngineComponentKey.CREATE_NEW_RECORD
      ? { ...command, label: 'Create new Creator' }
      : command.engineComponentKey === EngineComponentKey.IMPORT_RECORDS
        ? { ...command, label: 'Import Creators' }
        : command.engineComponentKey === EngineComponentKey.SEE_DELETED_RECORDS
          ? { ...command, label: 'See deleted Creators' }
          : command,
  );
  render(
    <I18nProvider i18n={i18n}>
      <CommandMenuContextProviderContent
        displayType="listItem"
        containerType="command-menu-list"
        commandMenuContextApi={{
          ...EMPTY_COMMAND_MENU_CONTEXT_API,
          pageType: ContextStorePageType.Index,
          objectMetadataItem: { id: 'creator', nameSingular: 'creator' },
        }}
        isInPreviewMode={false}
      >
        <SidePanelCommandMenuItemDisplayPage />
      </CommandMenuContextProviderContent>
    </I18nProvider>,
  );
  expect(
    screen.getAllByRole('button').map((button) => button.textContent),
  ).toEqual([
    'Create new Creator',
    'Import Creators',
    'See deleted Creators',
    'Go to Creators',
    'Message on Instagram',
  ]);
});

it('leaves Instagram first when Email and Campaign are unavailable', () => {
  render(
    <I18nProvider i18n={i18n}>
      <CommandMenuContextProviderContent
        displayType="listItem"
        containerType="command-menu-list"
        commandMenuContextApi={{
          ...EMPTY_COMMAND_MENU_CONTEXT_API,
          pageType: ContextStorePageType.Standalone,
          permissionFlags: {},
          featureFlags: { IS_EMAIL_GROUP_ENABLED: false },
        }}
        isInPreviewMode={false}
      >
        <SidePanelCommandMenuItemDisplayPage />
      </CommandMenuContextProviderContent>
    </I18nProvider>,
  );
  expect(
    screen.getAllByRole('button').map((button) => button.textContent),
  ).toEqual(['Message on Instagram', 'Search records']);
});

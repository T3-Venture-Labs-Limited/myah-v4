import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MYAH_CREATOR_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

const CREATOR_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS = Object.values(
  MYAH_CREATOR_PAGE_LAYOUT_CONFIG.tabs,
).map(({ universalIdentifier }) => universalIdentifier);
const CREATOR_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS = Object.values(
  MYAH_CREATOR_PAGE_LAYOUT_CONFIG.tabs,
).flatMap(({ widgets }) =>
  Object.values(widgets).map(({ universalIdentifier }) => universalIdentifier),
);
const CREATOR_DEFAULT_RELATION_FIELD_UNIVERSAL_IDENTIFIERS = [
  '5e98bbca-0761-5945-bbe6-c441e3fb831b',
  '81c0d29d-abc3-5b58-a15d-e573ea52de57',
  '68ea5fd3-32b0-542f-ae42-9162331b53e8',
  '179b4088-ecec-5113-8397-5b85ffd3d542',
];
const CREATOR_RECORD_PAGE_FIELDS_VIEW =
  MYAH_STANDARD_OBJECTS.creator.views.creatorRecordPageFields;
const CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS =
  Object.values(CREATOR_RECORD_PAGE_FIELDS_VIEW.viewFields).map(
    ({ universalIdentifier }) => universalIdentifier,
  );

type SynchronizeSourceControlledMyahMetadataService = {
  synchronizeWorkspace: (
    args: RunOnWorkspaceArgs,
    selection: {
      fieldMetadata: ReadonlySet<string>;
      view: ReadonlySet<string>;
      viewField: ReadonlySet<string>;
      pageLayout: ReadonlySet<string>;
      pageLayoutTab: ReadonlySet<string>;
      pageLayoutWidget: ReadonlySet<string>;
    },
  ) => Promise<void>;
};

type SynchronizeMyahCreatorPageLayoutMetadataCommand = {
  runOnWorkspace: (args: RunOnWorkspaceArgs) => Promise<void>;
};

type SynchronizeMyahCreatorPageLayoutMetadataCommandConstructor = new (
  ...constructorArgs: unknown[]
) => SynchronizeMyahCreatorPageLayoutMetadataCommand;

type SynchronizeMyahCreatorPageLayoutMetadataCommandModule = {
  SynchronizeMyahCreatorPageLayoutMetadataCommand: SynchronizeMyahCreatorPageLayoutMetadataCommandConstructor;
};

const loadCommandModule =
  (): SynchronizeMyahCreatorPageLayoutMetadataCommandModule | undefined => {
    try {
      return require(
        'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785240016002-synchronize-myah-creator-page-layout-metadata.command',
      ) as SynchronizeMyahCreatorPageLayoutMetadataCommandModule;
    } catch {
      return undefined;
    }
  };

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: true },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahCreatorPageLayoutMetadataCommand', () => {
  it('delegates the Creator layout, fields view, view fields, tabs, widgets, and native activity relations through an active-release metadata sync', async () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command =
      new commandModule!.SynchronizeMyahCreatorPageLayoutMetadataCommand(
        {} as WorkspaceIteratorService,
        {
          synchronizeWorkspace,
        } as SynchronizeSourceControlledMyahMetadataService,
      );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    const selection = synchronizeWorkspace.mock.calls[0][1] as {
      fieldMetadata: ReadonlySet<string>;
      view: ReadonlySet<string>;
      viewField: ReadonlySet<string>;
      pageLayout: ReadonlySet<string>;
      pageLayoutTab: ReadonlySet<string>;
      pageLayoutWidget: ReadonlySet<string>;
    };

    expect([...selection.fieldMetadata].sort()).toEqual(
      CREATOR_DEFAULT_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.sort(),
    );
    expect([...selection.view]).toEqual([
      CREATOR_RECORD_PAGE_FIELDS_VIEW.universalIdentifier,
    ]);
    expect([...selection.viewField].sort()).toEqual(
      CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.sort(),
    );
    expect([...selection.pageLayout]).toEqual([
      MYAH_CREATOR_PAGE_LAYOUT_CONFIG.universalIdentifier,
    ]);
    expect([...selection.pageLayoutTab].sort()).toEqual(
      CREATOR_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS.sort(),
    );
    expect([...selection.pageLayoutWidget].sort()).toEqual(
      CREATOR_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS.sort(),
    );
  });

  it('registers the Creator page layout replay in active version 2.19 after Inbox metadata', () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();
    expect(
      getRegisteredWorkspaceCommandMetadata(
        commandModule!.SynchronizeMyahCreatorPageLayoutMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.19.0',
      timestamp: 1785240016002,
    });
  });
});

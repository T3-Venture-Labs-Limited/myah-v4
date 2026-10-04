import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';

import { RemoveLegacyCreatorSocialFieldsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1791100000000-remove-legacy-creator-social-fields.command';

const field = (
  universalIdentifier: string,
  name: string,
  objectMetadataId = 'creator-id',
  type = FieldMetadataType.TEXT,
) => ({ universalIdentifier, name, objectMetadataId, type });

const setup = (fields: ReturnType<typeof field>[], hasCreator = true) => {
  const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
  const command = new RemoveLegacyCreatorSocialFieldsCommand(
    {} as never,
    { synchronizeWorkspace } as never,
    {
      invalidateAndRecompute: jest.fn().mockResolvedValue(undefined),
      getOrRecompute: jest.fn().mockResolvedValue({
        flatObjectMetadataMaps: {
          byUniversalIdentifier: hasCreator
            ? {
                [MYAH_STANDARD_OBJECTS.creator.universalIdentifier]: {
                  id: 'creator-id',
                },
              }
            : {},
        },
        flatFieldMetadataMaps: {
          byUniversalIdentifier: Object.fromEntries(
            fields.map((item) => [item.universalIdentifier, item]),
          ),
        },
      }),
    } as never,
  );
  const args = {
    workspaceId: 'workspace-id',
    dataSource: {},
    options: {},
  } as never;
  return { command, args, synchronizeWorkspace };
};

describe('RemoveLegacyCreatorSocialFieldsCommand', () => {
  it('deletes only per-platform Creator scalar fields, keeping relations and core fields', async () => {
    const { command, args, synchronizeWorkspace } = setup([
      field('u-ig-user', 'instagramUsername'),
      field('u-ig-link', 'instagramLink', 'creator-id', FieldMetadataType.LINKS),
      field('u-tt-count', 'tiktokFollowerCount', 'creator-id', FieldMetadataType.NUMBER),
      field('u-patreon', 'patreonUrl'),
      field(
        'u-ig-conversations',
        'instagramConversations',
        'creator-id',
        FieldMetadataType.RELATION,
      ),
      field('u-name', 'name'),
      field('u-email', 'email'),
      field('u-other', 'instagramUsername', 'other-object-id'),
    ]);

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(
      args,
      {},
      {
        deletionSelection: {
          fieldMetadata: new Set([
            'u-ig-user',
            'u-ig-link',
            'u-tt-count',
            'u-patreon',
          ]),
        },
      },
    );
  });

  it('does nothing on fresh workspaces without legacy fields or without Creator', async () => {
    const fresh = setup([field('u-name', 'name')]);
    await fresh.command.runOnWorkspace(fresh.args);
    const noCreator = setup([field('u-ig-user', 'instagramUsername')], false);
    await noCreator.command.runOnWorkspace(noCreator.args);

    expect(fresh.synchronizeWorkspace).not.toHaveBeenCalled();
    expect(noCreator.synchronizeWorkspace).not.toHaveBeenCalled();
  });
});

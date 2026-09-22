import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import {
  RetireBrandBrainMetadataCommand,
  RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
} from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';

describe('RetireBrandBrainMetadataCommand', () => {
  it('synchronizes inert objects and deletes only presentation metadata', async () => {
    const standardMetadataCommand = { synchronizeWorkspace: jest.fn() };
    const command = new RetireBrandBrainMetadataCommand(
      null as never,
      standardMetadataCommand as never,
    );
    const args = {
      workspaceId: 'workspace-id',
      options: { dryRun: false },
    } as never;

    await command.runOnWorkspace(args);

    expect(standardMetadataCommand.synchronizeWorkspace).toHaveBeenCalledWith(
      args,
      {
        targetObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
          MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
          MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
        ]),
        migrateLegacyMyahApplication: false,
        explicitObsoleteUniversalIdentifiersByMetadataName:
          RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
      },
    );

    expect(
      RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
    ).not.toHaveProperty('objectMetadata');
    expect(
      RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
    ).not.toHaveProperty('fieldMetadata');
    expect(
      RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
    ).not.toHaveProperty('roleTarget');
  });
});

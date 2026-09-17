import { InstallMyahInboxEmailGeneralProvenanceCommand } from '../2-20-workspace-command-1789313971538-install-myah-inbox-email-general-provenance.command';
import { CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand } from '../2-20-instance-command-fast-1789313971537-create-myah-inbox-email-general-provenance';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { EmailReplyContextActivationWorkspaceCommandProviderModule } from 'src/database/commands/upgrade-version-command/email-reply-context-activation-workspace-command-provider.module';
import { WorkspaceCommandProviderModule } from 'src/database/commands/upgrade-version-command/workspace-command-provider.module';
import { V2_20_EmailReplyContextActivationUpgradeVersionCommandModule } from '../2-20-email-reply-context-activation-upgrade-version-command.module';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { MigrateMyahInboxEmailReplyContextDraftsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-migrate-myah-inbox-email-reply-context-drafts.command';
import { EmailReplyContextActivationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-preflight.service';

describe('Email reply-context release provider graphs', () => {
  const providersOf = (module: Function): unknown[] =>
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [];

  it('keeps release A compatibility-only with no Email copy or activation provider', () => {
    const providers = providersOf(V2_20_UpgradeVersionCommandModule);

    expect(providers).toContain(InstallMyahInboxEmailGeneralProvenanceCommand);
    expect(providers).toContain(CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand);
    expect(providers).not.toContain(EmailReplyContextActivationService);
    expect(providers).not.toContain(MigrateMyahInboxEmailReplyContextDraftsCommand);
  });

  it('registers only the Email contextual activation command in release B', () => {
    const providers = providersOf(
      V2_20_EmailReplyContextActivationUpgradeVersionCommandModule,
    );

    expect(providers).toEqual([MigrateMyahInboxEmailReplyContextDraftsCommand]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        EmailReplyContextActivationWorkspaceCommandProviderModule,
      ),
    ).toEqual(
      expect.arrayContaining([
        WorkspaceCommandProviderModule,
        V2_20_EmailReplyContextActivationUpgradeVersionCommandModule,
      ]),
    );
  });
});

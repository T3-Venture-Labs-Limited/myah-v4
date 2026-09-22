import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';

import { AdminPanelResolver } from 'src/engine/core-modules/admin-panel/admin-panel.resolver';
import { ApplicationInstallModule } from 'src/engine/core-modules/application/application-install/application-install.module';
import { ApplicationInstallResolver } from 'src/engine/core-modules/application/application-install/application-install.resolver';
import { MarketplaceModule } from 'src/engine/core-modules/application/application-marketplace/marketplace.module';
import { MarketplaceResolver } from 'src/engine/core-modules/application/application-marketplace/marketplace.resolver';
import { ApplicationOAuthResolver } from 'src/engine/core-modules/application/application-oauth/application-oauth.resolver';
import { ApplicationRegistrationModule } from 'src/engine/core-modules/application/application-registration/application-registration.module';
import { ApplicationRegistrationResolver } from 'src/engine/core-modules/application/application-registration/application-registration.resolver';
import { ApplicationUpgradeModule } from 'src/engine/core-modules/application/application-upgrade/application-upgrade.module';
import { ApplicationUpgradeResolver } from 'src/engine/core-modules/application/application-upgrade/application-upgrade.resolver';
import { ApplicationVariableEntityModule } from 'src/engine/core-modules/application/application-variable/application-variable.module';
import { ApplicationVariableEntityResolver } from 'src/engine/core-modules/application/application-variable/application-variable.resolver';
import { EnterpriseResolver } from 'src/engine/core-modules/enterprise/enterprise.resolver';
import { EventLogsLiveResolver } from 'src/engine/core-modules/event-logs/event-logs-live.resolver';
import { EventLogsResolver } from 'src/engine/core-modules/event-logs/event-logs.resolver';
import { WorkspaceResolver } from 'src/engine/core-modules/workspace/workspace.resolver';
import { MyahTeamGuard } from 'src/engine/guards/myah-team.guard';
import { MyahTeamWorkspaceModelGuard } from 'src/engine/guards/myah-team-workspace-model.guard';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';

const getGuards = (target: object) => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, target);

  return Array.isArray(guards) ? guards : [];
};

describe('Myah Team platform boundary guards', () => {
  it.each([
    ['AdminPanelResolver', AdminPanelResolver],
    ['EnterpriseResolver', EnterpriseResolver],
  ])('requires a verified Myah Team identity for %s', (_name, resolver) => {
    expect(getGuards(resolver)).toEqual(
      expect.arrayContaining([MyahTeamGuard, NoImpersonationGuard]),
    );
  });

  it.each([
    ['EventLogsResolver', EventLogsResolver],
    ['EventLogsLiveResolver', EventLogsLiveResolver],
  ])('keeps %s scoped to workspace permissions', (_name, resolver) => {
    expect(getGuards(resolver)).not.toContain(MyahTeamGuard);
  });

  it.each([
    [ApplicationInstallModule, ApplicationInstallResolver],
    [ApplicationUpgradeModule, ApplicationUpgradeResolver],
    [ApplicationVariableEntityModule, ApplicationVariableEntityResolver],
    [MarketplaceModule, MarketplaceResolver],
    [ApplicationRegistrationModule, ApplicationRegistrationResolver],
  ])(
    'does not register customer application resolver %p',
    (module, resolver) => {
      expect(
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [],
      ).not.toContain(resolver);
    },
  );

  it('removes customer application-token minting', () => {
    expect(
      'generateApplicationToken' in ApplicationOAuthResolver.prototype,
    ).toBe(false);
  });

  it('requires a Team identity to synchronize the marketplace catalog', () => {
    expect(
      getGuards(MarketplaceResolver.prototype.syncMarketplaceCatalog),
    ).toEqual(expect.arrayContaining([MyahTeamGuard, NoImpersonationGuard]));
  });

  it('keeps application token renewal available to existing installations', () => {
    expect(
      getGuards(ApplicationOAuthResolver.prototype.renewApplicationToken),
    ).not.toEqual(expect.arrayContaining([MyahTeamGuard]));
  });

  it('requires a Team identity to change workspace AI model availability', () => {
    expect(getGuards(WorkspaceResolver.prototype.updateWorkspace)).toEqual(
      expect.arrayContaining([MyahTeamWorkspaceModelGuard]),
    );
  });
});

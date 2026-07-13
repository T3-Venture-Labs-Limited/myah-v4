import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AdminPanelResolver } from 'src/engine/core-modules/admin-panel/admin-panel.resolver';
import { ApplicationDevelopmentResolver } from 'src/engine/core-modules/application/application-development/application-development.resolver';
import { ApplicationInstallResolver } from 'src/engine/core-modules/application/application-install/application-install.resolver';
import { MarketplaceResolver } from 'src/engine/core-modules/application/application-marketplace/marketplace.resolver';
import { ApplicationOAuthResolver } from 'src/engine/core-modules/application/application-oauth/application-oauth.resolver';
import { ApplicationUpgradeResolver } from 'src/engine/core-modules/application/application-upgrade/application-upgrade.resolver';
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
    ['ApplicationInstallResolver', ApplicationInstallResolver],
    ['ApplicationDevelopmentResolver', ApplicationDevelopmentResolver],
    ['ApplicationUpgradeResolver', ApplicationUpgradeResolver],
    ['ApplicationVariableEntityResolver', ApplicationVariableEntityResolver],
    ['MarketplaceResolver', MarketplaceResolver],
    ['EventLogsResolver', EventLogsResolver],
    ['EventLogsLiveResolver', EventLogsLiveResolver],
  ])('requires a verified Myah Team identity for %s', (_name, resolver) => {
    expect(getGuards(resolver)).toEqual(
      expect.arrayContaining([MyahTeamGuard, NoImpersonationGuard]),
    );
  });

  it('requires a Team identity to mint application tokens', () => {
    expect(
      getGuards(ApplicationOAuthResolver.prototype.generateApplicationToken),
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

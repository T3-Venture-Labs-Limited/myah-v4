import { constants } from 'node:fs';
import { access, open, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { InjectRepository } from '@nestjs/typeorm';
import { Command, Option } from 'nest-commander';
import { In, type Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs, type WorkspaceCommandOptions } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { PageLayoutTabEntity } from 'src/engine/metadata-modules/page-layout-tab/entities/page-layout-tab.entity';
import { PageLayoutWidgetEntity } from 'src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity';
import { PageLayoutEntity } from 'src/engine/metadata-modules/page-layout/entities/page-layout.entity';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

type ManifestOptions = WorkspaceCommandOptions & { manifestDir?: string };
type Link = { id: string; deletedAt: Date | string | null; targetDashboardId: string | null };
type Dashboard = {
  id: string;
  deletedAt: Date | string | null;
  pageLayoutId: string | null;
  // WorkspaceRepository.find formats selected physical ACTOR columns into this composite.
  createdBy: {
    source?: string | null;
    workspaceMemberId?: string | null;
    name?: string | null;
    context?: Record<string, unknown> | null;
  } | null;
};

export const DASHBOARD_RETIREMENT_SELECT = {
  id: true,
  deletedAt: true,
  pageLayoutId: true,
  createdBySource: true,
  createdByWorkspaceMemberId: true,
  createdByName: true,
  createdByContext: true,
} as const;
type ManifestRow = {
  id: string;
  deleted: boolean;
  disposition: 'preserve' | 'preserve-anomalous-link';
  applicationId?: string;
  universalIdentifier?: string;
  pageLayoutId?: string | null;
  pageLayoutTabId?: string;
  targetDashboardId?: string | null;
  basePageLayoutId?: string;
  overridePageLayoutId?: string;
  basePageLayoutTabId?: string;
  overridePageLayoutTabId?: string;
  createdBy?: {
    source: string | null;
    workspaceMemberId: string | null;
    name: string | null;
    context: Record<string, unknown> | null;
  } | null;
};
export type DashboardRetirementManifest = {
  schemaVersion: 1;
  workspaceId: string;
  dashboards: ManifestRow[];
  pageLayouts: ManifestRow[];
  pageLayoutTabs: ManifestRow[];
  pageLayoutWidgets: ManifestRow[];
  attachments: ManifestRow[];
  timelineActivities: ManifestRow[];
  anomalousLinkedLayouts: ManifestRow[];
};

@RegisteredWorkspaceCommand('2.20.0', 1790000000413)
@Command({
  name: 'upgrade:2-20:retire-dashboard',
  description: 'Inventory preserved dashboard data without deleting or repurposing it',
})
export class RetireDashboardCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(PageLayoutEntity)
    private readonly pageLayoutRepository: Repository<PageLayoutEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(PageLayoutTabEntity)
    private readonly pageLayoutTabRepository: Repository<PageLayoutTabEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(PageLayoutWidgetEntity)
    private readonly pageLayoutWidgetRepository: Repository<PageLayoutWidgetEntity>,
  ) {
    super(workspaceIteratorService);
  }

  @Option({ flags: '--manifest-dir <directory>', description: 'Private task-specific directory for a read-only per-workspace manifest' })
  parseManifestDir(value: string): string {
    return value;
  }

  override async run(passedParams: string[], options: ManifestOptions): Promise<void> {
    if (!options.manifestDir) {
      if (options.manifestDir === '') throw new Error('Manifest directory is required');
      return super.run(passedParams, options);
    }
    const ids = options.workspaceId;

    // An inventory of sensitive records must never fall back to enumerating workspaces.
    if (!ids || ids.size !== 1 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test([...ids][0])) {
      throw new Error('Manifest output requires exactly one explicit UUID workspace ID (-w)');
    }
    const workspaceId = [...ids][0];
    const report = await this.workspaceIteratorService.iterate({
      workspaceIds: [workspaceId],
      activationStatuses: this.activationStatuses,
      dryRun: options.dryRun,
      callback: async (context) => this.runOnWorkspace({ ...context, options }),
    });

    if (report.fail.length || report.success.length !== 1 || report.success[0].workspaceId !== workspaceId) {
      throw new Error('Dashboard manifest failed or workspace was not processed; no success receipt');
    }
    this.logger.log('Dashboard manifest command completed');
  }

  override async runOnWorkspace({ workspaceId, options }: RunOnWorkspaceArgs): Promise<void> {
    const manifest = await this.buildManifest(workspaceId);
    const directory = (options as ManifestOptions).manifestDir;

    if (directory) await this.writeManifest(directory, manifest);

    // IDs and record contents belong only in the private artifact, never telemetry.
    this.logger.log(
      `Dashboard retirement inventory: ${manifest.dashboards.length} dashboard(s), ${manifest.pageLayouts.length} layout(s), ${manifest.pageLayoutTabs.length} tab(s), ${manifest.pageLayoutWidgets.length} widget(s), ${manifest.attachments.length} attachment(s), ${manifest.timelineActivities.length} timeline activity record(s), ${manifest.anomalousLinkedLayouts.length} anomalous linked layout(s)${directory ? '; private manifest written' : '; no manifest requested'}`,
    );
  }

  private async writeManifest(directory: string, manifest: DashboardRetirementManifest): Promise<void> {
    const root = resolve(homedir(), '.local/share/myah-scratch');
    const name = basename(directory);

    if (!name?.match(/^myah410-dashboard-[a-zA-Z0-9-]+$/) || resolve(directory) !== join(root, name)) {
      throw new Error('Manifest directory must be a task-specific direct child of the private scratch root');
    }
    const rootPath = await realpath(root);
    const path = await realpath(directory);
    const directoryStat = await stat(path);

    if (rootPath !== root || path !== join(root, name) || !directoryStat.isDirectory() ||
      (directoryStat.mode & 0o077) !== 0 || directoryStat.uid !== process.getuid?.()) {
      throw new Error('Manifest directory must be owned, private and not a symlink');
    }
    if (!/^[a-zA-Z0-9-]+$/.test(manifest.workspaceId)) throw new Error('Invalid workspace ID for manifest filename');
    const filename = join(path, `${manifest.workspaceId}.dashboard-retirement.json`);
    const contents = `${JSON.stringify(manifest, null, 2)}\n`;

    try {
      const file = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);

      try {
        await file.writeFile(contents);
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await access(filename, constants.R_OK);
      const existing = await stat(filename);

      if (!existing.isFile() || existing.uid !== process.getuid?.() || (existing.mode & 0o077) !== 0 ||
        await readFile(filename, 'utf8') !== contents) {
        throw new Error('Existing dashboard manifest differs; use a new task directory');
      }
    }
  }

  private async buildManifest(workspaceId: string): Promise<DashboardRetirementManifest> {
    const { dashboardRows, attachmentRows, timelineActivityRows } = await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dashboardRepository = await this.globalWorkspaceOrmManager.getRepository<Dashboard>(workspaceId, 'dashboard', { shouldBypassPermissionChecks: true });
        const attachmentRepository = await this.globalWorkspaceOrmManager.getRepository<Link>(workspaceId, 'attachment', { shouldBypassPermissionChecks: true });
        const timelineActivityRepository = await this.globalWorkspaceOrmManager.getRepository<Link>(workspaceId, 'timelineActivity', { shouldBypassPermissionChecks: true });
        const dashboardRows = await dashboardRepository.find({ select: DASHBOARD_RETIREMENT_SELECT, withDeleted: true });
        const dashboardIds = dashboardRows.map(({ id }) => id);

        return {
          dashboardRows,
          attachmentRows: dashboardIds.length ? await attachmentRepository.find({ select: { id: true, deletedAt: true, targetDashboardId: true }, where: { targetDashboardId: In(dashboardIds) }, withDeleted: true }) : [],
          timelineActivityRows: dashboardIds.length ? await timelineActivityRepository.find({ select: { id: true, deletedAt: true, targetDashboardId: true }, where: { targetDashboardId: In(dashboardIds) }, withDeleted: true }) : [],
        };
      }, buildSystemAuthContext(workspaceId),
    );
    if (dashboardRows.some(({ createdBy }) => createdBy === undefined ||
      (createdBy !== null && (typeof createdBy !== 'object' || Array.isArray(createdBy))))) {
      throw new Error('Dashboard creator attribution missing from formatted repository result');
    }
    const linkedIds = [...new Set(dashboardRows.map(({ pageLayoutId }) => pageLayoutId).filter((id): id is string => id !== null))];
    const layouts = await this.pageLayoutRepository.find({
      select: { id: true, deletedAt: true, applicationId: true, universalIdentifier: true, type: true },
      where: { workspaceId, type: PageLayoutType.DASHBOARD }, withDeleted: true,
    });
    const layoutIds = new Set(layouts.map(({ id }) => id));
    const otherIds = linkedIds.filter((id) => !layoutIds.has(id));
    const anomalousLayouts = otherIds.length ? await this.pageLayoutRepository.find({
      select: { id: true, deletedAt: true, applicationId: true, universalIdentifier: true, type: true },
      where: { workspaceId, id: In(otherIds) }, withDeleted: true,
    }) : [];
    const tabs = layoutIds.size ? await this.pageLayoutTabRepository.find({
      select: { id: true, deletedAt: true, applicationId: true, universalIdentifier: true, pageLayoutId: true, overrides: true },
      where: { workspaceId }, withDeleted: true,
    }) : [];
    // Legacy JSON may contain a layout override even though today's tab type does not expose one.
    const overrideLayoutId = (tab: PageLayoutTabEntity) =>
      (tab.overrides as { pageLayoutId?: string } | null)?.pageLayoutId;
    const closureTabs = tabs.filter((tab) => layoutIds.has(tab.pageLayoutId) || layoutIds.has(overrideLayoutId(tab) ?? ''));
    const tabIds = new Set(closureTabs.map(({ id }) => id));
    const widgets = tabIds.size ? await this.pageLayoutWidgetRepository.find({
      select: { id: true, deletedAt: true, applicationId: true, universalIdentifier: true, pageLayoutTabId: true, overrides: true },
      where: { workspaceId }, withDeleted: true,
    }) : [];
    const closureWidgets = widgets.filter((widget) => tabIds.has(widget.pageLayoutTabId) || tabIds.has(widget.overrides?.pageLayoutTabId ?? ''));
    const sorted = (rows: ManifestRow[]) => rows.sort((a, b) => a.id.localeCompare(b.id));
    const status = (deletedAt: Date | string | null) => deletedAt !== null;

    return {
      schemaVersion: 1, workspaceId,
      dashboards: sorted(dashboardRows.map(({ id, deletedAt, pageLayoutId, createdBy }) => ({ id, deleted: status(deletedAt), disposition: pageLayoutId && !layoutIds.has(pageLayoutId) ? 'preserve-anomalous-link' : 'preserve', pageLayoutId, createdBy: createdBy === null ? null : { source: createdBy.source ?? null, workspaceMemberId: createdBy.workspaceMemberId ?? null, name: createdBy.name ?? null, context: createdBy.context ?? null } }))),
      pageLayouts: sorted(layouts.map(({ id, deletedAt, applicationId, universalIdentifier }) => ({ id, deleted: status(deletedAt), disposition: 'preserve', applicationId, universalIdentifier }))),
      pageLayoutTabs: sorted(closureTabs.map(({ id, deletedAt, applicationId, universalIdentifier, pageLayoutId, overrides }) => ({ id, deleted: status(deletedAt), disposition: 'preserve', applicationId, universalIdentifier, basePageLayoutId: pageLayoutId, ...(overrides as { pageLayoutId?: string } | null)?.pageLayoutId && { overridePageLayoutId: (overrides as { pageLayoutId: string }).pageLayoutId } }))),
      pageLayoutWidgets: sorted(closureWidgets.map(({ id, deletedAt, applicationId, universalIdentifier, pageLayoutTabId, overrides }) => ({ id, deleted: status(deletedAt), disposition: 'preserve', applicationId, universalIdentifier, basePageLayoutTabId: pageLayoutTabId, ...overrides?.pageLayoutTabId && { overridePageLayoutTabId: overrides.pageLayoutTabId } }))),
      attachments: sorted(attachmentRows.map(({ id, deletedAt, targetDashboardId }) => ({ id, deleted: status(deletedAt), disposition: 'preserve', targetDashboardId }))),
      timelineActivities: sorted(timelineActivityRows.map(({ id, deletedAt, targetDashboardId }) => ({ id, deleted: status(deletedAt), disposition: 'preserve', targetDashboardId }))),
      anomalousLinkedLayouts: sorted(anomalousLayouts.map(({ id, deletedAt, applicationId, universalIdentifier }) => ({ id, deleted: status(deletedAt), disposition: 'preserve-anomalous-link', applicationId, universalIdentifier }))),
    };
  }
}

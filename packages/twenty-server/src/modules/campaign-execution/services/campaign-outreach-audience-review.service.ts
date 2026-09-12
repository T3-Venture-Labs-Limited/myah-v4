import { Injectable } from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { MYAH_CAMPAIGN_CREATOR_OUTREACH_ELIGIBLE_STAGES } from 'twenty-shared/metadata';
import { In, type ObjectLiteral } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GLOBAL_BLOCKING_SUPPRESSION_REASONS } from 'src/engine/core-modules/emailing-domain/constants/hard-suppression-reasons.constant';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { MessageSuppressionService } from 'src/modules/emailing/services/message-suppression.service';
import {
  type CampaignOutreachAudienceExclusionReason,
  type CampaignOutreachAudienceReview,
} from 'src/modules/campaign-execution/types/campaign-outreach-audience-review.type';
import { normalizeCampaignCreatorEmail } from 'src/modules/myah-outreach/utils/normalize-campaign-creator-email.util';

const SYSTEM_PERMISSIONS = { shouldBypassPermissionChecks: true } as const;
const REASON_ORDER: readonly CampaignOutreachAudienceExclusionReason[] = [
  'INVALID_MEMBERSHIP',
  'MISSING_CREATOR',
  'INVALID_STAGE',
  'NON_EMAIL_CONTACT_METHOD',
  'INVALID_EMAIL',
  'SUPPRESSED_EMAIL',
  'DUPLICATE_CREATOR_EMAIL',
];

export class CampaignOutreachAudienceAccessError extends Error {}

type Campaign = ObjectLiteral & { id: string; deletedAt?: unknown };
type Membership = ObjectLiteral & {
  id: unknown;
  campaignId: unknown;
  creatorId: unknown;
  stage: unknown;
  selectedContactMethod: unknown;
  deletedAt?: unknown;
};
type Creator = ObjectLiteral & {
  id: unknown;
  name: unknown;
  email: unknown;
  deletedAt?: unknown;
};

type AudienceRows = Readonly<{
  memberships: readonly Membership[];
  audienceCreators: readonly Creator[];
  allWorkspaceCreators: readonly Creator[];
}>;

@Injectable()
export class CampaignOutreachAudienceReviewService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly suppression: MessageSuppressionService,
  ) {}

  async preview(input: {
    authContext: WorkspaceAuthContext;
    campaignId: string;
  }): Promise<CampaignOutreachAudienceReview> {
    const { authContext, campaignId } = input;
    const workspaceId = authContext.workspace.id;

    return this.orm.executeInWorkspaceContext(async () => {
      if (getWorkspaceContext().authContext.workspace.id !== workspaceId)
        throw new CampaignOutreachAudienceAccessError(
          'Campaign audience workspace context mismatch',
        );

      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: getWorkspaceContext().userWorkspaceRoleMap,
        apiKeyRoleMap: getWorkspaceContext().apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new CampaignOutreachAudienceAccessError(
          'Campaign audience review requires role permissions',
        );

      const [campaignRepository, membershipRepository, creatorRepository] =
        await Promise.all([
          this.repository<Campaign>(workspaceId, 'campaign', permissions),
          this.repository<Membership>(
            workspaceId,
            'campaignCreator',
            permissions,
          ),
          this.repository<Creator>(workspaceId, 'creator', permissions),
        ]);
      const [campaign, memberships] = await Promise.all([
        campaignRepository.findOne({
          where: { id: campaignId },
          select: { id: true, deletedAt: true },
        }),
        membershipRepository.find({
          where: { campaignId },
          select: {
            id: true,
            campaignId: true,
            creatorId: true,
            stage: true,
            selectedContactMethod: true,
            deletedAt: true,
          },
        }),
      ]);
      if (!campaign || campaign.deletedAt != null)
        throw new CampaignOutreachAudienceAccessError(
          'Campaign is missing, inaccessible, or deleted',
        );

      const activeMemberships = memberships.filter(
        (row) => row.deletedAt == null && row.campaignId === campaignId,
      );
      const creatorIds = [
        ...new Set(
          activeMemberships
            .map(({ creatorId }) => creatorId)
            .filter((id): id is string => typeof id === 'string'),
        ),
      ];
      const audienceCreators = await creatorRepository.find({
        where: { id: In(creatorIds) },
        select: { id: true, name: true, email: true, deletedAt: true },
      });
      const allWorkspaceCreators = await this.orm.executeInWorkspaceContext(
        async () => {
          const repository = await this.repository<Creator>(
            workspaceId,
            'creator',
            SYSTEM_PERMISSIONS,
          );
          return repository.find({
            select: { id: true, email: true, deletedAt: true },
          });
        },
        buildSystemAuthContext(workspaceId),
      );

      const candidateEmails = this.candidateEmails(audienceCreators);
      const suppressedEmails = await this.suppression.getSuppressedAddresses(
        workspaceId,
        candidateEmails,
      );

      return this.evaluate(
        campaignId,
        {
          memberships: activeMemberships,
          audienceCreators,
          allWorkspaceCreators,
        },
        suppressedEmails,
      );
    }, authContext);
  }

  async reviewInTransaction(input: {
    workspaceId: string;
    campaignId: string;
    schemaName: string;
    manager: WorkspaceEntityManager;
    rolePermissionConfig: RolePermissionConfig;
  }): Promise<CampaignOutreachAudienceReview> {
    const {
      campaignId,
      manager,
      rolePermissionConfig,
      schemaName,
      workspaceId,
    } = input;
    const runner = manager.queryRunner;
    if (
      !runner ||
      !runner.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager
    )
      throw new Error('Campaign audience review requires the active manager');

    // User-triggered Start holds these SHARE table locks until activation
    // persistence commits. DML takes ROW EXCLUSIVE, so Creator/membership and
    // global-suppression inserts/updates cannot interleave with this snapshot.
    await runner.query(
      `LOCK TABLE "${schemaName}"."campaignCreator", "${schemaName}".creator, core."messageSuppression" IN SHARE MODE`,
    );

    const [membershipRepository, creatorRepository] = await Promise.all([
      this.repository<Membership>(
        workspaceId,
        'campaignCreator',
        rolePermissionConfig,
      ),
      this.repository<Creator>(workspaceId, 'creator', rolePermissionConfig),
    ]);
    const memberships = await membershipRepository.find(
      {
        where: { campaignId },
        select: {
          id: true,
          campaignId: true,
          creatorId: true,
          stage: true,
          selectedContactMethod: true,
          deletedAt: true,
        },
      },
      manager,
    );
    const activeMemberships = memberships.filter(
      (row) => row.deletedAt == null && row.campaignId === campaignId,
    );
    const creatorIds = [
      ...new Set(
        activeMemberships
          .map(({ creatorId }) => creatorId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const audienceCreators = await creatorRepository.find(
      {
        where: { id: In(creatorIds) },
        select: { id: true, name: true, email: true, deletedAt: true },
      },
      manager,
    );
    const allWorkspaceCreators = await runner.query(
      `SELECT id, email, "deletedAt"
         FROM "${schemaName}".creator
        WHERE "deletedAt" IS NULL
        ORDER BY id`,
    );
    if (!Array.isArray(allWorkspaceCreators))
      throw new Error('Campaign audience duplicate census was incomplete');

    const candidateEmails = this.candidateEmails(audienceCreators);
    const suppressionRows = await runner.query(
      `SELECT "emailAddress"
         FROM core."messageSuppression"
        WHERE "workspaceId" = $1
          AND "emailAddress" = ANY($2::varchar[])
          AND reason::text = ANY($3::text[])
          AND "unsubscribeTopicId" IS NULL
        ORDER BY "emailAddress"`,
      [workspaceId, candidateEmails, GLOBAL_BLOCKING_SUPPRESSION_REASONS],
    );
    if (!Array.isArray(suppressionRows))
      throw new Error('Campaign audience suppression review was incomplete');
    const suppressedEmails = new Set(
      suppressionRows.map(({ emailAddress }) => emailAddress),
    );

    return this.evaluate(
      campaignId,
      {
        memberships: activeMemberships,
        audienceCreators,
        allWorkspaceCreators,
      },
      suppressedEmails,
    );
  }

  private evaluate(
    campaignId: string,
    rows: AudienceRows,
    suppressedEmailInput: ReadonlySet<string>,
  ): CampaignOutreachAudienceReview {
    const creators = new Map(
      rows.audienceCreators
        .filter(
          (creator) =>
            creator.deletedAt == null &&
            typeof creator.id === 'string' &&
            isUuid(creator.id),
        )
        .map((creator) => [creator.id as string, creator]),
    );
    const emailCounts = new Map<string, number>();
    for (const creator of rows.allWorkspaceCreators) {
      if (creator.deletedAt != null) continue;
      const email = normalizeCampaignCreatorEmail(creator.email);
      if (email !== null)
        emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
    const duplicateEmails = new Set(
      [...emailCounts].filter(([, count]) => count > 1).map(([email]) => email),
    );
    const suppressedEmails = new Set(
      [...suppressedEmailInput].map((email) => email.trim().toLowerCase()),
    );
    const eligible: CampaignOutreachAudienceReview['eligible'][number][] = [];
    const excluded: CampaignOutreachAudienceReview['excluded'][number][] = [];

    for (const membership of rows.memberships) {
      const campaignCreatorId =
        typeof membership.id === 'string' && isUuid(membership.id)
          ? membership.id
          : null;
      const creatorId =
        typeof membership.creatorId === 'string' && isUuid(membership.creatorId)
          ? membership.creatorId
          : null;
      const creator = creatorId === null ? undefined : creators.get(creatorId);
      const email = creator
        ? normalizeCampaignCreatorEmail(creator.email)
        : null;
      const reasons: CampaignOutreachAudienceExclusionReason[] = [];
      if (
        campaignCreatorId === null ||
        membership.campaignId !== campaignId ||
        membership.deletedAt != null
      )
        reasons.push('INVALID_MEMBERSHIP');
      if (!creator) reasons.push('MISSING_CREATOR');
      if (
        !MYAH_CAMPAIGN_CREATOR_OUTREACH_ELIGIBLE_STAGES.has(
          membership.stage as never,
        )
      )
        reasons.push('INVALID_STAGE');
      if (
        typeof membership.selectedContactMethod !== 'string' ||
        membership.selectedContactMethod.trim().toUpperCase() !== 'EMAIL'
      )
        reasons.push('NON_EMAIL_CONTACT_METHOD');
      if (creator && email === null) reasons.push('INVALID_EMAIL');
      if (email && suppressedEmails.has(email))
        reasons.push('SUPPRESSED_EMAIL');
      if (email && duplicateEmails.has(email))
        reasons.push('DUPLICATE_CREATOR_EMAIL');

      const creatorName = creator
        ? this.displayName(creator.name, creatorId as string)
        : null;
      if (
        reasons.length === 0 &&
        campaignCreatorId !== null &&
        creatorId !== null &&
        creatorName !== null &&
        email !== null
      ) {
        eligible.push({
          campaignCreatorId,
          creatorId,
          creatorName,
          normalizedEmail: email,
        });
      } else {
        excluded.push({
          campaignCreatorId: campaignCreatorId ?? String(membership.id ?? ''),
          creatorId,
          creatorName,
          reasons: REASON_ORDER.filter((reason) => reasons.includes(reason)),
        });
      }
    }

    const compare = (
      left: { creatorName: string | null; campaignCreatorId: string },
      right: { creatorName: string | null; campaignCreatorId: string },
    ) =>
      (left.creatorName ?? '').localeCompare(
        right.creatorName ?? '',
        undefined,
        {
          sensitivity: 'base',
        },
      ) || left.campaignCreatorId.localeCompare(right.campaignCreatorId);

    return Object.freeze({
      campaignId,
      eligible: Object.freeze(eligible.sort(compare)),
      excluded: Object.freeze(excluded.sort(compare)),
    });
  }

  private candidateEmails(creators: readonly Creator[]): string[] {
    return [
      ...new Set(
        creators
          .filter((creator) => creator.deletedAt == null)
          .map(({ email }) => normalizeCampaignCreatorEmail(email))
          .filter((email): email is string => email !== null),
      ),
    ].sort();
  }

  private repository<T extends ObjectLiteral>(
    workspaceId: string,
    objectName: string,
    permissions: RolePermissionConfig,
  ): Promise<WorkspaceRepository<T>> {
    return this.orm.getRepository<T>(workspaceId, objectName, permissions);
  }

  private displayName(name: unknown, fallback: string): string {
    return typeof name === 'string' && name.trim() ? name.trim() : fallback;
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import {
  type MyahInboxReplyContextOptionsInput,
  validateReplyContextOptionsInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context-options.input';
import {
  type MyahInboxReplyContextOptions,
  type MyahInboxReplyDefaultContext,
  type MyahInboxReplyContextOptionEdge,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context-options.dto';
import { ReplyContextKind } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { EmailReplyContextActivationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-preflight.service';
import {
  MyahInboxReplyContextQueryEvidenceResolver,
  type ReplyContextRequest,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { decodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

type OptionsRequest = Omit<
  ReplyContextRequest,
  'target' | 'replyContext' | 'contactIdentity'
> &
  MyahInboxReplyContextOptionsInput;

@Injectable()
export class MyahInboxReplyContextOptionsService {
  constructor(
    private readonly evidenceResolver: MyahInboxReplyContextQueryEvidenceResolver,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly activationGate: EmailReplyContextActivationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listOptions(
    input: OptionsRequest,
  ): Promise<MyahInboxReplyContextOptions> {
    const { target, first } = validateReplyContextOptionsInput(input);
    if (
      !isUserAuthContext(input.authContext) ||
      input.authContext.workspace.id !== input.expectedWorkspaceId ||
      input.workspace.id !== input.expectedWorkspaceId ||
      input.workspaceMemberId !== input.authContext.workspaceMemberId
    ) {
      throw new ForbiddenException('Reply context is not readable');
    }
    await this.activationGate.assertEmailContextActivationEnabled(
      input.workspace.id,
    );
    const contactIdentity = decodeMyahInboxContactId(
      target.contactId,
      input.workspace.id,
    );
    if (contactIdentity.kind !== 'creator') {
      throw new ForbiddenException('Reply context is not readable');
    }
    const cursorFor = (campaignId: string) =>
      Buffer.from(
        JSON.stringify([
          1,
          input.workspace.id,
          target.threadId,
          target.contactId,
          campaignId,
        ]),
      ).toString('base64url');
    let afterId: string | null = null;
    if (input.after != null) {
      try {
        const cursor: unknown = JSON.parse(
          Buffer.from(input.after, 'base64url').toString('utf8'),
        );
        if (
          !Array.isArray(cursor) ||
          cursor.length !== 5 ||
          typeof cursor[4] !== 'string' ||
          !isValidUuid(cursor[4]) ||
          cursorFor(cursor[4]) !== input.after
        ) {
          throw new Error('Invalid cursor');
        }
        afterId = cursor[4];
      } catch {
        throw new BadRequestException('Invalid reply context options cursor');
      }
    }
    const request: ReplyContextRequest = {
      authContext: input.authContext,
      user: input.user,
      workspace: input.workspace,
      workspaceMemberId: input.workspaceMemberId,
      target,
      contactIdentity,
      replyContext: { kind: ReplyContextKind.GENERAL },
    };
    // Reuse the same Inbox visibility and required Creator authority as draft reads.
    const anchor = await this.evidenceResolver.resolveCurrentEvidence(request);
    if (!anchor.readable)
      throw new ForbiddenException('Reply context is not readable');

    try {
      return await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const workspaceContext = getWorkspaceContext();
          const rolePermissionConfig = resolveRolePermissionConfig({
            authContext: input.authContext,
            userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
            apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
          });
          if (!rolePermissionConfig)
            throw new ForbiddenException('Reply context is not readable');
          const threads = await this.globalWorkspaceOrmManager.getRepository<{
            id: string;
            creatorId: string | null;
            myahCampaignId: string | null;
            deletedAt: Date | null;
          }>(input.workspace.id, 'messageThread', rolePermissionConfig);
          const thread = await threads.findOne({
            where: { id: target.threadId, deletedAt: IsNull() },
            select: { id: true, creatorId: true, myahCampaignId: true },
          });
          if (!thread || thread.creatorId !== contactIdentity.recordId)
            throw new ForbiddenException('Reply context is not readable');
          // SET_NULL on Campaign deletion is indistinguishable from historical
          // unassociation. Only insert-time proof for this readable anchor counts.
          const proof =
            thread.myahCampaignId === null
              ? await this.dataSource.query<{ proven: boolean }[]>(
                  `SELECT true AS proven FROM core."myahInboxEmailGeneralProvenance"
                 WHERE "workspaceId" = $1 AND "deliveryTargetId" = $2
                   AND "creatorId" = $3 AND "revokedAt" IS NULL`,
                  [
                    input.workspace.id,
                    target.threadId,
                    contactIdentity.recordId,
                  ],
                )
              : [];
          const generalAvailable = proof[0]?.proven === true;
          let defaultContext: MyahInboxReplyDefaultContext | null =
            generalAvailable
              ? {
                  kind: ReplyContextKind.GENERAL,
                  campaignId: null,
                  campaignName: null,
                }
              : null;
          const exactCampaignId =
            typeof thread.myahCampaignId === 'string' &&
            isValidUuid(thread.myahCampaignId)
              ? thread.myahCampaignId
              : null;
          if (exactCampaignId) {
            const exact = await this.evidenceResolver.resolveCurrentEvidence({
              ...request,
              replyContext: {
                kind: ReplyContextKind.CAMPAIGN,
                campaignId: exactCampaignId,
              },
            });
            if (exact.readable)
              defaultContext = {
                kind: ReplyContextKind.CAMPAIGN,
                campaignId: exactCampaignId,
                campaignName: exact.campaignName ?? '',
              };
          }
          const terms = await this.globalWorkspaceOrmManager.getRepository<{
            id: string;
            creatorId: string;
            campaignId: string;
            deletedAt: Date | null;
          }>(input.workspace.id, 'campaignCreator', rolePermissionConfig);
          // Enumerate complete candidate history. Membership nominates a candidate,
          // never eligibility: every emitted option passes actual delivery evidence.
          const [legacyThreads, campaignCreators] = await Promise.all([
            threads.find({
              where: {
                creatorId: contactIdentity.recordId,
                deletedAt: IsNull(),
              },
              select: { id: true, myahCampaignId: true },
            }),
            terms.find({
              where: {
                creatorId: contactIdentity.recordId,
                deletedAt: IsNull(),
              },
              select: { id: true, campaignId: true },
            }),
          ]);
          const candidateIds = [
            ...new Set(
              [
                ...legacyThreads.map((row) => row.myahCampaignId),
                ...campaignCreators.map((row) => row.campaignId),
                exactCampaignId,
              ].filter(
                (id): id is string => typeof id === 'string' && isValidUuid(id),
              ),
            ),
          ].sort();
          const edges: MyahInboxReplyContextOptionEdge[] = [];
          for (const campaignId of candidateIds) {
            if (afterId && campaignId <= afterId) continue;
            const evidence = await this.evidenceResolver.resolveCurrentEvidence(
              {
                ...request,
                replyContext: { kind: ReplyContextKind.CAMPAIGN, campaignId },
              },
            );
            if (!evidence.readable || !evidence.eligible) continue;
            edges.push({
              cursor: cursorFor(campaignId),
              node: { id: campaignId, name: evidence.campaignName ?? '' },
            });
            if (edges.length > first) break;
          }
          const hasNextPage = edges.length > first;
          const page = edges.slice(0, first);
          return {
            edges: page,
            pageInfo: {
              hasNextPage,
              endCursor: page[page.length - 1]?.cursor ?? null,
            },
            generalAvailable,
            defaultContext,
          };
        },
        input.authContext,
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        (error instanceof PermissionsException &&
          error.code === PermissionsExceptionCode.PERMISSION_DENIED)
      ) {
        throw new ForbiddenException('Reply context is not readable');
      }
      throw error;
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';

import {
  MYAH_INBOX_DEFAULT_PAGE_SIZE,
  MYAH_INBOX_MAX_PAGE_SIZE,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  type MyahInboxThreadConnection,
  type MyahInboxThreadEdge,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import { type MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

type MyahInboxListThreadsInput = {
  workspaceId: string;
  workspaceMemberId: string;
  first?: number;
  after?: string;
  queue?: 'CREATOR_LINKED' | 'UNMATCHED';
  owner?: string;
  campaignId?: string;
  states?: string[];
  search?: string;
};

type MyahInboxCursor = {
  receivedAt: string;
  threadId: string;
};

type MyahInboxThreadRaw = {
  id: string;
  lastActivityAt: Date | string;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  state: string | null;
  creatorId: string | null;
  creatorName: string | null;
  campaignId: string | null;
  campaignName: string | null;
};

@Injectable()
export class MyahInboxQueryService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async listThreads(
    input: MyahInboxListThreadsInput,
  ): Promise<MyahInboxThreadConnection> {
    const pageSize = Math.min(
      input.first ?? MYAH_INBOX_DEFAULT_PAGE_SIZE,
      MYAH_INBOX_MAX_PAGE_SIZE,
    );
    const cursor = input.after ? this.decodeCursor(input.after) : undefined;

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const messageThreadRepository =
        await this.globalWorkspaceOrmManager.getRepository<Record<string, never>>(
          input.workspaceId,
          'messageThread',
        );
      const queryBuilder = messageThreadRepository
        .createQueryBuilder('messageThread')
        .select('messageThread.id', 'id')
        .addSelect('latestMessage.receivedAt', 'lastActivityAt')
        .addSelect('latestMessage.text', 'lastMessagePreview')
        .addSelect(
          `(SELECT messageParticipant.handle FROM "messageParticipant" messageParticipant WHERE messageParticipant."messageId" = latestMessage.id AND messageParticipant.role = 'FROM' ORDER BY messageParticipant.id ASC LIMIT 1)`,
          'lastMessageSender',
        )
        .addSelect('messageThread.inboxState', 'state')
        .addSelect('creator.id', 'creatorId')
        .addSelect('creator.name', 'creatorName')
        .addSelect('campaign.id', 'campaignId')
        .addSelect('campaign.name', 'campaignName')
        .leftJoin(
          'messageThread.messages',
          'latestMessage',
          `latestMessage.id = (SELECT message.id FROM message message WHERE message."messageThreadId" = messageThread.id AND message."deletedAt" IS NULL ORDER BY message."receivedAt" DESC, message.id DESC LIMIT 1)`,
        )
        .leftJoin('messageThread.creator', 'creator')
        .leftJoin('messageThread.campaign', 'campaign')
        .where('messageThread.deletedAt IS NULL')
        .andWhere('latestMessage.deletedAt IS NULL');

      if (input.queue === 'CREATOR_LINKED') {
        queryBuilder.andWhere('messageThread.creatorId IS NOT NULL');
      }
      if (input.queue === 'UNMATCHED') {
        queryBuilder.andWhere('messageThread.creatorId IS NULL');
      }
      if (input.owner === 'ME') {
        queryBuilder.andWhere('messageThread.inboxOwnerId = :inboxOwnerId', {
          inboxOwnerId: input.workspaceMemberId,
        });
      } else if (input.owner === 'UNASSIGNED') {
        queryBuilder.andWhere('messageThread.inboxOwnerId IS NULL');
      } else if (input.owner) {
        queryBuilder.andWhere('messageThread.inboxOwnerId = :inboxOwnerId', {
          inboxOwnerId: input.owner,
        });
      }
      if (input.campaignId) {
        queryBuilder.andWhere('messageThread.campaignId = :campaignId', {
          campaignId: input.campaignId,
        });
      }
      if (input.states?.length) {
        queryBuilder.andWhere('messageThread.inboxState IN (:...states)', {
          states: input.states,
        });
      }
      if (input.search) {
        queryBuilder.andWhere(
          '(latestMessage.subject ILIKE :search OR latestMessage.text ILIKE :search)',
          { search: `%${input.search}%` },
        );
      }
      if (cursor) {
        queryBuilder.andWhere(
          '(latestMessage.receivedAt < :cursorReceivedAt OR (latestMessage.receivedAt = :cursorReceivedAt AND messageThread.id < :cursorThreadId))',
          {
            cursorReceivedAt: cursor.receivedAt,
            cursorThreadId: cursor.threadId,
          },
        );
      }

      const rows = await queryBuilder
        .orderBy('latestMessage.receivedAt', 'DESC')
        .addOrderBy('messageThread.id', 'DESC')
        .limit(pageSize + 1)
        .getRawMany<MyahInboxThreadRaw>();
      const hasNextPage = rows.length > pageSize;
      const pageRows = rows.slice(0, pageSize);
      const edges = pageRows.map((row) => this.toEdge(row));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        },
      };
    }, buildSystemAuthContext(input.workspaceId));
  }

  private toEdge(row: MyahInboxThreadRaw): MyahInboxThreadEdge {
    const receivedAt =
      row.lastActivityAt instanceof Date
        ? row.lastActivityAt.toISOString()
        : row.lastActivityAt;

    return {
      cursor: this.encodeCursor({ receivedAt, threadId: row.id }),
      node: {
        id: row.id,
        lastActivityAt: receivedAt,
        lastMessagePreview: row.lastMessagePreview,
        lastMessageSender: row.lastMessageSender,
        state: row.state,
        creator: row.creatorId
          ? { id: row.creatorId, name: row.creatorName }
          : null,
        campaign: row.campaignId
          ? { id: row.campaignId, name: row.campaignName }
          : null,
      } satisfies MyahInboxThreadSummary,
    };
  }

  private encodeCursor(cursor: MyahInboxCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(cursor: string): MyahInboxCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<MyahInboxCursor>;

      if (
        typeof decoded.receivedAt !== 'string' ||
        typeof decoded.threadId !== 'string'
      ) {
        throw new Error('cursor fields are missing');
      }

      return { receivedAt: decoded.receivedAt, threadId: decoded.threadId };
    } catch {
      throw new BadRequestException('Invalid Myah inbox cursor');
    }
  }

}

import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

export type CapacitySelectionConstraint =
  | { kind: 'ROTATE' }
  | {
      kind: 'PINNED_REPLY' | 'EXPLICIT';
      connectedAccountId: string;
      messageChannelId: string;
      senderHandle: string;
    };

export type LockAndRankMailboxCapacityInput = {
  workspaceId: string;
  workspaceTimeZone: string;
  candidates: ReadyCampaignSenderReadiness[];
  selectionConstraint: CapacitySelectionConstraint;
};

export type LockedMailboxCapacityCandidate = {
  sender: ReadyCampaignSenderReadiness;
  localDate: string;
  acceptedCount: number;
  reservedCount: number;
  nextEligibleAt: Date | null;
  nextLocalMidnightAt: Date;
  earliestEligibleAt: Date;
};

export type LockAndRankMailboxCapacityResult =
  | {
      status: 'ELIGIBLE_NOW';
      observedAt: Date;
      selected: LockedMailboxCapacityCandidate;
      lockedCandidates: LockedMailboxCapacityCandidate[];
    }
  | {
      status: 'NOT_READY';
      observedAt: Date;
      nextEligibleAt: Date;
      lockedCandidates: LockedMailboxCapacityCandidate[];
    }
  | {
      status: 'BLOCKED';
      reason: 'PINNED_SENDER_NOT_READY' | 'INVALID_CAPACITY_INPUT';
    };

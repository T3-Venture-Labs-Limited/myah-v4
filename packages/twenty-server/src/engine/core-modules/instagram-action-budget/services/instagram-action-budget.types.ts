export type InstagramActionKind = 'START_CHAT' | 'REPLY';

export type InstagramActionBlockedWindow = 'HOURLY' | 'DAILY';

export type InstagramActionBudgetUsage = {
  hourlyUsed: number;
  hourlyLimit: 10;
  hourlyRemaining: number;
  dailyUsed: number;
  dailyLimit: 100;
  dailyRemaining: number;
  nextEligibleAt: Date | null;
};

export type InstagramActionBudgetBlockedResult = InstagramActionBudgetUsage & {
  status: 'BLOCKED';
  code: 'INSTAGRAM_ACTION_LIMIT_REACHED';
  blockedWindows: InstagramActionBlockedWindow[];
  reservationId?: never;
};

export type InstagramActionBudgetReservedResult = {
  status: 'RESERVED';
  reservationId: string;
};

export type InspectInstagramActionBudgetInput = {
  workspaceId: string;
  instagramAccountRecordId: string;
};

export type ReserveInstagramActionInput = InspectInstagramActionBudgetInput & {
  actionExecutionReceiptId: string;
  actionKind: InstagramActionKind;
  targetFingerprint: string;
};

export type ReservationTransitionInput = {
  workspaceId: string;
  reservationId: string;
};

export type ReleasePreDispatchInput = ReservationTransitionInput & {
  reason: string;
};

export type ReleaseStartTargetInput = ReservationTransitionInput & {
  reason: 'PROJECTED' | 'KNOWN_REJECTION' | 'RESOLVED';
};

export type ReleaseStartTargetForReceiptInput = {
  workspaceId: string;
  actionExecutionReceiptId: string;
  reason: 'PROJECTED' | 'RESOLVED';
};

export type GetInstagramActionBlockedResultInput = {
  workspaceId: string;
  actionExecutionReceiptId: string;
};

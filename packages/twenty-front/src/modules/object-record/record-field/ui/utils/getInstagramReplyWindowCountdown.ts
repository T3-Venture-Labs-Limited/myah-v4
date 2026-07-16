type InstagramReplyWindowCountdownStatus =
  | 'closed'
  | 'normal'
  | 'pending'
  | 'urgent'
  | 'warning';

type InstagramReplyWindowCountdown = {
  label: string;
  status: InstagramReplyWindowCountdownStatus;
};

type GetInstagramReplyWindowCountdownArgs = {
  deadline: string | null | undefined;
  now: Date;
};

const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_MINUTE = 60_000;
const WARNING_THRESHOLD_MINUTES = 60;
const URGENT_THRESHOLD_MINUTES = 15;

export const getInstagramReplyWindowCountdown = ({
  deadline,
  now,
}: GetInstagramReplyWindowCountdownArgs): InstagramReplyWindowCountdown => {
  if (deadline === null || deadline === undefined) {
    return { label: 'Awaiting reply', status: 'pending' };
  }

  const remainingMilliseconds = new Date(deadline).getTime() - now.getTime();

  if (remainingMilliseconds <= 0) {
    return { label: 'Window closed', status: 'closed' };
  }

  const remainingMinutes = Math.ceil(
    remainingMilliseconds / MILLISECONDS_PER_MINUTE,
  );
  const hours = Math.floor(remainingMinutes / MINUTES_PER_HOUR);
  const minutes = remainingMinutes % MINUTES_PER_HOUR;
  const label =
    hours > 0
      ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ''} left`
      : `${minutes}m left`;

  return {
    label,
    status:
      remainingMinutes <= URGENT_THRESHOLD_MINUTES
        ? 'urgent'
        : remainingMinutes <= WARNING_THRESHOLD_MINUTES
          ? 'warning'
          : 'normal',
  };
};

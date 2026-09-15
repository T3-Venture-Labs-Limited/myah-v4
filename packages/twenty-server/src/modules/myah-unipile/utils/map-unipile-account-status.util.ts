import { UnipileInstagramAccountBindingStatus } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { type UnipileInstagramSourceStatus } from 'src/modules/myah-unipile/types/unipile-v1.type';

const bindingStatusBySourceStatus = {
  OK: UnipileInstagramAccountBindingStatus.ACTIVE,
  CONNECTING: UnipileInstagramAccountBindingStatus.CONNECTING,
  CREDENTIALS: UnipileInstagramAccountBindingStatus.NEEDS_RECONNECT,
  PERMISSIONS: UnipileInstagramAccountBindingStatus.NEEDS_RECONNECT,
  ERROR: UnipileInstagramAccountBindingStatus.ERROR,
  STOPPED: UnipileInstagramAccountBindingStatus.ERROR,
} satisfies Record<
  UnipileInstagramSourceStatus,
  UnipileInstagramAccountBindingStatus
>;

export const mapUnipileAccountStatus = (
  sourceStatus: UnipileInstagramSourceStatus,
): UnipileInstagramAccountBindingStatus =>
  bindingStatusBySourceStatus[sourceStatus];

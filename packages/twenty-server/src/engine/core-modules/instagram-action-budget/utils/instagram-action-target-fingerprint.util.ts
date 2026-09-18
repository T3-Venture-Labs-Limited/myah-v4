import { createHash } from 'crypto';

const sha256 = (values: unknown[]) =>
  createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex');

export const computeInstagramActionTargetFingerprints = (input: {
  instagramAccountRecordId: string;
  normalizedHandle: string;
  providerId: string;
  providerMessagingId: string;
}): { legacyTargetFingerprints: string[]; targetFingerprint: string } => ({
  // The current key is a stable, account-scoped messaging identity. It must not
  // depend on mutable handle, route, or Creator data.
  targetFingerprint: sha256([
    input.instagramAccountRecordId,
    input.providerMessagingId,
  ]),
  // Preserve the historical v2 key exactly while old reservations drain.
  legacyTargetFingerprints: [
    sha256([input.normalizedHandle, input.providerId]),
  ],
});

import { createHash } from 'node:crypto';

const SEQUENCE_IDENTITY_PROOF_DOMAIN =
  'myah/campaign-sequence-launch/sequence-identity/v1';
const PREPARED_PROOF_DOMAIN = 'myah/campaign-sequence-launch/prepared/v1';
const SENDER_AUTHORITY_PROOF_DOMAIN =
  'myah/campaign-sequence-launch/sender-authority/v1';
const FIXED_MATERIAL_PROOF_DOMAIN =
  'myah/campaign-sequence-launch/fixed-material/v1';

export const canonicalCampaignProofJson = (value: unknown): string => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalCampaignProofJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Proof material must be plain finite JSON');
    }

    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalCampaignProofJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  throw new Error('Proof material must be plain finite JSON');
};

const digest = (domain: string, material: unknown): string =>
  createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalCampaignProofJson(material))
    .digest('hex');

export const buildCampaignSequenceIdentityDigest = (
  input: Readonly<{
    workspaceId: string;
    campaignId: string;
    workflowId: string;
    workflowVersionId: string;
    nodes: readonly Readonly<{
      messageId: string;
      channel: 'EMAIL';
      replyToThread: boolean;
    }>[];
    delaysSeconds: readonly number[];
  }>,
): string =>
  digest(SEQUENCE_IDENTITY_PROOF_DOMAIN, {
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    workflowId: input.workflowId,
    workflowVersionId: input.workflowVersionId,
    nodes: input.nodes,
    delaysSeconds: input.delaysSeconds,
  });

export const buildCampaignFixedMaterialDigest = (material: unknown): string =>
  digest(FIXED_MATERIAL_PROOF_DOMAIN, material);

export const buildCampaignPreparedFingerprint = (
  input: Readonly<{
    workspaceId: string;
    campaignId: string;
    workflowId: string;
    workflowVersionId: string;
    initiatingUserWorkspaceId: string;
    initiatingUserId: string;
    initiatingWorkspaceMemberId: string;
    sequenceDigest: string;
    fixedMaterialDigest: string;
    senderAuthorityDigest: string;
  }>,
): string => digest(PREPARED_PROOF_DOMAIN, input);

export const buildCampaignFinalEvidenceDigest = (material: unknown): string =>
  digest('myah/campaign-sequence/final-evidence/v1', material);

export const buildCampaignSenderAuthorityDigest = (
  input: Readonly<{
    readySenderBindings: readonly unknown[];
    senderPoolFingerprint: string;
    senderPoolSerializationRevision: string;
    senderPoolRotationPolicyId: string;
  }>,
): string => digest(SENDER_AUTHORITY_PROOF_DOMAIN, input);

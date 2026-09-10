import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';
import { z } from 'zod';

const SHA_256_DIGEST = /^[0-9a-f]{64}$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

const isCanonicalUuid = (value: string): boolean => {
  try {
    return stringifyUuid(parseUuid(value)) === value;
  } catch {
    return false;
  }
};

const isCanonicalIanaTimeZone = (value: string): boolean => {
  if (value.length === 0) return false;

  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions()
        .timeZone === value
    );
  } catch {
    return false;
  }
};

const isCanonicalInstant = (value: string): boolean => {
  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
};

const isPlainFiniteData = (
  value: unknown,
  ancestors: Set<object> = new Set(),
): boolean => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;

  const prototype = Object.getPrototypeOf(value);

  if (
    (Array.isArray(value) && prototype !== Array.prototype) ||
    (!Array.isArray(value) && prototype !== Object.prototype)
  ) {
    return false;
  }

  ancestors.add(value);

  try {
    const keys = Reflect.ownKeys(value);

    if (keys.some((key) => typeof key !== 'string')) return false;

    if (Array.isArray(value)) {
      const elementKeys = keys.filter((key) => key !== 'length');

      if (
        elementKeys.length !== value.length ||
        elementKeys.some((key, index) => key !== String(index))
      ) {
        return false;
      }
    }

    return keys.every((key) => {
      if (key === 'length' && Array.isArray(value)) return true;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      return (
        descriptor !== undefined &&
        'value' in descriptor &&
        descriptor.enumerable &&
        isPlainFiniteData(descriptor.value, ancestors)
      );
    });
  } finally {
    ancestors.delete(value);
  }
};

const plainFinite = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (isPlainFiniteData(value) ? value : undefined),
    schema,
  );

const canonicalUuidSchema = z.string().refine(isCanonicalUuid);
const digestSchema = z.string().regex(SHA_256_DIGEST);
const nonEmptyStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0);
const canonicalTimeZoneSchema = z.string().refine(isCanonicalIanaTimeZone);
const canonicalInstantSchema = z.string().refine(isCanonicalInstant);

const attachmentProofSchema = z.strictObject({
  fileId: canonicalUuidSchema,
  filename: nonEmptyStringSchema,
  contentType: nonEmptyStringSchema,
  size: z.number().int().nonnegative().finite(),
  contentDigest: digestSchema,
});

const fixedMaterialProofSchema = z.strictObject({
  messageId: canonicalUuidSchema,
  orderedAttachmentProofs: z.array(attachmentProofSchema).readonly(),
});

const preparedProofSchema = z
  .strictObject({
    kind: z.literal('PREPARED'),
    workspaceId: canonicalUuidSchema,
    campaignId: canonicalUuidSchema,
    workflowId: canonicalUuidSchema,
    workflowVersionId: canonicalUuidSchema,
    initiatingUserWorkspaceId: canonicalUuidSchema,
    initiatingUserId: canonicalUuidSchema,
    initiatingWorkspaceMemberId: canonicalUuidSchema,
    orderedMessageIds: z.array(canonicalUuidSchema).min(1).readonly(),
    usedChannels: z.tuple([z.literal('EMAIL')]).readonly(),
    sequenceDigest: digestSchema,
    fixedMaterialDigest: digestSchema,
    senderAuthorityDigest: digestSchema,
    preparedFingerprint: digestSchema,
    signatureDigest: digestSchema.nullable(),
    fixedMaterialProofs: z.array(fixedMaterialProofSchema).min(1).readonly(),
    senderPoolFingerprint: digestSchema,
    senderPoolSerializationRevision: nonEmptyStringSchema,
    senderPoolRotationPolicyId: nonEmptyStringSchema,
  })
  .superRefine((proof, context) => {
    if (
      proof.fixedMaterialProofs.length !== proof.orderedMessageIds.length ||
      proof.fixedMaterialProofs.some(
        ({ messageId }, index) => messageId !== proof.orderedMessageIds[index],
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Fixed material proofs must follow ordered message identity',
        path: ['fixedMaterialProofs'],
      });
    }

    if (
      new Set(proof.orderedMessageIds).size !== proof.orderedMessageIds.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Ordered message identities must be unique',
        path: ['orderedMessageIds'],
      });
    }
  });

export const campaignSequenceAuthorizationPreparedProofSchema =
  plainFinite(preparedProofSchema);

const reviewedWindowSchema = z
  .strictObject({
    timeZone: canonicalTimeZoneSchema,
    startLocalTime: z.string().regex(LOCAL_TIME),
    endLocalTime: z.string().regex(LOCAL_TIME),
  })
  .superRefine((window, context) => {
    if (window.startLocalTime >= window.endLocalTime) {
      context.addIssue({
        code: 'custom',
        message:
          'Reviewed window must be a strictly increasing same-day interval',
        path: ['endLocalTime'],
      });
    }
  });

export const campaignSequenceAuthorizationReviewedWindowSchema =
  plainFinite(reviewedWindowSchema);

const requestSchema = z.strictObject({
  preparedProof: preparedProofSchema,
  reviewedWindow: reviewedWindowSchema,
  campaignCapacityTimeZone: canonicalTimeZoneSchema,
});

export const campaignSequenceAuthorizationRequestSchema =
  plainFinite(requestSchema);

const bindingSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    authorizationId: canonicalUuidSchema,
    generation: z.number().int().positive().finite(),
    startIdempotencyKey: canonicalUuidSchema,
    workspaceId: canonicalUuidSchema,
    campaignId: canonicalUuidSchema,
    campaignExecutionId: canonicalUuidSchema,
    workflowVersionId: canonicalUuidSchema,
    request: campaignSequenceAuthorizationRequestSchema,
    futureEligibleCampaignCreatorsAuthorized: z.literal(true),
    authorizedAt: canonicalInstantSchema,
  })
  .superRefine((binding, context) => {
    const proof = binding.request.preparedProof;

    for (const [path, matches] of [
      [['workspaceId'], binding.workspaceId === proof.workspaceId],
      [['campaignId'], binding.campaignId === proof.campaignId],
      [
        ['workflowVersionId'],
        binding.workflowVersionId === proof.workflowVersionId,
      ],
    ] as const) {
      if (!matches) {
        context.addIssue({
          code: 'custom',
          message: 'Binding scope must equal the reviewed proof scope',
          path: [...path],
        });
      }
    }
  });

export const campaignSequenceAuthorizationBindingSchema =
  plainFinite(bindingSchema);

const projectionBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authorizationId: canonicalUuidSchema,
  generation: z.number().int().positive().finite(),
  workflowVersionId: canonicalUuidSchema,
  preparedFingerprint: digestSchema,
  authorizedAt: canonicalInstantSchema,
});

export const campaignSequenceAuthorizationCurrentProjectionSchema = plainFinite(
  z.union([
    projectionBaseSchema.extend({
      state: z.literal('ACTIVE'),
      revokedAt: z.null(),
      revocationReason: z.null(),
    }),
    projectionBaseSchema.extend({
      state: z.literal('REVOKED'),
      revokedAt: canonicalInstantSchema,
      revocationReason: z.enum(['CAMPAIGN_PAUSED', 'CAMPAIGN_COMPLETED']),
    }),
  ]),
);

export type CampaignSequenceAuthorizationPreparedProof = z.infer<
  typeof campaignSequenceAuthorizationPreparedProofSchema
>;
export type CampaignSequenceAuthorizationReviewedWindow = z.infer<
  typeof campaignSequenceAuthorizationReviewedWindowSchema
>;
export type CampaignSequenceAuthorizationRequest = z.infer<
  typeof campaignSequenceAuthorizationRequestSchema
>;
export type CampaignSequenceAuthorizationBinding = z.infer<
  typeof campaignSequenceAuthorizationBindingSchema
>;
export type CampaignSequenceAuthorizationCurrentProjection = z.infer<
  typeof campaignSequenceAuthorizationCurrentProjectionSchema
>;

export const parseCampaignSequenceAuthorizationPreparedProof = (
  value: unknown,
): CampaignSequenceAuthorizationPreparedProof =>
  campaignSequenceAuthorizationPreparedProofSchema.parse(value);

export const parseCampaignSequenceAuthorizationRequest = (
  value: unknown,
): CampaignSequenceAuthorizationRequest =>
  campaignSequenceAuthorizationRequestSchema.parse(value);

export const parseCampaignSequenceAuthorizationBinding = (
  value: unknown,
): CampaignSequenceAuthorizationBinding =>
  campaignSequenceAuthorizationBindingSchema.parse(value);

export const parseCampaignSequenceAuthorizationCurrentProjection = (
  value: unknown,
): CampaignSequenceAuthorizationCurrentProjection =>
  campaignSequenceAuthorizationCurrentProjectionSchema.parse(value);

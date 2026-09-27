import {
  type RequestApprovalInvalidReason,
  type ReviewedGenericAction,
  type ReviewedGenericActionRecord,
  type ReviewedGenericActionTarget,
} from 'twenty-shared/ai';
import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { isValidUuid } from 'twenty-shared/utils';

import { REGISTERED_ACTION_TOOL_NAMES } from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';
import { EXTERNAL_WRITE_POLICIES } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';
import { type ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { type ToolContext } from 'src/engine/core-modules/tool-provider/types/tool-context.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { PRE_APPROVAL_SAFE_TOOL_NAMES } from 'src/engine/metadata-modules/ai/ai-chat/utils/approval-tool-availability.util';
import { computeGenericApprovalDigest } from 'src/engine/metadata-modules/ai/ai-chat/utils/generic-approval-digest.util';

const MAX_CARD_RECORDS = 20;
const READ_CRUD_OPERATIONS = new Set(['find_many', 'find_one', 'group_by']);
const REGISTERED_ACTION_TOOL_NAME_SET = new Set<string>(
  REGISTERED_ACTION_TOOL_NAMES,
);

// Tools whose effect a founder cannot review from their arguments (model-
// written code) or that can never run in chat (external writes without a
// registered action) are never offered through generic approval.
export const isGenericApprovalDeniedTool = (toolName: string): boolean => {
  const policy = EXTERNAL_WRITE_POLICIES[toolName];

  return (
    toolName === 'code_interpreter' ||
    (policy?.kind === 'external-write' && policy.actionName === undefined)
  );
};

// learn_tools may reveal a gated schema before approval only for generic
// internal writes. Send, email, external-write, and code tools keep their
// existing pre-approval visibility.
export const isGenericApprovalSchemaOnlyTool = (toolName: string): boolean =>
  EXTERNAL_WRITE_POLICIES[toolName] === undefined &&
  !REGISTERED_ACTION_TOOL_NAME_SET.has(toolName);

export class GenericApprovalReviewError extends Error {
  constructor(
    message: string,
    readonly reason: RequestApprovalInvalidReason,
  ) {
    super(message);
  }
}

type ToolRegistryLike = Pick<
  ToolRegistryService,
  'getToolInfo' | 'resolveAndExecute'
>;

// Maps a record's relation join column (e.g. creatorId) to the related
// object's singular name, used only to label linked records on the card.
type LinkedObjectNamesResolver = (
  objectNameSingular: string,
) => Promise<Record<string, string>>;

type PlainRecord = Record<string, unknown>;

type ReviewedValue =
  | string
  | number
  | boolean
  | null
  | ReviewedValue[]
  | { [key: string]: ReviewedValue };

type TargetRecord = {
  record: PlainRecord | null;
  label: string | null;
  proposed: PlainRecord;
};

const isPlainObject = (value: unknown): value is PlainRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const withoutUndefined = (value: PlainRecord): PlainRecord =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );

// Only the proposed keys are reviewed: composite fields compare the proposed
// subfields, so unrelated background edits do not invalidate an approval.
// Values come from JSON-normalized records, so they are JSON-compatible.
const pickReviewedValue = (
  current: unknown,
  proposed: unknown,
): ReviewedValue => {
  if (isPlainObject(proposed) && isPlainObject(current)) {
    return Object.fromEntries(
      Object.keys(proposed).map((key) => [
        key,
        pickReviewedValue(current[key], proposed[key]),
      ]),
    );
  }

  return current === undefined ? null : (current as ReviewedValue);
};

const resolveSchemaNode = (root: PlainRecord, node: unknown): PlainRecord => {
  if (!isPlainObject(node)) return {};

  const ref = node.$ref;

  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const definitions = isPlainObject(root.$defs) ? root.$defs : {};

    return resolveSchemaNode(root, definitions[ref.slice('#/$defs/'.length)]);
  }

  return node;
};

const getSchemaPropertyNames = (
  root: PlainRecord,
  node: unknown,
): Set<string> => {
  const properties = resolveSchemaNode(root, node).properties;

  return new Set(isPlainObject(properties) ? Object.keys(properties) : []);
};

export const createGenericApprovalReviewer = ({
  toolRegistry,
  toolContext,
  toolCatalog,
  resolveLinkedObjectNames,
}: {
  toolRegistry: ToolRegistryLike;
  toolContext: ToolContext;
  toolCatalog: ToolIndexEntry[];
  resolveLinkedObjectNames?: LinkedObjectNamesResolver;
}) => {
  const findCrudEntry = (objectNameSingular: string, operation: string) =>
    toolCatalog.find(
      (entry) =>
        entry.executionRef.kind === 'database_crud' &&
        entry.executionRef.objectNameSingular === objectNameSingular &&
        entry.executionRef.operation === operation,
    );

  const unavailable = (message: string) =>
    new GenericApprovalReviewError(message, 'NOT_AUTHORIZED_OR_UNAVAILABLE');
  const changed = (message: string) =>
    new GenericApprovalReviewError(message, 'TARGET_CHANGED');

  const findRecords = async (
    objectNameSingular: string,
    operation: 'find_one' | 'find_many',
    args: PlainRecord,
  ): Promise<{
    records: PlainRecord[];
    labels: (string | null)[];
    count: number;
  }> => {
    const findEntry = findCrudEntry(objectNameSingular, operation);

    if (!findEntry) {
      throw unavailable(
        `This user cannot read ${objectNameSingular} records, so the action cannot be reviewed.`,
      );
    }

    const output = await toolRegistry.resolveAndExecute(
      findEntry.name,
      args,
      toolContext,
    );

    if (!output.success) {
      throw unavailable(
        `The ${objectNameSingular} records could not be read: ${output.error ?? output.message}`,
      );
    }

    const result = (output.result ?? {}) as {
      records?: unknown[];
      count?: number;
    };
    // Round-trip through JSON so dates and other values compare as the model
    // and card see them.
    let records: PlainRecord[];

    try {
      records = JSON.parse(
        JSON.stringify(result.records ?? []),
      ) as PlainRecord[];
    } catch {
      throw unavailable(
        `The ${objectNameSingular} records could not be read for review.`,
      );
    }
    const labelsById = new Map(
      (output.recordReferences ?? []).map((reference) => [
        reference.recordId,
        reference.displayName ?? null,
      ]),
    );

    return {
      records,
      labels: records.map(
        (record) => labelsById.get(record.id as string) ?? null,
      ),
      count: typeof result.count === 'number' ? result.count : records.length,
    };
  };

  const findOne = async (objectNameSingular: string, id: unknown) => {
    if (typeof id !== 'string' || !isValidUuid(id)) {
      throw changed('The action must name an exact record ID.');
    }

    const { records, labels } = await findRecords(
      objectNameSingular,
      'find_one',
      { id },
    );

    if (records.length !== 1) {
      throw changed(
        `The ${objectNameSingular} record ${id} does not exist or cannot be read.`,
      );
    }

    return { record: records[0], label: labels[0] };
  };

  const findByFilter = async (objectNameSingular: string, filter: unknown) => {
    if (!isPlainObject(filter) || Object.keys(filter).length === 0) {
      throw changed('The action must include a non-empty filter.');
    }

    const { records, labels, count } = await findRecords(
      objectNameSingular,
      'find_many',
      { ...filter, select: ['*'], limit: QUERY_MAX_RECORDS },
    );

    if (count === 0 || records.length === 0) {
      throw changed('The filter does not match any record.');
    }

    if (count > MAX_CARD_RECORDS || records.length !== count) {
      throw changed(
        `The filter matches more than ${MAX_CARD_RECORDS} records, which is too many to review.`,
      );
    }

    return records.map((record, index) => ({ record, label: labels[index] }));
  };

  const assertKnownFields = (
    fields: PlainRecord,
    allowedFieldNames: Set<string>,
  ) => {
    if (Object.keys(fields).length === 0) {
      throw changed('The action does not change any field.');
    }

    for (const fieldName of Object.keys(fields)) {
      if (!allowedFieldNames.has(fieldName)) {
        throw changed(`"${fieldName}" is not a field this tool can write.`);
      }
    }
  };

  const assertRichTextValuesReviewable = (
    fields: PlainRecord,
    schema: PlainRecord,
    container: unknown,
    bulk: boolean,
  ) => {
    const fieldSchemas = resolveSchemaNode(schema, container).properties;

    if (!isPlainObject(fieldSchemas)) return;

    for (const [field, value] of Object.entries(fields)) {
      const subfields = getSchemaPropertyNames(schema, fieldSchemas[field]);

      if (!subfields.has('markdown') || !subfields.has('blocknote')) continue;

      // Rich-text conversion can rewrite blocknote for {} or markdown-only,
      // while find_many select:['*'] omits its current value.
      if (bulk) {
        throw changed(
          'Bulk rich-text changes (including blocknote) cannot be reviewed. Use a single-record update.',
        );
      }
      if (
        !isPlainObject(value) ||
        Object.keys(value).length === 0 ||
        Object.keys(value).some((subfield) => !subfields.has(subfield))
      ) {
        throw changed(
          'A rich-text replacement cannot be reviewed without known markdown or blocknote values.',
        );
      }
    }
  };

  const getWriteSchema = async (toolName: string): Promise<PlainRecord> => {
    const [toolInfo] = await toolRegistry.getToolInfo([toolName], toolContext, [
      'schema',
    ]);

    return isPlainObject(toolInfo?.inputSchema) ? toolInfo.inputSchema : {};
  };

  // Resolves every target record for a CRUD write from current data. Used both
  // when proposing (to build the card) and right before execution (freshness).
  const resolveRecordTargets = async (
    entry: ToolIndexEntry,
    args: PlainRecord,
  ): Promise<{
    operation: 'create' | 'update' | 'delete';
    objectNameSingular: string;
    targets: TargetRecord[];
  }> => {
    if (entry.executionRef.kind !== 'database_crud') {
      throw new Error('Expected a database record tool');
    }

    const { objectNameSingular, operation } = entry.executionRef;
    const schema = await getWriteSchema(entry.name);
    const properties = isPlainObject(schema.properties)
      ? schema.properties
      : {};

    switch (operation) {
      case 'update_one': {
        const { id, ...fields } = args;
        const proposed = withoutUndefined(fields);
        const allowed = getSchemaPropertyNames(schema, schema);

        allowed.delete('id');
        assertKnownFields(proposed, allowed);
        assertRichTextValuesReviewable(proposed, schema, schema, false);
        const { record, label } = await findOne(objectNameSingular, id);

        return {
          operation: 'update',
          objectNameSingular,
          targets: [{ record, label, proposed }],
        };
      }
      case 'update_many': {
        const proposed = isPlainObject(args.data)
          ? withoutUndefined(args.data)
          : {};

        assertKnownFields(
          proposed,
          getSchemaPropertyNames(schema, properties.data),
        );
        assertRichTextValuesReviewable(proposed, schema, properties.data, true);
        const matches = await findByFilter(objectNameSingular, args.filter);

        return {
          operation: 'update',
          objectNameSingular,
          targets: matches.map(({ record, label }) => ({
            record,
            label,
            proposed,
          })),
        };
      }
      case 'upsert_many': {
        const proposedRecords = Array.isArray(args.records) ? args.records : [];
        const recordSchema = resolveSchemaNode(
          schema,
          properties.records,
        ).items;
        const allowed = getSchemaPropertyNames(schema, recordSchema);
        const ids: string[] = [];
        const proposedById = new Map<string, PlainRecord>();

        if (proposedRecords.length === 0) {
          throw changed('The action does not include any record.');
        }
        if (proposedRecords.length > MAX_CARD_RECORDS) {
          throw changed(
            `The action includes more than ${MAX_CARD_RECORDS} records, which is too many to review.`,
          );
        }

        for (const proposedRecord of proposedRecords) {
          const { id, ...fields } = isPlainObject(proposedRecord)
            ? proposedRecord
            : {};

          // An upsert without an ID could match and update an unreviewed
          // record through a unique field, so only exact IDs are reviewable.
          if (
            typeof id !== 'string' ||
            !isValidUuid(id) ||
            proposedById.has(id)
          ) {
            throw changed(
              'Every upserted record must have a distinct existing record ID. Use a create tool for new records.',
            );
          }

          const proposed = withoutUndefined(fields);

          allowed.delete('id');
          assertKnownFields(proposed, allowed);
          assertRichTextValuesReviewable(proposed, schema, recordSchema, true);
          ids.push(id);
          proposedById.set(id, proposed);
        }

        const { records, labels } = await findRecords(
          objectNameSingular,
          'find_many',
          { id: { in: ids }, select: ['*'], limit: QUERY_MAX_RECORDS },
        );

        if (records.length !== ids.length) {
          throw changed(
            'Some records to update do not exist or cannot be read.',
          );
        }

        return {
          operation: 'update',
          objectNameSingular,
          targets: records.map((record, index) => ({
            record,
            label: labels[index],
            proposed: proposedById.get(record.id as string) ?? {},
          })),
        };
      }
      case 'delete_one': {
        const { record, label } = await findOne(objectNameSingular, args.id);

        return {
          operation: 'delete',
          objectNameSingular,
          targets: [{ record, label, proposed: {} }],
        };
      }
      case 'delete_many': {
        const matches = await findByFilter(objectNameSingular, args.filter);

        return {
          operation: 'delete',
          objectNameSingular,
          targets: matches.map(({ record, label }) => ({
            record,
            label,
            proposed: {},
          })),
        };
      }
      case 'create_one':
      case 'create_many': {
        const proposedRecords =
          operation === 'create_one'
            ? [args]
            : Array.isArray(args.records)
              ? args.records
              : [];
        const allowed =
          operation === 'create_one'
            ? getSchemaPropertyNames(schema, schema)
            : getSchemaPropertyNames(
                schema,
                resolveSchemaNode(schema, properties.records).items,
              );

        if (proposedRecords.length === 0) {
          throw changed('The action does not include any record.');
        }
        if (proposedRecords.length > MAX_CARD_RECORDS) {
          throw changed(
            `The action includes more than ${MAX_CARD_RECORDS} records, which is too many to review.`,
          );
        }

        return {
          operation: 'create',
          objectNameSingular,
          targets: proposedRecords.map((proposedRecord) => {
            const proposed = isPlainObject(proposedRecord)
              ? withoutUndefined(proposedRecord)
              : {};

            assertKnownFields(proposed, allowed);

            return { record: null, label: null, proposed };
          }),
        };
      }
      default:
        throw changed(`Unsupported record operation "${operation}".`);
    }
  };

  const computeTargetFingerprint = (
    operation: 'create' | 'update' | 'delete',
    targets: TargetRecord[],
  ): string | null => {
    if (operation === 'create') return null;

    const reviewedValues = Object.fromEntries(
      targets.map(({ record, proposed }) => {
        const currentRecord = record ?? {};

        for (const fieldName of Object.keys(proposed)) {
          // A missing key means the role cannot read the field (or it does
          // not exist), so the current value cannot be shown or kept fresh.
          if (!(fieldName in currentRecord)) {
            throw unavailable(
              `The current value of "${fieldName}" cannot be read, so the change cannot be reviewed.`,
            );
          }
        }

        return [
          currentRecord.id as string,
          pickReviewedValue(
            Object.fromEntries(
              Object.keys(proposed).map((key) => [key, currentRecord[key]]),
            ),
            proposed,
          ),
        ];
      }),
    );

    return computeGenericApprovalDigest(reviewedValues);
  };

  const labelLinkedRecords = async (
    objectNameSingular: string,
    proposed: PlainRecord,
  ): Promise<ReviewedGenericActionRecord['linkedRecords']> => {
    const linkedObjectNames = resolveLinkedObjectNames
      ? await resolveLinkedObjectNames(objectNameSingular)
      : {};

    return Promise.all(
      Object.entries(proposed)
        .filter(
          ([fieldName, value]) =>
            linkedObjectNames[fieldName] !== undefined &&
            typeof value === 'string' &&
            isValidUuid(value),
        )
        .map(async ([fieldName, value]) => {
          const { label } = await findOne(linkedObjectNames[fieldName], value);

          if (label === null) {
            throw unavailable(
              `The linked ${linkedObjectNames[fieldName]} record could not be read for review.`,
            );
          }

          return {
            field: fieldName,
            recordId: value as string,
            label:
              label === '' ? `Unnamed ${linkedObjectNames[fieldName]}` : label,
          };
        }),
    );
  };

  const buildRecordTarget = async (
    entry: ToolIndexEntry,
    args: PlainRecord,
  ): Promise<ReviewedGenericActionTarget> => {
    const { operation, objectNameSingular, targets } =
      await resolveRecordTargets(entry, args);

    if (targets.some(({ record, label }) => record && label === null)) {
      throw unavailable(
        `The ${objectNameSingular} records could not be labelled for review.`,
      );
    }

    const targetFingerprint = computeTargetFingerprint(operation, targets);

    const records = await Promise.all(
      targets
        .slice(0, MAX_CARD_RECORDS)
        .map(async ({ record, label, proposed }) => ({
          recordId: (record?.id as string | undefined) ?? null,
          label:
            record && label === ''
              ? `Unnamed ${objectNameSingular} (${record.id as string})`
              : label,
          changes: Object.entries(proposed).map(([field, proposedValue]) =>
            record
              ? {
                  field,
                  current: pickReviewedValue(record[field], proposedValue),
                  proposed: proposedValue,
                }
              : { field, proposed: proposedValue },
          ),
          linkedRecords: await labelLinkedRecords(objectNameSingular, proposed),
        })),
    );

    return {
      kind: 'record_write',
      operation,
      objectNameSingular,
      records,
      totalCount: targets.length,
      targetFingerprint,
    };
  };

  const buildReviewedAction = async ({
    toolName,
    proposedArguments,
  }: {
    toolName: string;
    proposedArguments: Record<string, unknown>;
  }): Promise<ReviewedGenericAction> => {
    const entry = toolCatalog.find(
      (catalogEntry) => catalogEntry.name === toolName,
    );

    if (!entry) {
      throw unavailable(`Tool "${toolName}" is not available to this user.`);
    }

    if (REGISTERED_ACTION_TOOL_NAME_SET.has(toolName)) {
      throw unavailable(
        `Tool "${toolName}" requires its registered approval input, not generic approval.`,
      );
    }

    if (isGenericApprovalDeniedTool(toolName)) {
      throw unavailable(
        `Tool "${toolName}" cannot be approved in chat because its effect cannot be reviewed or it cannot run here.`,
      );
    }

    if (
      PRE_APPROVAL_SAFE_TOOL_NAMES[toolName] ||
      (entry.executionRef.kind === 'database_crud' &&
        READ_CRUD_OPERATIONS.has(entry.executionRef.operation))
    ) {
      throw unavailable(`Tool "${toolName}" does not require approval.`);
    }

    return {
      version: 1,
      toolName,
      toolLabel: entry.label,
      argumentsDigest: computeGenericApprovalDigest(proposedArguments),
      arguments: proposedArguments,
      target:
        entry.executionRef.kind === 'database_crud'
          ? await buildRecordTarget(entry, proposedArguments)
          : { kind: 'arguments_only' },
    };
  };

  // Re-reads the targets right before execution and refuses when the reviewed
  // record set or reviewed current values changed, or the tool is no longer
  // available to the user.
  const verifyTarget = async (
    reviewedAction: ReviewedGenericAction,
  ): Promise<
    | { ok: true }
    | { ok: false; reason: RequestApprovalInvalidReason; message: string }
  > => {
    try {
      // Rebuild what the card would show now; a fingerprint alone cannot
      // detect a forged target kind, operation, label, or creation.
      const currentReview = await buildReviewedAction({
        toolName: reviewedAction.toolName,
        proposedArguments: reviewedAction.arguments,
      });

      return computeGenericApprovalDigest(currentReview) ===
        computeGenericApprovalDigest(reviewedAction)
        ? { ok: true }
        : {
            ok: false,
            reason: 'TARGET_CHANGED',
            message: 'The reviewed action changed after approval.',
          };
    } catch (error) {
      if (error instanceof GenericApprovalReviewError) {
        return { ok: false, reason: error.reason, message: error.message };
      }

      throw error;
    }
  };

  return { buildReviewedAction, verifyTarget };
};

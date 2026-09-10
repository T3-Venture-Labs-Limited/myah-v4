import { z } from 'zod';

import { workflowFileSchema } from './schemas/workflow-file-action-schema';

const messageIdSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

const campaignSequenceEmailSchema = z.strictObject({
  id: messageIdSchema,
  channel: z.literal('EMAIL'),
  subject: z.string(),
  body: z.string(),
  files: z.array(workflowFileSchema.strict()),
  replyToThread: z.boolean(),
});

const campaignSequenceInstagramSchema = z.strictObject({
  id: messageIdSchema,
  channel: z.literal('INSTAGRAM'),
  text: z.string(),
});

export const campaignSequenceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    messages: z.array(
      z.discriminatedUnion('channel', [
        campaignSequenceEmailSchema,
        campaignSequenceInstagramSchema,
      ]),
    ),
    delaysSeconds: z.array(
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    ),
  })
  .superRefine((value, context) => {
    if (value.delaysSeconds.length !== Math.max(0, value.messages.length - 1)) {
      context.addIssue({
        code: 'custom',
        path: ['delaysSeconds'],
        message: 'One delay is required between messages',
      });
    }

    if (
      new Set(value.messages.map(({ id }) => id.toLowerCase())).size !==
      value.messages.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['messages'],
        message: 'Message IDs must be unique',
      });
    }
  });

export type CampaignSequence = z.infer<typeof campaignSequenceSchema>;
export type CampaignSequenceMessage = CampaignSequence['messages'][number];

export type CampaignSequenceIssue = {
  code:
    | 'EMPTY_SEQUENCE'
    | 'DELAY_REQUIRED'
    | 'CONTENT_REQUIRED'
    | 'REPLY_WITHOUT_PRIOR_EMAIL'
    | 'INVALID_UNICODE'
    | 'INSTAGRAM_UNAVAILABLE'
    | 'DURATION_OVERFLOW'
    | 'INVALID_EMAIL_BODY';
  path: string;
  message: string;
  messageId?: string;
};

type JsonRecord = Record<string, unknown>;

type EmailBodyValidation = {
  isValid: boolean;
  hasMeaningfulContent: boolean;
  hasImage: boolean;
  hasInvalidUnicode: boolean;
};

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (value: JsonRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasOnlyKeys = (
  value: JsonRecord,
  requiredKeys: string[],
  optionalKeys: string[] = [],
): boolean => {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  return (
    requiredKeys.every((key) => hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  );
};

const hasLoneUtf16Surrogate = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);

      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        return true;
      }

      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }

  return false;
};

const valueHasLoneUtf16Surrogate = (value: unknown): boolean => {
  const pendingValues = [value];

  while (pendingValues.length > 0) {
    const currentValue = pendingValues.pop();

    if (typeof currentValue === 'string') {
      if (hasLoneUtf16Surrogate(currentValue)) {
        return true;
      }

      continue;
    }

    if (Array.isArray(currentValue)) {
      for (const nestedValue of currentValue) {
        pendingValues.push(nestedValue);
      }

      continue;
    }

    if (isJsonRecord(currentValue)) {
      for (const [key, nestedValue] of Object.entries(currentValue)) {
        if (hasLoneUtf16Surrogate(key)) {
          return true;
        }

        pendingValues.push(nestedValue);
      }
    }
  }

  return false;
};

type NodeValidation = {
  isValid: boolean;
  hasMeaningfulContent: boolean;
  hasImage: boolean;
};

const invalidNode: NodeValidation = {
  isValid: false,
  hasMeaningfulContent: false,
  hasImage: false,
};

const combineNodeValidation = (
  validations: NodeValidation[],
): NodeValidation => ({
  isValid: validations.every(({ isValid }) => isValid),
  hasMeaningfulContent: validations.some(
    ({ hasMeaningfulContent }) => hasMeaningfulContent,
  ),
  hasImage: validations.some(({ hasImage }) => hasImage),
});

const validateMark = (value: unknown): boolean => {
  if (!isJsonRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (['bold', 'italic', 'strike', 'underline'].includes(value.type)) {
    return hasOnlyKeys(value, ['type']);
  }

  if (value.type !== 'link' || !hasOnlyKeys(value, ['type', 'attrs'])) {
    return false;
  }

  const attributes = value.attrs;

  if (
    !isJsonRecord(attributes) ||
    !hasOnlyKeys(attributes, ['href'], ['target', 'rel', 'class']) ||
    typeof attributes.href !== 'string'
  ) {
    return false;
  }

  return ['target', 'rel', 'class'].every(
    (key) =>
      !hasOwn(attributes, key) ||
      typeof attributes[key] === 'string' ||
      attributes[key] === null,
  );
};

const hasValidMarks = (value: JsonRecord): boolean =>
  !hasOwn(value, 'marks') ||
  (Array.isArray(value.marks) && value.marks.every(validateMark));

const validateInlineNode = (value: unknown): NodeValidation => {
  if (!isJsonRecord(value) || typeof value.type !== 'string') {
    return invalidNode;
  }

  if (value.type === 'hardBreak') {
    return hasOnlyKeys(value, ['type'], ['marks']) && hasValidMarks(value)
      ? { ...invalidNode, isValid: true }
      : invalidNode;
  }

  if (value.type === 'variableTag') {
    if (
      !hasOnlyKeys(value, ['type', 'attrs'], ['marks']) ||
      !isJsonRecord(value.attrs) ||
      !hasValidMarks(value)
    ) {
      return invalidNode;
    }

    const isValid =
      hasOnlyKeys(value.attrs, ['variable']) &&
      typeof value.attrs.variable === 'string' &&
      value.attrs.variable.length > 0;

    return {
      isValid,
      hasMeaningfulContent: isValid,
      hasImage: false,
    };
  }

  if (
    value.type !== 'text' ||
    !hasOnlyKeys(value, ['type', 'text'], ['marks']) ||
    typeof value.text !== 'string' ||
    value.text.length === 0 ||
    !hasValidMarks(value)
  ) {
    return invalidNode;
  }

  return {
    isValid: true,
    hasMeaningfulContent: value.text.trim().length > 0,
    hasImage: false,
  };
};

const validateInlineContent = (value: unknown): NodeValidation => {
  if (value === undefined) {
    return { ...invalidNode, isValid: true };
  }

  if (!Array.isArray(value)) {
    return invalidNode;
  }

  return combineNodeValidation(value.map(validateInlineNode));
};

const validateParagraph = (value: JsonRecord): NodeValidation => {
  if (!hasOnlyKeys(value, ['type'], ['content'])) {
    return invalidNode;
  }

  return validateInlineContent(value.content);
};

const validateHeading = (value: JsonRecord): NodeValidation => {
  if (
    !hasOnlyKeys(value, ['type', 'attrs'], ['content']) ||
    !isJsonRecord(value.attrs) ||
    !hasOnlyKeys(value.attrs, ['level']) ||
    ![1, 2, 3].includes(value.attrs.level as number)
  ) {
    return invalidNode;
  }

  return validateInlineContent(value.content);
};

const validateImage = (value: JsonRecord): NodeValidation => {
  if (
    !hasOnlyKeys(value, ['type', 'attrs']) ||
    !isJsonRecord(value.attrs) ||
    !hasOnlyKeys(
      value.attrs,
      ['src'],
      ['alt', 'title', 'width', 'height', 'align'],
    ) ||
    typeof value.attrs.src !== 'string'
  ) {
    return invalidNode;
  }

  const nullableStringAttributesAreValid = ['alt', 'title', 'align'].every(
    (key) =>
      !hasOwn(value.attrs as JsonRecord, key) ||
      typeof (value.attrs as JsonRecord)[key] === 'string' ||
      (value.attrs as JsonRecord)[key] === null,
  );
  const nullableNumberAttributesAreValid = ['width', 'height'].every(
    (key) =>
      !hasOwn(value.attrs as JsonRecord, key) ||
      typeof (value.attrs as JsonRecord)[key] === 'number' ||
      (value.attrs as JsonRecord)[key] === null,
  );

  return {
    isValid:
      nullableStringAttributesAreValid && nullableNumberAttributesAreValid,
    hasMeaningfulContent: false,
    hasImage: true,
  };
};

const validateBlockContent = (content: unknown[]): NodeValidation => {
  const pendingNodes = [...content];
  let hasMeaningfulContent = false;
  let hasImage = false;

  while (pendingNodes.length > 0) {
    const value = pendingNodes.pop();

    if (!isJsonRecord(value) || typeof value.type !== 'string') {
      return invalidNode;
    }

    let validation: NodeValidation;

    if (value.type === 'paragraph') {
      validation = validateParagraph(value);
    } else if (value.type === 'heading') {
      validation = validateHeading(value);
    } else if (value.type === 'image') {
      validation = validateImage(value);
    } else if (value.type === 'bulletList' || value.type === 'orderedList') {
      const isOrderedList = value.type === 'orderedList';

      if (
        !hasOnlyKeys(
          value,
          ['type', 'content'],
          isOrderedList ? ['attrs'] : [],
        ) ||
        !Array.isArray(value.content) ||
        value.content.length === 0
      ) {
        return invalidNode;
      }

      if (isOrderedList && hasOwn(value, 'attrs')) {
        if (
          !isJsonRecord(value.attrs) ||
          !hasOnlyKeys(value.attrs, [], ['start', 'type']) ||
          (hasOwn(value.attrs, 'start') &&
            (!Number.isInteger(value.attrs.start) ||
              !Number.isSafeInteger(value.attrs.start))) ||
          (hasOwn(value.attrs, 'type') &&
            typeof value.attrs.type !== 'string' &&
            value.attrs.type !== null)
        ) {
          return invalidNode;
        }
      }

      for (const listItem of value.content) {
        if (
          !isJsonRecord(listItem) ||
          listItem.type !== 'listItem' ||
          !hasOnlyKeys(listItem, ['type', 'content']) ||
          !Array.isArray(listItem.content) ||
          listItem.content.length === 0 ||
          !isJsonRecord(listItem.content[0]) ||
          listItem.content[0].type !== 'paragraph'
        ) {
          return invalidNode;
        }

        for (const listItemNode of listItem.content) {
          pendingNodes.push(listItemNode);
        }
      }

      continue;
    } else {
      return invalidNode;
    }

    if (!validation.isValid) {
      return invalidNode;
    }

    hasMeaningfulContent ||= validation.hasMeaningfulContent;
    hasImage ||= validation.hasImage;
  }

  return { isValid: true, hasMeaningfulContent, hasImage };
};

// This is a strict shape/content check for the installed editor contract. It
// deliberately does not render, resolve variables, rewrite, or normalize body JSON.
const validateSerializedEmailBody = (body: string): EmailBodyValidation => {
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(body);
  } catch {
    return {
      isValid: false,
      hasMeaningfulContent: false,
      hasImage: false,
      hasInvalidUnicode: hasLoneUtf16Surrogate(body),
    };
  }

  const hasInvalidUnicode = valueHasLoneUtf16Surrogate(parsedBody);

  if (
    !isJsonRecord(parsedBody) ||
    parsedBody.type !== 'doc' ||
    !hasOnlyKeys(parsedBody, ['type'], ['content']) ||
    (hasOwn(parsedBody, 'content') && !Array.isArray(parsedBody.content))
  ) {
    return {
      isValid: false,
      hasMeaningfulContent: false,
      hasImage: false,
      hasInvalidUnicode,
    };
  }

  const content = parsedBody.content as unknown[] | undefined;
  const validation = validateBlockContent(content ?? []);

  return { ...validation, hasInvalidUnicode };
};

const issue = (
  code: CampaignSequenceIssue['code'],
  path: string,
  message: string,
  messageId?: string,
): CampaignSequenceIssue => ({
  code,
  path,
  message,
  ...(messageId === undefined ? {} : { messageId }),
});

export const validateCampaignSequence = (
  sequence: CampaignSequence,
): CampaignSequenceIssue[] => {
  const issues: CampaignSequenceIssue[] = [];

  if (sequence.messages.length === 0) {
    issues.push(
      issue('EMPTY_SEQUENCE', 'messages', 'Add at least one message'),
    );
  }

  let cumulativeSeconds = 0;

  sequence.delaysSeconds.forEach((delay, index) => {
    const path = `delaysSeconds.${index}`;

    if (delay === null) {
      issues.push(
        issue('DELAY_REQUIRED', path, 'Set a delay between messages'),
      );
      return;
    }

    const nextCumulativeSeconds = cumulativeSeconds + delay;

    if (
      !Number.isSafeInteger(delay) ||
      !Number.isSafeInteger(nextCumulativeSeconds)
    ) {
      issues.push(
        issue(
          'DURATION_OVERFLOW',
          path,
          'The cumulative campaign duration is too large',
        ),
      );
      return;
    }

    cumulativeSeconds = nextCumulativeSeconds;

    if (!Number.isSafeInteger(cumulativeSeconds * 1000)) {
      issues.push(
        issue(
          'DURATION_OVERFLOW',
          path,
          'The campaign duration cannot be represented in milliseconds',
        ),
      );
    }
  });

  let hasPriorEmail = false;

  sequence.messages.forEach((message, index) => {
    const messagePath = `messages.${index}`;

    if (message.channel === 'INSTAGRAM') {
      if (message.text.trim().length === 0) {
        issues.push(
          issue(
            'CONTENT_REQUIRED',
            `${messagePath}.text`,
            'Add Instagram message content',
            message.id,
          ),
        );
      }

      if (hasLoneUtf16Surrogate(message.text)) {
        issues.push(
          issue(
            'INVALID_UNICODE',
            `${messagePath}.text`,
            'Instagram text contains malformed Unicode',
            message.id,
          ),
        );
      }

      issues.push(
        issue(
          'INSTAGRAM_UNAVAILABLE',
          `${messagePath}.channel`,
          'Instagram delivery is not available',
          message.id,
        ),
      );
      return;
    }

    if (message.subject.trim().length === 0) {
      issues.push(
        issue(
          'CONTENT_REQUIRED',
          `${messagePath}.subject`,
          'Add an email subject',
          message.id,
        ),
      );
    }

    if (hasLoneUtf16Surrogate(message.subject)) {
      issues.push(
        issue(
          'INVALID_UNICODE',
          `${messagePath}.subject`,
          'Email subject contains malformed Unicode',
          message.id,
        ),
      );
    }

    if (message.body === '') {
      issues.push(
        issue(
          'CONTENT_REQUIRED',
          `${messagePath}.body`,
          'Add email body content',
          message.id,
        ),
      );
    } else {
      const bodyValidation = validateSerializedEmailBody(message.body);

      if (bodyValidation.hasInvalidUnicode) {
        issues.push(
          issue(
            'INVALID_UNICODE',
            `${messagePath}.body`,
            'Email body contains malformed Unicode',
            message.id,
          ),
        );
      }

      if (!bodyValidation.isValid) {
        issues.push(
          issue(
            'INVALID_EMAIL_BODY',
            `${messagePath}.body`,
            'Email body is not a supported TipTap document',
            message.id,
          ),
        );
      } else if (bodyValidation.hasImage) {
        issues.push(
          issue(
            'INVALID_EMAIL_BODY',
            `${messagePath}.body`,
            'Image content requires authorized content handling',
            message.id,
          ),
        );
      } else if (!bodyValidation.hasMeaningfulContent) {
        issues.push(
          issue(
            'CONTENT_REQUIRED',
            `${messagePath}.body`,
            'Add email body content',
            message.id,
          ),
        );
      }
    }

    if (message.replyToThread && !hasPriorEmail) {
      issues.push(
        issue(
          'REPLY_WITHOUT_PRIOR_EMAIL',
          `${messagePath}.replyToThread`,
          'A reply requires an earlier email in the sequence',
          message.id,
        ),
      );
    }

    hasPriorEmail = true;
  });

  return issues;
};

const assertIndex = (
  index: number,
  maximum: number,
  parameterName: string,
): void => {
  if (!Number.isInteger(index)) {
    throw new TypeError(`${parameterName} must be an integer`);
  }

  if (index < 0 || index > maximum) {
    throw new RangeError(`${parameterName} is out of bounds`);
  }
};

export const insertCampaignSequenceMessage = (
  sequence: CampaignSequence,
  index: number,
  message: CampaignSequenceMessage,
): CampaignSequence => {
  assertIndex(index, sequence.messages.length, 'index');

  const messages = [...sequence.messages];
  const delaysSeconds = [...sequence.delaysSeconds];

  messages.splice(index, 0, message);

  if (sequence.messages.length > 0) {
    delaysSeconds.splice(index, 0, null);
  }

  return { ...sequence, messages, delaysSeconds };
};

export const moveCampaignSequenceMessage = (
  sequence: CampaignSequence,
  from: number,
  to: number,
): CampaignSequence => {
  const lastIndex = sequence.messages.length - 1;

  assertIndex(from, lastIndex, 'from');
  assertIndex(to, lastIndex, 'to');

  const messages = [...sequence.messages];
  const [moved] = messages.splice(from, 1);

  messages.splice(to, 0, moved);

  return {
    ...sequence,
    messages,
    delaysSeconds: [...sequence.delaysSeconds],
  };
};

export const removeCampaignSequenceMessage = (
  sequence: CampaignSequence,
  index: number,
): CampaignSequence => {
  assertIndex(index, sequence.messages.length - 1, 'index');

  const messages = [...sequence.messages];
  const delaysSeconds = [...sequence.delaysSeconds];

  if (index > 0 && index < sequence.messages.length - 1) {
    const delayBefore = delaysSeconds[index - 1];
    const delayAfter = delaysSeconds[index];
    let combinedDelay: number | null = null;

    if (delayBefore !== null && delayAfter !== null) {
      combinedDelay = delayBefore + delayAfter;

      if (!Number.isSafeInteger(combinedDelay)) {
        throw new RangeError('Combined delay exceeds the safe integer range');
      }
    }

    delaysSeconds.splice(index - 1, 2, combinedDelay);
  } else if (sequence.messages.length > 1) {
    delaysSeconds.splice(index === 0 ? 0 : index - 1, 1);
  }

  messages.splice(index, 1);

  return { ...sequence, messages, delaysSeconds };
};

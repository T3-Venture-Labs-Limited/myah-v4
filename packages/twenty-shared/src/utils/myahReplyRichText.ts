const MAX_MARKDOWN_LENGTH = 100_000;
const MAX_BLOCKNOTE_LENGTH = 1_000_000;
const MAX_DOCUMENT_DEPTH = 16;
const MAX_DOCUMENT_NODES = 10_000;
const INVALID_BODY_ERROR = 'Invalid rich reply body';

export type MyahReplyTextStyles = Partial<
  Record<'bold' | 'italic' | 'underline' | 'strike', true>
>;

export type MyahReplyText = {
  type: 'text';
  text: string;
  styles: MyahReplyTextStyles;
};

export type MyahReplyLink = {
  type: 'link';
  href: string;
  content: MyahReplyText[];
};

export type MyahReplyInlineContent = MyahReplyText | MyahReplyLink;

export type MyahReplyBlock = {
  id?: string;
  type: 'paragraph' | 'bulletListItem' | 'numberedListItem';
  props?: {
    backgroundColor?: 'default';
    textColor?: 'default';
    textAlignment?: 'left';
    start?: number;
  };
  content: MyahReplyInlineContent[];
  children: MyahReplyBlock[];
};

export type MyahReplyBody = { markdown: string; blocknote: string | null };

export type ParsedMyahReplyBody = {
  blocks: MyahReplyBlock[] | null;
  plainText: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const invalidBody = (): never => {
  throw new Error(INVALID_BODY_ERROR);
};

const validateUrl = (value: unknown): string => {
  if (typeof value !== 'string' || /[\u0000-\u001F\u007F-\u009F]/.test(value)) {
    return invalidBody();
  }

  try {
    const protocol = new URL(value).protocol;

    if (!['http:', 'https:', 'mailto:'].includes(protocol)) {
      return invalidBody();
    }
  } catch {
    return invalidBody();
  }

  return value;
};

const validateStyles = (value: unknown): MyahReplyTextStyles => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['bold', 'italic', 'underline', 'strike'])
  ) {
    return invalidBody();
  }

  for (const style of Object.values(value)) {
    if (style !== true) {
      return invalidBody();
    }
  }

  return value as MyahReplyTextStyles;
};

const validateText = (value: unknown, countNode: () => void): MyahReplyText => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['type', 'text', 'styles']) ||
    value.type !== 'text' ||
    typeof value.text !== 'string'
  ) {
    return invalidBody();
  }

  countNode();

  return {
    type: 'text',
    text: value.text,
    styles: validateStyles(value.styles),
  };
};

const validateInlineContent = (
  value: unknown,
  countNode: () => void,
): MyahReplyInlineContent => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  if (value.type === 'text') {
    return validateText(value, countNode);
  }

  if (
    value.type !== 'link' ||
    !hasOnlyKeys(value, ['type', 'href', 'content']) ||
    !Array.isArray(value.content)
  ) {
    return invalidBody();
  }

  countNode();

  return {
    type: 'link',
    href: validateUrl(value.href),
    content: value.content.map((item) => validateText(item, countNode)),
  };
};

const validateProps = (
  value: unknown,
  type: MyahReplyBlock['type'],
): MyahReplyBlock['props'] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      type === 'numberedListItem'
        ? ['backgroundColor', 'textColor', 'textAlignment', 'start']
        : ['backgroundColor', 'textColor', 'textAlignment'],
    ) ||
    (value.backgroundColor !== undefined &&
      value.backgroundColor !== 'default') ||
    (value.textColor !== undefined && value.textColor !== 'default') ||
    (value.textAlignment !== undefined && value.textAlignment !== 'left') ||
    (value.start !== undefined &&
      (type !== 'numberedListItem' ||
        typeof value.start !== 'number' ||
        !Number.isSafeInteger(value.start) ||
        value.start < 1))
  ) {
    return invalidBody();
  }

  return value.start === undefined
    ? undefined
    : { start: value.start as number };
};

const validateBlocks = (value: unknown): MyahReplyBlock[] => {
  let nodeCount = 0;
  const countNode = () => {
    nodeCount += 1;
    if (nodeCount > MAX_DOCUMENT_NODES) {
      invalidBody();
    }
  };

  const validateBlock = (block: unknown, depth: number): MyahReplyBlock => {
    if (
      depth > MAX_DOCUMENT_DEPTH ||
      !isRecord(block) ||
      !hasOnlyKeys(block, ['id', 'type', 'props', 'content', 'children']) ||
      (block.type !== 'paragraph' &&
        block.type !== 'bulletListItem' &&
        block.type !== 'numberedListItem') ||
      !Array.isArray(block.content) ||
      !Array.isArray(block.children) ||
      (block.id !== undefined && typeof block.id !== 'string')
    ) {
      return invalidBody();
    }

    countNode();

    const props = validateProps(block.props, block.type);

    return {
      type: block.type,
      ...(props === undefined ? {} : { props }),
      content: block.content.map((item) =>
        validateInlineContent(item, countNode),
      ),
      children: block.children.map((child) => validateBlock(child, depth + 1)),
    };
  };

  if (!Array.isArray(value)) {
    return invalidBody();
  }

  return value.map((block) => validateBlock(block, 1));
};

const hasRichContent = (blocks: MyahReplyBlock[]): boolean =>
  blocks.some(
    (block) =>
      block.type !== 'paragraph' ||
      block.content.some(
        (content) =>
          content.type === 'link' ||
          (content.type === 'text' && content.text.length > 0),
      ) ||
      hasRichContent(block.children),
  );

const projectInlineContent = (content: MyahReplyInlineContent[]): string =>
  content
    .map((item) =>
      item.type === 'text' ? item.text : projectInlineContent(item.content),
    )
    .join('');

const projectBlocks = (blocks: MyahReplyBlock[], depth = 0): string[] => {
  let nextNumberedIndex = 1;

  return blocks.flatMap((block) => {
    const numberedIndex = block.props?.start ?? nextNumberedIndex;
    nextNumberedIndex =
      block.type === 'numberedListItem' ? numberedIndex + 1 : 1;
    const prefix =
      block.type === 'bulletListItem'
        ? '• '
        : block.type === 'numberedListItem'
          ? `${numberedIndex}. `
          : '';

    return [
      `${'  '.repeat(depth)}${prefix}${projectInlineContent(block.content)}`,
      ...projectBlocks(block.children, depth + 1),
    ];
  });
};

const projectPlainText = (blocks: MyahReplyBlock[]): string =>
  projectBlocks(blocks).join('\n');

const assertMarkdown = (markdown: unknown): string => {
  if (typeof markdown !== 'string' || markdown.length > MAX_MARKDOWN_LENGTH) {
    return invalidBody();
  }

  return markdown;
};

export const createMyahReplyBlocksFromPlainText = (
  text: string,
): MyahReplyBlock[] => [
  {
    type: 'paragraph',
    content: [{ type: 'text', text, styles: {} }],
    children: [],
  },
];

export const serializeMyahReplyBlocks = (
  blocks: MyahReplyBlock[],
): MyahReplyBody => {
  const canonicalBlocks = validateBlocks(blocks);
  const markdown = assertMarkdown(projectPlainText(canonicalBlocks));

  if (!hasRichContent(canonicalBlocks)) {
    return { markdown, blocknote: null };
  }

  const blocknote = JSON.stringify(canonicalBlocks);

  if (blocknote.length > MAX_BLOCKNOTE_LENGTH) {
    return invalidBody();
  }

  return { markdown, blocknote };
};

export const parseMyahReplyRichText = (
  body: MyahReplyBody,
): ParsedMyahReplyBody => {
  const markdown = assertMarkdown(body?.markdown);
  const blocknote = body?.blocknote;

  if (blocknote === null || blocknote === undefined) {
    return { blocks: null, plainText: markdown };
  }

  if (
    typeof blocknote !== 'string' ||
    blocknote.length > MAX_BLOCKNOTE_LENGTH
  ) {
    return invalidBody();
  }

  if (blocknote.trim() === '') {
    return { blocks: null, plainText: markdown };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(blocknote);
  } catch {
    return invalidBody();
  }

  if (isRecord(parsed) && Object.keys(parsed).length === 0) {
    return { blocks: null, plainText: markdown };
  }

  const blocks = validateBlocks(parsed);

  if (!hasRichContent(blocks)) {
    return { blocks: null, plainText: markdown };
  }

  const plainText = assertMarkdown(projectPlainText(blocks));

  if (markdown !== plainText) {
    return invalidBody();
  }

  return { blocks, plainText };
};

import {
  parseMyahReplyRichText,
  type MyahReplyBlock,
  type MyahReplyBody,
} from 'twenty-shared/utils';

import { escapeHtml } from 'src/engine/core-modules/emailing-domain/utils/escape-html.util';
import { getServerBlockNoteEditor } from 'src/engine/core-modules/record-transformer/utils/transform-rich-text.util';

const createNativeRenderBlocks = (blocks: MyahReplyBlock[]): MyahReplyBlock[] =>
  blocks.map(({ content, children, props, ...block }) => ({
    ...block,
    ...(props ? { props: { ...props } } : {}),
    content: content.map((item) =>
      item.type === 'link'
        ? {
            ...item,
            href: item.href.replace(/[<>]/g, (character) =>
              character === '<' ? '%3C' : '%3E',
            ),
            content: item.content.map((text) => ({
              ...text,
              styles: { ...text.styles },
            })),
          }
        : { ...item, styles: { ...item.styles } },
    ),
    children: createNativeRenderBlocks(children),
  }));

export const renderMyahInboxReplyBody = async (
  body: MyahReplyBody,
): Promise<{ body: string; html: string }> => {
  const parsed = parseMyahReplyRichText(body);

  if (!parsed.blocks) {
    return { body: parsed.plainText, html: escapeHtml(parsed.plainText) };
  }

  return {
    body: parsed.plainText,
    html: await (
      await getServerBlockNoteEditor()
    ).blocksToHTMLLossy(createNativeRenderBlocks(parsed.blocks)),
  };
};

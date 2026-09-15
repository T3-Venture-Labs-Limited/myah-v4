import {
  createMyahReplyBlocksFromPlainText,
  parseMyahReplyRichText,
  serializeMyahReplyBlocks,
  type MyahReplyBlock,
} from '@/utils/myahReplyRichText';

describe('myahReplyRichText', () => {
  it('serializes supported formatting while projecting plain text', () => {
    const blocks = createMyahReplyBlocksFromPlainText('Maya');
    blocks[0].id = 'editor-generated-id';
    blocks[0].props = {
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    };
    blocks[0].content = [
      { type: 'text', text: 'Maya', styles: { bold: true } },
    ];

    const body = serializeMyahReplyBlocks(blocks);

    expect(body.markdown).toBe('Maya');
    expect(JSON.parse(body.blocknote ?? '')).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Maya', styles: { bold: true } }],
        children: [],
      },
    ]);
    expect(parseMyahReplyRichText(body)).toEqual({
      blocks: JSON.parse(body.blocknote ?? ''),
      plainText: 'Maya',
    });
  });

  it('keeps initial plain text literal, including newlines and markup-like text', () => {
    const text = '**Maya**\n<script>\nこんにちは\n\n';
    const blocks = createMyahReplyBlocksFromPlainText(text);

    expect(blocks).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text, styles: {} }],
        children: [],
      },
    ]);
    expect(parseMyahReplyRichText(serializeMyahReplyBlocks(blocks))).toEqual({
      blocks,
      plainText: text,
    });
  });

  it('projects nested lists, links, and inline line breaks deterministically', () => {
    const blocks: MyahReplyBlock[] = [
      {
        type: 'bulletListItem',
        content: [
          { type: 'text', text: 'First\nline', styles: {} },
          {
            type: 'link',
            href: 'https://example.com/path',
            content: [
              { type: 'text', text: ' link', styles: { italic: true } },
            ],
          },
        ],
        children: [
          {
            type: 'numberedListItem',
            content: [{ type: 'text', text: 'Nested', styles: {} }],
            children: [],
          },
        ],
      },
    ];

    expect(serializeMyahReplyBlocks(blocks).markdown).toBe(
      '• First\nline link\n  1. Nested',
    );
  });

  it('accepts 10,000 native nodes and rejects node 10,001 below the byte limit', () => {
    const blocksAtLimit: MyahReplyBlock[] = [
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'x', styles: {} }],
        children: [],
      },
      ...Array.from({ length: 9_998 }, () => ({
        type: 'paragraph' as const,
        content: [],
        children: [],
      })),
    ];
    const bodyAtLimit = serializeMyahReplyBlocks(blocksAtLimit);
    const blocksAboveLimit = JSON.stringify([
      ...blocksAtLimit,
      { type: 'paragraph', content: [], children: [] },
    ]);

    expect(bodyAtLimit.blocknote?.length).toBeLessThan(1_000_000);
    expect(parseMyahReplyRichText(bodyAtLimit).blocks).toHaveLength(9_999);
    expect(blocksAboveLimit.length).toBeLessThan(1_000_000);
    expect(() =>
      parseMyahReplyRichText({
        markdown: `${bodyAtLimit.markdown}\n`,
        blocknote: blocksAboveLimit,
      }),
    ).toThrow('Invalid rich reply body');
  });

  it('rejects unsafe, malformed, unsupported, oversized, deep, and inconsistent rich bodies safely', () => {
    const body = serializeMyahReplyBlocks(
      createMyahReplyBlocksFromPlainText('Maya'),
    );
    const tooDeep = JSON.stringify(
      Array.from({ length: 17 }).reduceRight<MyahReplyBlock[]>(
        (children) => [
          {
            type: 'bulletListItem',
            content: [{ type: 'text', text: 'x', styles: {} }],
            children,
          },
        ],
        [],
      ),
    );
    const invalidBodies = [
      { markdown: 'Maya', blocknote: '{not json' },
      {
        markdown: 'unsafe',
        blocknote:
          '[{"type":"paragraph","content":[{"type":"link","href":"java\\u0073cript:alert(1)","content":[]}],"children":[]}]',
      },
      {
        markdown: 'Maya',
        blocknote:
          '[{"type":"heading","content":[{"type":"text","text":"Maya","styles":{}}],"children":[]}]',
      },
      {
        markdown: 'Maya',
        blocknote:
          '[{"type":"paragraph","props":{"textColor":"red"},"content":[{"type":"text","text":"Maya","styles":{}}],"children":[]}]',
      },
      {
        markdown: 'Maya',
        blocknote:
          '[{"type":"paragraph","content":[{"type":"text","text":"Maya","styles":{"code":true}}],"children":[]}]',
      },
      { markdown: 'x'.repeat(100_001), blocknote: null },
      { markdown: 'x', blocknote: ' '.repeat(1_000_001) },
      { markdown: 'x', blocknote: tooDeep },
      { markdown: 'different', blocknote: body.blocknote },
    ];

    for (const invalidBody of invalidBodies) {
      expect(() => parseMyahReplyRichText(invalidBody)).toThrow(
        'Invalid rich reply body',
      );
      try {
        parseMyahReplyRichText(invalidBody);
      } catch (error) {
        expect((error as Error).message).not.toContain('javascript:');
        expect((error as Error).message).not.toContain('{not json');
      }
    }
  });
});

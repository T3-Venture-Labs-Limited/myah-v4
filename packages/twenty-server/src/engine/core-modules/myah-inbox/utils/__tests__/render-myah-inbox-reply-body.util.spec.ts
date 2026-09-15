import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { serializeMyahReplyBlocks } from 'twenty-shared/utils';

import { renderMyahInboxReplyBody } from 'src/engine/core-modules/myah-inbox/utils/render-myah-inbox-reply-body.util';

jest.mock(
  'src/engine/core-modules/record-transformer/utils/transform-rich-text.util',
  () => ({ getServerBlockNoteEditor: jest.fn() }),
);

const { getServerBlockNoteEditor } = jest.requireMock(
  'src/engine/core-modules/record-transformer/utils/transform-rich-text.util',
) as { getServerBlockNoteEditor: jest.Mock };
const blocksToHTMLLossy = jest.fn();

describe('renderMyahInboxReplyBody', () => {
  beforeEach(() => {
    blocksToHTMLLossy.mockResolvedValue(
      '<p><strong>Hello </strong><em><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow" classname="bn-inline-content-section" data-inline-content-type="link">link</a></em></p><ul><li><p class="bn-inline-content">item</p></li></ul>',
    );
    getServerBlockNoteEditor.mockResolvedValue({ blocksToHTMLLossy });
  });
  it('preserves literal plain text while escaping it for HTML', async () => {
    await expect(
      renderMyahInboxReplyBody({
        markdown: '**literal** <script>alert("x")</script>',
        blocknote: null,
      }),
    ).resolves.toEqual({
      body: '**literal** <script>alert("x")</script>',
      html: '**literal** &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    });
  });

  it('uses the native BlockNote renderer for validated formatted blocks', async () => {
    const body = serializeMyahReplyBlocks([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ', styles: { bold: true } },
          {
            type: 'link',
            href: 'https://example.com',
            content: [{ type: 'text', text: 'link', styles: { italic: true } }],
          },
        ],
        children: [],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'item', styles: {} }],
        children: [],
      },
    ]);

    await expect(renderMyahInboxReplyBody(body)).resolves.toEqual({
      body: 'Hello link\n• item',
      html: '<p><strong>Hello </strong><em><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow" classname="bn-inline-content-section" data-inline-content-type="link">link</a></em></p><ul><li><p class="bn-inline-content">item</p></li></ul>',
    });
    expect(getServerBlockNoteEditor).toHaveBeenCalledTimes(1);
    expect(blocksToHTMLLossy).toHaveBeenCalledWith([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ', styles: { bold: true } },
          {
            type: 'link',
            href: 'https://example.com',
            content: [{ type: 'text', text: 'link', styles: { italic: true } }],
          },
        ],
        children: [],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'item', styles: {} }],
        children: [],
      },
    ]);
  });

  it('exports a detached safe native HTML projection for hostile formatted links', () => {
    const body = serializeMyahReplyBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Hostile <tag> & "quote"',
            styles: { bold: true },
          },
          {
            type: 'link',
            href: 'https://example.com/?q="&x=<tag>',
            content: [
              { type: 'text', text: 'web <link>', styles: { italic: true } },
            ],
          },
          { type: 'text', text: '\n', styles: {} },
          {
            type: 'link',
            href: 'mailto:person@example.com?subject=<tag>',
            content: [
              { type: 'text', text: 'mail', styles: { underline: true } },
            ],
          },
        ],
        children: [],
      },
      {
        type: 'bulletListItem',
        content: [
          {
            type: 'text',
            text: 'item & <safe>',
            styles: { strike: true },
          },
        ],
        children: [
          {
            type: 'bulletListItem',
            content: [
              {
                type: 'link',
                href: 'https://example.com/nested<node>',
                content: [{ type: 'text', text: 'nested link', styles: {} }],
              },
            ],
            children: [],
          },
        ],
      },
    ]);
    const script = `
      import rendererModule from './src/engine/core-modules/myah-inbox/utils/render-myah-inbox-reply-body.util.ts';
      process.stdout.write(JSON.stringify(await rendererModule.renderMyahInboxReplyBody(${JSON.stringify(body)})));
    `;
    const output = execFileSync(
      process.execPath,
      [
        '--no-deprecation',
        `--localstorage-file=${join(tmpdir(), `myah-rich-body-${process.pid}`)}`,
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        script,
      ],
      {
        cwd: join(process.cwd(), 'packages/twenty-server'),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const rendered = JSON.parse(output) as { body: string; html: string };

    expect(rendered.body).toBe(body.markdown);
    expect(rendered.html).toContain(
      '<strong>Hostile &lt;tag&gt; &amp; "quote"</strong>',
    );
    expect(rendered.html).toContain('<br>');
    expect(rendered.html).toContain('<ul><li>');
    expect(rendered.html).toContain(
      'href="https://example.com/?q=&quot;&amp;x=%3Ctag%3E"',
    );
    expect(rendered.html).toContain(
      'href="mailto:person@example.com?subject=%3Ctag%3E"',
    );
    expect(rendered.html).toContain(
      'href="https://example.com/nested%3Cnode%3E"',
    );
    expect(rendered.html).not.toMatch(/href="[^"]*[<>]/);
    expect(rendered.html).not.toContain('<script');
    expect(rendered.html).not.toContain('onerror=');
  });

  it('rejects malformed rich bodies rather than returning partial output', async () => {
    await expect(
      renderMyahInboxReplyBody({ markdown: 'safe', blocknote: '{' }),
    ).rejects.toThrow('Invalid rich reply body');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FRONT_ROOT = resolve(__dirname, '../..');
const STATIC_DESCRIPTION = 'Myah is a creator operations workspace.';
const CANONICAL_URL = 'https://app.myah.dev/';
const SOCIAL_IMAGE_URL =
  'https://app.myah.dev/images/brand/myah-social-card.png';

describe('static Myah branding', () => {
  it('identifies Myah before JavaScript runs and to link-preview crawlers', () => {
    const indexHtml = readFileSync(resolve(FRONT_ROOT, 'index.html'), 'utf8');

    expect(indexHtml).toContain('<title>Myah</title>');
    expect(indexHtml).toContain('type="image/png"');
    expect(indexHtml).toContain('href="/images/icons/ios/180.png"');
    expect(indexHtml).toContain(`content="${STATIC_DESCRIPTION}"`);
    expect(indexHtml).toContain(`content="${CANONICAL_URL}"`);
    expect(indexHtml).toContain(`content="${SOCIAL_IMAGE_URL}"`);
    expect(indexHtml).toContain('property="og:image:alt"');
    expect(indexHtml).toContain('property="og:image:width" content="1200"');
    expect(indexHtml).toContain('property="og:image:height" content="630"');
    expect(indexHtml).toContain('name="twitter:image:alt"');
    expect(indexHtml).not.toContain('twentyhq/twenty');
  });
});

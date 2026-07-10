import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';

const PUBLIC_DIRECTORY = resolve(__dirname, '../../public');

describe('public Myah assets', () => {
  it('ships the named SVG mark and opaque PNG masters', async () => {
    const svgPath = resolve(
      PUBLIC_DIRECTORY,
      'images/integrations/myah-mark.svg',
    );
    const markPath = resolve(PUBLIC_DIRECTORY, 'images/brand/myah-mark.png');
    const socialPath = resolve(
      PUBLIC_DIRECTORY,
      'images/brand/myah-social-card.png',
    );

    await expect(access(svgPath)).resolves.toBeUndefined();

    await expect(sharp(markPath).metadata()).resolves.toMatchObject({
      format: 'png',
      hasAlpha: false,
      height: 1024,
      width: 1024,
    });
    await expect(sharp(socialPath).metadata()).resolves.toMatchObject({
      format: 'png',
      hasAlpha: false,
      height: 630,
      width: 1200,
    });
  });
});

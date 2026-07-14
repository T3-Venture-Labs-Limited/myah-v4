import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';

import { getManifestAssetSpecifications } from '../../scripts/generate-brand-assets';

const PUBLIC_DIRECTORY = resolve(__dirname, '../../public');

const expectPng = async (
  path: string,
  dimensions: { height: number; width: number },
) => {
  await expect(sharp(path).metadata()).resolves.toMatchObject({
    format: 'png',
    ...dimensions,
  });
};

const hasTransparentPixels = async (imagePath: string) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] < 255) {
      return true;
    }
  }

  return false;
};

describe('public Myah assets', () => {
  it('ships the named SVG mark and opaque PNG master', async () => {
    const svgPath = resolve(
      PUBLIC_DIRECTORY,
      'images/integrations/myah-mark.svg',
    );
    const markPath = resolve(PUBLIC_DIRECTORY, 'images/brand/myah-mark.png');

    await expect(access(svgPath)).resolves.toBeUndefined();
    await expect(sharp(markPath).metadata()).resolves.toMatchObject({
      format: 'png',
      hasAlpha: false,
      height: 1024,
      width: 1024,
    });
  });

  it('ships a transparent circular browser favicon separately from the square product mark', async () => {
    const faviconPath = resolve(
      PUBLIC_DIRECTORY,
      'images/brand/myah-favicon.png',
    );

    await expect(sharp(faviconPath).metadata()).resolves.toMatchObject({
      format: 'png',
      hasAlpha: true,
      height: 48,
      width: 48,
    });
    expect(await hasTransparentPixels(faviconPath)).toBe(true);
  });

  it('serves the social card and every manifest icon as advertised PNGs', async () => {
    await expectPng(
      resolve(PUBLIC_DIRECTORY, 'images/brand/myah-social-card.png'),
      { height: 630, width: 1200 },
    );

    await Promise.all(
      getManifestAssetSpecifications().map(({ height, sourcePath, width }) =>
        expectPng(resolve(PUBLIC_DIRECTORY, sourcePath), {
          height,
          width,
        }),
      ),
    );
  });
});

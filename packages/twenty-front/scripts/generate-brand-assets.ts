import { readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

type BrandAssetPlatform = 'android' | 'ios' | 'windows';

type ManifestIcon = {
  src: string;
  sizes: string;
};

type Manifest = {
  icons: ManifestIcon[];
};

export type BrandAssetSpecification = {
  height: number;
  platform: BrandAssetPlatform;
  sourcePath: string;
  width: number;
};

const BRAND_BACKGROUND = { r: 223, g: 51, b: 119, alpha: 1 };
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FRONT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const PUBLIC_DIRECTORY = resolve(FRONT_ROOT, 'public');
const MANIFEST_PATH = resolve(PUBLIC_DIRECTORY, 'manifest.json');
const BRAND_ASSET_DIRECTORY = resolve(FRONT_ROOT, 'assets', 'myah');
const SQUARE_MASTER_PATH = resolve(
  BRAND_ASSET_DIRECTORY,
  'myah-square-master.png',
);
const WINDOWS_MASTER_PATH = resolve(
  BRAND_ASSET_DIRECTORY,
  'myah-windows-master.png',
);
const MARK_SVG_PATH = resolve(BRAND_ASSET_DIRECTORY, 'myah-mark.svg');
const SOCIAL_MASTER_PATH = resolve(
  BRAND_ASSET_DIRECTORY,
  'myah-social-card.png',
);
const FAVICON_MASTER_PATH = resolve(
  BRAND_ASSET_DIRECTORY,
  'myah-favicon-master.png',
);
const PUBLIC_BRAND_ASSET_DIRECTORY = resolve(
  PUBLIC_DIRECTORY,
  'images',
  'brand',
);
const PUBLIC_MARK_PATH = resolve(PUBLIC_BRAND_ASSET_DIRECTORY, 'myah-mark.png');
const PUBLIC_SOCIAL_CARD_PATH = resolve(
  PUBLIC_BRAND_ASSET_DIRECTORY,
  'myah-social-card.png',
);
const PUBLIC_FAVICON_PATH = resolve(
  PUBLIC_BRAND_ASSET_DIRECTORY,
  'myah-favicon.png',
);
const PUBLIC_MARK_SVG_PATH = resolve(
  PUBLIC_DIRECTORY,
  'images',
  'integrations',
  'myah-mark.svg',
);

const getPlatform = (sourcePath: string): BrandAssetPlatform => {
  if (sourcePath.includes('/windows11/')) return 'windows';
  if (sourcePath.includes('/android/')) return 'android';
  if (sourcePath.includes('/ios/')) return 'ios';

  throw new Error(`Unsupported manifest icon path: ${sourcePath}`);
};

const parseDimensions = (sizes: string): { height: number; width: number } => {
  const [widthValue, heightValue] = sizes.split('x').map(Number);

  if (!Number.isInteger(widthValue) || !Number.isInteger(heightValue)) {
    throw new Error(`Invalid manifest icon dimensions: ${sizes}`);
  }

  return { height: heightValue, width: widthValue };
};

export const getManifestAssetSpecifications = (): BrandAssetSpecification[] => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

  return manifest.icons.map(({ src, sizes }) => {
    const { height, width } = parseDimensions(sizes);

    return {
      height,
      platform: getPlatform(src),
      sourcePath: src,
      width,
    };
  });
};

const isWindowsUnplatedAsset = (assetSpecification: BrandAssetSpecification) =>
  assetSpecification.platform === 'windows' &&
  assetSpecification.sourcePath.includes('altform-');

const isWindowsLightUnplatedAsset = (
  assetSpecification: BrandAssetSpecification,
) => assetSpecification.sourcePath.includes('altform-lightunplated');

const isWindowsLandscapeAsset = (assetSpecification: BrandAssetSpecification) =>
  assetSpecification.platform === 'windows' &&
  (assetSpecification.sourcePath.includes('Wide310x150Logo') ||
    assetSpecification.sourcePath.includes('SplashScreen'));

const getOutputPath = (assetSpecification: BrandAssetSpecification) =>
  resolve(PUBLIC_DIRECTORY, assetSpecification.sourcePath.replace(/^\//, ''));

const validatePng = async (
  sourcePath: string,
  expectedDimensions: { height: number; width: number },
) => {
  const metadata = await sharp(sourcePath).metadata();

  if (
    metadata.format !== 'png' ||
    metadata.width !== expectedDimensions.width ||
    metadata.height !== expectedDimensions.height
  ) {
    throw new Error(
      `Expected ${sourcePath} to be a ${expectedDimensions.width}×${expectedDimensions.height} PNG`,
    );
  }
};

const validateSourceMaster = async (
  sourcePath: string,
  expectedDimensions: { height: number; width: number },
) => {
  await validatePng(sourcePath, expectedDimensions);
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const firstPixel = data.subarray(0, info.channels);

  if (
    firstPixel[0] !== BRAND_BACKGROUND.r ||
    firstPixel[1] !== BRAND_BACKGROUND.g ||
    firstPixel[2] !== BRAND_BACKGROUND.b ||
    firstPixel[3] !== 255
  ) {
    throw new Error(`Expected ${sourcePath} to have an opaque Myah canvas`);
  }
};

const hasTransparentPixels = async (sourcePath: string) => {
  const { data, info } = await sharp(sourcePath)
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

const validateTransparentSourceMaster = async (
  sourcePath: string,
  expectedDimensions: { height: number; width: number },
) => {
  await validatePng(sourcePath, expectedDimensions);

  if (!(await hasTransparentPixels(sourcePath))) {
    throw new Error(`Expected ${sourcePath} to preserve transparent pixels`);
  }
};

const getUnplatedMarkInput = async (isLight: boolean) => {
  const markSvg = await readFile(MARK_SVG_PATH, 'utf8');

  return Buffer.from(
    isLight ? markSvg.replaceAll('fill="black"', 'fill="white"') : markSvg,
  );
};

const writeSquareAsset = async (
  assetSpecification: BrandAssetSpecification,
) => {
  await sharp(SQUARE_MASTER_PATH)
    .flatten({ background: BRAND_BACKGROUND })
    .removeAlpha()
    .resize(assetSpecification.width, assetSpecification.height, {
      fit: 'fill',
    })
    .png()
    .toFile(getOutputPath(assetSpecification));
};

const writeLandscapeAsset = async (
  assetSpecification: BrandAssetSpecification,
) => {
  const master = await sharp(WINDOWS_MASTER_PATH)
    .resize({ height: assetSpecification.height, fit: 'contain' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      background: BRAND_BACKGROUND,
      channels: 4,
      height: assetSpecification.height,
      width: assetSpecification.width,
    },
  })
    .composite([{ gravity: 'center', input: master }])
    .flatten({ background: BRAND_BACKGROUND })
    .removeAlpha()
    .png()
    .toFile(getOutputPath(assetSpecification));
};

const writeUnplatedAsset = async (
  assetSpecification: BrandAssetSpecification,
) => {
  const markInput = await getUnplatedMarkInput(
    isWindowsLightUnplatedAsset(assetSpecification),
  );

  await sharp(markInput)
    .resize(assetSpecification.width, assetSpecification.height, {
      fit: 'contain',
    })
    .png()
    .toFile(getOutputPath(assetSpecification));
};

const writeAsset = async (assetSpecification: BrandAssetSpecification) => {
  await mkdir(dirname(getOutputPath(assetSpecification)), { recursive: true });

  if (isWindowsUnplatedAsset(assetSpecification)) {
    await writeUnplatedAsset(assetSpecification);
    return;
  }

  if (isWindowsLandscapeAsset(assetSpecification)) {
    await writeLandscapeAsset(assetSpecification);
    return;
  }

  await writeSquareAsset(assetSpecification);
};

const writePublicBrandAssets = async () => {
  await mkdir(PUBLIC_BRAND_ASSET_DIRECTORY, { recursive: true });
  await mkdir(dirname(PUBLIC_MARK_SVG_PATH), { recursive: true });

  await Promise.all([
    copyFile(MARK_SVG_PATH, PUBLIC_MARK_SVG_PATH),
    sharp(SQUARE_MASTER_PATH)
      .flatten({ background: BRAND_BACKGROUND })
      .removeAlpha()
      .resize(1024, 1024, { fit: 'fill' })
      .png()
      .toFile(PUBLIC_MARK_PATH),
    sharp(FAVICON_MASTER_PATH)
      .resize(48, 48, { fit: 'fill' })
      .png()
      .toFile(PUBLIC_FAVICON_PATH),
    sharp(SOCIAL_MASTER_PATH)
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .removeAlpha()
      .resize(1200, 630, { fit: 'fill' })
      .png()
      .toFile(PUBLIC_SOCIAL_CARD_PATH),
  ]);
};

export const generateBrandAssets = async () => {
  const assetSpecifications = getManifestAssetSpecifications();

  await validateSourceMaster(SQUARE_MASTER_PATH, { height: 1200, width: 1200 });
  await validateSourceMaster(WINDOWS_MASTER_PATH, { height: 600, width: 1200 });
  await validatePng(SOCIAL_MASTER_PATH, { height: 630, width: 1200 });
  await validateTransparentSourceMaster(FAVICON_MASTER_PATH, {
    height: 1200,
    width: 1200,
  });

  await Promise.all([
    ...assetSpecifications.map(writeAsset),
    writePublicBrandAssets(),
  ]);
};

const getExpectedPlatformCount = (platform: BrandAssetPlatform) => {
  switch (platform) {
    case 'windows':
      return 80;
    case 'android':
      return 6;
    case 'ios':
      return 26;
  }
};

const PUBLIC_RASTER_ASSET_SPECIFICATIONS = [
  {
    expectsTransparency: false,
    height: 1024,
    outputPath: PUBLIC_MARK_PATH,
    width: 1024,
  },
  {
    expectsTransparency: false,
    height: 630,
    outputPath: PUBLIC_SOCIAL_CARD_PATH,
    width: 1200,
  },
  {
    expectsTransparency: true,
    height: 48,
    outputPath: PUBLIC_FAVICON_PATH,
    width: 48,
  },
] as const;

const checkPublicBrandAssets = async (validationErrors: string[]) => {
  try {
    const markSvg = await readFile(PUBLIC_MARK_SVG_PATH, 'utf8');

    if (!markSvg.includes('<svg')) {
      validationErrors.push(`Invalid public mark SVG: ${PUBLIC_MARK_SVG_PATH}`);
    }
  } catch {
    validationErrors.push(`Missing public mark SVG: ${PUBLIC_MARK_SVG_PATH}`);
  }

  for (const publicRasterAssetSpecification of PUBLIC_RASTER_ASSET_SPECIFICATIONS) {
    const { expectsTransparency, height, outputPath, width } =
      publicRasterAssetSpecification;

    try {
      const metadata = await sharp(outputPath).metadata();

      if (
        metadata.format !== 'png' ||
        metadata.width !== width ||
        metadata.height !== height ||
        (await hasTransparentPixels(outputPath)) !== expectsTransparency
      ) {
        validationErrors.push(`Invalid public brand asset: ${outputPath}`);
      }
    } catch {
      validationErrors.push(`Missing public brand asset: ${outputPath}`);
    }
  }
};

export const checkBrandAssets = async () => {
  const assetSpecifications = getManifestAssetSpecifications();
  const validationErrors: string[] = [];

  if (assetSpecifications.length !== 112) {
    validationErrors.push(
      `Expected 112 manifest icons, received ${assetSpecifications.length}`,
    );
  }

  for (const platform of ['windows', 'android', 'ios'] as const) {
    const platformCount = assetSpecifications.filter(
      (assetSpecification) => assetSpecification.platform === platform,
    ).length;

    if (platformCount !== getExpectedPlatformCount(platform)) {
      validationErrors.push(
        `Expected ${getExpectedPlatformCount(platform)} ${platform} icons, received ${platformCount}`,
      );
    }
  }

  for (const assetSpecification of assetSpecifications) {
    const outputPath = getOutputPath(assetSpecification);

    try {
      await stat(outputPath);
      const metadata = await sharp(outputPath).metadata();
      const expectsTransparency = isWindowsUnplatedAsset(assetSpecification);
      const containsTransparency = await hasTransparentPixels(outputPath);

      if (
        metadata.format !== 'png' ||
        metadata.width !== assetSpecification.width ||
        metadata.height !== assetSpecification.height ||
        containsTransparency !== expectsTransparency
      ) {
        validationErrors.push(`Invalid generated asset: ${outputPath}`);
      }
    } catch {
      validationErrors.push(`Missing generated asset: ${outputPath}`);
    }
  }

  await checkPublicBrandAssets(validationErrors);

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('\n'));
  }
};

const run = async () => {
  if (process.argv.includes('--check')) {
    await checkBrandAssets();
    return;
  }

  await generateBrandAssets();
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void run();
}

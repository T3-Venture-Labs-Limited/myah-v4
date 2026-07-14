import * as fs from 'fs';
import * as path from 'path';

import { THEME_DARK } from '@ui/theme/constants/ThemeDark';
import { THEME_LIGHT } from '@ui/theme/constants/ThemeLight';

import { themeCssVariables } from '../themeCssVariables';

const THEME_CONSTANTS_DIR = path.resolve(__dirname, '..');

const BRAND_ROLES = [
  'solid',
  'onSolid',
  'onSolidMuted',
  'solidHover',
  'solidActive',
  'text',
  'border',
  'soft',
  'softHover',
  'softActive',
  'disabled',
  'focusRing',
  'focusHalo',
] as const;

type BrandRole = (typeof BRAND_ROLES)[number];
type BrandTokens = Record<BrandRole, string>;

const BRAND_CSS_VARIABLES: Record<BrandRole, string> = {
  solid: '--t-brand-solid',
  onSolid: '--t-brand-on-solid',
  onSolidMuted: '--t-brand-on-solid-muted',
  solidHover: '--t-brand-solid-hover',
  solidActive: '--t-brand-solid-active',
  text: '--t-brand-text',
  border: '--t-brand-border',
  soft: '--t-brand-soft',
  softHover: '--t-brand-soft-hover',
  softActive: '--t-brand-soft-active',
  disabled: '--t-brand-disabled',
  focusRing: '--t-brand-focus-ring',
  focusHalo: '--t-brand-focus-halo',
};

type ThemeBrandCase = {
  name: 'light' | 'dark';
  theme: typeof THEME_LIGHT;
  cssFileName: 'theme-light.css' | 'theme-dark.css';
  textBackground: string;
};

const BRAND_CASES: ThemeBrandCase[] = [
  {
    name: 'light',
    theme: THEME_LIGHT,
    cssFileName: 'theme-light.css',
    textBackground: '#FFFFFF',
  },
  {
    name: 'dark',
    theme: THEME_DARK,
    cssFileName: 'theme-dark.css',
    textBackground: '#171717',
  },
];

const getBrandTokens = (theme: typeof THEME_LIGHT): BrandTokens => {
  const brandTokens = Reflect.get(theme, 'brand');

  expect(brandTokens).toBeDefined();

  if (typeof brandTokens !== 'object' || brandTokens === null) {
    throw new Error('Brand tokens must be an object');
  }

  return brandTokens as BrandTokens;
};

const getBrandCssVariables = (): Record<BrandRole, string> => {
  const brandCssVariables = Reflect.get(themeCssVariables, 'brand');

  expect(brandCssVariables).toBeDefined();

  if (typeof brandCssVariables !== 'object' || brandCssVariables === null) {
    throw new Error('Brand CSS variables must be an object');
  }

  return brandCssVariables as Record<BrandRole, string>;
};

const getCssVariableValue = (css: string, role: BrandRole) => {
  const cssVariableName = BRAND_CSS_VARIABLES[role];
  const match = css.match(new RegExp(`${cssVariableName}:\\s*([^;]+);`));

  if (match === null) {
    throw new Error(`Missing ${cssVariableName} declaration`);
  }

  return match[1].trim();
};

const getRelativeLuminance = (color: string) => {
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(color.slice(index, index + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const getContrastRatio = (firstColor: string, secondColor: string) => {
  const firstLuminance = getRelativeLuminance(firstColor);
  const secondLuminance = getRelativeLuminance(secondColor);

  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
};

describe.each(BRAND_CASES)(
  '$name brand tokens',
  ({ theme, cssFileName, textBackground }) => {
    it('defines the approved semantic roles in its TypeScript theme object', () => {
      const brandTokens = getBrandTokens(theme);

      expect(Object.keys(brandTokens)).toEqual(BRAND_ROLES);
      expect(brandTokens).toMatchObject({
        solid: '#C92769',
        onSolid: '#FFFFFF',
      });
    });

    it('maps every semantic role to its CSS custom property', () => {
      const brandCssVariables = getBrandCssVariables();

      expect(Object.keys(brandCssVariables)).toEqual(BRAND_ROLES);

      for (const role of BRAND_ROLES) {
        expect(brandCssVariables[role]).toBe(
          `var(${BRAND_CSS_VARIABLES[role]})`,
        );
      }
    });

    it('keeps source CSS synchronized with the TypeScript theme object', () => {
      const brandTokens = getBrandTokens(theme);
      const css = fs.readFileSync(
        path.join(THEME_CONSTANTS_DIR, cssFileName),
        'utf-8',
      );

      for (const role of BRAND_ROLES) {
        expect(getCssVariableValue(css, role).toLowerCase()).toBe(
          brandTokens[role].toLowerCase(),
        );
      }
    });

    it('keeps solid controls and regular-size brand text accessible', () => {
      const brandTokens = getBrandTokens(theme);

      expect(
        getContrastRatio(brandTokens.solid, brandTokens.onSolid),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(brandTokens.solidHover, brandTokens.onSolid),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(brandTokens.solidActive, brandTokens.onSolid),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(brandTokens.text, textBackground),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(brandTokens.text, brandTokens.softHover),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(brandTokens.text, brandTokens.softActive),
      ).toBeGreaterThanOrEqual(4.5);
    });
  },
);

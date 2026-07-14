import { type Meta, type StoryObj } from '@storybook/react-vite';
import { IconSearch } from '@ui/icon';
import { AnimatedButton } from '@ui/input/AnimatedButton/AnimatedButton';
import { Button } from '@ui/input/Button/Button';
import { ButtonGroup } from '@ui/input/ButtonGroup/ButtonGroup';
import { Checkbox, CheckboxAccent } from '@ui/input/Checkbox/Checkbox';
import { IconButton } from '@ui/input/IconButton/IconButton';
import { MainButton } from '@ui/input/MainButton/MainButton';
import { Radio } from '@ui/input/Radio/Radio';
import { SearchInput } from '@ui/input/SearchInput/SearchInput';
import { Toggle } from '@ui/input/Toggle/Toggle';
import { ThemeProvider, themeCssVariables } from '@ui/theme-constants';
import { expect, userEvent, within } from 'storybook/test';

const meta: Meta<typeof Button> = {
  title: 'UI/Input/Brand Accent Contract',
  component: Button,
};

export default meta;
type Story = StoryObj<typeof meta>;

type BrandAccentFixtureProps = {
  colorScheme: 'light' | 'dark';
  name: 'light' | 'dark';
};

const BrandAccentFixture = ({ colorScheme, name }: BrandAccentFixtureProps) => {
  return (
    <ThemeProvider colorScheme={colorScheme} applyToRoot={false}>
      <div style={{ backgroundColor: themeCssVariables.background.primary }}>
        <Button
          title={`${name} primary`}
          accent="brand"
          hotkeys={['⌘', 'K']}
          dataTestId={`${name}-brand-primary`}
        />
        <MainButton title={`${name} main`} />
        <MainButton title={`${name} login main`} accent="dark" />
        <Button
          title={`${name} focus`}
          accent="brand"
          focus
          dataTestId={`${name}-brand-focus`}
        />
        <Button
          title={`${name} disabled`}
          accent="brand"
          disabled
          dataTestId={`${name}-brand-disabled`}
        />
        <Button
          title={`${name} secondary`}
          variant="secondary"
          accent="brand"
          hotkeys={['⌘', 'S']}
          dataTestId={`${name}-brand-secondary`}
        />
        <IconButton
          Icon={IconSearch}
          ariaLabel={`${name} brand icon`}
          accent="brand"
          dataTestId={`${name}-brand-icon`}
        />
        <AnimatedButton
          title={`${name} animated`}
          accent="brand"
          animatedSvg={<svg aria-hidden />}
          dataTestId={`${name}-brand-animated`}
        />
        <AnimatedButton
          title={`${name} animated secondary`}
          variant="secondary"
          accent="brand"
          animatedSvg={<svg aria-hidden />}
          hotkeys={['⌘', 'A']}
          dataTestId={`${name}-brand-animated-secondary`}
        />
        <ButtonGroup accent="brand">
          <Button
            title={`${name} grouped`}
            dataTestId={`${name}-brand-grouped`}
          />
          <Button
            title={`${name} grouped secondary`}
            dataTestId={`${name}-brand-grouped-secondary`}
          />
        </ButtonGroup>
        <Checkbox
          checked
          accent={CheckboxAccent.Brand}
          aria-label={`${name} brand checkbox`}
        />
        <Radio checked label={`${name} brand radio`} />
        <Toggle value aria-label={`${name} brand toggle`} />
        <SearchInput
          value=""
          onChange={() => {}}
          aria-label={`${name} brand search`}
        />
      </div>
    </ThemeProvider>
  );
};

export const BrandAccentContract: Story = {
  render: () => (
    <>
      <BrandAccentFixture colorScheme="light" name="light" />
      <BrandAccentFixture colorScheme="dark" name="dark" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const lightPrimary = canvas.getByTestId('light-brand-primary');
    const darkPrimary = canvas.getByTestId('dark-brand-primary');

    expect(lightPrimary).toHaveAttribute('data-accent', 'brand');
    expect(darkPrimary).toHaveAttribute('data-accent', 'brand');
    expect(window.getComputedStyle(lightPrimary).backgroundColor).toBe(
      'rgb(201, 39, 105)',
    );
    expect(window.getComputedStyle(darkPrimary).backgroundColor).toBe(
      'rgb(201, 39, 105)',
    );
    expect(window.getComputedStyle(lightPrimary).color).toBe(
      'rgb(255, 255, 255)',
    );
    expect(window.getComputedStyle(darkPrimary).color).toBe(
      'rgb(255, 255, 255)',
    );

    const lightMainButton = canvas.getByRole('button', {
      name: 'light main',
    });
    const darkMainButton = canvas.getByRole('button', {
      name: 'dark main',
    });

    expect(window.getComputedStyle(lightMainButton).backgroundColor).toBe(
      'rgb(201, 39, 105)',
    );
    expect(window.getComputedStyle(darkMainButton).backgroundColor).toBe(
      'rgb(201, 39, 105)',
    );
    expect(window.getComputedStyle(lightMainButton).color).toBe(
      'rgb(255, 255, 255)',
    );
    expect(window.getComputedStyle(darkMainButton).color).toBe(
      'rgb(255, 255, 255)',
    );

    const lightLoginMainButton = canvas.getByRole('button', {
      name: 'light login main',
    });

    expect(window.getComputedStyle(lightLoginMainButton).backgroundColor).toBe(
      'rgb(10, 10, 10)',
    );
    expect(window.getComputedStyle(lightLoginMainButton).color).toBe(
      'rgb(255, 255, 255)',
    );

    expect(
      window
        .getComputedStyle(lightPrimary)
        .getPropertyValue('--btn-hover-bg')
        .trim(),
    ).toBe('#d42b6d');
    expect(
      window
        .getComputedStyle(lightPrimary)
        .getPropertyValue('--btn-active-bg')
        .trim(),
    ).toBe('#b71e5b');

    expect(
      window
        .getComputedStyle(lightPrimary)
        .getPropertyValue('--btn-hover-border-color')
        .trim(),
    ).toBe('#d42b6d');

    expect(
      window.getComputedStyle(lightPrimary, '::before').backgroundImage,
    ).toContain('linear-gradient');
    expect(
      window.getComputedStyle(lightPrimary, '::after').backgroundImage,
    ).toContain('data:image/svg+xml');
    expect(
      window
        .getComputedStyle(lightLoginMainButton)
        .getPropertyValue('--main-button-hover-bg')
        .trim(),
    ).toBe('#c92769');
    expect(
      window
        .getComputedStyle(lightLoginMainButton)
        .getPropertyValue('--main-button-hover-border-color')
        .trim(),
    ).toBe('#c92769');

    const lightFocus = canvas.getByTestId('light-brand-focus');
    const lightDisabled = canvas.getByTestId('light-brand-disabled');

    expect(window.getComputedStyle(lightFocus).borderColor).toBe(
      'rgb(201, 39, 105)',
    );
    expect(window.getComputedStyle(lightDisabled).backgroundColor).toBe(
      'rgb(232, 179, 203)',
    );

    for (const dataTestId of [
      'dark-brand-secondary',
      'dark-brand-animated-secondary',
    ]) {
      const secondaryButton = canvas.getByTestId(dataTestId);
      const [separator, shortcutLabel] = Array.from(
        secondaryButton.querySelectorAll(
          '[data-accent="brand"][data-variant="secondary"]',
        ),
      );

      if (!separator || !shortcutLabel) {
        throw new Error(`Missing secondary brand hotkeys for ${dataTestId}`);
      }
      expect(window.getComputedStyle(separator).backgroundColor).toBe(
        'rgb(255, 154, 192)',
      );
      expect(window.getComputedStyle(shortcutLabel).color).toBe(
        'rgb(255, 154, 192)',
      );
    }

    for (const dataTestId of [
      'light-brand-icon',
      'light-brand-animated',
      'light-brand-grouped',
    ]) {
      expect(
        window.getComputedStyle(canvas.getByTestId(dataTestId)).backgroundColor,
      ).toBe('rgb(201, 39, 105)');
    }

    const checkboxes = canvas.getAllByTestId('input-checkbox');
    const radios = canvas.getAllByTestId('input-radio');
    const toggles = canvas.getAllByRole('switch');

    expect(
      window.getComputedStyle(
        checkboxes[0].querySelector('span') as HTMLElement,
        '::before',
      ).backgroundColor,
    ).toBe('rgb(201, 39, 105)');
    expect(window.getComputedStyle(radios[0]).backgroundColor).toBe(
      'rgb(201, 39, 105)',
    );
    expect(window.getComputedStyle(toggles[0]).backgroundColor).toBe(
      'rgb(201, 39, 105)',
    );

    const lightSearchInput = canvas.getByLabelText('light brand search');

    await userEvent.click(lightSearchInput);
    expect(
      window.getComputedStyle(lightSearchInput.parentElement as HTMLElement)
        .borderColor,
    ).toBe('rgb(201, 39, 105)');
  },
};

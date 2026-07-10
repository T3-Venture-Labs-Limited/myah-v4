import {
  type ButtonAccent,
  type ButtonSize,
  type ButtonVariant,
} from '@ui/input/Button/Button';
import { getOsShortcutSeparator } from '@ui/utilities';

import styles from './ButtonHotKeys.module.scss';

export const ButtonHotkeys = ({
  size,
  accent,
  variant,
  inverted,
  hotkeys,
}: {
  size: ButtonSize;
  accent: ButtonAccent;
  variant: ButtonVariant;
  inverted: boolean;
  hotkeys: string[];
}) => {
  return (
    <>
      <div
        className={styles.separator}
        data-size={size}
        data-accent={accent}
        data-variant={variant}
        data-inverted={inverted || undefined}
      />
      <div
        className={styles.shortcutLabel}
        data-variant={variant}
        data-accent={accent}
        data-inverted={inverted || undefined}
      >
        {hotkeys.join(getOsShortcutSeparator())}
      </div>
    </>
  );
};

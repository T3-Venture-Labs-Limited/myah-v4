import { clsx } from 'clsx';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';

import { type IconComponent } from '@ui/icon';
import { useTheme } from '@ui/theme-constants';

import styles from './LightIconButton.module.scss';

export type LightIconButtonAccent = 'secondary' | 'tertiary';
export type LightIconButtonSize = 'small' | 'medium';

export type LightIconButtonProps = {
  testId?: string;
  'data-testid'?: string;
  Icon?: IconComponent;
  size?: LightIconButtonSize;
  accent?: LightIconButtonAccent;
  active?: boolean;
  focus?: boolean;
} & Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'dangerouslySetInnerHTML'
>;

export const LightIconButton = forwardRef<
  HTMLButtonElement,
  LightIconButtonProps
>(
  (
    {
      'aria-label': ariaLabel,
      className,
      testId,
      'data-testid': nativeDataTestId,
      Icon,
      active = false,
      size = 'small',
      accent = 'secondary',
      disabled = false,
      focus = false,
      ...buttonProps
    },
    ref,
  ) => {
    const theme = useTheme();

    return (
      <button
        ref={ref}
        // oxlint-disable-next-line react/jsx-props-no-spreading
        {...buttonProps}
        data-testid={testId ?? nativeDataTestId}
        aria-label={ariaLabel}
        disabled={disabled}
        className={clsx(styles.button, styles[size], className)}
        data-accent={accent}
        data-active={active || undefined}
        data-disabled={disabled || undefined}
        data-focus={(focus && !disabled) || undefined}
      >
        {Icon && (
          <Icon
            size={size === 'medium' ? theme.icon.size.md : theme.icon.size.sm}
            aria-hidden={!!ariaLabel}
          />
        )}
      </button>
    );
  },
);

LightIconButton.displayName = 'LightIconButton';

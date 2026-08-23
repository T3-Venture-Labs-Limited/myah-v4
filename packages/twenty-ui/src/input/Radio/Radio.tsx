import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { clsx } from 'clsx';
import * as React from 'react';

import styles from './Radio.module.scss';
import { RadioGroup, RadioGroupContext } from '@ui/input/RadioGroup/RadioGroup';

export enum RadioSize {
  Large = 'large',
  Small = 'small',
}

export enum LabelPosition {
  Left = 'left',
  Right = 'right',
}

export type RadioProps = {
  checked?: boolean;
  className?: string;
  name?: string;
  disabled?: boolean;
  label?: string;
  labelPosition?: LabelPosition;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: boolean) => void;
  size?: RadioSize;
  style?: React.CSSProperties;
  value?: string;
};

export const Radio = ({
  checked,
  className,
  name = 'input-radio',
  disabled = false,
  label,
  labelPosition = LabelPosition.Right,
  onChange,
  onCheckedChange,
  size = RadioSize.Small,
  style,
  value,
}: RadioProps) => {
  const isWithinRadioGroup = React.useContext(RadioGroupContext);
  const optionId = React.useId();

  // 'on' mimics the native input value default when neither value nor label is set.
  const radioValue = value ?? label ?? 'on';
  const containerClassName = clsx(
    styles.container,
    labelPosition === LabelPosition.Left && styles.containerLabelLeft,
    className,
  );
  const radioContent = (
    <>
      <RadioPrimitive.Root
        id={optionId}
        value={radioValue}
        disabled={disabled}
        data-testid="input-radio"
        className={clsx(styles.radio, styles[size])}
      />
      {label && (
        <label
          htmlFor={optionId}
          className={clsx(
            styles.label,
            labelPosition === LabelPosition.Left
              ? styles.labelLeft
              : styles.labelRight,
          )}
          data-disabled={disabled || undefined}
        >
          {label}
        </label>
      )}
    </>
  );

  if (isWithinRadioGroup) {
    return (
      <div className={containerClassName} style={style}>
        {radioContent}
      </div>
    );
  }

  return (
    <RadioGroupPrimitive
      className={containerClassName}
      name={name}
      style={style}
      value={checked === undefined ? undefined : checked ? radioValue : ''}
      onValueChange={(_newValue, eventDetails) => {
        const inputElement = eventDetails.event
          .target as HTMLInputElement | null;
        onChange?.(
          eventDetails.event as unknown as React.ChangeEvent<HTMLInputElement>,
        );
        onCheckedChange?.(inputElement?.checked ?? true);
      }}
    >
      {radioContent}
    </RadioGroupPrimitive>
  );
};

Radio.Group = RadioGroup;

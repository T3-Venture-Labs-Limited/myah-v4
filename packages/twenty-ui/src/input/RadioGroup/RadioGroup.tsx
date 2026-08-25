import {
  RadioGroup as RadioGroupPrimitive,
  type RadioGroupProps as BaseRadioGroupProps,
} from '@base-ui/react/radio-group';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { themeCssVariables } from '@ui/theme-constants';

export const RadioGroupContext = React.createContext(false);

export type RadioGroupProps<Value = string> = Omit<
  BaseRadioGroupProps<Value>,
  'onChange'
> & {
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function RadioGroup<Value = string>({
  children,
  onChange,
  onValueChange,
  onKeyDownCapture,
  render,
  style,
  ...props
}: RadioGroupProps<Value>) {
  return (
    <RadioGroupContext.Provider value>
      <RadioGroupPrimitive<Value>
        // oxlint-disable-next-line react/jsx-props-no-spreading
        {...props}
        render={render}
        style={(state) => ({
          ...(render === undefined
            ? { display: 'flex', flexDirection: 'column' }
            : {}),
          gap: themeCssVariables.spacing[2],
          ...(typeof style === 'function' ? style(state) : style),
        })}
        onKeyDownCapture={(event) => {
          onKeyDownCapture?.(event);

          if (event.key.startsWith('Arrow')) {
            queueMicrotask(() => {
              flushSync(() => undefined);
            });
          }
        }}
        onValueChange={(newValue, eventDetails) => {
          onChange?.(
            eventDetails.event as unknown as React.ChangeEvent<HTMLInputElement>,
          );
          onValueChange?.(newValue, eventDetails);
        }}
      >
        {children}
      </RadioGroupPrimitive>
    </RadioGroupContext.Provider>
  );
}

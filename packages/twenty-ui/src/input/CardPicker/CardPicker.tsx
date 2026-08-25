import {
  Radio as RadioPrimitive,
  type RadioRootProps,
} from '@base-ui/react/radio';
import React from 'react';

import styles from './CardPicker.module.scss';
import radioStyles from '../Radio/Radio.module.scss';

export type CardPickerProps = Omit<
  RadioRootProps<string>,
  'children' | 'className' | 'nativeButton' | 'render' | 'style'
> & {
  children: React.ReactNode;
};

export const CardPicker = ({ children, value, ...props }: CardPickerProps) => {
  return (
    <RadioPrimitive.Root
      // oxlint-disable-next-line react/jsx-props-no-spreading
      {...props}
      className={styles.container}
      nativeButton
      render={<button type="button" />}
      value={value}
    >
      <div className={styles.radioContainer}>
        <RadioPrimitive.Indicator
          className={`${radioStyles.radio} ${radioStyles.small}`}
          keepMounted
        />
      </div>
      <div className={styles.cardInner}>{children}</div>
    </RadioPrimitive.Root>
  );
};

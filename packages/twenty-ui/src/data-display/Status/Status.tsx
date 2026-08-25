import { clsx } from 'clsx';

import { handleClickableElementKeyDown } from '@ui/accessibility/utils/handleClickableElementKeyDown';
import { Loader } from '@ui/feedback/Loader/Loader';
import { type ThemeColor } from '@ui/theme';
import { themeCssVariables } from '@ui/theme-constants';
import { parseThemeColor } from '@ui/utilities';
import { isDefined } from '@ui/utilities/utils/isDefined';

import styles from './Status.module.scss';

type StatusProps = {
  className?: string;
  color: ThemeColor;
  isLoaderVisible?: boolean;
  text: string;
  onClick?: () => void;
  weight?: 'regular' | 'medium';
};

export const Status = ({
  className,
  color,
  isLoaderVisible = false,
  text,
  onClick,
  weight = 'regular',
}: StatusProps) => {
  const parsedColor = parseThemeColor(color);
  const statusClassName = clsx(styles.status, styles[weight], className);
  const statusStyle = {
    '--status-background': themeCssVariables.tag.background[parsedColor],
    '--status-text-color': themeCssVariables.tag.text[parsedColor],
  } as React.CSSProperties;
  const statusContent = (
    <>
      <span className={styles.content}>{text}</span>
      {isLoaderVisible ? <Loader color={color} /> : null}
    </>
  );

  if (isDefined(onClick)) {
    return (
      <div
        className={statusClassName}
        role="button"
        onClick={onClick}
        tabIndex={0}
        onKeyDown={handleClickableElementKeyDown}
        data-loader-visible={isLoaderVisible || undefined}
        style={statusStyle}
      >
        {statusContent}
      </div>
    );
  }

  return (
    <h3
      className={statusClassName}
      data-loader-visible={isLoaderVisible || undefined}
      style={statusStyle}
    >
      {statusContent}
    </h3>
  );
};

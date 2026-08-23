import { clsx } from 'clsx';

import { OverflowingTextWithTooltip } from '@ui/surfaces/OverflowingTextWithTooltip/OverflowingTextWithTooltip';

import styles from './H2Title.module.scss';

type H2TitleProps = {
  title: string;
  description?: string;
  adornment?: React.ReactNode;
  className?: string;
};

export const H2Title = ({
  title,
  description,
  adornment,
  className,
}: H2TitleProps) => {
  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.titleContainer}>
        <h2 className={styles.title}>{title}</h2>
        {adornment}
      </div>
      {description && (
        <p className={styles.description}>
          <OverflowingTextWithTooltip
            as="span"
            text={description}
            displayedMaxRows={5}
            isTooltipMultiline={true}
          />
        </p>
      )}
    </div>
  );
};

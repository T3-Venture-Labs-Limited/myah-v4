import { type CSSProperties, type ReactNode, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { isNonEmptyString } from '@sniptt/guards';
import { clsx } from 'clsx';
import { LinkifiedText } from '@ui/typography/LinkifiedText/LinkifiedText';
import { isDefined } from '@ui/utilities/utils/isDefined';
import { AppTooltip, TooltipDelay } from '@ui/surfaces/AppTooltip/AppTooltip';

import styles from './OverflowingTextWithTooltip.module.scss';

type OverflowingTextWithTooltipProps = {
  as?: 'div' | 'span';
  size?: 'large' | 'small';
  isTooltipMultiline?: boolean;
  displayedMaxRows?: number;
  tooltipDelay?: TooltipDelay;
  alwaysShowTooltip?: boolean;
} & (
  | {
      text: string | null | undefined;
      tooltipContent?: string;
    }
  | {
      text: Exclude<ReactNode, string | null | undefined>;
      tooltipContent: string;
    }
);

export const OverflowingTextWithTooltip = ({
  as = 'div',
  size = 'small',
  text,
  isTooltipMultiline,
  displayedMaxRows,
  tooltipContent,
  tooltipDelay = TooltipDelay.mediumDelay,
  alwaysShowTooltip = false,
}: OverflowingTextWithTooltipProps) => {
  const textElementId = `title-id-${+new Date()}`;

  const textRef = useRef<HTMLDivElement | HTMLSpanElement | null>(null);

  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const [shouldRenderTooltip, setShouldRenderTooltip] = useState(false);
  const TextElement = as;

  const setTextRef = (element: HTMLDivElement | HTMLSpanElement | null) => {
    textRef.current = element;
  };

  const handleMouseEnter = () => {
    const isOverflowing = textRef.current
      ? textRef.current?.scrollHeight > textRef.current?.clientHeight ||
        textRef.current.scrollWidth > textRef.current.clientWidth
      : false;

    setIsTitleOverflowing(isOverflowing);
    setShouldRenderTooltip(true);
  };

  const handleMouseLeave = () => {
    setIsTitleOverflowing(false);
    setShouldRenderTooltip(false);
  };

  const handleTooltipClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
  };

  const tooltipText = isNonEmptyString(tooltipContent)
    ? tooltipContent
    : isNonEmptyString(text)
      ? text
      : null;

  return (
    <>
      {isDefined(displayedMaxRows) ? (
        <TextElement
          data-testid="tooltip"
          data-content-overflowing={isTitleOverflowing ? '' : undefined}
          className={clsx(
            styles.overflowingMultilineText,
            size === 'large' && styles.large,
          )}
          style={
            {
              '--displayed-max-rows': displayedMaxRows
                ? displayedMaxRows.toString()
                : '1',
            } as CSSProperties
          }
          ref={setTextRef}
          id={textElementId}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isNonEmptyString(text) ? <LinkifiedText text={text} /> : text}
        </TextElement>
      ) : (
        <TextElement
          data-testid="tooltip"
          data-content-overflowing={isTitleOverflowing ? '' : undefined}
          className={clsx(
            styles.overflowingText,
            size === 'large' && styles.large,
          )}
          style={as === 'span' ? { display: 'inline-block' } : undefined}
          ref={setTextRef}
          id={textElementId}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isNonEmptyString(text) ? <LinkifiedText text={text} /> : text}
        </TextElement>
      )}

      {shouldRenderTooltip &&
        (isTitleOverflowing || alwaysShowTooltip) &&
        isDefined(tooltipText) &&
        createPortal(
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
          <div onClick={handleTooltipClick}>
            <AppTooltip
              anchorSelect={`#${textElementId}`}
              offset={5}
              noArrow
              place="bottom"
              positionStrategy="absolute"
              delay={tooltipDelay}
              isOpen={true}
            >
              {isTooltipMultiline ? (
                <pre className={styles.pre}>{tooltipText}</pre>
              ) : (
                tooltipText
              )}
            </AppTooltip>
          </div>,
          document.body,
        )}
    </>
  );
};

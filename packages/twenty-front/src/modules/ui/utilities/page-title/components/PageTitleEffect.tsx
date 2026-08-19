import { useLayoutEffect, useState } from 'react';

import { useDocumentTitleContextOrThrow } from '@/ui/utilities/page-title/contexts/DocumentTitleContext';

type PageTitleEffectProps = {
  title: string;
};

export const PageTitleEffect = (props: PageTitleEffectProps) => {
  const { claimTitle, pathnameVisitToken } = useDocumentTitleContextOrThrow();
  const [claimPathnameVisitToken] = useState(pathnameVisitToken);

  useLayoutEffect(() => {
    claimTitle({
      title: props.title,
      pathnameVisitToken: claimPathnameVisitToken,
    });
  }, [claimPathnameVisitToken, claimTitle, props.title]);

  return null;
};

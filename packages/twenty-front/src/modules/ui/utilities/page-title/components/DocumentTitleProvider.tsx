import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';

import {
  DocumentTitleContext,
  type DocumentTitleContextValue,
} from '@/ui/utilities/page-title/contexts/DocumentTitleContext';
import { getPageTitleFromPath } from '~/utils/title-utils';

export const DocumentTitleProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const location = useLocation();
  const [pathnameVisit, setPathnameVisit] = useState(() => ({
    pathname: location.pathname,
    token: 0,
    claimedTitle: undefined as string | undefined,
  }));

  if (pathnameVisit.pathname !== location.pathname) {
    setPathnameVisit(({ token }) => ({
      pathname: location.pathname,
      token: token + 1,
      claimedTitle: undefined,
    }));
  }

  const pathnameVisitToken = pathnameVisit.token;

  useLayoutEffect(() => {
    document.title =
      pathnameVisit.claimedTitle ?? getPageTitleFromPath(location.pathname);
  }, [location.pathname, pathnameVisit.claimedTitle, pathnameVisitToken]);

  const claimTitle = useCallback<DocumentTitleContextValue['claimTitle']>(
    ({ title, pathnameVisitToken: claimedPathnameVisitToken }) => {
      setPathnameVisit((currentPathnameVisit) => {
        if (
          claimedPathnameVisitToken !== currentPathnameVisit.token ||
          title === currentPathnameVisit.claimedTitle
        ) {
          return currentPathnameVisit;
        }

        return { ...currentPathnameVisit, claimedTitle: title };
      });
    },
    [],
  );

  const documentTitleContextValue = useMemo(
    () => ({ pathnameVisitToken, claimTitle }),
    [claimTitle, pathnameVisitToken],
  );

  return (
    <DocumentTitleContext.Provider value={documentTitleContextValue}>
      {children}
    </DocumentTitleContext.Provider>
  );
};

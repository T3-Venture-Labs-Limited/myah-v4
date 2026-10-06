import { useCallback } from 'react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { v4 } from 'uuid';
import { useMutation } from '@apollo/client/react';
import {
  AnalyticsType,
  type MutationTrackAnalyticsArgs,
  TrackAnalyticsDocument,
} from '~/generated-metadata/graphql';

export const ANALYTICS_COOKIE_NAME = 'analyticsCookie';
export const getSessionId = (): string => {
  const cookie: { [key: string]: string } = {};
  document.cookie.split(';').forEach((el) => {
    const [key, value] = el.split('=');
    cookie[key.trim()] = value;
  });
  return cookie[ANALYTICS_COOKIE_NAME];
};

export const setSessionId = (domain?: string): void => {
  const sessionId = getSessionId() || v4();
  const baseCookie = `${ANALYTICS_COOKIE_NAME}=${sessionId}; Max-Age=1800; path=/; secure`;
  const cookie = domain ? baseCookie + `; domain=${domain}` : baseCookie;

  document.cookie = cookie;
};

export const useEventTracker = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { hasAccess } = useMyahWorkspaceUsage();
  const [createEventMutation] = useMutation(TrackAnalyticsDocument);

  return useCallback(
    (
      type: AnalyticsType,
      payload: Omit<MutationTrackAnalyticsArgs, 'type'>,
    ) => {
      if (currentWorkspace && !hasAccess) return;
      createEventMutation({
        variables: {
          type,
          ...payload,
          properties: {
            ...payload.properties,
            ...(type === AnalyticsType['PAGEVIEW']
              ? { sessionId: getSessionId() }
              : {}),
          },
        },
      });
    },
    [createEventMutation, currentWorkspace, hasAccess],
  );
};

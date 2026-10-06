import { gql } from '@apollo/client';
import { type MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import {
  ANALYTICS_COOKIE_NAME,
  useEventTracker,
} from '@/analytics/hooks/useEventTracker';
import { AnalyticsType } from '~/generated-metadata/graphql';

let mockHasAccess = true;
let mockWorkspace: { id: string } | null = null;
jest.mock('@/settings/billing/hooks/useMyahWorkspaceUsage', () => ({
  useMyahWorkspaceUsage: () => ({ hasAccess: mockHasAccess }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockWorkspace,
}));

// Mock document.cookie
Object.defineProperty(document, 'cookie', {
  writable: true,
  value: `${ANALYTICS_COOKIE_NAME}=exampleId`,
});

const mocks: MockedResponse[] = [
  {
    request: {
      query: gql`
        mutation TrackAnalytics(
          $type: AnalyticsType!
          $event: String
          $name: String
          $properties: JSON
        ) {
          trackAnalytics(
            type: $type
            event: $event
            name: $name
            properties: $properties
          ) {
            success
          }
        }
      `,
      variables: {
        type: AnalyticsType['TRACK'],
        event: 'Example Event',
        properties: {
          foo: 'bar',
        },
      },
    },
    result: jest.fn(() => ({
      data: {
        track: {
          success: true,
        },
      },
    })),
  },
  {
    request: {
      query: gql`
        mutation TrackAnalytics(
          $type: AnalyticsType!
          $event: String
          $name: String
          $properties: JSON
        ) {
          trackAnalytics(
            type: $type
            event: $event
            name: $name
            properties: $properties
          ) {
            success
          }
        }
      `,
      variables: {
        type: AnalyticsType['PAGEVIEW'],
        name: 'Example',
        properties: {
          sessionId: 'exampleId',
          pathname: '/example/path',
          userAgent: '',
          timeZone: '',
          locale: '',
          href: '',
          referrer: '',
        },
      },
    },
    result: jest.fn(() => ({
      data: {
        track: {
          success: true,
        },
      },
    })),
  },
];

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MockedProvider mocks={mocks}>{children}</MockedProvider>
);

describe('useEventTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAccess = true;
    mockWorkspace = null;
  });

  it('does not track a gated workspace until access is available', async () => {
    mockWorkspace = { id: 'workspace' };
    mockHasAccess = false;
    const { result, rerender } = renderHook(() => useEventTracker(), {
      wrapper: Wrapper,
    });
    const payload = { event: 'Example Event', properties: { foo: 'bar' } };
    await act(async () => {
      result.current(AnalyticsType.TRACK, payload);
    });
    expect(mocks[0].result).not.toHaveBeenCalled();
    mockHasAccess = true;
    rerender();
    act(() => {
      result.current(AnalyticsType.TRACK, payload);
    });
    await waitFor(() => expect(mocks[0].result).toHaveBeenCalledTimes(1));
  });

  it('preserves anonymous sign-in analytics without workspace access', async () => {
    mockHasAccess = false;
    const { result } = renderHook(() => useEventTracker(), {
      wrapper: Wrapper,
    });
    act(() => {
      result.current(AnalyticsType.TRACK, {
        event: 'Example Event',
        properties: { foo: 'bar' },
      });
    });
    await waitFor(() => expect(mocks[0].result).toHaveBeenCalledTimes(1));
  });
  it('should make the call to track the event', async () => {
    const payload = {
      event: 'Example Event',
      properties: {
        foo: 'bar',
      },
    };

    const { result } = renderHook(() => useEventTracker(), {
      wrapper: Wrapper,
    });
    act(() => {
      result.current(AnalyticsType['TRACK'], payload);
    });
    await waitFor(() => {
      expect(mocks[0].result).toHaveBeenCalled();
    });
  });

  it('should make the call to track a pageview', async () => {
    const payload = {
      name: 'Example',
      properties: {
        sessionId: 'exampleId',
        pathname: '/example/path',
        userAgent: '',
        timeZone: '',
        locale: '',
        href: '',
        referrer: '',
      },
    };
    const { result } = renderHook(() => useEventTracker(), {
      wrapper: Wrapper,
    });
    act(() => {
      result.current(AnalyticsType['PAGEVIEW'], payload);
    });
    await waitFor(() => {
      expect(mocks[1].result).toHaveBeenCalled();
    });
  });
});

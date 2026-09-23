import { act, renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import { useMyahInboxCampaignAiGuidanceNavigation } from '@/myah/inbox/hooks/useMyahInboxCampaignAiGuidanceNavigation';
import { myahInboxPreserveSelectionOnUnmountState } from '@/myah/inbox/states/myahInboxSelectionState';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: jest.fn() };
});

const mockUseNavigate = jest.mocked(useNavigate);

// Seeds the real metadataStoreState atoms that pageLayoutsWithRelationsSelector
// derives from, exactly as production data would arrive, rather than mocking
// the selector's shape.
const seedActiveCampaignAgentTab = (
  store: ReturnType<typeof createStore>,
  { hasActiveAgentTab }: { hasActiveAgentTab: boolean },
) => {
  store.set(metadataStoreState.atomFamily('pageLayouts'), {
    current: hasActiveAgentTab
      ? [
          {
            id: 'layout-1',
            deletedAt: null,
            universalIdentifier:
              MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
          } as never,
        ]
      : [],
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('pageLayoutTabs'), {
    current: hasActiveAgentTab
      ? [
          {
            id: 'agent-tab-1',
            pageLayoutId: 'layout-1',
            isActive: true,
            universalIdentifier: MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER,
          } as never,
        ]
      : [],
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('pageLayoutWidgets'), {
    current: [],
    draft: [],
    status: 'up-to-date',
  });
};

const renderNavigation = (store: ReturnType<typeof createStore>) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <Provider store={store}>{children}</Provider>
    </MemoryRouter>
  );
  return renderHook(() => useMyahInboxCampaignAiGuidanceNavigation(), {
    wrapper,
  });
};

describe('useMyahInboxCampaignAiGuidanceNavigation', () => {
  let navigate: jest.Mock;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    navigate = jest.fn();
    mockUseNavigate.mockReturnValue(navigate);
    store = createStore();
    seedActiveCampaignAgentTab(store, { hasActiveAgentTab: true });
  });

  it('exposes the active Campaign Agent tab from current page layouts', () => {
    const { result } = renderNavigation(store);
    expect(result.current.runtimeAgentTabId).toBe('agent-tab-1');
  });

  it('does nothing without a Campaign id or an active Agent tab', async () => {
    seedActiveCampaignAgentTab(store, { hasActiveAgentTab: false });
    const { result } = renderNavigation(store);
    const flush = jest.fn().mockResolvedValue(true);
    await act(() =>
      result.current.openGuidance({
        campaignId: 'campaign-1',
        flush,
        isStillCurrent: () => true,
      }),
    );
    expect(flush).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('flushes the draft, marks Inbox preservation, and navigates on success', async () => {
    const { result } = renderNavigation(store);
    const flush = jest.fn().mockResolvedValue(true);
    await act(() =>
      result.current.openGuidance({
        campaignId: 'campaign-1',
        flush,
        isStillCurrent: () => true,
      }),
    );
    expect(flush).toHaveBeenCalledTimes(1);
    expect(store.get(myahInboxPreserveSelectionOnUnmountState.atom)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining('#agent-tab-1'),
      {
        state: { myahCampaignAgentGuidanceFocusCampaignId: 'campaign-1' },
      },
    );
  });

  it('aborts without navigating when the flush does not resolve cleanly', async () => {
    const { result } = renderNavigation(store);
    const flush = jest.fn().mockResolvedValue(false);
    await act(() =>
      result.current.openGuidance({
        campaignId: 'campaign-1',
        flush,
        isStillCurrent: () => true,
      }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('aborts without navigating when the target/selection changed during the flush', async () => {
    const { result } = renderNavigation(store);
    const flush = jest.fn().mockResolvedValue(true);
    await act(() =>
      result.current.openGuidance({
        campaignId: 'campaign-1',
        flush,
        isStillCurrent: () => false,
      }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('aborts without navigating when the active Agent tab changed during the flush', async () => {
    const { result } = renderNavigation(store);
    const flush = jest.fn().mockImplementation(async () => {
      seedActiveCampaignAgentTab(store, { hasActiveAgentTab: false });
      return true;
    });
    await act(() =>
      result.current.openGuidance({
        campaignId: 'campaign-1',
        flush,
        isStillCurrent: () => true,
      }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a second activation while one is already in flight', async () => {
    const { result } = renderNavigation(store);
    let resolveFlush!: (value: boolean) => void;
    const flush = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFlush = resolve;
        }),
    );
    let firstCall: Promise<void> | undefined;
    await act(() => {
      firstCall = result.current.openGuidance({
        campaignId: 'campaign-1',
        flush,
        isStillCurrent: () => true,
      });
      return result.current.openGuidance({
        campaignId: 'campaign-1',
        flush,
        isStillCurrent: () => true,
      });
    });
    expect(flush).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFlush(true);
      await firstCall;
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

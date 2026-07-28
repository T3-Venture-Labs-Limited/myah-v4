// @vitest-environment jsdom

import {
  act,
  createElement,
  type ComponentProps,
  type ReactElement,
} from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { CampaignOverviewReadiness } from 'src/front-components/components/campaign-overview-readiness';
import { CampaignOverviewReadinessContent } from 'src/front-components/components/campaign-overview-readiness-content';
import { CampaignOverviewReadinessView } from 'src/front-components/components/campaign-overview-readiness-view';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const {
  useSelectedRecordIdsMock,
  coreApiClientConstructor,
  coreApiClientQueryMock,
  coreApiClientMutationMock,
} = vi.hoisted(() => {
  const query = vi.fn();
  const mutation = vi.fn();

  return {
    useSelectedRecordIdsMock: vi.fn<() => string[]>(),
    coreApiClientConstructor: vi.fn(function CoreApiClient() {
      return { query, mutation };
    }),
    coreApiClientQueryMock: query,
    coreApiClientMutationMock: mutation,
  };
});

vi.mock('twenty-sdk/front-component', () => ({
  useSelectedRecordIds: useSelectedRecordIdsMock,
}));
vi.mock('twenty-client-sdk/core', () => ({
  CoreApiClient: coreApiClientConstructor,
}));

const renderWithTheme = (component: ReactElement): string =>
  renderToStaticMarkup(
    createElement(ThemeProvider, {
      colorScheme: 'light',
      children: component,
    }),
  );

const renderView = (
  props: ComponentProps<typeof CampaignOverviewReadinessView>,
): string =>
  renderWithTheme(createElement(CampaignOverviewReadinessView, props));

const readyDraftSnapshot = {
  id: 'campaign-1',
  name: 'Launch',
  objective: 'Grow awareness',
  status: 'DRAFT' as const,
  effectiveAudienceCount: 1,
};

describe('CampaignOverviewReadinessView', () => {
  it('renders a compact loading state without false zero data or actions', () => {
    const markup = renderView({ loadState: { kind: 'loading' } });

    expect(markup).toContain('Loading Campaign readiness');
    expect(markup).not.toContain('0 creators');
    expect(markup).not.toContain('Activate');
  });

  it('renders explicit no-context, missing, and read-restricted states', () => {
    const noContextMarkup = renderView({
      loadState: { kind: 'no-context' },
    });
    const missingMarkup = renderView({ loadState: { kind: 'missing' } });
    const restrictedMarkup = renderView({
      loadState: { kind: 'read-restricted' },
    });

    expect(noContextMarkup).toContain(
      'Open one Campaign to see its readiness.',
    );
    expect(missingMarkup).toContain('This Campaign is unavailable.');
    expect(restrictedMarkup).toContain('permission to view this Campaign.');
    expect(restrictedMarkup).not.toContain('creators');
  });

  it('renders a recoverable query error with Retry', () => {
    const markup = renderView({
      loadState: { kind: 'error', message: 'Campaign data could not load.' },
      onRetry: vi.fn(),
    });

    expect(markup).toContain('Campaign data could not load.');
    expect(markup).toContain('Retry');
  });

  it('renders a ready Draft with complete setup and Activate', () => {
    const markup = renderView({
      loadState: { kind: 'loaded', snapshot: readyDraftSnapshot },
      onChangeStatus: vi.fn(),
    });

    expect(markup).toContain('Draft');
    expect(markup).toContain('1 creator');
    expect(markup).toContain('Name complete');
    expect(markup).toContain('Objective complete');
    expect(markup).toContain('Audience complete');
    expect(markup).toContain('Activate');
  });

  it('renders blockers and disables Activate for an incomplete Draft', () => {
    const markup = renderView({
      loadState: {
        kind: 'loaded',
        snapshot: {
          ...readyDraftSnapshot,
          name: ' ',
          effectiveAudienceCount: 0,
        },
      },
      onChangeStatus: vi.fn(),
    });

    expect(markup).toContain('Name incomplete');
    expect(markup).toContain('Audience incomplete');
    expect(markup).toContain('Campaign name is required before activation.');
    expect(markup).toContain(
      'Add at least one creator before activating this campaign.',
    );
    expect(markup).toContain('Activate');
    expect(markup).toMatch(/<button[^>]*disabled/);
  });

  it('preserves facts but hides lifecycle controls when updates are restricted', () => {
    const markup = renderView({
      loadState: { kind: 'loaded', snapshot: readyDraftSnapshot },
      isUpdateRestricted: true,
      onChangeStatus: vi.fn(),
    });

    expect(markup).toContain('1 creator');
    expect(markup).toContain('Name complete');
    expect(markup).toContain('permission to change this Campaign');
    expect(markup).not.toContain('Activate');
  });

  it('renders only lifecycle actions allowed by the current status', () => {
    const activeMarkup = renderView({
      loadState: {
        kind: 'loaded',
        snapshot: { ...readyDraftSnapshot, status: 'ACTIVE' },
      },
      onChangeStatus: vi.fn(),
    });
    const pausedMarkup = renderView({
      loadState: {
        kind: 'loaded',
        snapshot: { ...readyDraftSnapshot, status: 'PAUSED' },
      },
      onChangeStatus: vi.fn(),
    });
    const completedMarkup = renderView({
      loadState: {
        kind: 'loaded',
        snapshot: { ...readyDraftSnapshot, status: 'COMPLETED' },
      },
      onChangeStatus: vi.fn(),
    });

    expect(activeMarkup).toContain('>Pause<');
    expect(activeMarkup).toContain('>Complete<');
    expect(activeMarkup).not.toContain('>Activate<');
    expect(activeMarkup).not.toContain('>Resume<');
    expect(pausedMarkup).toContain('>Resume<');
    expect(pausedMarkup).toContain('>Complete<');
    expect(pausedMarkup).not.toContain('>Pause<');
    expect(completedMarkup).not.toContain('<button');
  });

  it('keeps the observed status visible and disables actions while saving', () => {
    const markup = renderView({
      loadState: {
        kind: 'loaded',
        snapshot: { ...readyDraftSnapshot, status: 'ACTIVE' },
      },
      isSaving: true,
      onChangeStatus: vi.fn(),
    });

    expect(markup).toContain('Active');
    expect(markup).toContain('Pause');
    expect(markup).toContain('Complete');
    expect(markup.match(/<button[^>]*disabled/g)).toHaveLength(2);
  });

  it('shows safe mutation and conflict feedback beside the actual status', () => {
    const mutationErrorMarkup = renderView({
      loadState: { kind: 'loaded', snapshot: readyDraftSnapshot },
      feedback: {
        kind: 'error',
        message: 'Change Campaign status from Campaign Overview.',
      },
      onChangeStatus: vi.fn(),
    });
    const conflictMarkup = renderView({
      loadState: {
        kind: 'loaded',
        snapshot: { ...readyDraftSnapshot, status: 'COMPLETED' },
      },
      feedback: {
        kind: 'conflict',
        message: 'This Campaign changed. Review it and try again.',
      },
      onChangeStatus: vi.fn(),
    });

    expect(mutationErrorMarkup).toContain(
      'Change Campaign status from Campaign Overview.',
    );
    expect(mutationErrorMarkup).toContain('Draft');
    expect(conflictMarkup).toContain(
      'This Campaign changed. Review it and try again.',
    );
    expect(conflictMarkup).toContain('Completed');
  });
});

describe('CampaignOverviewReadinessContent', () => {
  beforeEach(() => {
    coreApiClientConstructor.mockClear();
    coreApiClientQueryMock.mockReset();
    coreApiClientMutationMock.mockReset();
  });

  it('refreshes setup fields and effective audience in both directions when the embedded component regains focus', async () => {
    coreApiClientQueryMock
      .mockResolvedValueOnce({
        campaign: {
          id: 'campaign-1',
          name: '',
          objective: '',
          status: 'DRAFT',
        },
        campaignCreators: { totalCount: 0 },
      })
      .mockResolvedValueOnce({
        campaign: {
          id: 'campaign-1',
          name: 'Launch',
          objective: 'Grow awareness',
          status: 'DRAFT',
        },
        campaignCreators: { totalCount: 1 },
      })
      .mockResolvedValueOnce({
        campaign: {
          id: 'campaign-1',
          name: '',
          objective: '',
          status: 'DRAFT',
        },
        campaignCreators: { totalCount: 0 },
      })
      .mockRejectedValueOnce(new Error('Temporary refresh failure'))
      .mockResolvedValueOnce({
        campaign: {
          id: 'campaign-1',
          name: 'Launch',
          objective: 'Grow awareness',
          status: 'DRAFT',
        },
        campaignCreators: { totalCount: 1 },
      });
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ThemeProvider, {
          colorScheme: 'light',
          children: createElement(CampaignOverviewReadinessContent, {
            campaignId: 'campaign-1',
          }),
        }),
      );
    });

    expect(coreApiClientQueryMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.textContent).toContain('0 creators');

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(coreApiClientQueryMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('button')?.disabled).toBe(false);
    expect(container.textContent).toContain('1 creator');

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(coreApiClientQueryMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.textContent).toContain('0 creators');

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(coreApiClientQueryMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain(
      'Campaign data could not refresh. Retry.',
    );

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(coreApiClientQueryMock).toHaveBeenCalledTimes(5);
    expect(container.textContent).not.toContain(
      'Campaign data could not refresh. Retry.',
    );
    expect(container.querySelector('button')?.disabled).toBe(false);
    expect(container.textContent).toContain('1 creator');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the restricted state when the active role cannot read Campaign data', async () => {
    coreApiClientQueryMock.mockRejectedValueOnce({
      errors: [{ extensions: { code: 'FORBIDDEN' } }],
    });
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ThemeProvider, {
          colorScheme: 'light',
          children: createElement(CampaignOverviewReadinessContent, {
            campaignId: 'campaign-1',
          }),
        }),
      );
    });

    expect(container.textContent).toContain(
      "You don't have permission to view this Campaign.",
    );
    expect(container.querySelector('button')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});

describe('CampaignOverviewReadiness', () => {
  beforeEach(() => {
    coreApiClientConstructor.mockClear();
  });

  it.each([
    { selectedRecordIds: [] as string[] },
    { selectedRecordIds: ['campaign-1', 'campaign-2'] },
  ])(
    'does not construct a Core API client for invalid record context $selectedRecordIds',
    ({ selectedRecordIds }) => {
      useSelectedRecordIdsMock.mockReturnValue(selectedRecordIds);

      const markup = renderWithTheme(createElement(CampaignOverviewReadiness));

      expect(markup).toContain('Open one Campaign to see its readiness.');
      expect(coreApiClientConstructor).not.toHaveBeenCalled();
    },
  );
});

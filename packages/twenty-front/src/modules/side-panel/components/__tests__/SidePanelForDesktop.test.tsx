import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import {
  createElement,
  forwardRef,
  type ComponentProps,
  type ElementType,
  type HTMLAttributes,
} from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SidePanelPages } from 'twenty-shared/types';
import { SidePanelForDesktop } from '@/side-panel/components/SidePanelForDesktop';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import {
  SIDE_PANEL_WIDTH_VAR,
  sidePanelWidthState,
} from '@/side-panel/states/sidePanelWidthState';
import { type ResizablePanelGap } from '@/ui/layout/resizable-panel/components/ResizablePanelGap';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import {
  NAVIGATION_DRAWER_WIDTH_VAR,
  navigationDrawerWidthState,
} from '@/ui/navigation/states/navigationDrawerWidthState';
import { NavigationDrawerWidthEffect } from '@/ui/navigation/components/NavigationDrawerWidthEffect';

type GapProps = ComponentProps<typeof ResizablePanelGap>;
const mockGap = jest.fn<void, [GapProps]>();
const mockClose = jest.fn();

// Keep actual resize/pointer hooks, persisted state, viewport/nav hooks and CSS
// width effect. Only compiled styling and unrelated panel content are replaced.
jest.mock('@linaria/react', () => {
  const styledComponent = (component: ElementType) => () =>
    forwardRef<
      HTMLElement,
      HTMLAttributes<HTMLElement> & {
        isOpen?: boolean;
        isResizing?: boolean;
        gapWidth?: number;
      }
    >(
      (
        {
          isOpen: _isOpen,
          isResizing: _isResizing,
          gapWidth: _gapWidth,
          ...props
        },
        ref,
      ) => createElement(component, { ...props, ref }),
    );
  return {
    styled: new Proxy(styledComponent, {
      get: (_, tag: string) => styledComponent(tag as ElementType),
    }),
  };
});
jest.mock('@/side-panel/components/SidePanelRouter', () => ({
  SidePanelRouter: () => <div>Native page content</div>,
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: mockClose }),
}));
jest.mock(
  '@/side-panel/hooks/useSidePanelCloseAnimationCompleteCleanup',
  () => ({
    useSidePanelCloseAnimationCompleteCleanup: () => ({
      sidePanelCloseAnimationCompleteCleanup: jest.fn(),
    }),
  }),
);
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));
jest.mock('@/ui/layout/resizable-panel/components/ResizablePanelGap', () => {
  const actual = jest.requireActual<{
    ResizablePanelGap: typeof ResizablePanelGap;
  }>('@/ui/layout/resizable-panel/components/ResizablePanelGap');
  return {
    ResizablePanelGap: (props: GapProps) => {
      mockGap(props);
      return (
        <div data-testid="resize-gap">
          <actual.ResizablePanelGap
            side={props.side}
            constraints={props.constraints}
            currentWidth={props.currentWidth}
            onWidthChange={props.onWidthChange}
            onCollapse={props.onCollapse}
            gapWidth={props.gapWidth}
            cssVariableName={props.cssVariableName}
            onResizeStart={props.onResizeStart}
          />
        </div>
      );
    },
  };
});

const resizeViewport = (width: number) =>
  act(() => {
    window.innerWidth = width;
    fireEvent(window, new Event('resize'));
  });
const gapProps = () => mockGap.mock.calls.at(-1)![0];
const handle = () => screen.getByTestId('resize-gap').firstElementChild!;
const panel = () => document.querySelector<HTMLElement>('[data-side-panel]')!;
const expandedCap =
  'clamp(320px, calc(100vw - var(--navigation-drawer-width) - 580px), 600px)';
const collapsedCap = 'clamp(320px, calc(100vw - 40px - 580px), 600px)';

const setup = ({
  viewport = 1200,
  nav = 220,
  expanded = true,
  saved = 600,
  hydrateSaved = false,
  page = SidePanelPages.MyahInboxContext,
} = {}) => {
  resizeViewport(viewport);
  const store = createStore();
  if (hydrateSaved) {
    localStorage.setItem(sidePanelWidthState.key, JSON.stringify(saved));
  } else {
    store.set(sidePanelWidthState.atom, saved);
  }
  store.set(navigationDrawerWidthState.atom, nav);
  store.set(isNavigationDrawerExpandedState.atom, expanded);
  store.set(isSidePanelOpenedState.atom, true);
  store.set(sidePanelPageState.atom, page);
  render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={['/myah/inbox']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <NavigationDrawerWidthEffect />
        <SidePanelForDesktop />
      </MemoryRouter>
    </Provider>,
  );
  return store;
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  document.documentElement.style.removeProperty(SIDE_PANEL_WIDTH_VAR);
});
afterEach(() => jest.restoreAllMocks());

it.each([
  [769, 220, 320],
  [1024, 220, 320],
  [1119, 220, 320],
  [1120, 220, 320],
  [1121, 220, 321],
  [1199, 220, 399],
  [1200, 220, 400],
  [1399, 220, 599],
  [1400, 220, 600],
  [1440, 220, 600],
  [1920, 220, 600],
  [1200, 350, 320],
  [1200, 180, 440],
])(
  'caps Inbox drag/render constraints at viewport%s nav%s to %s',
  (viewport, nav, maximum) => {
    const store = setup({ viewport, nav });
    expect(gapProps().constraints).toEqual({
      min: 320,
      max: maximum,
      default: 400,
    });
    expect(gapProps().currentWidth).toBe(maximum);
    expect(panel().style.maxWidth).toBe(expandedCap);
    expect(panel().style.minWidth).toBe('320px');
    expect(store.get(sidePanelWidthState.atom)).toBe(600);
  },
);

it('clamps native localStorage hydration of saved600 without replacing it', () => {
  const store = setup({ hydrateSaved: true });
  expect(store.get(sidePanelWidthState.atom)).toBe(600);
  expect(localStorage.getItem(sidePanelWidthState.key)).toBe('600');
  expect(gapProps().currentWidth).toBe(400);
  expect(gapProps().constraints.max).toBe(400);
  expect(panel().style.maxWidth).toBe(expandedCap);
});

it('clamps saved600 through nav/viewport changes without writing the preference and restores unrelated pages', () => {
  const store = setup();
  const writes = jest.spyOn(Storage.prototype, 'setItem');
  expect(gapProps().currentWidth).toBe(400);
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('600px');
  act(() => store.set(isNavigationDrawerExpandedState.atom, false));
  expect(gapProps().constraints.max).toBe(580);
  expect(gapProps().currentWidth).toBe(580);
  expect(panel().style.maxWidth).toBe(collapsedCap);
  resizeViewport(1440);
  act(() => store.set(isNavigationDrawerExpandedState.atom, true));
  expect(gapProps().currentWidth).toBe(600);
  resizeViewport(1200);
  expect(gapProps().currentWidth).toBe(400);
  act(() => store.set(navigationDrawerWidthState.atom, 350));
  expect(gapProps().currentWidth).toBe(320);
  expect(
    document.documentElement.style.getPropertyValue(
      NAVIGATION_DRAWER_WIDTH_VAR,
    ),
  ).toBe('350px');
  act(() => store.set(navigationDrawerWidthState.atom, 220));
  expect(gapProps().currentWidth).toBe(400);
  act(() => store.set(sidePanelPageState.atom, SidePanelPages.AskAI));
  expect(gapProps().constraints.max).toBe(600);
  expect(gapProps().currentWidth).toBe(600);
  expect(panel().style.maxWidth).toBe('');
  expect(panel().style.minWidth).toBe('');
  expect(store.get(sidePanelWidthState.atom)).toBe(600);
  expect(localStorage.getItem(sidePanelWidthState.key)).toBe('600');
  expect(
    writes.mock.calls.filter(([key]) => key === sidePanelWidthState.key),
  ).toHaveLength(0);
});

it.each([
  SidePanelPages.AskAI,
  SidePanelPages.ViewRecord,
  SidePanelPages.CommandMenuDisplay,
])(
  'leaves %s sizing and native maximum unchanged at narrow desktop width',
  (page) => {
    setup({ viewport: 769, page });
    expect(gapProps().constraints).toEqual({
      min: 320,
      max: 600,
      default: 400,
    });
    expect(gapProps().currentWidth).toBe(600);
    expect(panel().style.maxWidth).toBe('');
  },
);

it('starts native drag at the displayed cap, not saved600, and preserves deliberate persistence and collapse', () => {
  const store = setup();
  fireEvent.mouseDown(handle(), { clientX: 800 });
  fireEvent.mouseMove(document, { clientX: 840 });
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('360px');
  fireEvent.mouseUp(document, { clientX: 840 });
  expect(store.get(sidePanelWidthState.atom)).toBe(360);
  expect(localStorage.getItem(sidePanelWidthState.key)).toBe('360');
  fireEvent.mouseDown(handle(), { clientX: 800 });
  fireEvent.mouseMove(document, { clientX: 0 });
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('400px');
  fireEvent.mouseUp(document, { clientX: 0 });
  expect(store.get(sidePanelWidthState.atom)).toBe(400);
  fireEvent.mouseDown(handle(), { clientX: 800 });
  fireEvent.mouseUp(document, { clientX: 800 });
  expect(mockClose).toHaveBeenCalledTimes(1);
  act(() => store.set(isSidePanelOpenedState.atom, false));
  expect(panel().style.minWidth).toBe('0');
});

it('reclamps a drag after viewport shrink and still honors the native minimum', () => {
  const store = setup({ viewport: 1440 });
  fireEvent.mouseDown(handle(), { clientX: 800 });
  fireEvent.mouseMove(document, { clientX: 780 });
  resizeViewport(1200);
  expect(gapProps().constraints.max).toBe(400);
  expect(panel().style.maxWidth).toBe(expandedCap);
  fireEvent.mouseMove(document, { clientX: 760 });
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('400px');
  fireEvent.mouseUp(document, { clientX: 760 });
  expect(store.get(sidePanelWidthState.atom)).toBe(400);
  fireEvent.mouseDown(handle(), { clientX: 800 });
  fireEvent.mouseMove(document, { clientX: 1200 });
  fireEvent.mouseUp(document, { clientX: 1200 });
  expect(store.get(sidePanelWidthState.atom)).toBe(320);
});

it('synchronizes drag completion after a shrink even when the final preference is unchanged', () => {
  const store = setup({ viewport: 1440, saved: 400 });
  fireEvent.mouseDown(handle(), { clientX: 800 });
  fireEvent.mouseMove(document, { clientX: 600 });
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('600px');
  expect(store.get(sidePanelWidthState.atom)).toBe(400);

  resizeViewport(1200);
  expect(gapProps().constraints.max).toBe(400);
  // No mousemove after shrink: completion must publish the newly clamped
  // final width even though setting the existing atom value cannot run its effect.
  fireEvent.mouseUp(document, { clientX: 600 });
  expect(store.get(sidePanelWidthState.atom)).toBe(400);
  expect(localStorage.getItem(sidePanelWidthState.key)).toBe('400');
  expect(gapProps().currentWidth).toBe(400);
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('400px');

  resizeViewport(1440);
  expect(store.get(sidePanelWidthState.atom)).toBe(400);
  expect(gapProps().currentWidth).toBe(400);
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('400px');
  act(() => store.set(sidePanelPageState.atom, SidePanelPages.AskAI));
  expect(gapProps().constraints.max).toBe(600);
  expect(panel().style.maxWidth).toBe('');
  expect(store.get(sidePanelWidthState.atom)).toBe(400);
  expect(gapProps().currentWidth).toBe(400);
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('400px');

  act(() =>
    store.set(sidePanelPageState.atom, SidePanelPages.MyahInboxContext),
  );
  fireEvent.mouseDown(handle(), { clientX: 800 });
  fireEvent.mouseMove(document, { clientX: 780 });
  expect(
    document.documentElement.style.getPropertyValue(SIDE_PANEL_WIDTH_VAR),
  ).toBe('420px');
  fireEvent.mouseUp(document, { clientX: 780 });
  expect(store.get(sidePanelWidthState.atom)).toBe(420);
  expect(gapProps().currentWidth).toBe(420);
  expect(mockClose).not.toHaveBeenCalled();
});

it('bounds a below-minimum saved width for presentation without persisting a replacement', () => {
  const store = setup({ saved: 200 });
  expect(gapProps().currentWidth).toBe(320);
  expect(panel().style.minWidth).toBe('320px');
  expect(store.get(sidePanelWidthState.atom)).toBe(200);
});

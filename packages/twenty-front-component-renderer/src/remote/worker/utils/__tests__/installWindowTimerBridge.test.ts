import { installWindowTimerBridge } from '../installWindowTimerBridge';

describe('installWindowTimerBridge', () => {
  it('mirrors bound worker timers onto a polyfilled window', () => {
    const window = {} as Record<string, (...args: unknown[]) => unknown>;
    const scope = {
      window,
      setTimeout: jest.fn(function (this: unknown) {
        return this;
      }),
      clearTimeout: jest.fn(),
      setInterval: jest.fn(function (this: unknown) {
        return this;
      }),
      clearInterval: jest.fn(),
    };

    installWindowTimerBridge(scope);

    expect(window.setInterval?.()).toBe(scope);
    expect(window.setTimeout?.()).toBe(scope);
    window.clearInterval?.(7);
    window.clearTimeout?.(8);
    expect(scope.clearInterval).toHaveBeenCalledWith(7);
    expect(scope.clearTimeout).toHaveBeenCalledWith(8);
  });

  it('does not replace timers when window is the global scope', () => {
    const setInterval = jest.fn();
    const scope: Record<string, unknown> = { setInterval };

    scope.window = scope;
    installWindowTimerBridge(scope);

    expect(scope.setInterval).toBe(setInterval);
  });
});

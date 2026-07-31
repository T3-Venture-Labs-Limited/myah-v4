type Timer = (...args: unknown[]) => unknown;

type TimerBridgeScope = Record<string, unknown> & {
  window?: Record<string, unknown>;
  setTimeout?: Timer;
  clearTimeout?: Timer;
  setInterval?: Timer;
  clearInterval?: Timer;
};

export const installWindowTimerBridge = (
  scope: TimerBridgeScope = globalThis as unknown as TimerBridgeScope,
): void => {
  if (scope.window === undefined || scope.window === scope) {
    return;
  }

  const timerByName = {
    setTimeout: scope.setTimeout,
    clearTimeout: scope.clearTimeout,
    setInterval: scope.setInterval,
    clearInterval: scope.clearInterval,
  } satisfies Record<string, Timer | undefined>;

  for (const [name, timer] of Object.entries(timerByName)) {
    if (typeof timer === 'function') {
      scope.window[name] = timer.bind(scope);
    }
  }
};

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

let currentMinute = new Date();
let timeoutId: number | undefined;

const scheduleNextMinute = () => {
  const millisecondsUntilNextMinute = 60_000 - (Date.now() % 60_000) || 60_000;

  timeoutId = window.setTimeout(() => {
    currentMinute = new Date();
    listeners.forEach((listener) => listener());

    if (listeners.size > 0) {
      scheduleNextMinute();
    }
  }, millisecondsUntilNextMinute);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  if (timeoutId === undefined) {
    currentMinute = new Date();
    scheduleNextMinute();
    listener();
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };
};

export const useCurrentMinute = () =>
  useSyncExternalStore(
    subscribe,
    () => currentMinute,
    () => currentMinute,
  );

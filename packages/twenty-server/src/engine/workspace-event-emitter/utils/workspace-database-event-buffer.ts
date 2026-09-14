import { AsyncLocalStorage } from 'node:async_hooks';

type BufferedWorkspaceDatabaseEvent = () => void;

type WorkspaceDatabaseEventBufferContext = {
  active: boolean;
  events: BufferedWorkspaceDatabaseEvent[];
};

const workspaceDatabaseEventBufferStorage =
  new AsyncLocalStorage<WorkspaceDatabaseEventBufferContext>();

export const enqueueWorkspaceDatabaseEvent = (
  event: BufferedWorkspaceDatabaseEvent,
): boolean => {
  const context = workspaceDatabaseEventBufferStorage.getStore();

  if (context?.active !== true) {
    return false;
  }

  context.events.push(event);

  return true;
};

type FlushWorkspaceDatabaseEvents = (
  reportFailure: (error: unknown) => void,
) => void;

export const runWithWorkspaceDatabaseEventBuffer = async <Result>(
  callback: (flush: FlushWorkspaceDatabaseEvents) => Promise<Result>,
): Promise<{
  bufferedEvents: BufferedWorkspaceDatabaseEvent[];
  result: Result;
}> => {
  const context: WorkspaceDatabaseEventBufferContext = {
    active: true,
    events: [],
  };

  const flush: FlushWorkspaceDatabaseEvents = (reportFailure) => {
    context.active = false;
    flushBufferedWorkspaceDatabaseEvents(
      context.events.splice(0, context.events.length),
      reportFailure,
    );
  };

  try {
    const result = await workspaceDatabaseEventBufferStorage.run(context, () =>
      callback(flush),
    );

    return { bufferedEvents: context.events, result };
  } finally {
    context.active = false;
  }
};

export const flushBufferedWorkspaceDatabaseEvents = (
  events: BufferedWorkspaceDatabaseEvent[],
  reportFailure: (error: unknown) => void,
): void => {
  for (const event of events) {
    try {
      event();
    } catch (error) {
      reportFailure(error);
    }
  }
};

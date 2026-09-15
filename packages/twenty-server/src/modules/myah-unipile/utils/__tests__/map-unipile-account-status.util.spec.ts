type UnipileInstagramSourceStatus =
  | 'OK'
  | 'CONNECTING'
  | 'CREDENTIALS'
  | 'PERMISSIONS'
  | 'ERROR'
  | 'STOPPED';

type UnipileInstagramAccountBindingStatus =
  | 'ACTIVE'
  | 'CONNECTING'
  | 'NEEDS_RECONNECT'
  | 'ERROR';

type MapUnipileAccountStatusModule = {
  mapUnipileAccountStatus: (
    sourceStatus: UnipileInstagramSourceStatus,
  ) => UnipileInstagramAccountBindingStatus;
};

const loadMapUnipileAccountStatusModule = ():
  | MapUnipileAccountStatusModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/utils/map-unipile-account-status.util') as MapUnipileAccountStatusModule;
  } catch {
    return undefined;
  }
};

const mapUnipileAccountStatus = (
  sourceStatus: UnipileInstagramSourceStatus,
): UnipileInstagramAccountBindingStatus | undefined => {
  const mapperModule = loadMapUnipileAccountStatusModule();

  expect(mapperModule).toBeDefined();

  return mapperModule?.mapUnipileAccountStatus(sourceStatus);
};

describe('mapUnipileAccountStatus', () => {
  it.each([
    ['OK', 'ACTIVE'],
    ['CONNECTING', 'CONNECTING'],
    ['CREDENTIALS', 'NEEDS_RECONNECT'],
    ['PERMISSIONS', 'NEEDS_RECONNECT'],
    ['ERROR', 'ERROR'],
    ['STOPPED', 'ERROR'],
  ] as const)('maps %s to %s', (sourceStatus, expectedStatus) => {
    expect(mapUnipileAccountStatus(sourceStatus)).toBe(expectedStatus);
  });
});

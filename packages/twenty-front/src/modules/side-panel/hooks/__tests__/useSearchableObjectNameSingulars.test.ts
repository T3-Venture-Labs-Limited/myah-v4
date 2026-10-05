import { renderHook } from '@testing-library/react';

import { useSearchableObjectNameSingulars } from '@/side-panel/hooks/useSearchableObjectNameSingulars';

jest.mock('@/object-metadata/hooks/useReadableObjectMetadataItems', () => ({
  useReadableObjectMetadataItems: () => ({
    readableObjectMetadataItems: [
      { nameSingular: 'creator', isSearchable: true },
      { nameSingular: 'workflow', isSearchable: true },
      { nameSingular: 'workflowRun', isSearchable: true },
      { nameSingular: 'workflowVersion', isSearchable: true },
      { nameSingular: 'workflowAutomatedTrigger', isSearchable: true },
    ],
  }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => false,
}));

describe('useSearchableObjectNameSingulars', () => {
  it.each([
    null,
    'workflow',
    'workflowRun',
    'workflowVersion',
    'workflowAutomatedTrigger',
  ])(
    'leaves Automations out of search, including stale selected filter %s (MYAH-460)',
    (selectedObjectNameSingular) => {
      const { result } = renderHook(() =>
        useSearchableObjectNameSingulars({ selectedObjectNameSingular }),
      );

      expect(result.current).toEqual(['creator']);
    },
  );
});

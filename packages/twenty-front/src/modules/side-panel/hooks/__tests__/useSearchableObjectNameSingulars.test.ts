import { renderHook } from '@testing-library/react';

import { useSearchableObjectNameSingulars } from '@/side-panel/hooks/useSearchableObjectNameSingulars';

jest.mock('@/object-metadata/hooks/useReadableObjectMetadataItems', () => ({
  useReadableObjectMetadataItems: () => ({
    readableObjectMetadataItems: [
      { nameSingular: 'creator', isSearchable: true },
      { nameSingular: 'workflow', isSearchable: true },
      { nameSingular: 'workflowRun', isSearchable: true },
      { nameSingular: 'workflowVersion', isSearchable: true },
    ],
  }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => false,
}));

describe('useSearchableObjectNameSingulars', () => {
  it('leaves Automations out of search (MYAH-460)', () => {
    const { result } = renderHook(() => useSearchableObjectNameSingulars());

    expect(result.current).toEqual(['creator']);
  });
});

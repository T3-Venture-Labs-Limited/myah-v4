import { act, renderHook } from '@testing-library/react';
import { saveAs } from 'file-saver';

import { useDownloadFakeRecords } from '@/spreadsheet-import/steps/components/UploadStep/hooks/useDownloadFakeRecords';

jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('@/spreadsheet-import/hooks/useSpreadsheetImportInternal', () => ({
  useSpreadsheetImportInternal: () => ({
    availableFieldMetadataItems: [
      { name: 'name', label: 'Creator name', type: 'TEXT' },
    ],
    sampleFileName: 'creators-sample.csv',
  }),
}));

it('downloads the imported object sample without requiring a record-table context (MYAH-457)', () => {
  const { result } = renderHook(() => useDownloadFakeRecords());
  act(() => result.current.downloadSample());
  expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'creators-sample.csv');
});

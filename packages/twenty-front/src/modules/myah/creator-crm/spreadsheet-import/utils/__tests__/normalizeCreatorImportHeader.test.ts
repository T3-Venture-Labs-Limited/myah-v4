import { normalizeCreatorImportHeader } from '@/myah/creator-crm/spreadsheet-import/utils/normalizeCreatorImportHeader';

describe('normalizeCreatorImportHeader', () => {
  it.each([
    [' first_name ', 'first_name'],
    ['FIRST NAME', 'first_name'],
    ['Contact-Phone Number', 'contact_phone_number'],
    ['YouTube   Link', 'youtube_link'],
    ['Contact - __ Phone Number', 'contact_phone_number'],
  ])('normalizes %s to %s', (header, expected) => {
    expect(normalizeCreatorImportHeader(header)).toBe(expected);
  });
});

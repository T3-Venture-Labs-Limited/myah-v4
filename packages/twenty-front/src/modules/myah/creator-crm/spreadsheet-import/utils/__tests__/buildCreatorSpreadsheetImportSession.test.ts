import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildCreatorSpreadsheetImportSession } from '@/myah/creator-crm/spreadsheet-import/utils/buildCreatorSpreadsheetImportSession';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { type ImportedStructuredRow } from '@/spreadsheet-import/types/SpreadsheetImportImportedStructuredRow';
import { mapWorkbook } from '@/spreadsheet-import/utils/mapWorkbook';
import { normalizeTableData } from '@/spreadsheet-import/utils/normalizeTableData';
import { setColumn } from '@/spreadsheet-import/utils/setColumn';
import { read } from 'xlsx-ugnis';

const metadataItems = [
  ['email-id', 'email'],
  ['name-id', 'name'],
  ['location-id', 'location'],
  ['gender-id', 'gender'],
  ['phone-id', 'phone'],
  ['instagram-id', 'instagramLink'],
  ['tiktok-id', 'tiktokLink'],
  ['youtube-id', 'youtubeLink'],
  ['twitter-id', 'twitterLink'],
  ['source-id', 'importSource'],
  ['imported-at-id', 'lastImportedAt'],
].map(([id, name]) => ({ id, name }));

const field = (
  key: string,
  fieldMetadataItemId: string,
  compositeSubFieldKey?: string,
): SpreadsheetImportField =>
  ({
    key,
    label: key,
    fieldMetadataItemId,
    fieldType: { type: 'input' },
    isNestedField: Boolean(compositeSubFieldKey),
    isCompositeSubField: Boolean(compositeSubFieldKey),
    compositeSubFieldKey,
  }) as SpreadsheetImportField;

const spreadsheetImportFields = [
  field('email', 'email-id'),
  field('name', 'name-id'),
  field('location', 'location-id'),
  {
    ...field('gender', 'gender-id'),
    fieldType: {
      type: 'select' as const,
      options: [
        { value: 'FEMALE', label: 'Female' },
        { value: 'MALE', label: 'Male' },
        { value: 'NON_BINARY', label: 'Non-binary' },
        { value: 'OTHER', label: 'Other' },
        { value: 'UNKNOWN', label: 'Unknown' },
      ],
    },
  },
  field('phone', 'phone-id'),
  field('instagram', 'instagram-id', 'primaryLinkUrl'),
  field('tiktok', 'tiktok-id', 'primaryLinkUrl'),
  field('youtube', 'youtube-id', 'primaryLinkUrl'),
  field('twitter', 'twitter-id', 'primaryLinkUrl'),
  field('importSource', 'source-id'),
  field('lastImportedAt', 'imported-at-id'),
];

const influencerClubHeaders = [
  'email',
  'first_name',
  'location',
  'gender',
  'contact_phone_number',
  'instagram_link',
  'tiktok_link',
  'youtube_link',
  'twitter_link',
];

const destinationKeyByHeader: Record<string, string> = {
  email: 'email',
  first_name: 'name',
  location: 'location',
  gender: 'gender',
  contact_phone_number: 'phone',
  phone_number: 'phone',
  phone: 'phone',
  instagram_link: 'instagram',
  instagram_url: 'instagram',
  tiktok_link: 'tiktok',
  tiktok_url: 'tiktok',
  youtube_link: 'youtube',
  youtube_url: 'youtube',
  twitter_link: 'twitter',
  twitter_url: 'twitter',
  x_link: 'twitter',
  x_url: 'twitter',
};

const columnsFor = (headers: string[]): SpreadsheetColumns =>
  headers.map((header, index) => ({
    index,
    header,
    type: SpreadsheetColumnType.matched,
    value: destinationKeyByHeader[header.replaceAll(' ', '_')] ?? header,
  }));

const createSession = (
  queryExistingCreators: jest.Mock = jest.fn().mockResolvedValue([]),
) =>
  buildCreatorSpreadsheetImportSession({
    availableFieldMetadataItems: metadataItems,
    spreadsheetImportFields,
    queryExistingCreators,
  });

const runTableHook = (
  session: ReturnType<typeof createSession>,
  rows: ImportedStructuredRow[],
) => {
  const errors: Array<{ rowIndex: number; fieldKey: string; message: string }> =
    [];
  const result = session.tableHook(rows, (rowIndex, fieldKey, error) => {
    errors.push({ rowIndex, fieldKey, message: error.message });
  });
  return { rows: result, errors };
};

describe('buildCreatorSpreadsheetImportSession', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-24T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds all approved aliases and detects only the exact nine-column profile', () => {
    const session = createSession();

    for (const alias of [
      'email',
      'email_address',
      'first_name',
      'phone_number',
      'phone',
      'instagram_url',
      'tiktok_url',
      'youtube_url',
      'twitter_url',
      'x_link',
      'x_url',
    ]) {
      expect(session.headerAliases[alias]).toBeDefined();
    }

    expect(
      session.headerProfile.isDetected([
        'YOUTUBE-LINK',
        'Gender',
        'First Name',
        'Instagram Link',
        'Email',
        'Location',
        'TikTok Link',
        'Contact---Phone Number',
        'X URL',
      ]),
    ).toBe(true);
    expect(
      session.headerProfile.isDetected([
        'email_address',
        'first_name',
        'location',
        'gender',
        'phone',
        'instagram_url',
        'tiktok_url',
        'youtube_url',
        'twitter_url',
      ]),
    ).toBe(false);
    expect(
      session.headerProfile.isDetected(influencerClubHeaders.slice(0, 8)),
    ).toBe(false);
    expect(
      session.headerProfile.isDetected([
        ...influencerClubHeaders,
        'unexpected',
      ]),
    ).toBe(false);
  });

  it('normalizes only recognized mappings and adds exact-profile provenance', async () => {
    const session = createSession();
    const input = {
      email: ' ADA@EXAMPLE.COM ',
      name: '  Åda Лавлейс  ',
      location: ' London ',
      gender: 'male',
      phone: ' +44 (0) 20 1234 5678 ',
      instagram: 'https://www.instagram.com/Ada/?ref=csv',
      tiktok: 'https://www.tiktok.com/@Ada/',
      youtube: 'https://youtube.com/channel/UCAbC123/?view=1',
      twitter: 'https://twitter.com/Ada/#bio',
    };

    const rows = await session.matchColumnsStepHook(
      [input],
      [[]],
      columnsFor(influencerClubHeaders),
      'influencer-club',
    );

    expect(rows).toEqual([
      {
        email: 'ada@example.com',
        name: 'Åda Лавлейс',
        location: 'London',
        gender: 'MALE',
        phone: '+44 (0) 20 1234 5678',
        instagram: 'https://instagram.com/Ada',
        tiktok: 'https://tiktok.com/@Ada',
        youtube: 'https://youtube.com/channel/UCAbC123',
        twitter: 'https://x.com/Ada',
        importSource: 'Influencer Club CSV',
        __index: 'creator-import-source-0',
      },
    ]);
  });

  it('does not attribute partial, cleared, remapped, or unknown source mappings', async () => {
    const session = createSession();
    const partialRows = await session.matchColumnsStepHook(
      [{ email: ' ADA@EXAMPLE.COM ' }],
      [[]],
      columnsFor(['email']),
      undefined,
    );

    expect(partialRows[0]).toEqual({
      email: 'ada@example.com',
      __index: 'creator-import-source-0',
    });

    const remappedRows = await session.matchColumnsStepHook(
      [{ name: '  unchanged  ' }],
      [[]],
      [
        {
          index: 0,
          header: 'email',
          type: SpreadsheetColumnType.matched,
          value: 'name',
        },
      ],
      'influencer-club',
    );
    expect(remappedRows[0]).toEqual({
      name: '  unchanged  ',
      importSource: 'Influencer Club CSV',
      __index: 'creator-import-source-0',
    });

    const unknownRows = await session.matchColumnsStepHook(
      [{ email: ' KEEP@EXAMPLE.COM ' }],
      [[]],
      [
        {
          index: 0,
          header: 'custom_contact',
          type: SpreadsheetColumnType.matched,
          value: 'email',
        },
      ],
      undefined,
    );
    expect(unknownRows[0]).toEqual({
      email: ' KEEP@EXAMPLE.COM ',
      __index: 'creator-import-source-0',
    });
  });

  it('validates only recognized profile values', async () => {
    const session = createSession();
    const rows = await session.matchColumnsStepHook(
      [
        {
          email: 'not-an-email',
          gender: 'unsupported',
          phone: '123',
          instagram: 'http://instagram.com/ada',
          youtube: 'https://youtube.com/watch?v=video',
        },
      ],
      [[]],
      columnsFor([
        'email',
        'gender',
        'phone',
        'instagram_link',
        'youtube_link',
      ]),
      undefined,
    );

    const { errors } = runTableHook(session, rows);
    expect(errors.map(({ fieldKey }) => fieldKey).sort()).toEqual([
      'email',
      'gender',
      'instagram',
      'phone',
      'youtube',
    ]);
  });

  it('preserves unmatched Gender source values for explicit validation', async () => {
    const session = createSession();
    const genderField = spreadsheetImportFields.find(
      (spreadsheetImportField) => spreadsheetImportField.key === 'gender',
    )!;
    const rawRows = [['agender']];
    const genderColumn = setColumn(
      {
        index: 0,
        header: 'gender',
        type: SpreadsheetColumnType.empty,
      },
      genderField,
      rawRows,
      session.headerAliases.gender.selectOptionAliases,
    );
    const normalizedRows = normalizeTableData(
      [genderColumn],
      rawRows,
      spreadsheetImportFields,
    );

    expect(normalizedRows).toEqual([{ gender: undefined }]);

    const preservedRows = await session.matchColumnsStepHook(
      normalizedRows,
      rawRows,
      [genderColumn],
      undefined,
    );
    const { rows, errors } = runTableHook(session, preservedRows);

    expect(rows[0].gender).toBe('agender');
    expect(errors).toEqual([
      expect.objectContaining({
        fieldKey: 'gender',
        message: 'Select a valid gender',
      }),
    ]);
  });

  it.each(['12+34+567', '123.456.7890'])(
    'rejects unsupported phone syntax %s',
    async (phone) => {
      const session = createSession();
      const rows = await session.matchColumnsStepHook(
        [{ phone }],
        [[phone]],
        columnsFor(['phone']),
        undefined,
      );

      expect(runTableHook(session, rows).errors).toEqual([
        expect.objectContaining({
          fieldKey: 'phone',
          message: 'Enter a valid phone number',
        }),
      ]);
    },
  );

  it('classifies one canonical existing match without using email or Name', async () => {
    const session = createSession(
      jest.fn().mockResolvedValue([
        {
          id: 'creator-a',
          instagramLink: {
            primaryLinkUrl:
              'https://www.instagram.com/Ada/?utm_source=stored#bio',
          },
        },
      ]),
    );
    const rows = await session.matchColumnsStepHook(
      [
        {
          email: 'same@example.com',
          name: 'Same Name',
          instagram: 'https://instagram.com/Ada/',
        },
        { email: 'same@example.com', name: 'Same Name' },
      ],
      [[], []],
      columnsFor(['email', 'first_name', 'instagram_link']),
      undefined,
    );

    const { rows: validatedRows, errors } = runTableHook(session, rows);
    expect(errors).toEqual([
      expect.objectContaining({
        rowIndex: 0,
        fieldKey: 'instagram',
        message: 'Creator already exists for this social profile',
      }),
    ]);
    expect(session.getSummary(validatedRows)).toEqual({
      existing: 1,
      conflicts: 0,
    });
  });

  it('marks same-file, different-Creator, and ambiguous identities as conflicts', async () => {
    const session = createSession(
      jest.fn().mockResolvedValue([
        {
          id: 'creator-a',
          instagramLink: { primaryLinkUrl: 'https://instagram.com/ada' },
        },
        {
          id: 'creator-b',
          tiktokLink: { primaryLinkUrl: 'https://tiktok.com/@ada' },
          twitterLink: { primaryLinkUrl: 'https://x.com/ambiguous' },
        },
        {
          id: 'creator-c',
          twitterLink: { primaryLinkUrl: 'https://twitter.com/ambiguous/' },
        },
      ]),
    );
    const rows = await session.matchColumnsStepHook(
      [
        {
          instagram: 'https://instagram.com/ada',
          tiktok: 'https://tiktok.com/@ada',
        },
        { youtube: 'https://youtube.com/@duplicate' },
        { youtube: 'https://www.youtube.com/@duplicate/' },
        { twitter: 'https://x.com/ambiguous' },
      ],
      [[], [], [], []],
      columnsFor([
        'instagram_link',
        'tiktok_link',
        'youtube_link',
        'twitter_link',
      ]),
      undefined,
    );

    const { rows: validatedRows, errors } = runTableHook(session, rows);
    expect(session.getSubmissionBlockReason(validatedRows)).toBe(
      'Remove conflicting Creator rows before importing',
    );
    expect(session.getSummary(validatedRows)).toEqual({
      existing: 0,
      conflicts: 4,
    });
    expect(
      errors.filter(
        ({ message }) =>
          message === 'Social profile appears in more than one imported row',
      ),
    ).toHaveLength(2);
  });

  it('builds social identities only from recognized mappings', async () => {
    const session = createSession(
      jest.fn().mockResolvedValue([
        {
          id: 'creator-a',
          instagramLink: { primaryLinkUrl: 'https://instagram.com/ada' },
        },
      ]),
    );
    const recognizedRows = await session.matchColumnsStepHook(
      [{ instagram: 'https://instagram.com/ada' }],
      [[]],
      columnsFor(['instagram_link']),
      undefined,
    );
    runTableHook(session, recognizedRows);

    const manuallyMappedRows = await session.matchColumnsStepHook(
      [{ instagram: 'https://instagram.com/ada' }],
      [[]],
      [
        {
          index: 0,
          header: 'manual_social_profile',
          type: SpreadsheetColumnType.matched,
          value: 'instagram',
        },
      ],
      undefined,
    );
    const { errors, rows } = runTableHook(session, manuallyMappedRows);

    expect(errors).toEqual([]);
    expect(session.getSummary(rows)).toEqual({ existing: 0, conflicts: 0 });
  });

  it('does not look up existing Creators without a recognized social mapping', async () => {
    const queryExistingCreators = jest
      .fn()
      .mockRejectedValue(
        new Error('generic imports must not query social fields'),
      );
    const session = createSession(queryExistingCreators);
    const rows = await session.matchColumnsStepHook(
      [{ email: 'creator@example.com' }],
      [['creator@example.com']],
      columnsFor(['email']),
      undefined,
    );

    await session.beforeSubmitHook(rows);

    expect(queryExistingCreators).not.toHaveBeenCalled();
  });

  it('requires a Creator Name when the first_name destination is recognized', async () => {
    const session = createSession();
    const rows = await session.matchColumnsStepHook(
      [{}],
      [['']],
      columnsFor(['first_name']),
      undefined,
    );
    const { errors } = runTableHook(session, rows);

    expect(errors).toEqual([
      expect.objectContaining({
        fieldKey: 'name',
        message: 'Enter a Creator Name',
      }),
    ]);
  });

  it('keeps an edited conflicting row blocked until its row ID is removed', async () => {
    const session = createSession();
    const rows = await session.matchColumnsStepHook(
      [
        { instagram: 'https://instagram.com/duplicate' },
        { instagram: 'https://instagram.com/duplicate/' },
      ],
      [[], []],
      columnsFor(['instagram_link']),
      undefined,
    );
    const conflicted = runTableHook(session, rows);
    const edited = runTableHook(session, [
      {
        ...conflicted.rows[0],
        instagram: 'https://instagram.com/edited',
      },
    ]);

    expect(session.getSubmissionBlockReason(edited.rows)).toBe(
      'Remove conflicting Creator rows before importing',
    );
    expect(session.getSummary(edited.rows)).toEqual({
      existing: 0,
      conflicts: 2,
    });

    const removed = runTableHook(session, []);
    expect(session.getSubmissionBlockReason(removed.rows)).toBeUndefined();
  });

  it('clears prior classification and exclusion state when matching columns restarts', async () => {
    const session = createSession();
    const rows = await session.matchColumnsStepHook(
      [
        { instagram: 'https://instagram.com/duplicate' },
        { instagram: 'https://instagram.com/duplicate/' },
      ],
      [[], []],
      columnsFor(['instagram_link']),
      undefined,
    );
    const conflicted = runTableHook(session, rows);
    runTableHook(session, [conflicted.rows[0]]);

    const restartedRows = await session.matchColumnsStepHook(
      [{ email: 'creator@example.com' }],
      [['creator@example.com']],
      columnsFor(['email']),
      undefined,
    );

    expect(session.getSubmissionBlockReason(restartedRows)).toBeUndefined();
    expect(session.getSummary(restartedRows)).toEqual({
      existing: 0,
      conflicts: 0,
    });
  });

  it('stamps one submission timestamp during final preflight', async () => {
    const session = createSession();
    const rows = await session.matchColumnsStepHook(
      [{ email: 'creator@example.com' }],
      [['creator@example.com']],
      columnsFor(influencerClubHeaders),
      'influencer-club',
    );

    expect(rows[0].lastImportedAt).toBeUndefined();

    jest.setSystemTime(new Date('2026-07-24T13:45:00.000Z'));
    await session.beforeSubmitHook(rows);
    const refreshedRows = runTableHook(session, rows).rows;

    expect(refreshedRows[0]).toEqual(
      expect.objectContaining({
        importSource: 'Influencer Club CSV',
        lastImportedAt: '2026-07-24T13:45:00.000Z',
      }),
    );
  });

  it('refreshes the existing index immediately before submission', async () => {
    const queryExistingCreators = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'creator-a',
          instagramLink: { primaryLinkUrl: 'https://instagram.com/ada/' },
        },
      ]);
    const session = createSession(queryExistingCreators);
    const rows = await session.matchColumnsStepHook(
      [{ instagram: 'https://instagram.com/ada' }],
      [[]],
      columnsFor(['instagram_link']),
      undefined,
    );

    const initial = runTableHook(session, rows);
    expect(initial.errors).toEqual([]);

    await session.beforeSubmitHook(initial.rows);
    const refreshed = runTableHook(session, initial.rows);
    expect(refreshed.errors).toEqual([
      expect.objectContaining({
        fieldKey: 'instagram',
        message: 'Creator already exists for this social profile',
      }),
    ]);
  });

  it('does not inflate conflict counts after validation back-navigation', async () => {
    const session = createSession();
    const rawRows = [
      ['https://instagram.com/duplicate'],
      ['https://instagram.com/duplicate/'],
    ];
    const columns = columnsFor(['instagram_link']);
    const firstRows = await session.matchColumnsStepHook(
      [{ instagram: rawRows[0][0] }, { instagram: rawRows[1][0] }],
      rawRows,
      columns,
      undefined,
    );

    const firstValidation = runTableHook(session, firstRows);

    expect(session.getSummary(firstValidation.rows)).toEqual({
      existing: 0,
      conflicts: 2,
    });
    const remainingRows = runTableHook(session, [firstValidation.rows[0]]).rows;

    expect(session.getSummary(remainingRows)).toEqual({
      existing: 0,
      conflicts: 2,
    });

    const backRows = await session.matchColumnsStepHook(
      [{ instagram: rawRows[0][0] }, { instagram: rawRows[1][0] }],
      rawRows,
      columns,
      undefined,
    );
    const revalidatedRows = runTableHook(session, backRows).rows;

    expect(session.getSummary(revalidatedRows)).toEqual({
      existing: 0,
      conflicts: 2,
    });
  });

  it('retains a removed conflict in the final summary while clearing the block', async () => {
    const session = createSession();
    const rows = await session.matchColumnsStepHook(
      [
        { instagram: 'https://instagram.com/duplicate' },
        { instagram: 'https://instagram.com/duplicate/' },
      ],
      [[], []],
      columnsFor(['instagram_link']),
      undefined,
    );
    runTableHook(session, rows);
    const removed = runTableHook(session, []);

    expect(session.getSubmissionBlockReason(removed.rows)).toBeUndefined();
    expect(session.getSummary(removed.rows)).toEqual({
      existing: 0,
      conflicts: 2,
    });
  });
  it('classifies the 149-row sanitized Influencer Club fixture exactly', async () => {
    const existingCreators = [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `existing-${index + 1}`,
        instagramLink: {
          primaryLinkUrl: `https://instagram.com/existing.creator.${String(
            index + 1,
          ).padStart(3, '0')}`,
        },
      })),
      ...Array.from({ length: 4 }, (_, index) => [
        {
          id: `conflict-${index + 1}-a`,
          instagramLink: {
            primaryLinkUrl: `https://instagram.com/conflict.creator.${String(
              index + 1,
            ).padStart(3, '0')}`,
          },
        },
        {
          id: `conflict-${index + 1}-b`,
          instagramLink: {
            primaryLinkUrl: `https://www.instagram.com/conflict.creator.${String(
              index + 1,
            ).padStart(3, '0')}/`,
          },
        },
      ]).flat(),
    ];
    const session = createSession(
      jest.fn().mockResolvedValue(existingCreators),
    );
    const workbook = read(
      readFileSync(
        resolve(__dirname, '../../fixtures/influencer-club-149-creators.csv'),
      ),
      { type: 'buffer' },
    );
    const [headers, ...sourceRows] = mapWorkbook(workbook);
    const columns = columnsFor(headers);
    const importedRows = sourceRows.map((sourceRow, rowIndex) => ({
      ...Object.fromEntries(
        columns.map((column, columnIndex) => [
          'value' in column ? column.value : column.header,
          sourceRow[columnIndex] ?? '',
        ]),
      ),
      __index: `fixture-row-${rowIndex}`,
    }));

    const normalizedRows = await session.matchColumnsStepHook(
      importedRows,
      sourceRows,
      columns,
      session.headerProfile.key,
    );
    const classified = runTableHook(session, normalizedRows);
    const existingRowIndexes = new Set(
      classified.errors
        .filter(
          ({ message }) =>
            message === 'Creator already exists for this social profile',
        )
        .map(({ rowIndex }) => rowIndex),
    );
    const conflictRowIndexes = new Set(
      classified.errors
        .filter(
          ({ message }) =>
            message === 'Social profiles match different or ambiguous Creators',
        )
        .map(({ rowIndex }) => rowIndex),
    );
    const invalidRowIndexes = new Set(
      classified.errors
        .filter(({ message }) => message === 'Enter a valid email address')
        .map(({ rowIndex }) => rowIndex),
    );
    const erroredRowIndexes = new Set(
      classified.errors.map(({ rowIndex }) => rowIndex),
    );

    expect(headers).toEqual([
      'first_name',
      'email',
      'contact_phone_number',
      'instagram_link',
      'tiktok_link',
      'youtube_link',
      'twitter_link',
      'gender',
      'location',
    ]);
    expect(classified.rows).toHaveLength(149);
    expect(sourceRows.filter((sourceRow) => Boolean(sourceRow[3])).length).toBe(
      86,
    );
    expect(sourceRows.filter((sourceRow) => Boolean(sourceRow[4])).length).toBe(
      149,
    );
    expect(sourceRows.filter((sourceRow) => Boolean(sourceRow[5])).length).toBe(
      45,
    );
    expect(sourceRows.filter((sourceRow) => Boolean(sourceRow[6])).length).toBe(
      10,
    );
    expect(existingRowIndexes.size).toBe(20);
    expect(conflictRowIndexes.size).toBe(4);
    expect(invalidRowIndexes.size).toBe(6);
    expect(classified.rows.length - erroredRowIndexes.size).toBe(119);
    expect(session.getSummary(classified.rows)).toEqual({
      existing: 20,
      conflicts: 4,
    });
    expect(session.getSubmissionBlockReason(classified.rows)).toBe(
      'Remove conflicting Creator rows before importing',
    );

    const withoutConflicts = runTableHook(
      session,
      classified.rows.filter(
        (_, rowIndex) => !conflictRowIndexes.has(rowIndex),
      ),
    );

    expect(
      session.getSubmissionBlockReason(withoutConflicts.rows),
    ).toBeUndefined();
    expect(session.getSummary(withoutConflicts.rows)).toEqual({
      existing: 20,
      conflicts: 4,
    });
  });
});

import { getDatabaseCrudToolFlatObjects } from 'src/engine/metadata-modules/ai/ai-agent/utils/get-database-crud-tool-flat-objects.util';

const RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS = [
  '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
  'f99ff6bc-3b56-4600-beb3-cfc2c23364f6',
  'facac4a1-0a2f-469f-9f1f-81ef01f06578',
];

describe('getDatabaseCrudToolFlatObjects', () => {
  it('excludes retired Brand Brain objects while retaining active objects', () => {
    const retainedObject = {
      isActive: true,
      universalIdentifier: 'retained-object-id',
    };
    const byUniversalIdentifier = Object.fromEntries([
      [retainedObject.universalIdentifier, retainedObject],
      ...RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS.map(
        (universalIdentifier) => [
          universalIdentifier,
          { isActive: true, universalIdentifier },
        ],
      ),
    ]);

    expect(getDatabaseCrudToolFlatObjects(byUniversalIdentifier)).toEqual([
      retainedObject,
    ]);
  });
});

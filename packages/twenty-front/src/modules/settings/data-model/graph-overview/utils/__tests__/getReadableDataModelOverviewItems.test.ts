import { getReadableDataModelOverviewItems } from '@/settings/data-model/graph-overview/utils/getReadableDataModelOverviewItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { filterReadableActiveObjectMetadataItems } from '@/object-metadata/utils/filterReadableActiveObjectMetadataItems';

const object = ({
  id,
  isSystem = false,
  fields = [],
  readableFields = fields,
}: {
  id: string;
  isSystem?: boolean;
  fields?: { id: string }[];
  readableFields?: { id: string }[];
}) =>
  ({
    id,
    isActive: true,
    isSystem,
    fields,
    readableFields,
  }) as EnrichedObjectMetadataItem;

describe('getReadableDataModelOverviewItems', () => {
  it('removes system objects and unreadable fields', () => {
    const readableField = { id: 'readable-field' };
    const readableObjects = filterReadableActiveObjectMetadataItems(
      [
        object({
          id: 'creator',
          fields: [readableField, { id: 'restricted-relation' }],
          readableFields: [readableField],
        }),
        object({ id: 'restricted-object' }),
        object({ id: 'system-object', isSystem: true }),
      ],
      {
        'restricted-object': {
          objectMetadataId: 'restricted-object',
          canReadObjectRecords: false,
        } as never,
      },
    );
    const items = getReadableDataModelOverviewItems(readableObjects);

    expect(items.map(({ id }) => id)).toEqual(['creator']);
    expect(items[0].fields).toEqual([readableField]);
  });
});

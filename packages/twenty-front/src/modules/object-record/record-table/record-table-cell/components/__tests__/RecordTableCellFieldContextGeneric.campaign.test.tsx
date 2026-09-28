import { fireEvent, render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { RecordTableCellFieldContextGeneric } from '@/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric';
import { RecordTableCellContext } from '@/object-record/record-table/contexts/RecordTableCellContext';
import { RelationType, FieldMetadataType } from '~/generated-metadata/graphql';

let openFirstColumnRelationInIndex = false;
let objectNameSingular = 'campaignCreator';
let fieldName = 'creator';
let relationTarget = 'creator';
let hasIdentifierClickHandler = true;
const onRecordIdentifierClick = jest.fn();
const fieldDefinition = {
  fieldMetadataId: 'creator-field',
  type: FieldMetadataType.RELATION,
  metadata: {
    get fieldName() {
      return fieldName;
    },
    get relationObjectMetadataNameSingular() {
      return relationTarget;
    },
    relationType: RelationType.MANY_TO_ONE,
    relationObjectMetadataId: 'creator-object',
    isUIEditable: false,
  },
};

jest.mock(
  '@/object-metadata/hooks/useGetIsMetadataItemFromStandardApplication',
  () => ({
    useGetIsMetadataItemFromStandardApplication: () => () => true,
  }),
);
jest.mock('@/object-metadata/utils/getObjectPermissionsForObject', () => ({
  getObjectPermissionsForObject: () => ({ canReadObjectRecords: true }),
}));
jest.mock('@/object-record/read-only/utils/isRecordFieldReadOnly', () => ({
  isRecordFieldReadOnly: () => false,
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => false,
  }),
);
jest.mock(
  '@/object-record/record-table/contexts/RecordTableRowContext',
  () => ({
    useRecordTableRowContextOrThrow: () => ({
      recordId: 'membership-a',
      rowIndex: 2,
      isRecordReadOnly: false,
    }),
  }),
);
jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: () => ({
    objectMetadataItem: {
      id: 'membership-object',
      nameSingular: objectNameSingular,
    },
    objectMetadataItems: [],
    objectPermissions: { canReadObjectRecords: true },
    onRecordIdentifierClick: hasIdentifierClickHandler
      ? onRecordIdentifierClick
      : undefined,
  }),
}));
jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectPermissionsByObjectMetadataId: {},
    fieldDefinitionByFieldMetadataItemId: { 'creator-field': fieldDefinition },
    openFirstColumnRelationInIndex,
  }),
}));

const RelationLink = () => {
  const { onRecordChipClick } = useContext(FieldContext);
  return (
    <a href="/object/creator/creator-a" onClick={onRecordChipClick}>
      Creator name
    </a>
  );
};

const renderCell = (column: number) =>
  render(
    <RecordTableCellContext.Provider
      value={
        {
          cellPosition: { column, row: 2 },
          recordField: { fieldMetadataItemId: 'creator-field' },
        } as never
      }
    >
      <RecordTableCellFieldContextGeneric
        recordField={{ fieldMetadataItemId: 'creator-field' } as never}
      >
        <RelationLink />
      </RecordTableCellFieldContextGeneric>
    </RecordTableCellContext.Provider>,
  );

describe('campaign relation identifier seam', () => {
  beforeEach(() => {
    openFirstColumnRelationInIndex = false;
    objectNameSingular = 'campaignCreator';
    fieldName = 'creator';
    relationTarget = 'creator';
    hasIdentifierClickHandler = true;
    onRecordIdentifierClick.mockClear();
  });

  it('keeps the ordinary relation link independent of the membership row', () => {
    renderCell(0);
    fireEvent.click(screen.getByRole('link', { name: 'Creator name' }));
    expect(onRecordIdentifierClick).not.toHaveBeenCalled();
  });

  it.each([
    ['a different field', 'campaignCreator', 'campaign', 'campaign'],
    ['a different target', 'campaignCreator', 'creator', 'company'],
    ['a different object', 'campaignCreatorListSource', 'creator', 'creator'],
  ])(
    'preserves the native link for %s even in the opted-in first column',
    (_, objectName, name, target) => {
      openFirstColumnRelationInIndex = true;
      objectNameSingular = objectName;
      fieldName = name;
      relationTarget = target;
      renderCell(0);
      const link = screen.getByRole('link', { name: 'Creator name' });
      expect(link).toHaveAttribute('href', '/object/creator/creator-a');
      fireEvent.click(link, { ctrlKey: true });
      expect(onRecordIdentifierClick).not.toHaveBeenCalled();
    },
  );

  it('keeps the native relation when the table has no identifier click handler', () => {
    openFirstColumnRelationInIndex = true;
    hasIdentifierClickHandler = false;
    renderCell(0);
    fireEvent.click(screen.getByRole('link', { name: 'Creator name' }));
    expect(onRecordIdentifierClick).not.toHaveBeenCalled();
  });

  it('opens the membership from the first-column relation link only when opted in', () => {
    openFirstColumnRelationInIndex = true;
    const { rerender } = renderCell(0);
    const link = screen.getByRole('link', { name: 'Creator name' });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    expect(onRecordIdentifierClick).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(onRecordIdentifierClick).toHaveBeenCalledWith(
      2,
      'membership-a',
      link,
    );
    onRecordIdentifierClick.mockClear();
    rerender(
      <RecordTableCellContext.Provider
        value={
          {
            cellPosition: { column: 1, row: 2 },
            recordField: { fieldMetadataItemId: 'creator-field' },
          } as never
        }
      >
        <RecordTableCellFieldContextGeneric
          recordField={{ fieldMetadataItemId: 'creator-field' } as never}
        >
          <RelationLink />
        </RecordTableCellFieldContextGeneric>
      </RecordTableCellContext.Provider>,
    );
    fireEvent.click(link);
    expect(onRecordIdentifierClick).not.toHaveBeenCalled();
  });
});

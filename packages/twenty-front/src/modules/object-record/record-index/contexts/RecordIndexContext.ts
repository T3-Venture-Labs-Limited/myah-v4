import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { type ObjectPermissions } from 'twenty-shared/types';
import { createRequiredContext } from '~/utils/createRequiredContext';

export type RecordIndexOpenRequest = {
  recordId: string;
  source: 'record-chip' | 'table-identifier-action' | 'record-board-card';
  activationElement?: HTMLElement;
};

export type RecordIndexContextValue = {
  indexIdentifierUrl: (recordId: string) => string;
  onOpenRecordFromIndexView?: (request: RecordIndexOpenRequest) => void;
  shouldPreserveParentViewStateOnOpen?: boolean;
  shouldUseIndexIdentifierUrlOnFullPageOpen?: boolean;
  hideEmptyStateSubtitle?: boolean;
  onViewChange?: (viewId: string) => void;
  onRecordCreated?: (record: ObjectRecord) => Promise<void>;
  onIndexRecordsLoaded: () => void;
  objectNamePlural: string;
  objectNameSingular: string;
  objectMetadataItem: EnrichedObjectMetadataItem;
  objectPermissionsByObjectMetadataId: Record<
    string,
    ObjectPermissions & { objectMetadataId: string }
  >;
  recordIndexId: string;
  viewBarInstanceId: string;
  recordFieldByFieldMetadataItemId: Record<string, RecordField>;
  labelIdentifierFieldMetadataItem: FieldMetadataItem | undefined;
  fieldMetadataItemByFieldMetadataItemId: Record<string, FieldMetadataItem>;
  fieldDefinitionByFieldMetadataItemId: Record<
    string,
    ColumnDefinition<FieldMetadata>
  >;
  recordLimit?: number;
};

export const [
  RecordIndexContextProvider,
  useRecordIndexContextOrThrow,
  useOptionalRecordIndexContext,
] = createRequiredContext<RecordIndexContextValue>('RecordIndexContext');

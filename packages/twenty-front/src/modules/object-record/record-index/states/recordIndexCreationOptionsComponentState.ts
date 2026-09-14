import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';

export type RecordIndexCreationOptions = {
  onRecordCreated?: (record: ObjectRecord) => Promise<void>;
  shouldCloseAfterCreation?: boolean;
};

export const recordIndexCreationOptionsComponentState =
  createAtomComponentState<RecordIndexCreationOptions>({
    key: 'recordIndexCreationOptionsComponentState',
    defaultValue: {},
    componentInstanceContext: ViewComponentInstanceContext,
  });

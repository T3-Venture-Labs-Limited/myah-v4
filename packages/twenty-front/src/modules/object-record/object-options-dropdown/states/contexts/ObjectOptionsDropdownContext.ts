import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type ObjectOptionsContentId } from '@/object-record/object-options-dropdown/types/ObjectOptionsContentId';
import { type ViewType } from '@/views/types/ViewType';
import { type OnDragEndResponder } from '@hello-pangea/dnd';
import { createContext } from 'react';

export type ObjectOptionsDropdownContextValue = {
  recordIndexId: string;
  objectMetadataItem: EnrichedObjectMetadataItem;
  viewType: ViewType;
  currentContentId: ObjectOptionsContentId | null;
  onContentChange: (key: ObjectOptionsContentId) => void;
  resetContent: () => void;
  dropdownId: string;
  onViewChange?: (viewId: string) => void;
  handleRecordGroupOrderChangeWithModal?: OnDragEndResponder;
};

export const ObjectOptionsDropdownContext =
  createContext<ObjectOptionsDropdownContextValue>(
    {} as ObjectOptionsDropdownContextValue,
  );

import { buildHeadlessCommandContextApi } from '@/command-menu-item/engine-command/utils/buildHeadlessCommandContextApi';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { createStore } from 'jotai';
import { EngineComponentKey } from '~/generated-metadata/graphql';

jest.mock('@/context-store/utils/computeContextStoreFilters', () => ({
  computeContextStoreFilters: jest.fn(() => null),
}));

jest.mock(
  '@/object-metadata/states/flattenedFieldMetadataItemsSelector',
  () => {
    const { atom } = jest.requireActual('jotai');

    return {
      flattenedFieldMetadataItemsSelector: { atom: atom([]) },
    };
  },
);

jest.mock('@/object-metadata/states/objectMetadataItemsSelector', () => {
  const { atom } = jest.requireActual('jotai');

  return {
    objectMetadataItemsSelector: {
      atom: atom([{ id: 'creator-object', namePlural: 'creators' }]),
    },
  };
});

describe('buildHeadlessCommandContextApi', () => {
  it.each([
    [
      'a scoped Creator List context',
      'creator-list-pane-list-a',
      'creator-view-a',
      'creators-creator-view-a-creator-list-pane-list-a',
    ],
    [
      'the main context',
      MAIN_CONTEXT_STORE_INSTANCE_ID,
      'creator-view-a',
      'creators-creator-view-a',
    ],
  ])(
    'uses the RecordIndexSurface record index namespace for %s',
    (_, contextStoreInstanceId, viewId, recordIndexId) => {
      const store = createStore();

      store.set(
        contextStoreCurrentObjectMetadataItemIdComponentState.atomFamily({
          instanceId: contextStoreInstanceId,
        }),
        'creator-object',
      );
      store.set(
        contextStoreCurrentViewIdComponentState.atomFamily({
          instanceId: contextStoreInstanceId,
        }),
        viewId,
      );

      const context = buildHeadlessCommandContextApi({
        contextStoreInstanceId,
        engineComponentKey: EngineComponentKey.CREATE_NEW_RECORD,
        store,
      });

      expect(context.recordIndexId).toBe(recordIndexId);
    },
  );
});

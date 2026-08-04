import { PageFocusId } from '@/types/PageFocusId';
import { useResetFocusStackToFocusItem } from '@/ui/utilities/focus/hooks/useResetFocusStackToFocusItem';
import { FocusComponentType } from '@/ui/utilities/focus/types/FocusComponentType';

export const useResetFocusStackToRecordIndex = () => {
  const { resetFocusStackToFocusItem } = useResetFocusStackToFocusItem();

  const resetFocusStackToRecordIndex = (
    recordIndexFocusId: string = PageFocusId.RecordIndex,
  ) => {
    resetFocusStackToFocusItem({
      focusStackItem: {
        focusId: recordIndexFocusId,
        componentInstance: {
          componentType: FocusComponentType.PAGE,
          componentInstanceId: recordIndexFocusId,
        },
        globalHotkeysConfig: {
          enableGlobalHotkeysWithModifiers: true,
          enableGlobalHotkeysConflictingWithKeyboard: true,
        },
      },
    });
  };

  return {
    resetFocusStackToRecordIndex,
  };
};

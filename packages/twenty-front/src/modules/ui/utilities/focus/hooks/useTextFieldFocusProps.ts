import { useCallback, useId } from 'react';

import { usePushFocusItemToFocusStack } from '@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack';
import { useRemoveFocusItemFromFocusStackById } from '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById';
import { FocusComponentType } from '@/ui/utilities/focus/types/FocusComponentType';

// Focus/blur props for a plain <input>/<textarea> so that, while someone types
// in it, global single-key shortcuts (such as the "g" go-to sequence) don't
// swallow keystrokes — what Twenty's own TextInput/TextArea do (MYAH-454).
export const useTextFieldFocusProps = () => {
  const focusId = `text-field-${useId()}`;
  const { pushFocusItemToFocusStack } = usePushFocusItemToFocusStack();
  const { removeFocusItemFromFocusStackById } =
    useRemoveFocusItemFromFocusStackById();

  const onFocus = useCallback(() => {
    pushFocusItemToFocusStack({
      focusId,
      component: { type: FocusComponentType.TEXT_INPUT, instanceId: focusId },
      globalHotkeysConfig: {
        enableGlobalHotkeysConflictingWithKeyboard: false,
      },
    });
  }, [focusId, pushFocusItemToFocusStack]);

  const onBlur = useCallback(() => {
    removeFocusItemFromFocusStackById({ focusId });
  }, [focusId, removeFocusItemFromFocusStackById]);

  return { onFocus, onBlur };
};

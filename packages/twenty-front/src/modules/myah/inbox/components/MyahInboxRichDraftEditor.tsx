import {
  BlockNoteSchema,
  docToBlocks,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  FormattingToolbar,
  FormattingToolbarController,
  useCreateBlockNote,
} from '@blocknote/react';
import { styled } from '@linaria/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createMyahReplyBlocksFromPlainText,
  parseMyahReplyRichText,
  serializeMyahReplyBlocks,
  type MyahReplyBlock,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { BLOCK_EDITOR_GLOBAL_HOTKEYS_CONFIG } from '@/blocknote-editor/constants/BlockEditorGlobalHotkeysConfig';
import { usePushFocusItemToFocusStack } from '@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack';
import { useRemoveFocusItemFromFocusStackById } from '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById';
import { FocusComponentType } from '@/ui/utilities/focus/types/FocusComponentType';

import { type MyahInboxRichText } from '@/myah/inbox/types/MyahInboxDraftAutosave';
import '@blocknote/mantine/style.css';
import '@blocknote/react/style.css';

const MYAH_REPLY_BLOCK_SCHEMA = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: {
    bold: defaultStyleSpecs.bold,
    italic: defaultStyleSpecs.italic,
    underline: defaultStyleSpecs.underline,
    strike: defaultStyleSpecs.strike,
  },
});

const StyledRichDraftEditor = styled.div`
  &[data-main-reply-editor] .bn-container,
  &[data-main-reply-editor] .bn-editor,
  &[data-main-reply-editor] .bn-editor:focus-within {
    background: transparent;
    border: 0;
    box-shadow: none;
    outline: 0;
  }

  &[data-main-reply-editor] .bn-toolbar.bn-formatting-toolbar {
    box-shadow: none;
  }

  &[data-main-reply-editor] .bn-editor {
    color: inherit;
    font: inherit;
    line-height: inherit;
    max-height: min(240px, 40vh);
    min-height: 144px;
    overflow-y: auto;
    padding: 0;
    scrollbar-width: none;
  }

  &[data-main-reply-editor] {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding-bottom: 8px;
  }

  &[data-main-reply-editor] .bn-editor::-webkit-scrollbar {
    display: none;
  }
`;

const StyledValidationError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const isAllowedRichLink = (href: string) => {
  if (/[\u0000-\u001F\u007F-\u009F]/.test(href)) return false;

  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol);
  } catch {
    return false;
  }
};

type MyahInboxRichDraftEditorProps = {
  body: MyahInboxRichText;
  ariaLabel: string;
  disabled: boolean;
  editorVersion: number;
  focusId: string;
  onDraftChange: (body: MyahInboxRichText) => void;
  autoFocus?: boolean;
  presentation?: 'default' | 'main';
};

export const MyahInboxRichDraftEditor = ({
  body,
  ariaLabel,
  disabled,
  editorVersion,
  focusId,
  onDraftChange,
  autoFocus = false,
  presentation = 'default',
}: MyahInboxRichDraftEditorProps) => {
  const initialContent = useMemo(
    () =>
      parseMyahReplyRichText(body).blocks ??
      createMyahReplyBlocksFromPlainText(body.markdown),
    [body],
  );
  // oxlint-disable-next-line twenty/no-state-useref -- Native transactions need the last emitted body without a second autosave queue.
  const latestBodyRef = useRef(body);
  // oxlint-disable-next-line twenty/no-state-useref -- The native subscription stays mounted while its controlled callback changes.
  const onDraftChangeRef = useRef(onDraftChange);
  // oxlint-disable-next-line twenty/no-state-useref -- DOM blur cleanup must survive focus moves into the floating toolbar.
  const blurTimeoutRef = useRef<number | null>(null);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const { pushFocusItemToFocusStack } = usePushFocusItemToFocusStack();
  const { removeFocusItemFromFocusStackById } =
    useRemoveFocusItemFromFocusStackById();
  const editor = useCreateBlockNote(
    {
      initialContent,
      schema: MYAH_REPLY_BLOCK_SCHEMA,
      trailingBlock: false,
      domAttributes: {
        editor: {
          'aria-label': ariaLabel,
          'aria-multiline': 'true',
          role: 'textbox',
        },
      },
      links: { isValidLink: isAllowedRichLink },
      pasteHandler: ({ event, editor: currentEditor }) => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        currentEditor.insertInlineContent(text);
        return true;
      },
    },
    [editorVersion],
  );

  useEffect(() => {
    latestBodyRef.current = serializeMyahReplyBlocks(
      editor.document as MyahReplyBlock[],
    );
  }, [editor]);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    if (presentation !== 'main' || typeof document === 'undefined') return;

    const fontFaceSet = (document as { fonts?: FontFaceSet }).fonts;
    if (typeof fontFaceSet?.load !== 'function') return;

    void fontFaceSet.load('700 13px Inter').catch(() => {});
  }, [presentation]);

  useEffect(() => {
    const unsubscribe = editor.onBeforeChange(({ tr }) => {
      if (!tr.docChanged) return true;

      try {
        serializeMyahReplyBlocks(
          docToBlocks(tr.doc, editor.pmSchema) as MyahReplyBlock[],
        );
        setRejectionMessage(null);
        return true;
      } catch {
        setRejectionMessage(
          'This change was not applied because the draft exceeds supported rich-reply limits.',
        );
        return false;
      }
    });

    return unsubscribe;
  }, [editor]);

  useEffect(() => {
    const unsubscribe = editor.onChange((currentEditor) => {
      const nextBody = serializeMyahReplyBlocks(
        currentEditor.document as MyahReplyBlock[],
      );
      if (
        nextBody.markdown === latestBodyRef.current.markdown &&
        nextBody.blocknote === latestBodyRef.current.blocknote
      ) {
        return;
      }
      latestBodyRef.current = nextBody;
      onDraftChangeRef.current(nextBody);
    });

    return unsubscribe;
  }, [editor]);

  useEffect(() => {
    if (autoFocus) editor.focus();
  }, [autoFocus, editor]);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
      removeFocusItemFromFocusStackById({ focusId });
    },
    [focusId, removeFocusItemFromFocusStackById],
  );

  const handleFocus = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    pushFocusItemToFocusStack({
      component: {
        instanceId: focusId,
        type: FocusComponentType.ACTIVITY_RICH_TEXT_EDITOR,
      },
      focusId,
      globalHotkeysConfig: BLOCK_EDITOR_GLOBAL_HOTKEYS_CONFIG,
    });
  };

  const handleBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (!activeElement || !editor.isWithinEditor(activeElement)) {
        removeFocusItemFromFocusStackById({ focusId });
      }
    });
  };

  return (
    <StyledRichDraftEditor
      data-main-reply-editor={presentation === 'main' || undefined}
    >
      <BlockNoteView
        editor={editor}
        editable={!disabled}
        formattingToolbar={false}
        linkToolbar={false}
        slashMenu={false}
        sideMenu={false}
        emojiPicker={false}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {!disabled && (
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                <BlockTypeSelect />
                <BasicTextStyleButton basicTextStyle="bold" />
                <BasicTextStyleButton basicTextStyle="italic" />
                <BasicTextStyleButton basicTextStyle="underline" />
                <BasicTextStyleButton basicTextStyle="strike" />
                <CreateLinkButton />
              </FormattingToolbar>
            )}
          />
        )}
      </BlockNoteView>
      {rejectionMessage && (
        <StyledValidationError role="alert">
          {rejectionMessage}
        </StyledValidationError>
      )}
    </StyledRichDraftEditor>
  );
};

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { createStore, Provider, useAtomValue } from 'jotai';
import type * as ReactType from 'react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxDraftEditor } from '@/myah/inbox/components/MyahInboxDraftEditor';
import { useMyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import {
  draftKeyFixture,
  draftInputFixture,
} from '@/myah/inbox/hooks/__tests__/fixtures/myahInboxDraftAutosaveTestFixture';

jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: jest.fn(),
}));
jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { sm: '4px' },
    },
    font: {
      color: {
        primary: 'black',
        secondary: 'dimgray',
        tertiary: 'gray',
        danger: 'darkred',
      },
      size: { md: '16px', sm: '13px', xs: '11px' },
      weight: { regular: 400, semiBold: 600 },
    },
    spacing: { 2: '8px', 3: '12px' },
  },
}));

jest.mock('@/ui/input/components/Select', () => ({ Select: () => null }));
jest.mock('twenty-ui/surfaces', () => ({
  AppTooltip: () => null,
  TooltipDelay: { shortDelay: '300ms' },
  TooltipPosition: { Top: 'top' },
}));
jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
    ariaLabel,
  }: {
    title?: string;
    onClick?: () => void;
    disabled?: boolean;
    ariaLabel?: string;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

jest.mock('@blocknote/core', () => ({
  BlockNoteSchema: { create: jest.fn(() => ({})) },
  defaultBlockSpecs: {
    paragraph: {},
    bulletListItem: {},
    numberedListItem: {},
  },
  defaultInlineContentSpecs: {},
  defaultStyleSpecs: { bold: {}, italic: {}, underline: {}, strike: {} },
  docToBlocks: jest.fn(),
}));
type Editor = {
  document: unknown[];
  focus: () => void;
  onChange: () => () => void;
  onBeforeChange: () => () => void;
};
const mockEditors: Editor[] = [];
jest.mock('@blocknote/react', () => {
  const React = jest.requireActual('react') as typeof ReactType;
  return {
    BasicTextStyleButton: () => null,
    BlockTypeSelect: () => null,
    CreateLinkButton: () => null,
    FormattingToolbar: () => null,
    FormattingToolbarController: () => null,
    // BlockNote consumes initialContent only when its dependency-keyed instance is created.
    useCreateBlockNote: (
      options: { initialContent: unknown[] },
      dependencies: unknown[],
    ) =>
      React.useMemo(() => {
        const editor = {
          document: options.initialContent,
          focus: jest.fn(),
          onChange: () => jest.fn(),
          onBeforeChange: () => jest.fn(),
        };
        mockEditors.push(editor);
        return editor;
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- Match BlockNote instance lifetime, not controlled body props.
      }, dependencies),
  };
});
jest.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({
    editor,
    children,
  }: {
    editor: Editor;
    children: ReactType.ReactNode;
  }) => (
    <div role="textbox" aria-label="Shared reply draft">
      {JSON.stringify(editor.document)}
      {children}
    </div>
  ),
}));
jest.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({
    pushFocusItemToFocusStack: jest.fn(),
  }),
}));
jest.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: jest.fn(),
    }),
  }),
);

const key = draftKeyFixture('workspace-1', 'thread-1');
const body = { markdown: 'private local text', blocknote: null };
const thread = {
  key,
  input: draftInputFixture(key),
  revision: 2,
  body,
  executionState: 'READY' as const,
};
const MountedEditor = () => {
  const entry = useAtomValue(myahInboxDraftAutosaveFamilyState.atomFamily(key));
  return entry ? (
    <MyahInboxDraftEditor
      entry={entry}
      presentation="main"
      onDraftChange={jest.fn()}
      onRetry={jest.fn()}
      onReloadConflict={jest.fn()}
      actions={null}
      disabled={entry.executionState !== 'READY'}
    />
  ) : null;
};

describe('MyahInboxDraftEditor execution-state masking', () => {
  beforeEach(() => {
    mockEditors.length = 0;
    jest
      .mocked(useMyahInboxThreadMutations)
      .mockReturnValue({ saveDraft: jest.fn() } as never);
  });
  describe.each([
    'readiness-pending',
    'readiness-unknown',
    'outcome-pending',
    'outcome-unknown',
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
    'CONTEXT_UNAVAILABLE',
    'NEEDS_REVIEW',
  ] as const)('%s', (transition) => {
    it.each(['idle', 'conflict', 'error'] as const)(
      'clears the already-open native editor and %s panel unless readable',
      (status) => {
        const store = createStore();
        store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never);
        const wrapper = ({ children }: ReactType.PropsWithChildren) => (
          <Provider store={store}>{children}</Provider>
        );
        const { result } = renderHook(
          () => useMyahInboxDraftAutosaveController(),
          { wrapper },
        );
        const controller = result.current;
        const target = controller.beginTargetRead(key, () => true);
        controller.authorizeTarget(target, thread);
        const operation = transition.startsWith('outcome-')
          ? controller.acquire(key, 'sending')!
          : null;
        const original = controller.getEntry(key)!;
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(key), {
          ...original,
          status,
          error: status === 'error' ? 'private error text' : null,
          conflict:
            status === 'conflict'
              ? {
                  revision: 3,
                  body: { markdown: 'private conflict text', blocknote: null },
                }
              : null,
        });
        render(<MountedEditor />, { wrapper });
        fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
        expect(screen.getByRole('textbox')).toHaveTextContent(
          'private local text',
        );
        const oldEditor = mockEditors.at(-1);
        if (status === 'conflict')
          expect(
            screen.getByLabelText('Current saved draft'),
          ).toHaveTextContent('private conflict text');
        act(() => {
          if (
            transition === 'readiness-pending' ||
            transition === 'readiness-unknown'
          )
            controller.setReadinessLock(
              key,
              transition === 'readiness-pending' ? 'pending' : 'unknown',
            );
          else if (
            transition === 'outcome-pending' ||
            transition === 'outcome-unknown'
          )
            controller.setOutcomeLock(
              operation!,
              transition === 'outcome-pending' ? 'pending' : 'unknown',
            );
          else controller.reconcile({ ...thread, executionState: transition });
        });
        if (transition === 'NEEDS_REVIEW') {
          expect(screen.getByRole('textbox')).toHaveTextContent(
            'private local text',
          );
          expect(mockEditors.at(-1)).toBe(oldEditor);
          if (status === 'conflict')
            expect(
              screen.getByLabelText('Current saved draft'),
            ).toHaveTextContent('private conflict text');
        } else {
          expect(screen.getByRole('textbox')).not.toHaveTextContent('private');
          expect(document.body).not.toHaveTextContent('private');
          expect(mockEditors.at(-1)).not.toBe(oldEditor);
          expect(JSON.stringify(mockEditors.at(-1)?.document)).not.toContain(
            'private',
          );
          expect(controller.getEntry(key)).toMatchObject({
            localBody: { markdown: '', blocknote: null },
            confirmedBody: null,
            conflict: null,
            error: null,
            status: 'idle',
            editorVersion: original.editorVersion + 1,
          });
          expect(screen.queryByRole('alert')).not.toBeInTheDocument();
          const maskedEditor = mockEditors.at(-1);
          const maskedVersion = controller.getEntry(key)?.editorVersion;
          act(() =>
            controller.reconcile({
              ...thread,
              executionState: controller.getEntry(key)!.executionState,
            }),
          );
          expect(controller.getEntry(key)?.editorVersion).toBe(maskedVersion);
          expect(mockEditors.at(-1)).toBe(maskedEditor);
        }
      },
    );
  });
});

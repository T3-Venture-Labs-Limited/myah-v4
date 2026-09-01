import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';

import { BlockEditor } from '@/blocknote-editor/components/BlockEditor';

jest.mock('@blocknote/core/extensions', () => ({
  filterSuggestionItems: () => [],
  SuggestionMenu: Symbol('SuggestionMenu'),
}));

jest.mock('@/blocknote-editor/utils/getSlashMenu', () => ({
  getSlashMenu: () => [],
}));

jest.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({
    children,
    formattingToolbar,
    linkToolbar,
  }: {
    children: React.ReactNode;
    formattingToolbar?: boolean;
    linkToolbar?: boolean;
  }) => (
    <div
      data-formatting-toolbar={formattingToolbar}
      data-link-toolbar={linkToolbar}
      data-testid="block-note-view"
    >
      {children}
    </div>
  ),
}));

jest.mock('@blocknote/react', () => ({
  SuggestionMenuController: () => <div data-testid="suggestion-menu" />,
}));

jest.mock('@/blocknote-editor/components/CustomMentionMenu', () => ({
  CustomMentionMenu: () => null,
}));

jest.mock('@/blocknote-editor/components/CustomSideMenu', () => ({
  CustomSideMenu: () => <div data-testid="side-menu" />,
}));

jest.mock('@/blocknote-editor/components/CustomSlashMenu', () => ({
  CustomSlashMenu: () => null,
}));

jest.mock('@/mention/hooks/useMentionMenu', () => ({
  useMentionMenu: () => jest.fn(),
}));

const editor = {
  getExtension: jest.fn(),
} as unknown as ComponentProps<typeof BlockEditor>['editor'];

describe('BlockEditor', () => {
  it('suppresses formatting, link, side, slash, and mention controls', () => {
    render(
      <I18nProvider i18n={i18n}>
        <BlockEditor editor={editor} showFormattingControls={false} />
      </I18nProvider>,
    );

    expect(screen.getByTestId('block-note-view')).toHaveAttribute(
      'data-formatting-toolbar',
      'false',
    );
    expect(screen.getByTestId('block-note-view')).toHaveAttribute(
      'data-link-toolbar',
      'false',
    );
    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-menu')).not.toBeInTheDocument();
  });

  it('preserves the existing controls by default', () => {
    render(
      <I18nProvider i18n={i18n}>
        <BlockEditor editor={editor} />
      </I18nProvider>,
    );

    expect(screen.getByTestId('block-note-view')).toHaveAttribute(
      'data-formatting-toolbar',
      'true',
    );
    expect(screen.getByTestId('block-note-view')).toHaveAttribute(
      'data-link-toolbar',
      'true',
    );
    expect(screen.getByTestId('side-menu')).toBeVisible();
    expect(screen.getAllByTestId('suggestion-menu')).toHaveLength(2);
  });
});

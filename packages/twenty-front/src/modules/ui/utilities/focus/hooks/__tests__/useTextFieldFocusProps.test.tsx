import { act, fireEvent, render, screen } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { focusStackState } from '@/ui/utilities/focus/states/focusStackState';
import { pendingHotkeyState } from '@/ui/utilities/hotkey/states/internal/pendingHotkeysState';

import { useTextFieldFocusProps } from '@/ui/utilities/focus/hooks/useTextFieldFocusProps';
import { useGoToHotkeys } from '@/ui/utilities/hotkey/hooks/useGoToHotkeys';

// MYAH-454: with a "g" go-to shortcut registered, typing "g" in a plain
// textarea was swallowed ("messae" was sent to a creator).
const Field = ({ withFocusProps }: { withFocusProps: boolean }) => {
  useGoToHotkeys({ key: 'o', location: '/elsewhere' });
  const focusProps = useTextFieldFocusProps();
  const location = useLocation();

  return (
    <>
      <textarea
        aria-label="Message"
        onFocus={withFocusProps ? focusProps.onFocus : undefined}
        onBlur={withFocusProps ? focusProps.onBlur : undefined}
      />
      <span data-testid="path">{location.pathname}</span>
    </>
  );
};

const renderField = (withFocusProps: boolean) =>
  render(
    <MemoryRouter initialEntries={['/campaign']}>
      <Field withFocusProps={withFocusProps} />
    </MemoryRouter>,
  );

const typeKey = (element: HTMLElement, key: string) => {
  const notPrevented = fireEvent.keyDown(element, {
    key,
    code: `Key${key.toUpperCase()}`,
  });

  return notPrevented;
};

describe('useTextFieldFocusProps', () => {
  beforeEach(() => {
    getDefaultStore().set(focusStackState.atom, []);
    getDefaultStore().set(pendingHotkeyState.atom, null);
  });

  it('lets "g" and "o" reach a focused field instead of the go-to shortcut', () => {
    renderField(true);
    const field = screen.getByLabelText('Message');

    act(() => field.focus());

    expect(typeKey(field, 'g')).toBe(true);
    expect(typeKey(field, 'o')).toBe(true);
    expect(screen.getByTestId('path')).toHaveTextContent('/campaign');
  });

  it('is needed: without it the shortcut swallows "g"', () => {
    renderField(false);
    const field = screen.getByLabelText('Message');

    act(() => field.focus());

    expect(typeKey(field, 'g')).toBe(false);
  });

  it('restores shortcuts once the field loses focus', () => {
    renderField(true);
    const field = screen.getByLabelText('Message');

    act(() => field.focus());
    act(() => field.blur());
    act(() => {
      fireEvent.keyDown(document, { key: 'g', code: 'KeyG' });
    });
    act(() => {
      fireEvent.keyDown(document, { key: 'o', code: 'KeyO' });
    });

    expect(screen.getByTestId('path')).toHaveTextContent('/elsewhere');
  });
});

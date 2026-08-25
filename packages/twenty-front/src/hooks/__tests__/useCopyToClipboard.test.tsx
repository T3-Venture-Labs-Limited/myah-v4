import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages } from '~/locales/generated/en';

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: jest.fn(),
}));

const enqueueSuccessSnackBar = jest.fn();
const enqueueErrorSnackBar = jest.fn();
const writeText = jest.fn();

const Wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
);

describe('useCopyToClipboard', () => {
  beforeAll(() => {
    i18n.load({ [SOURCE_LOCALE]: messages });
    i18n.activate(SOURCE_LOCALE);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useSnackBar as jest.Mock).mockReturnValue({
      enqueueErrorSnackBar,
      enqueueSuccessSnackBar,
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies the exact value and reports success', async () => {
    writeText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyToClipboard(), {
      wrapper: Wrapper,
    });

    await act(() => result.current.copyToClipboard('mail.example.com'));

    expect(writeText).toHaveBeenCalledWith('mail.example.com');
    expect(enqueueSuccessSnackBar).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Copied to clipboard' }),
    );
    expect(enqueueErrorSnackBar).not.toHaveBeenCalled();
  });

  it('reports a bounded error when clipboard access rejects', async () => {
    writeText.mockRejectedValue(new Error('raw clipboard failure'));
    const { result } = renderHook(() => useCopyToClipboard(), {
      wrapper: Wrapper,
    });

    await act(() => result.current.copyToClipboard('mail.example.com'));

    expect(enqueueErrorSnackBar).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Couldn't copy to clipboard" }),
    );
    expect(enqueueSuccessSnackBar).not.toHaveBeenCalled();
  });
});

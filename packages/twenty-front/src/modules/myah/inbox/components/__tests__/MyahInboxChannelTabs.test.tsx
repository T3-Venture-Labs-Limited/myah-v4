import { fireEvent, render, screen } from '@testing-library/react';

import {
  MYAH_INBOX_EMAIL_PANEL_ID,
  MYAH_INBOX_EMAIL_TAB_ID,
  MYAH_INBOX_INSTAGRAM_PANEL_ID,
  MYAH_INBOX_INSTAGRAM_TAB_ID,
  MyahInboxChannelTabs,
} from '@/myah/inbox/components/MyahInboxChannelTabs';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white', transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { sm: '4px' },
    },
    font: {
      color: { primary: 'black', secondary: 'dimgray', tertiary: 'gray' },
      family: 'sans-serif',
      size: { sm: '13px' },
      weight: { semiBold: 600 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
}));

describe('MyahInboxChannelTabs', () => {
  it('connects the selected tab to its panel without choosing a default channel', () => {
    const onChannelChange = jest.fn();

    render(
      <MyahInboxChannelTabs
        activeChannel="INSTAGRAM"
        emailAvailable
        instagramAvailable
        onChannelChange={onChannelChange}
      />,
    );

    const tabList = screen.getByRole('tablist', {
      name: 'Conversation channels',
    });
    const emailTab = screen.getByRole('tab', { name: 'Email' });
    const instagramTab = screen.getByRole('tab', { name: 'Instagram' });

    expect(tabList).toContainElement(emailTab);
    expect(emailTab).toHaveAttribute('id', MYAH_INBOX_EMAIL_TAB_ID);
    expect(emailTab).toHaveAttribute(
      'aria-controls',
      MYAH_INBOX_EMAIL_PANEL_ID,
    );
    expect(emailTab).toHaveAttribute('aria-selected', 'false');
    expect(emailTab).toHaveAttribute('tabindex', '-1');

    expect(instagramTab).toHaveAttribute('id', MYAH_INBOX_INSTAGRAM_TAB_ID);
    expect(instagramTab).toHaveAttribute(
      'aria-controls',
      MYAH_INBOX_INSTAGRAM_PANEL_ID,
    );
    expect(instagramTab).toHaveAttribute('aria-selected', 'true');
    expect(instagramTab).toHaveAttribute('tabindex', '0');
    expect(onChannelChange).not.toHaveBeenCalled();
  });

  it('moves focus and selection with ArrowLeft, ArrowRight, Home, and End', () => {
    const onChannelChange = jest.fn();

    render(
      <MyahInboxChannelTabs
        activeChannel="EMAIL"
        emailAvailable
        instagramAvailable
        onChannelChange={onChannelChange}
      />,
    );

    const emailTab = screen.getByRole('tab', { name: 'Email' });
    const instagramTab = screen.getByRole('tab', { name: 'Instagram' });

    emailTab.focus();
    fireEvent.keyDown(emailTab, { key: 'ArrowRight' });
    expect(onChannelChange).toHaveBeenLastCalledWith('INSTAGRAM');
    expect(instagramTab).toHaveFocus();

    fireEvent.keyDown(instagramTab, { key: 'ArrowLeft' });
    expect(onChannelChange).toHaveBeenLastCalledWith('EMAIL');
    expect(emailTab).toHaveFocus();

    fireEvent.keyDown(emailTab, { key: 'End' });
    expect(onChannelChange).toHaveBeenLastCalledWith('INSTAGRAM');
    expect(instagramTab).toHaveFocus();

    fireEvent.keyDown(instagramTab, { key: 'Home' });
    expect(onChannelChange).toHaveBeenLastCalledWith('EMAIL');
    expect(emailTab).toHaveFocus();

    fireEvent.keyDown(emailTab, { key: 'ArrowLeft' });
    expect(onChannelChange).toHaveBeenLastCalledWith('INSTAGRAM');
    expect(instagramTab).toHaveFocus();
  });

  it('disables unavailable channels and skips them during keyboard navigation', () => {
    const onChannelChange = jest.fn();

    render(
      <MyahInboxChannelTabs
        activeChannel="EMAIL"
        emailAvailable
        instagramAvailable={false}
        onChannelChange={onChannelChange}
      />,
    );

    const emailTab = screen.getByRole('tab', { name: 'Email' });
    const instagramTab = screen.getByRole('tab', { name: 'Instagram' });

    expect(instagramTab).toBeDisabled();
    expect(instagramTab).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(instagramTab);
    fireEvent.keyDown(emailTab, { key: 'ArrowRight' });
    fireEvent.keyDown(emailTab, { key: 'End' });

    expect(emailTab).toHaveFocus();
    expect(onChannelChange).not.toHaveBeenCalled();
  });
});

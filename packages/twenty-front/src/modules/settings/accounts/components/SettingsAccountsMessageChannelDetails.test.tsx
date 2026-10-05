import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  MessageChannelContactAutoCreationPolicy,
  MessageChannelType,
  MessageFolderImportPolicy,
} from 'twenty-shared/types';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { SettingsAccountsMessageChannelDetails } from '@/settings/accounts/components/SettingsAccountsMessageChannelDetails';
import { MessageChannelVisibility } from '~/generated/graphql';

const mockUpdate = jest.fn();
jest.mock('@apollo/client/react', () => ({ useMutation: () => [mockUpdate] }));

it('hides CRM-only email settings but retains the group-email sync toggle (MYAH-469)', () => {
  // jsdom does not implement PointerEvent, used by the native switch.
  const originalPointerEvent = window.PointerEvent;
  window.PointerEvent = MouseEvent as typeof PointerEvent;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <SettingsAccountsMessageChannelDetails
          messageChannel={{
            id: 'mailbox',
            type: MessageChannelType.EMAIL,
            contactAutoCreationPolicy:
              MessageChannelContactAutoCreationPolicy.SENT,
            excludeNonProfessionalEmails: true,
            excludeGroupEmails: false,
            isSyncEnabled: true,
            visibility: MessageChannelVisibility.SHARE_EVERYTHING,
            messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
          }}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
  for (const label of [
    'Import',
    'Visibility',
    'Contact auto-creation',
    'Exclude non-professional emails',
  ]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  expect(screen.getByText('Exclude group emails')).toBeVisible();
  try {
    fireEvent.click(screen.getByRole('switch'));
  } finally {
    window.PointerEvent = originalPointerEvent;
  }
  expect(mockUpdate).toHaveBeenCalledWith({
    variables: {
      input: { id: 'mailbox', update: { excludeGroupEmails: true } },
    },
  });
});

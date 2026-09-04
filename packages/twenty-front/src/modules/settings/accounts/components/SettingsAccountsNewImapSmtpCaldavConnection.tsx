import { useLingui } from '@lingui/react/macro';
import { FormProvider } from 'react-hook-form';
import { useLocation } from 'react-router-dom';

import { SaveAndCancelButtons } from '@/settings/components/SaveAndCancelButtons/SaveAndCancelButtons';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsPath } from 'twenty-shared/types';

import { getSettingsPath } from 'twenty-shared/utils';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

import { SettingsAccountsConnectionForm } from '@/settings/accounts/components/SettingsAccountsConnectionForm';
import { useImapSmtpCaldavConnectionForm } from '@/settings/accounts/hooks/useImapSmtpCaldavConnectionForm';

const getRelativeReturnPath = (search: string): string | undefined => {
  const returnTo = new URLSearchParams(search).get('returnTo');

  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return undefined;
  }

  try {
    const url = new URL(returnTo, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : undefined;
  } catch {
    return undefined;
  }
};

export const SettingsAccountsNewImapSmtpCaldavConnection = () => {
  const { t } = useLingui();
  const navigate = useNavigateSettings();
  const location = useLocation();
  const returnTo = getRelativeReturnPath(location.search);

  const {
    formMethods,
    handleSave,
    handleSubmit,
    canSave,
    isSubmitting,
    loading,
  } = useImapSmtpCaldavConnectionForm({ returnTo });

  const { control } = formMethods;

  return (
    // oxlint-disable-next-line react/jsx-props-no-spreading
    <FormProvider {...formMethods}>
      <SettingsPageLayout
        title={t`New Account`}
        links={[
          {
            children: t`User`,
            href: getSettingsPath(SettingsPath.ProfilePage),
          },
          {
            children: t`Accounts`,
            href: getSettingsPath(SettingsPath.Accounts),
          },
          { children: t`New Account` },
        ]}
        actionButton={
          <SaveAndCancelButtons
            isSaveDisabled={!canSave}
            isCancelDisabled={isSubmitting}
            isLoading={loading}
            onCancel={() => navigate(SettingsPath.Accounts)}
            onSave={handleSubmit((data) => handleSave(data))}
          />
        }
      >
        <SettingsPageContainer>
          <SettingsAccountsConnectionForm control={control} isEditing={false} />
        </SettingsPageContainer>
      </SettingsPageLayout>
    </FormProvider>
  );
};

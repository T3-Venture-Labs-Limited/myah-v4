import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';
import { type Control, Controller } from 'react-hook-form';

import { type AccountType } from 'twenty-shared/constants';

import { type ConnectionFormData } from '@/settings/accounts/hooks/useImapSmtpCaldavConnectionForm';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledPasswordFieldContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledChangePasswordButton = styled.button`
  align-self: flex-end;
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.light};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: 0 ${themeCssVariables.spacing[1]};
  white-space: nowrap;

  &:hover {
    color: ${themeCssVariables.font.color.tertiary};
  }
`;

const MASKED_PASSWORD_PLACEHOLDER = '••••••••';

type SettingsAccountsPasswordControllerProps = {
  protocol: AccountType;
  label: string;
  control: Control<ConnectionFormData>;
  disabled: boolean;
  onUnlock: () => void;
};

export const SettingsAccountsPasswordController = ({
  protocol,
  label,
  control,
  disabled,
  onUnlock,
}: SettingsAccountsPasswordControllerProps) => {
  return (
    <Controller
      name={`${protocol}.password`}
      control={control}
      render={({ field, fieldState }) => (
        <StyledPasswordFieldContainer>
          <SettingsTextInput
            ref={field.ref}
            instanceId={`${protocol.toLowerCase()}-password-connection-form`}
            label={label}
            placeholder={disabled ? MASKED_PASSWORD_PLACEHOLDER : ''}
            type={disabled ? 'text' : 'password'}
            name={field.name}
            value={field.value || ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            disabled={disabled}
          />
          {disabled && (
            <StyledChangePasswordButton type="button" onClick={onUnlock}>
              <Trans>Change password</Trans>
            </StyledChangePasswordButton>
          )}
        </StyledPasswordFieldContainer>
      )}
    />
  );
};

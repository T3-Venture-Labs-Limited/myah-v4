import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { type Control, Controller } from 'react-hook-form';

import { Select } from '@/ui/input/components/Select';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';

import { SettingsAccountsPasswordController } from '@/settings/accounts/components/SettingsAccountsPasswordController';
import { type ConnectionFormData } from '@/settings/accounts/hooks/useImapSmtpCaldavConnectionForm';
import { type AccountType } from 'twenty-shared/constants';
import { CardPicker, RadioGroup } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledFormContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
`;

const StyledConnectionSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSectionHeader = styled.div`
  margin-bottom: ${themeCssVariables.spacing[2]};
`;

const StyledSectionTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin: 0;
  margin-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledSectionDescription = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledFieldRow = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[3]};

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    flex-direction: column;
  }
`;

const StyledFieldGroup = styled.div`
  flex: 1;

  & > * {
    width: 100%;
  }
`;

export type SettingsAccountsConnectionFormProtocolSelection = {
  selectedProtocol: AccountType | null;
  onSelectedProtocolChange: (protocol: AccountType) => void;
};

type SettingsAccountsConnectionFormProps = {
  control: Control<ConnectionFormData>;
  isEditing: boolean;
  isEmailAddressDisabled?: boolean;
  isProtocolSelectionDisabled?: boolean;
  existingProtocols?: AccountType[];
  protocolSelection?: SettingsAccountsConnectionFormProtocolSelection;
};

export const SettingsAccountsConnectionForm = ({
  control,
  isEditing,
  isEmailAddressDisabled = false,
  isProtocolSelectionDisabled = false,
  existingProtocols = [],
  protocolSelection,
}: SettingsAccountsConnectionFormProps) => {
  const { t } = useLingui();

  const [isProtocolPasswordBeingEdited, setIsProtocolPasswordBeingEdited] =
    useState<Record<AccountType, boolean>>({
      IMAP: false,
      SMTP: false,
      CALDAV: false,
    });

  const isPasswordInputDisabled = (protocol: AccountType) =>
    existingProtocols.includes(protocol) &&
    !isProtocolPasswordBeingEdited[protocol];

  const shouldShowProtocol = (protocol: AccountType) =>
    protocolSelection === undefined ||
    protocolSelection.selectedProtocol === protocol;

  const getDescription = () => {
    if (protocolSelection !== undefined) {
      return isEditing
        ? t`Update the selected protocol's connection settings.`
        : t`Choose one protocol, then enter its connection settings.`;
    }

    if (isEditing) {
      return t`Update your account's configuration. Configure any combination of IMAP, SMTP, and CalDAV as needed.`;
    }
    return t`You can set up any combination of IMAP (receiving emails), SMTP (sending emails), and CalDAV (calendar sync).`;
  };

  const handlePortChange = (value: string) => Number(value);

  return (
    <Section>
      <H2Title title={t`Mail Account`} description={getDescription()} />
      <StyledFormContainer>
        <Controller
          name="handle"
          control={control}
          render={({ field, fieldState }) => (
            <SettingsTextInput
              ref={field.ref}
              instanceId="email-address-connection-form"
              label={t`Email Address`}
              placeholder={t`john.doe@example.com`}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              disabled={isEmailAddressDisabled}
            />
          )}
        />

        {protocolSelection !== undefined && (
          <fieldset>
            <legend>{t`Connection protocol`}</legend>
            <RadioGroup<AccountType | null>
              aria-label={t`Connection protocol`}
              value={protocolSelection.selectedProtocol}
              disabled={isProtocolSelectionDisabled}
              onValueChange={(protocol) => {
                if (protocol !== null) {
                  protocolSelection.onSelectedProtocolChange(protocol);
                }
              }}
            >
              <CardPicker aria-label="IMAP" value="IMAP">
                <div>
                  <strong>IMAP</strong>
                  <p>{t`Receive and sync email.`}</p>
                </div>
              </CardPicker>
              <CardPicker aria-label="SMTP" value="SMTP">
                <div>
                  <strong>SMTP</strong>
                  <p>{t`Send email.`}</p>
                </div>
              </CardPicker>
              <CardPicker aria-label="CALDAV" value="CALDAV">
                <div>
                  <strong>CalDAV</strong>
                  <p>{t`Sync calendar events.`}</p>
                </div>
              </CardPicker>
            </RadioGroup>
          </fieldset>
        )}

        {shouldShowProtocol('IMAP') && (
          <StyledConnectionSection key="IMAP">
            <StyledSectionHeader>
              <StyledSectionTitle>{t`IMAP Configuration`}</StyledSectionTitle>
              <StyledSectionDescription>
                {t`Configure IMAP settings to receive and sync your emails.`}{' '}
                {t`Leave blank if you don't need to import emails.`}
              </StyledSectionDescription>
            </StyledSectionHeader>

            <Controller
              name="IMAP.host"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  ref={field.ref}
                  instanceId="imap-host-connection-form"
                  label={t`IMAP Server`}
                  placeholder={t`imap.example.com`}
                  name={field.name}
                  value={field.value || ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />

            <Controller
              name="IMAP.username"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  ref={field.ref}
                  instanceId="imap-username-connection-form"
                  label={t`IMAP Username (Optional)`}
                  placeholder={t`john.doe`}
                  type="text"
                  name={field.name}
                  value={field.value || ''}
                  required={false}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />

            <SettingsAccountsPasswordController
              key="IMAP"
              protocol="IMAP"
              label={t`IMAP Password`}
              control={control}
              disabled={isPasswordInputDisabled('IMAP')}
              onUnlock={() =>
                setIsProtocolPasswordBeingEdited((prev) => ({
                  ...prev,
                  IMAP: true,
                }))
              }
            />

            <StyledFieldRow>
              <StyledFieldGroup>
                <Controller
                  name="IMAP.port"
                  control={control}
                  render={({ field, fieldState }) => (
                    <SettingsTextInput
                      ref={field.ref}
                      instanceId="imap-port-connection-form"
                      label={t`IMAP Port`}
                      type="number"
                      placeholder="993"
                      name={field.name}
                      value={field?.value ? field.value : 993}
                      onChange={(value) =>
                        field.onChange(handlePortChange(value))
                      }
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </StyledFieldGroup>

              <StyledFieldGroup>
                <Controller
                  name="IMAP.connectionSecurity"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label={t`IMAP Connection security`}
                      options={[
                        { label: 'None', value: 'NONE' },
                        { label: 'STARTTLS', value: 'STARTTLS' },
                        { label: 'SSL/TLS', value: 'SSL_TLS' },
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                      dropdownId="imap-connection-security-dropdown"
                    />
                  )}
                />
              </StyledFieldGroup>
            </StyledFieldRow>
          </StyledConnectionSection>
        )}

        {shouldShowProtocol('SMTP') && (
          <StyledConnectionSection key="SMTP">
            <StyledSectionHeader>
              <StyledSectionTitle>{t`SMTP Configuration`}</StyledSectionTitle>
              <StyledSectionDescription>
                {t`Configure SMTP settings to send emails from your account.`}{' '}
                {t`Leave blank if you don't need to send emails.`}
              </StyledSectionDescription>
            </StyledSectionHeader>

            <Controller
              name="SMTP.host"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  ref={field.ref}
                  instanceId="smtp-host-connection-form"
                  label={t`SMTP Server`}
                  placeholder={t`smtp.example.com`}
                  name={field.name}
                  value={field.value || ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />

            <Controller
              name="SMTP.username"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  ref={field.ref}
                  instanceId="smtp-username-connection-form"
                  label={t`SMTP Username`}
                  placeholder={t`john.doe`}
                  type="text"
                  name={field.name}
                  value={field.value || ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />

            <SettingsAccountsPasswordController
              key="SMTP"
              protocol="SMTP"
              label={t`SMTP Password`}
              control={control}
              disabled={isPasswordInputDisabled('SMTP')}
              onUnlock={() =>
                setIsProtocolPasswordBeingEdited((prev) => ({
                  ...prev,
                  SMTP: true,
                }))
              }
            />

            <StyledFieldRow>
              <StyledFieldGroup>
                <Controller
                  name="SMTP.port"
                  control={control}
                  render={({ field, fieldState }) => (
                    <SettingsTextInput
                      ref={field.ref}
                      instanceId="smtp-port-connection-form"
                      label={t`SMTP Port`}
                      type="number"
                      placeholder="587"
                      name={field.name}
                      value={field?.value ? field.value : 587}
                      onChange={(value) =>
                        field.onChange(handlePortChange(value))
                      }
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </StyledFieldGroup>

              <StyledFieldGroup>
                <Controller
                  name="SMTP.connectionSecurity"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label={t`SMTP Connection security`}
                      options={[
                        { label: 'None', value: 'NONE' },
                        { label: 'STARTTLS', value: 'STARTTLS' },
                        { label: 'SSL/TLS', value: 'SSL_TLS' },
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                      dropdownId="smtp-connection-security-dropdown"
                    />
                  )}
                />
              </StyledFieldGroup>
            </StyledFieldRow>
          </StyledConnectionSection>
        )}

        {shouldShowProtocol('CALDAV') && (
          <StyledConnectionSection key="CALDAV">
            <StyledSectionHeader>
              <StyledSectionTitle>{t`CalDAV Configuration`}</StyledSectionTitle>
              <StyledSectionDescription>
                {t`Configure CalDAV settings to sync your calendar events.`}{' '}
                {t`Leave blank if you don't need calendar sync.`}
              </StyledSectionDescription>
            </StyledSectionHeader>

            <Controller
              name="CALDAV.host"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  ref={field.ref}
                  instanceId="caldav-host-connection-form"
                  label={t`CalDAV Server`}
                  placeholder={t`caldav.example.com`}
                  name={field.name}
                  value={field.value || ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />

            <Controller
              name="CALDAV.username"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  ref={field.ref}
                  instanceId="caldav-username-connection-form"
                  label={t`CalDAV Username`}
                  placeholder={t`john.doe`}
                  name={field.name}
                  required={false}
                  value={field.value || ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />

            <SettingsAccountsPasswordController
              key="CALDAV"
              protocol="CALDAV"
              label={t`CalDAV Password`}
              control={control}
              disabled={isPasswordInputDisabled('CALDAV')}
              onUnlock={() =>
                setIsProtocolPasswordBeingEdited((prev) => ({
                  ...prev,
                  CALDAV: true,
                }))
              }
            />
          </StyledConnectionSection>
        )}
      </StyledFormContainer>
    </Section>
  );
};

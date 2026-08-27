import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import { type ManagedEmailProposalInput } from '~/generated-metadata/graphql';

type ManagedEmailCreateFlowProps = {
  initialAcquisitionMode?: ManagedEmailCreationMode;
  onBack: () => void;
  onSubmit: (input: ManagedEmailProposalInput) => void;
};

type PersonaDraft = ManagedEmailProposalInput['personas'][number];

type ManagedEmailCreationMode = 'NEW_MANAGED' | 'CUSTOMER_OWNED_DOMAIN_IMPORT';

const emptyPersona = (): PersonaDraft => ({
  displayName: '',
  localPartPreference: '',
  roleTitle: '',
  signature: '',
});

export const ManagedEmailCreateFlow = ({
  initialAcquisitionMode = 'NEW_MANAGED',
  onBack,
  onSubmit,
}: ManagedEmailCreateFlowProps) => {
  const { t } = useLingui();
  const [mailboxCount, setMailboxCount] = useState(1);
  const [personas, setPersonas] = useState<PersonaDraft[] | null>(null);
  const [acquisitionMode, setAcquisitionMode] =
    useState<ManagedEmailCreationMode>(initialAcquisitionMode);
  const [customerOwnedDomain, setCustomerOwnedDomain] = useState('');
  const [hasAcknowledgedNameserverChange, setHasAcknowledgedNameserverChange] =
    useState(false);
  const isCustomerOwnedDomain =
    acquisitionMode === 'CUSTOMER_OWNED_DOMAIN_IMPORT';
  const normalizedCustomerOwnedDomain = customerOwnedDomain
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  const mailboxCountIsValid =
    Number.isSafeInteger(mailboxCount) &&
    mailboxCount >= 1 &&
    mailboxCount <= 50;

  const beginPersonas = () => {
    if (!mailboxCountIsValid) {
      return;
    }

    setPersonas(Array.from({ length: mailboxCount }, emptyPersona));
  };

  const updatePersona = (
    index: number,
    field: keyof PersonaDraft,
    value: string,
  ) => {
    setPersonas(
      (current) =>
        current?.map((persona, personaIndex) =>
          personaIndex === index ? { ...persona, [field]: value } : persona,
        ) ?? null,
    );
  };

  const isComplete =
    personas !== null &&
    personas.every(
      (persona) =>
        persona.displayName.trim() !== '' &&
        persona.localPartPreference.trim() !== '' &&
        persona.signature.trim() !== '',
    ) &&
    (!isCustomerOwnedDomain ||
      (normalizedCustomerOwnedDomain !== '' &&
        hasAcknowledgedNameserverChange));
  return (
    <Section>
      <H2Title
        title={
          isCustomerOwnedDomain
            ? t`Use a domain I own`
            : t`Create and warm new mailboxes`
        }
        description={
          isCustomerOwnedDomain
            ? t`Choose the complete initial mailbox set for a domain your workspace owns.`
            : t`Start with the mailbox count, then review the proposed identities before purchase.`
        }
      />
      {personas === null ? (
        <>
          {isCustomerOwnedDomain ? (
            <>
              <SettingsTextInput
                instanceId="managed-email-customer-owned-domain"
                label={t`Customer-owned domain`}
                value={customerOwnedDomain}
                onChange={setCustomerOwnedDomain}
              />
              <Button
                title={t`Buy domain`}
                variant="secondary"
                onClick={() => {
                  setAcquisitionMode('NEW_MANAGED');
                  setHasAcknowledgedNameserverChange(false);
                }}
              />
            </>
          ) : (
            <Button
              title={t`Use a domain I own`}
              variant="secondary"
              onClick={() => setAcquisitionMode('CUSTOMER_OWNED_DOMAIN_IMPORT')}
            />
          )}
          <SettingsTextInput
            instanceId="managed-email-mailbox-count"
            label={t`Mailbox count`}
            type="number"
            min={1}
            max={50}
            value={String(mailboxCount)}
            onChange={(value) => setMailboxCount(Number(value))}
          />
          <Button
            title={t`Continue`}
            variant="primary"
            disabled={
              !mailboxCountIsValid ||
              (isCustomerOwnedDomain && normalizedCustomerOwnedDomain === '')
            }
            onClick={beginPersonas}
          />
        </>
      ) : (
        <>
          {personas.map((persona, index) => {
            const position = index + 1;

            return (
              <fieldset key={position}>
                <legend>{t`Mailbox ${position}`}</legend>
                <SettingsTextInput
                  instanceId={`managed-email-display-name-${position}`}
                  label={t`Display name ${position}`}
                  value={persona.displayName}
                  onChange={(value) =>
                    updatePersona(index, 'displayName', value)
                  }
                />
                <SettingsTextInput
                  instanceId={`managed-email-role-title-${position}`}
                  label={t`Role title ${position}`}
                  value={persona.roleTitle ?? ''}
                  onChange={(value) => updatePersona(index, 'roleTitle', value)}
                />
                <SettingsTextInput
                  instanceId={`managed-email-local-part-${position}`}
                  label={t`Preferred address ${position}`}
                  value={persona.localPartPreference}
                  onChange={(value) =>
                    updatePersona(index, 'localPartPreference', value)
                  }
                />
                <SettingsTextInput
                  instanceId={`managed-email-signature-${position}`}
                  label={t`Signature ${position}`}
                  value={persona.signature}
                  onChange={(value) => updatePersona(index, 'signature', value)}
                />
              </fieldset>
            );
          })}
          {isCustomerOwnedDomain && (
            <>
              <p>
                {t`Include every mailbox you need now. You cannot add mailboxes later.`}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={hasAcknowledgedNameserverChange}
                  onChange={() =>
                    setHasAcknowledgedNameserverChange(
                      (isAcknowledged) => !isAcknowledged,
                    )
                  }
                />
                {t` I understand that I must update my registrar nameservers after purchase.`}
              </label>
            </>
          )}
          <Button
            title={t`Review proposal`}
            variant="primary"
            disabled={!isComplete}
            onClick={() =>
              onSubmit({
                mailboxCount,
                personas,
                ...(isCustomerOwnedDomain
                  ? {
                      acquisitionMode,
                      customerOwnedDomain: normalizedCustomerOwnedDomain,
                    }
                  : {}),
              })
            }
          />
          <Button
            title={t`Change mailbox count`}
            variant="secondary"
            onClick={() => setPersonas(null)}
          />
        </>
      )}
      <Button title={t`Back`} variant="secondary" onClick={onBack} />
    </Section>
  );
};

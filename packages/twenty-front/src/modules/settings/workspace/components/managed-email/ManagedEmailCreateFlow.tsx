import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import { type ManagedEmailProposalInput } from '~/generated-metadata/graphql';

type ManagedEmailCreateFlowProps = {
  onBack: () => void;
  onSubmit: (input: ManagedEmailProposalInput) => void;
};

type PersonaDraft = ManagedEmailProposalInput['personas'][number];

const emptyPersona = (): PersonaDraft => ({
  displayName: '',
  localPartPreference: '',
  roleTitle: '',
  signature: '',
});

export const ManagedEmailCreateFlow = ({
  onBack,
  onSubmit,
}: ManagedEmailCreateFlowProps) => {
  const { t } = useLingui();
  const [mailboxCount, setMailboxCount] = useState(1);
  const [personas, setPersonas] = useState<PersonaDraft[] | null>(null);

  const beginPersonas = () => {
    const safeCount = Math.min(50, Math.max(1, mailboxCount));

    setMailboxCount(safeCount);
    setPersonas(Array.from({ length: safeCount }, emptyPersona));
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
    );

  return (
    <Section>
      <H2Title
        title={t`Create and warm new mailboxes`}
        description={t`Start with the mailbox count, then review the proposed identities before purchase.`}
      />
      {personas === null ? (
        <>
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
          <Button
            title={t`Review proposal`}
            variant="primary"
            disabled={!isComplete}
            onClick={() =>
              onSubmit({
                mailboxCount,
                personas,
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

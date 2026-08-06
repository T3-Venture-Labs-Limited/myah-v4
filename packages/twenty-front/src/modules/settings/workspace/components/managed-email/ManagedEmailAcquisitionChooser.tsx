import { useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';

type ManagedEmailAcquisitionChooserProps = {
  acquisitionAvailable: boolean;
  canPurchase: boolean;
  onChoosePrewarmed: () => void;
  onCreateManaged: () => void;
  onConnectExisting: () => void;
};

export const ManagedEmailAcquisitionChooser = ({
  acquisitionAvailable,
  canPurchase,
  onChoosePrewarmed,
  onCreateManaged,
  onConnectExisting,
}: ManagedEmailAcquisitionChooserProps) => {
  const { t } = useLingui();

  return (
    <Section>
      <H2Title
        title={t`Add mailboxes`}
        description={t`Choose managed mailboxes or connect mailboxes your workspace already owns.`}
      />
      {canPurchase && acquisitionAvailable ? (
        <>
          <Button
            title={t`Get prewarmed mailboxes`}
            variant="secondary"
            onClick={onChoosePrewarmed}
          />
          <Button
            title={t`Create and warm new mailboxes`}
            variant="secondary"
            onClick={onCreateManaged}
          />
        </>
      ) : !canPurchase ? (
        <p>{t`A workspace billing admin must purchase managed mailboxes.`}</p>
      ) : (
        <p>{t`Managed mailbox acquisition is not available right now.`}</p>
      )}
      <Button
        title={t`Connect existing mailboxes`}
        variant="secondary"
        onClick={onConnectExisting}
      />
    </Section>
  );
};

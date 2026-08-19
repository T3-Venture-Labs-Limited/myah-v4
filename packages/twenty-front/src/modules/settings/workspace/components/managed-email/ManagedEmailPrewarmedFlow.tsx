import { useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import { type ManagedEmailBundle } from '~/generated-metadata/graphql';

type ManagedEmailPrewarmedFlowProps = {
  bundles: ManagedEmailBundle[];
  onBack: () => void;
  onChooseBundle: (bundle: ManagedEmailBundle) => void;
  onUseOrdinary: () => void;
};

export const ManagedEmailPrewarmedFlow = ({
  bundles,
  onBack,
  onChooseBundle,
  onUseOrdinary,
}: ManagedEmailPrewarmedFlowProps) => {
  const { t } = useLingui();

  return (
    <Section>
      <H2Title
        title={t`Prewarmed mailboxes`}
        description={t`Choose a complete domain bundle. Mailbox identities in a bundle are fixed.`}
      />
      {bundles.length === 0 ? (
        <>
          <p>{t`No prewarmed bundles are available right now.`}</p>
          <strong>{t`Recommended`}</strong>
          <Button
            title={t`Create and warm new mailboxes`}
            variant="primary"
            onClick={onUseOrdinary}
          />
        </>
      ) : (
        bundles.map((bundle) => (
          <article key={bundle.bundleId}>
            <h3>{bundle.domain}</h3>
            <p>
              {bundle.mailboxCount} {t`mailboxes`}
            </p>
            {bundle.exclusiveWorkspaceUse && (
              <p>{t`Exclusive to your workspace`}</p>
            )}
            <ul>
              {bundle.mailboxes.map((mailbox) => (
                <li key={mailbox.address}>
                  <strong>{mailbox.displayName}</strong> — {mailbox.address}
                </li>
              ))}
            </ul>
            <Button
              title={t`Select whole bundle`}
              variant="secondary"
              onClick={() => onChooseBundle(bundle)}
            />
          </article>
        ))
      )}
      <Button title={t`Back`} variant="tertiary" onClick={onBack} />
    </Section>
  );
};

import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

export const CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID =
  'creator-bulk-relationship-target-name';

type CreatorBulkRelationshipTargetNameDialogProps = {
  initialName: string;
  kind: 'creator-list' | 'campaign';
  onCreate: (targetName: string) => Promise<void>;
  onClose: () => void;
};

export const CreatorBulkRelationshipTargetNameDialog = ({
  initialName,
  kind,
  onCreate,
  onClose,
}: CreatorBulkRelationshipTargetNameDialogProps) => {
  const { closeModal } = useModal();
  const [targetName, setTargetName] = useState(initialName);
  const [isCreating, setIsCreating] = useState(false);
  const targetLabel = kind === 'creator-list' ? t`list` : t`campaign`;
  const title = t`Create new ${targetLabel}`;
  const trimmedTargetName = targetName.trim();

  useEffect(() => {
    setTargetName(initialName);
  }, [initialName]);

  const handleClose = () => {
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID);
    onClose();
  };

  const handleCreate = async () => {
    if (!trimmedTargetName || isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      await onCreate(trimmedTargetName);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID}
      onClose={onClose}
      onEnter={handleCreate}
      isClosable
      padding="large"
      overlay="dark"
      dataGloballyPreventClickOutside
      narrowWidth
      autoHeight
    >
      <H1Title title={title} fontColor={H1TitleFontColor.Primary} />
      <SettingsTextInput
        instanceId="creator-bulk-relationship-target-name"
        value={targetName}
        onChange={setTargetName}
        placeholder={t`${targetLabel} name`}
        onInputEnter={handleCreate}
        autoFocusOnMount
      />
      <Button
        title={t`Cancel`}
        variant="secondary"
        onClick={handleClose}
        fullWidth
      />
      <Button
        title={t`Create ${targetLabel}`}
        ariaLabel={t`Create ${targetLabel}`}
        variant="primary"
        accent="brand"
        onClick={handleCreate}
        disabled={!trimmedTargetName || isCreating}
        fullWidth
      />
    </ModalStatefulWrapper>
  );
};

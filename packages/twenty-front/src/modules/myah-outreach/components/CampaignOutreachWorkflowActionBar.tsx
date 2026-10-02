import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

const StyledActionBar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
  min-width: 0;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;

    > * {
      min-width: 0;
      width: 100%;
    }

    > :last-child {
      grid-column: 1 / -1;
    }
  }
`;

type CampaignOutreachWorkflowActionBarProps = {
  dirty: boolean;
  editable: boolean;
  onReload: () => Promise<void>;
  onReview: () => void;
  onSave: () => Promise<void>;
  onPublish?: () => Promise<void>;
  publishAllowed?: boolean;
  publishing?: boolean;
  reviewAllowed: boolean;
  saveAllowed: boolean;
  saving: boolean;
};

export const CampaignOutreachWorkflowActionBar = ({
  dirty,
  editable,
  onReload,
  onReview,
  onSave,
  onPublish = async () => undefined,
  publishAllowed = false,
  publishing = false,
  reviewAllowed,
  saveAllowed,
  saving,
}: CampaignOutreachWorkflowActionBarProps) => (
  <StyledActionBar>
    <Button
      accent="brand"
      ariaLabel="Save draft"
      disabled={!editable || !dirty || !saveAllowed || saving || publishing}
      isLoading={saving}
      onClick={() => void onSave()}
      title="Save draft"
      variant="primary"
    />
    <Button
      ariaLabel="Reload from server"
      disabled={saving || publishing}
      onClick={() => void onReload()}
      title="Reload from server"
      variant="secondary"
    />
    <Button
      ariaLabel="Review"
      disabled={!reviewAllowed || saving || publishing}
      onClick={onReview}
      title="Review sequence"
      variant="secondary"
    />
    <Button
      accent="brand"
      ariaLabel="Publish"
      disabled={!publishAllowed || saving || publishing}
      isLoading={publishing}
      onClick={() => void onPublish()}
      title="Publish"
      variant="primary"
    />
    <Button
      ariaLabel="Send test"
      disabled
      title="Campaign test integration unavailable"
      variant="secondary"
    />
  </StyledActionBar>
);

import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledActionBar = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
  details {
    position: relative;
  }
  summary {
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    cursor: pointer;
    padding: ${themeCssVariables.spacing[2]};
  }
`;
const StyledMenu = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 210px;
  padding: ${themeCssVariables.spacing[2]};
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 3;
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
    <span role="status">
      {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Draft saved'}
    </span>
    <details>
      <summary>Sequence actions</summary>
      <StyledMenu>
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
      </StyledMenu>
    </details>
  </StyledActionBar>
);

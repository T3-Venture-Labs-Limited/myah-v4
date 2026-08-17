import {
  AnimatedPlaceholder,
  AnimatedPlaceholderEmptyContainer,
  AnimatedPlaceholderEmptySubTitle,
  AnimatedPlaceholderEmptyTextContainer,
  AnimatedPlaceholderEmptyTitle,
} from 'twenty-ui/feedback';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';

type CampaignOutreachEmptyStateProps = {
  isCreating: boolean;
  onCreate: () => Promise<void>;
};

export const CampaignOutreachEmptyState = ({
  isCreating,
  onCreate,
}: CampaignOutreachEmptyStateProps) => {
  return (
    <AnimatedPlaceholderEmptyContainer>
      <AnimatedPlaceholder type="noRecord" />
      <AnimatedPlaceholderEmptyTextContainer>
        <AnimatedPlaceholderEmptyTitle>
          No outreach workflow yet
        </AnimatedPlaceholderEmptyTitle>
        <AnimatedPlaceholderEmptySubTitle>
          Create the Campaign's dedicated outreach workflow to configure its
          automation.
        </AnimatedPlaceholderEmptySubTitle>
      </AnimatedPlaceholderEmptyTextContainer>
      <Button
        ariaLabel="Create outreach workflow"
        Icon={IconPlus}
        disabled={isCreating}
        isLoading={isCreating}
        onClick={() => void onCreate()}
        title="Create outreach workflow"
        variant="secondary"
      />
    </AnimatedPlaceholderEmptyContainer>
  );
};

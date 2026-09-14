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
}: CampaignOutreachEmptyStateProps) => (
  <AnimatedPlaceholderEmptyContainer>
    <AnimatedPlaceholder type="noRecord" />
    <AnimatedPlaceholderEmptyTextContainer>
      <AnimatedPlaceholderEmptyTitle>
        No Campaign sequence yet
      </AnimatedPlaceholderEmptyTitle>
      <AnimatedPlaceholderEmptySubTitle>
        Create an empty restricted Email/Instagram sequence. Nothing is created
        by viewing this tab.
      </AnimatedPlaceholderEmptySubTitle>
    </AnimatedPlaceholderEmptyTextContainer>
    <Button
      Icon={IconPlus}
      ariaLabel="Create Campaign sequence"
      disabled={isCreating}
      isLoading={isCreating}
      onClick={() => void onCreate()}
      title="Create Campaign sequence"
      variant="secondary"
    />
  </AnimatedPlaceholderEmptyContainer>
);

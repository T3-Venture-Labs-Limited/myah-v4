import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CampaignOutreachEmptyState } from '@/myah-outreach/components/CampaignOutreachEmptyState';

describe('CampaignOutreachEmptyState', () => {
  it('offers only the Campaign-scoped workflow creation action', async () => {
    const onCreate = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<CampaignOutreachEmptyState isCreating={false} onCreate={onCreate} />);

    await user.click(
      screen.getByRole('button', { name: 'Create outreach workflow' }),
    );

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/copy general/i)).not.toBeInTheDocument();
  });

  it('keeps the creation action disabled while creating', () => {
    render(<CampaignOutreachEmptyState isCreating onCreate={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Create outreach workflow' }),
    ).toBeDisabled();
  });
});

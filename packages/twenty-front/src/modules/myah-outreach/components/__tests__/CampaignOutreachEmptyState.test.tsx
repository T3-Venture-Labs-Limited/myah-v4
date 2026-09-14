import { fireEvent, render, screen } from '@testing-library/react';

import { CampaignOutreachEmptyState } from '@/myah-outreach/components/CampaignOutreachEmptyState';

describe('CampaignOutreachEmptyState', () => {
  it('explains that viewing is write-free and creates only explicitly', () => {
    const onCreate = jest.fn().mockResolvedValue(undefined);
    render(
      <CampaignOutreachEmptyState isCreating={false} onCreate={onCreate} />,
    );

    expect(
      screen.getByText(/Nothing is created by viewing this tab/i),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Campaign sequence' }),
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/copy general/i)).not.toBeInTheDocument();
  });

  it('keeps the creation action disabled while creating', () => {
    render(<CampaignOutreachEmptyState isCreating onCreate={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Create Campaign sequence' }),
    ).toBeDisabled();
  });
});

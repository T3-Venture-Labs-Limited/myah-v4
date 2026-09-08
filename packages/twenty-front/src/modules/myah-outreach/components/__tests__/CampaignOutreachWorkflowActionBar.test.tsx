import { fireEvent, render, screen } from '@testing-library/react';

import { CampaignOutreachWorkflowActionBar } from '@/myah-outreach/components/CampaignOutreachWorkflowActionBar';

describe('CampaignOutreachWorkflowActionBar', () => {
  it('offers explicit draft save and reload without generic Activate or Test', () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onReload = jest.fn().mockResolvedValue(undefined);
    render(
      <CampaignOutreachWorkflowActionBar
        dirty
        editable
        onReload={onReload}
        onReview={jest.fn()}
        onSave={onSave}
        reviewAllowed
        saveAllowed
        saving={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload from server' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Activate' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Test' }),
    ).not.toBeInTheDocument();
  });

  it('allows local review while launch and test integrations remain disabled', () => {
    const onReview = jest.fn();
    render(
      <CampaignOutreachWorkflowActionBar
        dirty={false}
        editable
        onReload={jest.fn()}
        onReview={onReview}
        onSave={jest.fn()}
        reviewAllowed
        saveAllowed
        saving={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
    expect(
      screen.getByText('Campaign launch integration unavailable'),
    ).toBeVisible();
    expect(
      screen.getByText('Campaign test integration unavailable'),
    ).toBeVisible();
  });

  it('disables save for read-only, clean, unsafe, and in-flight states', () => {
    const { rerender } = render(
      <CampaignOutreachWorkflowActionBar
        dirty
        editable={false}
        onReload={jest.fn()}
        onReview={jest.fn()}
        onSave={jest.fn()}
        reviewAllowed={false}
        saveAllowed
        saving={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

    rerender(
      <CampaignOutreachWorkflowActionBar
        dirty
        editable
        onReload={jest.fn()}
        onReview={jest.fn()}
        onSave={jest.fn()}
        reviewAllowed={false}
        saveAllowed={false}
        saving={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });
});

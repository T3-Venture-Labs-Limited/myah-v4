import { render, screen } from '@testing-library/react';
import { MyahCampaignOfferPreview } from '@/page-layout/components/MyahCampaignOfferPreview';

it('shows the planned offer shape without accepting unsaved or unauthorized commercial terms', () => {
  render(<MyahCampaignOfferPreview />);
  expect(
    screen.getByRole('region', { name: 'Partnership offer layout preview' }),
  ).toBeVisible();
  expect(screen.getByText(/These offer fields do not save yet/)).toBeVisible();
  expect(
    screen.getByRole('textbox', { name: 'Collaboration summary' }),
  ).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Fixed fee' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Usage rights' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Payment terms' })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: /approve|accept|pay/i }),
  ).not.toBeInTheDocument();
});

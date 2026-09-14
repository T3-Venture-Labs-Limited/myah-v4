import { render, screen } from '@testing-library/react';

import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';

jest.mock('@/navigation/hooks/useNavigationDrawerExpanded', () => ({
  useNavigationDrawerExpanded: () => true,
}));

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => true,
}));

describe('PageCardHeader', () => {
  it('renders opted-in mobile title content after its leading action', () => {
    render(
      <PageCardHeader
        leadingAction={<button type="button">Back to Creator Lists</button>}
        icon={<span>Creator icon</span>}
        title={<span>List A</span>}
        showTitleOnMobile
      />,
    );

    const back = screen.getByRole('button', { name: 'Back to Creator Lists' });
    const icon = screen.getByText('Creator icon');
    const title = screen.getByText('List A');

    expect(back.compareDocumentPosition(icon)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(icon.compareDocumentPosition(title)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

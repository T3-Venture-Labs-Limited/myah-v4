import { render, screen } from '@testing-library/react';

import { PageLayoutRenderer } from '@/page-layout/components/PageLayoutRenderer';
import { PageLayoutType } from '~/generated-metadata/graphql';

const useLayoutRenderingContext = jest.fn();

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => useLayoutRenderingContext(),
}));
jest.mock(
  '@/page-layout/components/PageLayoutInitializationQueryEffect',
  () => ({
    PageLayoutInitializationQueryEffect: () => null,
  }),
);
jest.mock('@/page-layout/components/PageLayoutRendererContent', () => ({
  PageLayoutRendererContent: () => <div>retained record layout renderer</div>,
}));

describe('PageLayoutRenderer dashboard retirement boundary', () => {
  it('does not mount editor effects for a historical Dashboard layout', () => {
    useLayoutRenderingContext.mockReturnValue({
      layoutType: PageLayoutType.DASHBOARD,
      targetRecordIdentifier: {
        id: 'historical-dashboard-id',
        targetObjectNameSingular: 'dashboard',
      },
    });

    render(<PageLayoutRenderer pageLayoutId="historical-dashboard-layout" />);

    expect(
      screen.getByText('Dashboards are no longer available.'),
    ).toBeVisible();
    expect(
      screen.queryByText('retained record layout renderer'),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['Creator', 'creator'],
    ['Creator List', 'creatorList'],
    ['Campaign', 'campaign'],
  ])('keeps the %s record-layout renderer available', (_label, objectName) => {
    useLayoutRenderingContext.mockReturnValue({
      layoutType: PageLayoutType.RECORD_PAGE,
      targetRecordIdentifier: {
        id: `${objectName}-id`,
        targetObjectNameSingular: objectName,
      },
    });

    render(<PageLayoutRenderer pageLayoutId={`${objectName}-layout`} />);

    expect(screen.getByText('retained record layout renderer')).toBeVisible();
  });
});

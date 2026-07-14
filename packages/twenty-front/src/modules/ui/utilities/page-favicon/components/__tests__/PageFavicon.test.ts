import { PageFavicon } from '@/ui/utilities/page-favicon/components/PageFavicon';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({
    logo: 'workspace-logos/acme.png',
  }),
}));

describe('PageFavicon', () => {
  it('uses the Myah favicon even when the workspace has a logo', () => {
    const pageFavicon = PageFavicon();

    expect(pageFavicon.props.children.props.href).toBe(
      '/images/brand/myah-favicon.png',
    );
  });
});

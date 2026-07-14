import {
  DEFAULT_PAGE_FAVICON,
  getPageFaviconUrl,
} from '@/ui/utilities/page-favicon/components/PageFavicon';

jest.mock('~/config', () => ({
  REACT_APP_SERVER_BASE_URL: 'https://example.com',
}));

describe('getPageFaviconUrl', () => {
  it('uses the dedicated circular Myah favicon when no workspace logo exists', () => {
    expect(getPageFaviconUrl()).toBe(DEFAULT_PAGE_FAVICON);
  });

  it('keeps a customer workspace logo ahead of the Myah favicon fallback', () => {
    expect(getPageFaviconUrl('workspace-logos/acme.png')).toBe(
      'https://example.com/files/workspace-logos/acme.png',
    );
  });
});

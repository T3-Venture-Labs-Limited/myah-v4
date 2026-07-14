import { Helmet } from '@dr.pogodin/react-helmet';

export const DEFAULT_PAGE_FAVICON = '/images/brand/myah-favicon.png';

export const PageFavicon = () => {
  return (
    <Helmet>
      <link rel="icon" type="image/png" href={DEFAULT_PAGE_FAVICON} />
    </Helmet>
  );
};

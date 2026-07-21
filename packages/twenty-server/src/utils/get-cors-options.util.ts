import {
  type CorsOptions,
  type CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';

type GetCorsOptionsInput = {
  getFrontendUrl: () => string | undefined;
  getServerUrl: () => string;
};

type CorsRequest = {
  headers: {
    origin?: string;
  };
};

export const getCorsOptions = ({
  getFrontendUrl,
  getServerUrl,
}: GetCorsOptionsInput): CorsOptionsDelegate<CorsRequest> => {
  let configuredUrl: string | undefined;
  let frontendUrl: URL | undefined;
  const frontendOptions: CorsOptions = {
    credentials: true,
    exposedHeaders: ['WWW-Authenticate'],
    origin: true,
  };
  const otherBrowserClientOptions: CorsOptions = {
    exposedHeaders: ['WWW-Authenticate'],
    origin: true,
  };

  return (request, callback) => {
    const currentConfiguredUrl = getFrontendUrl() ?? getServerUrl();

    if (configuredUrl !== currentConfiguredUrl) {
      let nextFrontendUrl: URL | undefined;

      try {
        nextFrontendUrl = new URL(currentConfiguredUrl);
      } catch {
        nextFrontendUrl = undefined;
      }

      configuredUrl = currentConfiguredUrl;
      frontendUrl = nextFrontendUrl;
    }

    const requestOrigin = request.headers.origin;
    let isFrontendOrigin = false;

    if (requestOrigin !== undefined && frontendUrl !== undefined) {
      try {
        const requestUrl = new URL(requestOrigin);

        isFrontendOrigin =
          requestUrl.origin === requestOrigin &&
          requestUrl.protocol === frontendUrl.protocol &&
          requestUrl.port === frontendUrl.port &&
          (requestUrl.hostname === frontendUrl.hostname ||
            requestUrl.hostname.endsWith(`.${frontendUrl.hostname}`));
      } catch {
        isFrontendOrigin = false;
      }
    }

    callback(
      null,
      isFrontendOrigin ? frontendOptions : otherBrowserClientOptions,
    );
  };
};

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
  let frontendOrigin: string | undefined;
  let frontendOptions: CorsOptions | undefined;
  const otherBrowserClientOptions: CorsOptions = {
    exposedHeaders: ['WWW-Authenticate'],
    origin: true,
  };

  return (request, callback) => {
    const currentConfiguredUrl = getFrontendUrl() ?? getServerUrl();

    if (
      frontendOptions === undefined ||
      configuredUrl !== currentConfiguredUrl
    ) {
      configuredUrl = currentConfiguredUrl;
      frontendOrigin = new URL(currentConfiguredUrl).origin;
      frontendOptions = {
        credentials: true,
        exposedHeaders: ['WWW-Authenticate'],
        origin: frontendOrigin,
      };
    }

    callback(
      null,
      request.headers.origin === frontendOrigin
        ? frontendOptions
        : otherBrowserClientOptions,
    );
  };
};

import {
  type CorsOptions,
  type CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';

type GetCorsOptionsInput = {
  frontendUrl: string | undefined;
  serverUrl: string;
};

type CorsRequest = {
  headers: {
    origin?: string;
  };
};

export const getCorsOptions = ({
  frontendUrl,
  serverUrl,
}: GetCorsOptionsInput): CorsOptionsDelegate<CorsRequest> => {
  const frontendOrigin = new URL(frontendUrl ?? serverUrl).origin;
  const frontendOptions: CorsOptions = {
    credentials: true,
    exposedHeaders: ['WWW-Authenticate'],
    origin: frontendOrigin,
  };
  const otherBrowserClientOptions: CorsOptions = {
    exposedHeaders: ['WWW-Authenticate'],
    origin: true,
  };

  return (request, callback) => {
    callback(
      null,
      request.headers.origin === frontendOrigin
        ? frontendOptions
        : otherBrowserClientOptions,
    );
  };
};

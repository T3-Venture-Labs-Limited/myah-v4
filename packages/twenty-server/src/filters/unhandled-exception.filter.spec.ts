import {
  type ArgumentsHost,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';

import { captureException } from '@sentry/nestjs';

import { UnhandledExceptionFilter } from 'src/filters/unhandled-exception.filter';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  SentryExceptionCaptured:
    () =>
    (
      _target: object,
      _propertyKey: string | symbol,
      descriptor: PropertyDescriptor,
    ) =>
      descriptor,
}));

const mockedCaptureException = jest.mocked(captureException);

const createHost = (type: string = 'http') => {
  const response = {
    header: jest.fn(),
    headersSent: false,
    json: jest.fn(),
    status: jest.fn(),
  };

  response.status.mockReturnValue(response);

  return {
    host: {
      getType: () => type,
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost,
    response,
  };
};

describe('UnhandledExceptionFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves CORS headers already applied by middleware', () => {
    const { host, response } = createHost();

    new UnhandledExceptionFilter().catch(
      new HttpException({ message: 'Invalid request' }, 400),
      host,
    );

    expect(response.header).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Invalid request',
    });
  });

  it.each([
    new Error('plain failure'),
    new InternalServerErrorException('server failure'),
  ])('captures unexpected HTTP exceptions', (exception) => {
    const { host } = createHost();

    new UnhandledExceptionFilter().catch(exception, host);

    expect(mockedCaptureException).toHaveBeenCalledWith(exception);
  });

  it('does not capture expected HTTP exceptions', () => {
    const { host } = createHost();

    new UnhandledExceptionFilter().catch(
      new HttpException('invalid request', 400),
      host,
    );

    expect(mockedCaptureException).not.toHaveBeenCalled();
  });

  it('leaves GraphQL exceptions on the existing GraphQL capture path', () => {
    const { host } = createHost('graphql');

    new UnhandledExceptionFilter().catch(new Error('resolver failure'), host);

    expect(mockedCaptureException).not.toHaveBeenCalled();
  });
});

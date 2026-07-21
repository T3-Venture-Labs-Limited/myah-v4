import { type ArgumentsHost, HttpException } from '@nestjs/common';

import { UnhandledExceptionFilter } from 'src/filters/unhandled-exception.filter';

describe('UnhandledExceptionFilter', () => {
  it('preserves CORS headers already applied by middleware', () => {
    const response = {
      header: jest.fn(),
      headersSent: false,
      json: jest.fn(),
      status: jest.fn(),
    };

    response.status.mockReturnValue(response);

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

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
});

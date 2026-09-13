import { SendEmailCommand } from '@aws-sdk/client-sesv2';

import { type AwsSesClientProvider } from 'src/engine/core-modules/emailing-domain/drivers/aws-ses/providers/aws-ses-client.provider';
import { type AwsSesHandleErrorService } from 'src/engine/core-modules/emailing-domain/drivers/aws-ses/services/aws-ses-handle-error.service';
import { AwsSesSendEmailService } from 'src/engine/core-modules/emailing-domain/drivers/aws-ses/services/aws-ses-send-email.service';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import {
  EmailingDomainDriverException,
  EmailingDomainDriverExceptionCode,
} from 'src/engine/core-modules/emailing-domain/drivers/exceptions/emailing-domain-driver.exception';

describe('AwsSesSendEmailService', () => {
  const baseInput = {
    workspaceId: 'ws1',
    domain: 'mail.example.com',
    from: 'noreply@mail.example.com',
    to: ['user@example.com'],
    subject: 'Hello',
    text: 'World',
  };

  const baseContext = {
    tenantName: 'twenty-workspace-ws1',
    configurationSetName: 'twenty-workspace-ws1',
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const setUp = () => {
    const send = jest.fn();
    const clientProvider = {
      getSESClient: () => ({ send }),
    } as unknown as AwsSesClientProvider;
    const handleErrorService = {
      handleAwsSesError: jest.fn((error) => {
        throw error;
      }),
    } as unknown as AwsSesHandleErrorService;
    const service = new AwsSesSendEmailService(
      clientProvider,
      handleErrorService,
    );

    return { service, send, handleErrorService };
  };

  it('should call SendEmail with tenant and config set', async () => {
    const { service, send } = setUp();

    send.mockResolvedValue({ MessageId: 'msg-1' });
    const abortController = new AbortController();
    const abortControllerSpy = jest
      .spyOn(global, 'AbortController')
      .mockImplementation(() => abortController);

    const result = await service.sendEmail(baseInput, baseContext);

    expect(abortControllerSpy).toHaveBeenCalledTimes(1);
    expect(result.messageId).toBe('msg-1');

    const [command, options] = send.mock.calls[0];

    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(options).toEqual({ abortSignal: expect.any(AbortSignal) });
    expect(options.abortSignal).toBe(abortController.signal);
    expect(options.abortSignal.aborted).toBe(false);
    expect(command.input).toMatchObject({
      FromEmailAddress: 'noreply@mail.example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      ConfigurationSetName: 'twenty-workspace-ws1',
      TenantName: 'twenty-workspace-ws1',
    });
    expect(command.input.ListManagementOptions).toBeUndefined();
    expect(command.input.EmailTags).toEqual(
      expect.arrayContaining([
        { Name: 'workspace', Value: 'ws1' },
        { Name: 'domain', Value: 'mail.example.com' },
      ]),
    );
  });

  it('aborts and rejects a pending SES request at the absolute deadline', async () => {
    jest.useFakeTimers();
    const { service, send, handleErrorService } = setUp();
    let suppliedSignal: AbortSignal | undefined;

    send.mockImplementation((_command, options) => {
      suppliedSignal = options.abortSignal;

      return new Promise((_resolve, reject) => {
        suppliedSignal?.addEventListener(
          'abort',
          () => reject(suppliedSignal?.reason),
          { once: true },
        );
      });
    });

    const sendPromise = service.sendEmail(baseInput, baseContext);
    const rejection = expect(sendPromise).rejects.toThrow(
      `SES request exceeded ${OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS}ms`,
    );

    await jest.advanceTimersByTimeAsync(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS - 1,
    );
    expect(suppliedSignal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);

    expect(suppliedSignal?.aborted).toBe(true);
    await rejection;
    expect(handleErrorService.handleAwsSesError).toHaveBeenCalledTimes(1);
  });

  it('should throw when SES returns no MessageId', async () => {
    const { service, send } = setUp();

    send.mockResolvedValue({});

    await expect(service.sendEmail(baseInput, baseContext)).rejects.toThrow(
      EmailingDomainDriverException,
    );
  });

  it('should reject empty recipient list before calling SES', async () => {
    const { service, send } = setUp();

    await expect(
      service.sendEmail({ ...baseInput, to: [] }, baseContext),
    ).rejects.toMatchObject({
      code: EmailingDomainDriverExceptionCode.CONFIGURATION_ERROR,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('should route AWS errors through the error handler', async () => {
    const { service, send, handleErrorService } = setUp();
    const awsError = Object.assign(new Error('Rejected'), {
      name: 'MessageRejected',
      $metadata: { httpStatusCode: 400 },
    });

    send.mockRejectedValue(awsError);

    await expect(service.sendEmail(baseInput, baseContext)).rejects.toBe(
      awsError,
    );
    expect(handleErrorService.handleAwsSesError).toHaveBeenCalledWith(
      awsError,
      'sendEmail',
    );
  });
});

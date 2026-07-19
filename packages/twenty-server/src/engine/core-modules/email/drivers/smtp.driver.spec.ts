import { Logger } from '@nestjs/common';

import { createTransport, type SendMailOptions } from 'nodemailer';

import { SmtpDriver } from 'src/engine/core-modules/email/drivers/smtp.driver';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SmtpDriver', () => {
  const sendMail = jest.fn();
  const sendMailOptions: SendMailOptions = {
    from: 'noreply@example.com',
    to: 'recipient@example.com',
    subject: 'Test email',
    text: 'Test message',
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('rejects when Nodemailer rejects the send', async () => {
    const error = new Error('SMTP connection failed');
    sendMail.mockRejectedValueOnce(error);
    const driver = new SmtpDriver({ host: 'smtp.example.com' });

    await expect(driver.send(sendMailOptions)).rejects.toThrow(error);
    expect(sendMail).toHaveBeenCalledWith(sendMailOptions);
  });

  it('resolves after Nodemailer accepts the send', async () => {
    sendMail.mockResolvedValueOnce(undefined);
    const driver = new SmtpDriver({ host: 'smtp.example.com' });

    await expect(driver.send(sendMailOptions)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledWith(sendMailOptions);
  });
});

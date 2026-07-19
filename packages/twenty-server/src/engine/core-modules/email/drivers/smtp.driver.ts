import { Logger } from '@nestjs/common';

import {
  createTransport,
  type SendMailOptions,
  type Transporter,
} from 'nodemailer';

import { type EmailDriverInterface } from 'src/engine/core-modules/email/drivers/interfaces/email-driver.interface';

import type SMTPConnection from 'nodemailer/lib/smtp-connection';

export class SmtpDriver implements EmailDriverInterface {
  private readonly logger = new Logger(SmtpDriver.name);
  private transport: Transporter;

  constructor(options: SMTPConnection.Options) {
    this.transport = createTransport(options);
  }

  async send(sendMailOptions: SendMailOptions): Promise<void> {
    try {
      await this.transport.sendMail(sendMailOptions);
      this.logger.log(`Email to '${sendMailOptions.to}' successfully sent`);
    } catch (error) {
      this.logger.error(`sending email to '${sendMailOptions.to}': ${error}`);
      throw error;
    }
  }
}

import {
  type EmailingDomainDriverInterface,
  type EmailingDomainResourceInput,
  type EmailingDomainVerificationResult,
} from 'src/engine/core-modules/emailing-domain/drivers/interfaces/emailing-domain-driver.interface';
import {
  EmailingDomainDriverException,
  EmailingDomainDriverExceptionCode,
} from 'src/engine/core-modules/emailing-domain/drivers/exceptions/emailing-domain-driver.exception';
import { type EmailingDomainSendEmailRequest } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-send-email-input.type';
import { type EmailingDomainSendEmailResult } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-send-email-result.type';

// Keep local domain setup usable; never return a fake delivered message receipt.
export class E2eFixtureRejectingEmailingDomainDriver implements EmailingDomainDriverInterface {
  constructor(
    private readonly localDomainDriver: EmailingDomainDriverInterface,
  ) {}

  provisionWorkspace(workspaceId: string): Promise<void> {
    return this.localDomainDriver.provisionWorkspace(workspaceId);
  }

  deprovisionWorkspace(workspaceId: string): Promise<void> {
    return this.localDomainDriver.deprovisionWorkspace(workspaceId);
  }

  verifyDomain(
    input: EmailingDomainResourceInput,
  ): Promise<EmailingDomainVerificationResult> {
    return this.localDomainDriver.verifyDomain(input);
  }

  getDomainStatus(
    input: EmailingDomainResourceInput,
  ): Promise<EmailingDomainVerificationResult> {
    return this.localDomainDriver.getDomainStatus(input);
  }

  registerDomain(input: EmailingDomainResourceInput): Promise<void> {
    return this.localDomainDriver.registerDomain(input);
  }

  cleanupDomain(input: EmailingDomainResourceInput): Promise<void> {
    return this.localDomainDriver.cleanupDomain(input);
  }

  async sendEmail(
    _: EmailingDomainSendEmailRequest,
  ): Promise<EmailingDomainSendEmailResult> {
    throw new EmailingDomainDriverException(
      'E2E fixtures never send emailing-domain messages',
      EmailingDomainDriverExceptionCode.CONFIGURATION_ERROR,
    );
  }
}

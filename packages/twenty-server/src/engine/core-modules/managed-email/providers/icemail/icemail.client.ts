import { Injectable } from '@nestjs/common';

import { type AxiosInstance, type AxiosResponse, isAxiosError } from 'axios';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { IcemailException, IcemailExceptionCode } from './icemail.exception';
import {
  mapIcemailAppPassword,
  mapIcemailDomainAvailability,
  mapIcemailDomainDetail,
  mapIcemailDomainPage,
  mapIcemailMailboxDeletionReceipt,
  mapIcemailMailboxDetail,
  mapIcemailMailboxPage,
  mapIcemailOrderReceipt,
  mapIcemailPrewarmPurchaseReceipt,
  mapIcemailPrewarmedBundlePage,
  mapIcemailQueuedDomainAction,
} from './icemail-response.mapper';
import {
  type IcemailDomainAvailability,
  type IcemailDomainDetail,
  type IcemailDomainSummary,
  type IcemailMailboxCredential,
  type IcemailMailboxDeletionInput,
  type IcemailMailboxDeletionReceipt,
  type IcemailMailboxDetail,
  type IcemailMailboxSummary,
  type IcemailOrderReceipt,
  type IcemailOrdinaryOrderInput,
  type IcemailPage,
  type IcemailPrewarmPurchaseInput,
  type IcemailPrewarmPurchaseReceipt,
  type IcemailPrewarmedBundlePage,
  type IcemailQueuedDomainActionReceipt,
} from './icemail.types';

const ICEMAIL_READ_TIMEOUT_MS = 10_000;
const ICEMAIL_WRITE_TIMEOUT_MS = 30_000;
const ICEMAIL_FIRST_PAGE_LIMIT = 50;
const ICEMAIL_PREWARM_PAGE_LIMIT = 100;
const MAX_INPUT_COLLECTION_SIZE = 100;
const MAX_INPUT_STRING_LENGTH = 500;

@Injectable()
export class IcemailClient {
  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly secureHttpClientService: SecureHttpClientService,
  ) {}

  async checkDomainAvailability(
    domain: string,
  ): Promise<IcemailDomainAvailability> {
    const normalizedDomain = this.normalizeDomain(domain);

    return this.executeRead(
      (client) =>
        client.get('/domain/available', {
          params: { domain: normalizedDomain, page: 1 },
        }),
      mapIcemailDomainAvailability,
    );
  }

  async listPrewarmedBundles(): Promise<IcemailPrewarmedBundlePage> {
    return this.executeRead(
      (client) =>
        client.get('/prewarm', {
          params: { page: 1, limit: ICEMAIL_PREWARM_PAGE_LIMIT },
        }),
      mapIcemailPrewarmedBundlePage,
    );
  }

  async buyPrewarmedBundles(
    input: IcemailPrewarmPurchaseInput,
  ): Promise<IcemailPrewarmPurchaseReceipt> {
    const inventoryIds = this.validateIds(input.inventoryIds, 50);

    return this.executeWrite(
      (client) => client.post('/prewarm/buy', { domain_ids: inventoryIds }),
      mapIcemailPrewarmPurchaseReceipt,
    );
  }

  async createOrdinaryOrder(
    input: IcemailOrdinaryOrderInput,
  ): Promise<IcemailOrderReceipt> {
    const domains = this.validateOrdinaryOrder(input);

    return this.executeWrite(
      (client) =>
        client.post('/order', {
          import: false,
          data: domains.map((domain) => ({
            domain_name: domain.domain,
            mailbox_type: 'GOOGLE',
            mailboxes: domain.mailboxes.map((mailbox) => ({
              first_name: mailbox.firstName,
              last_name: mailbox.lastName,
              username: mailbox.address,
              password: mailbox.password,
            })),
          })),
        }),
      mapIcemailOrderReceipt,
    );
  }

  async listDomains(): Promise<IcemailPage<IcemailDomainSummary>> {
    return this.executeRead(
      (client) =>
        client.get('/domain', {
          params: { page: 1, limit: ICEMAIL_FIRST_PAGE_LIMIT },
        }),
      mapIcemailDomainPage,
    );
  }

  async listMailboxes(): Promise<IcemailPage<IcemailMailboxSummary>> {
    return this.executeRead(
      (client) =>
        client.get('/mailbox', {
          params: { page: 1, limit: ICEMAIL_FIRST_PAGE_LIMIT },
        }),
      mapIcemailMailboxPage,
    );
  }

  async getDomain(domainId: string): Promise<IcemailDomainDetail | null> {
    const id = this.validateString(domainId);

    return this.executeRead(
      (client) => client.get(`/domain/${encodeURIComponent(id)}`),
      mapIcemailDomainDetail,
      true,
    );
  }

  async getMailbox(mailboxId: string): Promise<IcemailMailboxDetail | null> {
    const id = this.validateString(mailboxId);

    return this.executeRead(
      (client) => client.get(`/mailbox/${encodeURIComponent(id)}`),
      mapIcemailMailboxDetail,
      true,
    );
  }

  async getMailboxCredential(
    mailboxId: string,
  ): Promise<IcemailMailboxCredential | null> {
    const id = this.validateString(mailboxId);
    const mailbox = await this.getMailbox(id);

    if (mailbox === null) return null;

    const appPassword = await this.executeRead(
      (client) => client.get(`/mailbox/${encodeURIComponent(id)}/app-password`),
      mapIcemailAppPassword,
    );

    if (appPassword === null) return null;

    return {
      username: mailbox.address,
      appPassword,
      smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
    };
  }

  async deleteDomainMailboxes(
    input: IcemailMailboxDeletionInput,
  ): Promise<IcemailMailboxDeletionReceipt> {
    const domainIds = this.validateIds(input.domainIds);

    if (input.mode !== 'immediate' && input.mode !== 'scheduled') {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return this.executeWrite(
      (client) =>
        client.delete('/domain/mailboxes', {
          data: { domain_ids: domainIds, mode: input.mode },
        }),
      (value) => mapIcemailMailboxDeletionReceipt(value, domainIds, input.mode),
    );
  }

  async clearDomainDns(
    domainIdsInput: string[],
  ): Promise<IcemailQueuedDomainActionReceipt> {
    const domainIds = this.validateIds(domainIdsInput);

    return this.executeWrite(
      (client) =>
        client.delete('/domain/clear-dns', {
          data: { domain_ids: domainIds },
        }),
      (value) =>
        mapIcemailQueuedDomainAction(
          value,
          'clear_dns_records',
          domainIds.length,
        ),
    );
  }

  async deleteConnectedDomains(
    domainIdsInput: string[],
  ): Promise<IcemailQueuedDomainActionReceipt> {
    const domainIds = this.validateIds(domainIdsInput);

    return this.executeWrite(
      (client) =>
        client.delete('/domain', {
          data: { domain_ids: domainIds },
        }),
      (value) =>
        mapIcemailQueuedDomainAction(value, 'delete_domain', domainIds.length),
    );
  }

  private async executeRead<T>(
    operation: (client: AxiosInstance) => Promise<AxiosResponse<unknown>>,
    map: (value: unknown) => T,
  ): Promise<T>;
  private async executeRead<T>(
    operation: (client: AxiosInstance) => Promise<AxiosResponse<unknown>>,
    map: (value: unknown) => T,
    allowNotFound: true,
  ): Promise<T | null>;
  private async executeRead<T>(
    operation: (client: AxiosInstance) => Promise<AxiosResponse<unknown>>,
    map: (value: unknown) => T,
    allowNotFound = false,
  ): Promise<T | null> {
    try {
      const response = await operation(this.createHttpClient(false));

      return map(response.data);
    } catch (error) {
      if (error instanceof IcemailException) throw error;

      if (isAxiosError(error)) {
        if (allowNotFound && error.response?.status === 404) return null;
        if (error.response?.status === 429) {
          throw new IcemailException(IcemailExceptionCode.RATE_LIMITED);
        }
      }

      throw new IcemailException(IcemailExceptionCode.REQUEST_FAILED);
    }
  }

  private async executeWrite<T>(
    operation: (client: AxiosInstance) => Promise<AxiosResponse<unknown>>,
    map: (value: unknown) => T,
  ): Promise<T> {
    let response: AxiosResponse<unknown>;

    try {
      response = await operation(this.createHttpClient(true));
    } catch (error) {
      if (error instanceof IcemailException) throw error;

      if (!isAxiosError(error)) {
        throw new IcemailException(
          IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN,
        );
      }

      const status = error.response?.status;

      if (status === 402) {
        throw new IcemailException(IcemailExceptionCode.INSUFFICIENT_CREDITS);
      }
      if (status === 409) {
        throw new IcemailException(IcemailExceptionCode.CONFLICT);
      }
      if (status === 429) {
        throw new IcemailException(IcemailExceptionCode.RATE_LIMITED);
      }
      if (status === undefined || status >= 500) {
        throw new IcemailException(
          IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN,
        );
      }

      throw new IcemailException(IcemailExceptionCode.REQUEST_FAILED);
    }

    try {
      return map(response.data);
    } catch {
      throw new IcemailException(IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN);
    }
  }

  private createHttpClient(write: boolean): AxiosInstance {
    if (!this.twentyConfigService.get('MANAGED_EMAIL_ENABLED')) {
      throw new IcemailException(IcemailExceptionCode.CONFIGURATION_DISABLED);
    }

    const baseURL = this.twentyConfigService.get('ICEMAIL_API_BASE_URL').trim();
    const apiKey = this.twentyConfigService.get('ICEMAIL_API_KEY').trim();

    if (!baseURL || !apiKey) {
      throw new IcemailException(IcemailExceptionCode.CONFIGURATION_DISABLED);
    }

    return this.secureHttpClientService.getHttpClient({
      baseURL,
      headers: { 'x-api-key': apiKey },
      retries: write ? 0 : 2,
      ...(write ? {} : { shouldResetTimeout: true }),
      timeout: write ? ICEMAIL_WRITE_TIMEOUT_MS : ICEMAIL_READ_TIMEOUT_MS,
    });
  }

  private validateOrdinaryOrder(input: IcemailOrdinaryOrderInput) {
    if (
      !Array.isArray(input.domains) ||
      input.domains.length === 0 ||
      input.domains.length > MAX_INPUT_COLLECTION_SIZE
    ) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    const domains = input.domains.map((inputDomain) => {
      const domain = this.normalizeDomain(inputDomain.domain);

      if (
        !Array.isArray(inputDomain.mailboxes) ||
        inputDomain.mailboxes.length === 0 ||
        inputDomain.mailboxes.length > MAX_INPUT_COLLECTION_SIZE
      ) {
        throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
      }

      return {
        domain,
        mailboxes: inputDomain.mailboxes.map((mailbox) => {
          const firstName = this.validateString(mailbox.firstName);
          const lastName = this.validateString(mailbox.lastName);
          const address = mailbox.address.trim().toLowerCase();
          const password = mailbox.password;

          if (
            !address.endsWith(`@${domain}`) ||
            address.slice(0, -(domain.length + 1)).length === 0 ||
            typeof password !== 'string' ||
            password.length < 8 ||
            password.length > MAX_INPUT_STRING_LENGTH
          ) {
            throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
          }

          return { firstName, lastName, address, password };
        }),
      };
    });

    if (
      new Set(domains.map((domain) => domain.domain)).size !== domains.length
    ) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return domains;
  }

  private normalizeDomain(value: string): string {
    if (typeof value !== 'string') {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    const domain = value.trim().toLowerCase();

    if (
      domain.length > 253 ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|biz|live|info)$/.test(
        domain,
      )
    ) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return domain;
  }

  private validateIds(values: string[], max = MAX_INPUT_COLLECTION_SIZE) {
    if (!Array.isArray(values) || values.length === 0 || values.length > max) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    const ids = values.map((value) => this.validateString(value));

    if (new Set(ids).size !== ids.length) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return ids;
  }

  private validateString(value: string): string {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.length > MAX_INPUT_STRING_LENGTH
    ) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return value.trim();
  }
}

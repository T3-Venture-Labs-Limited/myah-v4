import { Injectable } from '@nestjs/common';

import { type AxiosInstance, type AxiosResponse, isAxiosError } from 'axios';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { normalizeCustomerOwnedDomainImport } from '../../utils/normalize-customer-owned-domain-import.util';
import { IcemailException, IcemailExceptionCode } from './icemail.exception';
import {
  mapIcemailCredentialSecret,
  mapIcemailCustomerOwnedDomainImportOrderReceipt,
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
  type IcemailCustomerOwnedDomainImportOrderInput,
  type IcemailProviderCredentialSecret,
  type IcemailMailboxCredential,
  type IcemailMailboxReadOptions,
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
const ICEMAIL_MAX_LIST_PAGES = 100;
const MAX_INPUT_COLLECTION_SIZE = 100;
const MAX_INPUT_STRING_LENGTH = 500;
const ICEMAIL_PRODUCTION_DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|biz|live|info)$/;
const ICEMAIL_SANDBOX_DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|biz|live|info|test)$/;

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
      (value) => mapIcemailDomainAvailability(value, this.domainPolicy()),
    );
  }

  async listPrewarmedBundles(page = 1): Promise<IcemailPrewarmedBundlePage> {
    const validatedPage = this.validatePage(page);

    return this.executeRead(
      (client) =>
        client.get('/prewarm', {
          params: { page: validatedPage, limit: ICEMAIL_PREWARM_PAGE_LIMIT },
        }),
      (value) => mapIcemailPrewarmedBundlePage(value, this.domainPolicy()),
    );
  }

  async buyPrewarmedBundles(
    input: IcemailPrewarmPurchaseInput,
  ): Promise<IcemailPrewarmPurchaseReceipt> {
    const inventoryIds = this.validateIds(input.inventoryIds, 50);

    return this.executeWrite(
      (client) => client.post('/prewarm/buy', { domain_ids: inventoryIds }),
      (value) => mapIcemailPrewarmPurchaseReceipt(value, this.domainPolicy()),
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
      (value) => mapIcemailOrderReceipt(value, this.domainPolicy()),
    );
  }

  async createCustomerOwnedDomainImportOrder(
    input: IcemailCustomerOwnedDomainImportOrderInput,
  ): Promise<IcemailOrderReceipt> {
    const { domain, mailboxes } =
      this.validateCustomerOwnedDomainImportOrder(input);

    return this.executeWrite(
      (client) =>
        client.post('/order', {
          import: true,
          data: [
            {
              domain_name: domain,
              mailbox_type: 'GOOGLE',
              mailboxes: mailboxes.map((mailbox) => ({
                first_name: mailbox.firstName,
                last_name: mailbox.lastName,
                username: mailbox.address,
                password: mailbox.password,
              })),
            },
          ],
        }),
      (value) =>
        mapIcemailCustomerOwnedDomainImportOrderReceipt(
          value,
          domain,
          mailboxes,
        ),
    );
  }

  async listDomains(page = 1): Promise<IcemailPage<IcemailDomainSummary>> {
    const validatedPage = this.validatePage(page);

    return this.executeRead(
      (client) =>
        client.get('/domain', {
          params: { page: validatedPage, limit: ICEMAIL_FIRST_PAGE_LIMIT },
        }),
      (value) => mapIcemailDomainPage(value, this.domainPolicy()),
    );
  }

  async listMailboxes(
    page = 1,
    importedDomains?: ReadonlyMap<string, string>,
  ): Promise<IcemailPage<IcemailMailboxSummary>> {
    const validatedPage = this.validatePage(page);

    return this.executeRead(
      (client) =>
        client.get('/mailbox', {
          params: { page: validatedPage, limit: ICEMAIL_FIRST_PAGE_LIMIT },
        }),
      (value) =>
        mapIcemailMailboxPage(value, this.domainPolicy(), importedDomains),
    );
  }

  async listAllDomains(): Promise<IcemailDomainSummary[]> {
    return this.collectPages((page) => this.listDomains(page));
  }

  async listAllMailboxes(
    importedDomains?: ReadonlyMap<string, string>,
  ): Promise<IcemailMailboxSummary[]> {
    return this.collectPages((page) =>
      this.listMailboxes(page, importedDomains),
    );
  }

  async getDomain(domainId: string): Promise<IcemailDomainDetail | null> {
    const id = this.validateString(domainId);

    return this.executeRead(
      (client) => client.get(`/domain/${encodeURIComponent(id)}`),
      (value) => mapIcemailDomainDetail(value, this.domainPolicy()),
      true,
    );
  }

  async getMailbox(
    mailboxId: string,
    options?: IcemailMailboxReadOptions,
  ): Promise<IcemailMailboxDetail | null> {
    const id = this.validateString(mailboxId);
    const customerOwnedDomain =
      this.normalizeMailboxReadCustomerOwnedDomain(options);

    return this.executeRead(
      (client) => client.get(`/mailbox/${encodeURIComponent(id)}`),
      (value) =>
        mapIcemailMailboxDetail(
          value,
          this.domainPolicy(),
          customerOwnedDomain,
        ),
      true,
    );
  }

  async getMailboxCredential(
    mailboxId: string,
    options?: IcemailMailboxReadOptions,
  ): Promise<IcemailMailboxCredential | null> {
    const id = this.validateString(mailboxId);
    const mailbox =
      options === undefined
        ? await this.getMailbox(id)
        : await this.getMailbox(id, options);

    if (mailbox === null) return null;

    const credentialSecret = await this.executeRead(
      (client) => client.get(`/mailbox/${encodeURIComponent(id)}/app-password`),
      mapIcemailCredentialSecret,
    );

    if (credentialSecret === null) return null;

    const transport =
      this.twentyConfigService.get('MANAGED_EMAIL_EXECUTION_MODE') === 'SANDBOX'
        ? this.requireSandboxTransport(credentialSecret.transport)
        : {
            smtp: { host: 'smtp.gmail.com', port: 465, secure: true } as const,
            imap: { host: 'imap.gmail.com', port: 993, secure: true } as const,
          };

    return {
      username: mailbox.address,
      appPassword: credentialSecret.appPassword,
      ...transport,
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
    const baseURL = this.twentyConfigService.get('ICEMAIL_API_BASE_URL').trim();
    const apiKey = this.twentyConfigService.get('ICEMAIL_API_KEY').trim();

    if (!baseURL || !apiKey) {
      throw new IcemailException(IcemailExceptionCode.CONFIGURATION_DISABLED);
    }

    const timeout = write ? ICEMAIL_WRITE_TIMEOUT_MS : ICEMAIL_READ_TIMEOUT_MS;

    if (
      this.twentyConfigService.get('MANAGED_EMAIL_EXECUTION_MODE') === 'SANDBOX'
    ) {
      return this.secureHttpClientService.getInternalHttpClient({
        baseURL,
        headers: { 'x-api-key': apiKey },
        timeout,
      });
    }

    return this.secureHttpClientService.getHttpClient({
      baseURL,
      headers: { 'x-api-key': apiKey },
      retries: write ? 0 : 2,
      ...(write ? {} : { shouldResetTimeout: true }),
      timeout,
    });
  }

  private requireSandboxTransport(
    transport: IcemailProviderCredentialSecret['transport'],
  ): NonNullable<IcemailProviderCredentialSecret['transport']> {
    if (
      transport === null ||
      [transport.smtp, transport.imap].some(
        (endpoint) =>
          !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.host) ||
          !Number.isSafeInteger(endpoint.port) ||
          endpoint.port < 1 ||
          endpoint.port > 65_535 ||
          endpoint.secure !== false,
      )
    ) {
      throw new IcemailException(IcemailExceptionCode.MALFORMED_RESPONSE);
    }

    return transport;
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

  private normalizeMailboxReadCustomerOwnedDomain(
    options?: IcemailMailboxReadOptions,
  ): string | undefined {
    if (options === undefined) return undefined;

    const domain = normalizeCustomerOwnedDomainImport(
      typeof options === 'object' && options !== null
        ? options.customerOwnedDomain
        : undefined,
    );

    if (domain === null) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return domain;
  }

  private validateCustomerOwnedDomainImportOrder(
    input: IcemailCustomerOwnedDomainImportOrderInput,
  ) {
    const domain = normalizeCustomerOwnedDomainImport(
      input.customerOwnedDomain,
    );

    if (domain === null) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    if (
      !Array.isArray(input.mailboxes) ||
      input.mailboxes.length === 0 ||
      input.mailboxes.length > MAX_INPUT_COLLECTION_SIZE
    ) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    const mailboxes = input.mailboxes.map((mailbox) => {
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
    });

    if (
      new Set(mailboxes.map((mailbox) => mailbox.address)).size !==
      mailboxes.length
    ) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return { domain, mailboxes };
  }

  private domainPolicy(): 'PRODUCTION' | 'SANDBOX' {
    return this.twentyConfigService.get('MANAGED_EMAIL_EXECUTION_MODE') ===
      'SANDBOX'
      ? 'SANDBOX'
      : 'PRODUCTION';
  }

  private normalizeDomain(value: string): string {
    if (typeof value !== 'string') {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    const domain = value.trim().toLowerCase();
    const pattern =
      this.domainPolicy() === 'SANDBOX'
        ? ICEMAIL_SANDBOX_DOMAIN_PATTERN
        : ICEMAIL_PRODUCTION_DOMAIN_PATTERN;

    if (domain.length > 253 || !pattern.test(domain)) {
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

  private async collectPages<T>(
    readPage: (page: number) => Promise<IcemailPage<T>>,
  ): Promise<T[]> {
    const items: T[] = [];
    let expectedLimit: number | undefined;
    let expectedTotal: number | undefined;

    for (let page = 1; page <= ICEMAIL_MAX_LIST_PAGES; page += 1) {
      const result = await readPage(page);

      expectedLimit ??= result.limit;
      expectedTotal ??= result.total;
      if (
        result.page !== page ||
        result.limit !== expectedLimit ||
        result.total !== expectedTotal ||
        items.length + result.items.length > expectedTotal ||
        (result.items.length === 0 && items.length < expectedTotal)
      ) {
        throw new IcemailException(IcemailExceptionCode.MALFORMED_RESPONSE);
      }
      items.push(...result.items);
      if (items.length === expectedTotal) {
        return items;
      }
    }

    throw new IcemailException(IcemailExceptionCode.MALFORMED_RESPONSE);
  }

  private validatePage(page: number): number {
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new IcemailException(IcemailExceptionCode.INVALID_INPUT);
    }

    return page;
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

import { Injectable } from '@nestjs/common';

import { type AxiosInstance, type AxiosResponse, isAxiosError } from 'axios';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  WarmupInboxException,
  WarmupInboxExceptionCode,
} from './warmup-inbox.exception';
import {
  mapWarmupInboxCapacity,
  mapWarmupInboxCreateReceipt,
  mapWarmupInboxDetail,
  mapWarmupInboxList,
  mapWarmupInboxMetrics,
} from './warmup-inbox-response.mapper';
import {
  type ManagedWarmupPolicyConfiguration,
  type WarmupInboxCapacity,
  type WarmupInboxCreateInput,
  type WarmupInboxCreateReceipt,
  type WarmupInboxDetail,
  type WarmupInboxMetrics,
  type WarmupInboxMetricsRange,
  type WarmupInboxSummary,
} from './warmup-inbox.types';

const WARMUP_INBOX_READ_TIMEOUT_MS = 10_000;
const WARMUP_INBOX_WRITE_TIMEOUT_MS = 30_000;
const MAX_INPUT_STRING_LENGTH = 500;

@Injectable()
export class WarmupInboxClient {
  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly secureHttpClientService: SecureHttpClientService,
  ) {}

  async listInboxes(): Promise<WarmupInboxSummary[]> {
    return this.executeRead(
      (client) => client.get('/v1/inboxes'),
      mapWarmupInboxList,
    );
  }

  async findByExactAddress(
    addressInput: string,
  ): Promise<WarmupInboxSummary[]> {
    const address = this.normalizeAddress(addressInput);
    const inboxes = await this.listInboxes();

    return inboxes.filter((inbox) => inbox.address === address);
  }

  async getInbox(inboxIdInput: string): Promise<WarmupInboxDetail | null> {
    const inboxId = this.validateString(inboxIdInput);

    return this.executeRead(
      (client) => client.get(`/v1/inboxes/${encodeURIComponent(inboxId)}`),
      mapWarmupInboxDetail,
      true,
    );
  }

  async getCapacity(): Promise<WarmupInboxCapacity> {
    return this.executeRead(
      (client) => client.get('/v1/account/credits'),
      mapWarmupInboxCapacity,
    );
  }

  async createAdvanced(
    input: WarmupInboxCreateInput,
  ): Promise<WarmupInboxCreateReceipt> {
    const validated = this.validateCreateInput(input);
    let originalError: WarmupInboxException | undefined;

    try {
      return await this.executeWrite(
        (client) =>
          client.post('/v1/inboxes/advanced', {
            email: validated.address,
            sender_first: validated.senderFirstName,
            sender_last: validated.senderLastName,
            plan: 'basic',
            smtp: {
              username: validated.address,
              password: validated.appPassword,
              host: 'smtp.gmail.com',
              port: 465,
              tls: true,
            },
            imap: {
              username: validated.address,
              password: validated.appPassword,
              host: 'imap.gmail.com',
              port: 993,
              tls: true,
            },
            frequency: validated.frequency,
            custom_oauth: null,
            google: null,
            office: null,
          }),
        201,
        mapWarmupInboxCreateReceipt,
      );
    } catch (error) {
      if (
        !(error instanceof WarmupInboxException) ||
        ![
          WarmupInboxExceptionCode.CONFLICT,
          WarmupInboxExceptionCode.MALFORMED_RESPONSE,
          WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
        ].includes(error.code)
      ) {
        throw error;
      }

      originalError = error;
    }

    let matches: WarmupInboxSummary[];

    try {
      matches = await this.findByExactAddress(validated.address);
    } catch {
      throw originalError;
    }

    if (matches.length === 1) {
      return { id: matches[0].id, replayed: true };
    }
    if (matches.length > 1) {
      throw new WarmupInboxException(
        WarmupInboxExceptionCode.RECONCILIATION_REQUIRED,
      );
    }
    if (originalError.code === WarmupInboxExceptionCode.CONFLICT) {
      throw originalError;
    }

    throw new WarmupInboxException(
      WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
    );
  }

  async updatePolicy(
    inboxIdInput: string,
    policyInput: ManagedWarmupPolicyConfiguration,
  ): Promise<void> {
    const inboxId = this.validateString(inboxIdInput);
    const frequency = this.validatePolicy(policyInput);

    await this.executeWrite(
      (client) =>
        client.patch(`/v1/inboxes/${encodeURIComponent(inboxId)}`, {
          frequency,
        }),
      200,
      () => undefined,
    );
  }

  async start(inboxIdInput: string): Promise<void> {
    const inboxId = this.validateString(inboxIdInput);

    await this.executeWrite(
      (client) =>
        client.post(`/v1/inboxes/${encodeURIComponent(inboxId)}/start`),
      [200, 201],
      () => undefined,
      [409],
    );
  }

  async pause(inboxIdInput: string): Promise<void> {
    const inboxId = this.validateString(inboxIdInput);

    await this.executeWrite(
      (client) =>
        client.post(`/v1/inboxes/${encodeURIComponent(inboxId)}/pause`),
      [200, 201],
      () => undefined,
      [409],
    );
  }

  async delete(inboxIdInput: string): Promise<void> {
    const inboxId = this.validateString(inboxIdInput);

    await this.executeWrite(
      (client) => client.delete(`/v1/inboxes/${encodeURIComponent(inboxId)}`),
      200,
      () => undefined,
      [404],
    );
  }

  async getMetrics(
    inboxIdInput: string,
    range: WarmupInboxMetricsRange,
  ): Promise<WarmupInboxMetrics | null> {
    const inboxId = this.validateString(inboxIdInput);

    if (
      !(range.from instanceof Date) ||
      !(range.to instanceof Date) ||
      Number.isNaN(range.from.getTime()) ||
      Number.isNaN(range.to.getTime()) ||
      range.from >= range.to
    ) {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    const fromSeconds = Math.floor(range.from.getTime() / 1_000);
    const toSeconds = Math.floor(range.to.getTime() / 1_000);

    if (fromSeconds >= toSeconds) {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    return this.executeRead(
      (client) =>
        client.get(`/v1/inboxes/${encodeURIComponent(inboxId)}/metrics`, {
          params: {
            from: fromSeconds,
            to: toSeconds,
          },
        }),
      (value) => {
        const metrics = mapWarmupInboxMetrics(value);

        if (
          metrics.inboxId !== inboxId ||
          metrics.from.getTime() > fromSeconds * 1_000 ||
          metrics.to.getTime() < toSeconds * 1_000
        ) {
          throw new WarmupInboxException(
            WarmupInboxExceptionCode.MALFORMED_RESPONSE,
          );
        }

        return metrics;
      },
      true,
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

      if (response.status !== 200) {
        throw new WarmupInboxException(WarmupInboxExceptionCode.REQUEST_FAILED);
      }

      return map(response.data);
    } catch (error) {
      if (error instanceof WarmupInboxException) throw error;

      if (isAxiosError(error)) {
        if (allowNotFound && error.response?.status === 404) return null;
        if (error.response?.status === 429) {
          throw new WarmupInboxException(WarmupInboxExceptionCode.RATE_LIMITED);
        }
      }

      throw new WarmupInboxException(WarmupInboxExceptionCode.REQUEST_FAILED);
    }
  }

  private async executeWrite<T>(
    operation: (client: AxiosInstance) => Promise<AxiosResponse<unknown>>,
    expectedStatus: number | number[],
    map: (value: unknown) => T,
    replayStatuses: number[] = [],
  ): Promise<T> {
    let response: AxiosResponse<unknown>;

    try {
      response = await operation(this.createHttpClient(true));
    } catch (error) {
      if (error instanceof WarmupInboxException) throw error;

      if (!isAxiosError(error)) {
        throw new WarmupInboxException(
          WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
        );
      }

      const status = error.response?.status;

      if (status !== undefined && replayStatuses.includes(status)) {
        return undefined as T;
      }
      if (status === 409) {
        throw new WarmupInboxException(WarmupInboxExceptionCode.CONFLICT);
      }
      if (status === 429) {
        throw new WarmupInboxException(WarmupInboxExceptionCode.RATE_LIMITED);
      }
      if (status === undefined || status >= 500) {
        throw new WarmupInboxException(
          WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
        );
      }

      throw new WarmupInboxException(WarmupInboxExceptionCode.REQUEST_FAILED);
    }

    if (
      !(
        Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]
      ).includes(response.status)
    ) {
      throw new WarmupInboxException(
        WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
      );
    }

    try {
      return map(response.data);
    } catch {
      throw new WarmupInboxException(
        WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
      );
    }
  }

  private createHttpClient(write: boolean): AxiosInstance {
    if (!this.twentyConfigService.get('MANAGED_EMAIL_ENABLED')) {
      throw new WarmupInboxException(
        WarmupInboxExceptionCode.CONFIGURATION_DISABLED,
      );
    }

    const baseURL = this.twentyConfigService
      .get('WARMUP_INBOX_API_BASE_URL')
      .trim();
    const apiKey = this.twentyConfigService.get('WARMUP_INBOX_API_KEY').trim();

    if (!baseURL || !apiKey) {
      throw new WarmupInboxException(
        WarmupInboxExceptionCode.CONFIGURATION_DISABLED,
      );
    }

    return this.secureHttpClientService.getHttpClient({
      baseURL,
      headers: { 'x-api-key': apiKey },
      retries: write ? 0 : 2,
      ...(write ? {} : { shouldResetTimeout: true }),
      timeout: write
        ? WARMUP_INBOX_WRITE_TIMEOUT_MS
        : WARMUP_INBOX_READ_TIMEOUT_MS,
    });
  }

  private validateCreateInput(input: WarmupInboxCreateInput) {
    if (
      typeof input !== 'object' ||
      input === null ||
      'timezone' in input ||
      'schedule' in input
    ) {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    const address = this.normalizeAddress(input.address);
    const senderFirstName = this.validateString(input.senderFirstName);
    const senderLastName = this.validateString(input.senderLastName);
    const credential = input.credential;

    if (
      typeof credential !== 'object' ||
      credential === null ||
      this.normalizeAddress(credential.username) !== address ||
      typeof credential.appPassword !== 'string' ||
      credential.appPassword.length < 8 ||
      credential.appPassword.length > MAX_INPUT_STRING_LENGTH ||
      credential.smtp?.host !== 'smtp.gmail.com' ||
      credential.smtp.port !== 465 ||
      credential.smtp.secure !== true ||
      credential.imap?.host !== 'imap.gmail.com' ||
      credential.imap.port !== 993 ||
      credential.imap.secure !== true
    ) {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    return {
      address,
      senderFirstName,
      senderLastName,
      appPassword: credential.appPassword,
      frequency: this.validatePolicy(input.policy),
    };
  }

  private validatePolicy(input: ManagedWarmupPolicyConfiguration) {
    if (
      typeof input !== 'object' ||
      input === null ||
      !Number.isSafeInteger(input.startingBaseline) ||
      input.startingBaseline < 0 ||
      input.startingBaseline > 1_000 ||
      !Number.isSafeInteger(input.increasePerDay) ||
      input.increasePerDay < 1 ||
      input.increasePerDay > 100 ||
      !Number.isSafeInteger(input.maxSendsPerDay) ||
      input.maxSendsPerDay < 1 ||
      input.maxSendsPerDay > 1_000 ||
      typeof input.replyRatePercent !== 'number' ||
      !Number.isFinite(input.replyRatePercent) ||
      input.replyRatePercent < 0 ||
      input.replyRatePercent > 100 ||
      input.strategy !== 'progressive' ||
      typeof input.version !== 'string' ||
      input.version.trim().length === 0 ||
      input.version.length > MAX_INPUT_STRING_LENGTH
    ) {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    return {
      starting_baseline: input.startingBaseline,
      increase_per_day: input.increasePerDay,
      max_sends_per_day: input.maxSendsPerDay,
      reply_rate: input.replyRatePercent,
      strategy: input.strategy,
    };
  }

  private normalizeAddress(value: string): string {
    if (typeof value !== 'string') {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    const address = value.trim().toLowerCase();

    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    return address;
  }

  private validateString(value: string): string {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.length > MAX_INPUT_STRING_LENGTH
    ) {
      throw new WarmupInboxException(WarmupInboxExceptionCode.INVALID_INPUT);
    }

    return value.trim();
  }
}

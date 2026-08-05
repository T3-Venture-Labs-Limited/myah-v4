import { Inject, Injectable } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';

export const MANAGED_EMAIL_DNS_CLIENT = Symbol('MANAGED_EMAIL_DNS_CLIENT');
const DNS_QUERY_TIMEOUT_MS = 5_000;
type ManagedEmailMxRecord = Readonly<{ exchange: string; priority: number }>;

type ManagedEmailDnsClient = Readonly<{
  resolveMx(hostname: string): Promise<ManagedEmailMxRecord[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
}>;

export type ManagedEmailDnsFacts = Readonly<{
  dkim: boolean;
  dmarc: boolean;
  mx: boolean;
  spf: boolean;
}>;

export const createManagedEmailDnsClient = (): ManagedEmailDnsClient => {
  const resolver = new Resolver({ timeout: DNS_QUERY_TIMEOUT_MS, tries: 1 });

  return {
    resolveMx: (hostname) => resolver.resolveMx(hostname),
    resolveTxt: (hostname) => resolver.resolveTxt(hostname),
  };
};

@Injectable()
export class ManagedEmailDnsResolverService {
  constructor(
    @Inject(MANAGED_EMAIL_DNS_CLIENT)
    private readonly dnsClient: ManagedEmailDnsClient,
  ) {}

  async resolve(
    input: Readonly<{
      dkimSelector: string;
      domain: string;
      expectedMxSuffixes: readonly string[];
    }>,
  ): Promise<ManagedEmailDnsFacts> {
    const domain = input.domain.trim().toLowerCase();
    const dkimSelector = input.dkimSelector.trim().toLowerCase();
    const expectedMxSuffixes = input.expectedMxSuffixes.map((suffix) =>
      suffix.trim().toLowerCase(),
    );

    if (
      domain === '' ||
      dkimSelector === '' ||
      expectedMxSuffixes.length === 0
    ) {
      return { dkim: false, dmarc: false, mx: false, spf: false };
    }

    const [rootTxt, dkimTxt, dmarcTxt, mxRecords] = await Promise.all([
      this.safeTxt(domain),
      this.safeTxt(`${dkimSelector}._domainkey.${domain}`),
      this.safeTxt(`_dmarc.${domain}`),
      this.safeMx(domain),
    ]);

    return {
      dkim: this.hasTxtPrefix(dkimTxt, 'v=dkim1'),
      dmarc: this.hasTxtPrefix(dmarcTxt, 'v=dmarc1'),
      mx: mxRecords.some(({ exchange }) => {
        const hostname = exchange.toLowerCase().replace(/\.$/, '');

        return expectedMxSuffixes.some((suffix) =>
          suffix.startsWith('.')
            ? hostname === suffix.slice(1) || hostname.endsWith(suffix)
            : hostname === suffix,
        );
      }),
      spf: this.hasTxtPrefix(rootTxt, 'v=spf1'),
    };
  }

  private async safeMx(hostname: string): Promise<ManagedEmailMxRecord[]> {
    try {
      return await this.withTimeout(this.dnsClient.resolveMx(hostname));
    } catch {
      return [];
    }
  }

  private async safeTxt(hostname: string): Promise<string[][]> {
    try {
      return await this.withTimeout(this.dnsClient.resolveTxt(hostname));
    } catch {
      return [];
    }
  }

  private hasTxtPrefix(records: string[][], prefix: string): boolean {
    return records.some((chunks) =>
      chunks.join('').trim().toLowerCase().startsWith(prefix),
    );
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Managed email DNS query timed out')),
            DNS_QUERY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

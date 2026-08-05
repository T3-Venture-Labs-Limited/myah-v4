import { ManagedEmailDnsResolverService } from '../managed-email-dns-resolver.service';

describe('ManagedEmailDnsResolverService', () => {
  it('normalizes independently resolved SPF, DKIM, DMARC, and expected MX evidence', async () => {
    const dnsClient = {
      resolveMx: jest
        .fn()
        .mockResolvedValue([{ exchange: 'aspmx.l.google.com', priority: 1 }]),
      resolveTxt: jest.fn(async (hostname: string) => {
        if (hostname === 'example.com')
          return [['v=spf1 ', 'include:_spf.google.com ~all']];
        if (hostname === 'google._domainkey.example.com')
          return [['v=DKIM1; k=rsa']];
        if (hostname === '_dmarc.example.com') return [['v=DMARC1; p=reject']];
        return [];
      }),
    };
    const service = new ManagedEmailDnsResolverService(dnsClient);

    await expect(
      service.resolve({
        dkimSelector: 'google',
        domain: 'example.com',
        expectedMxSuffixes: ['.google.com'],
      }),
    ).resolves.toEqual({ dkim: true, dmarc: true, mx: true, spf: true });
  });

  it('fails each missing or failed record closed without exposing resolver errors', async () => {
    const service = new ManagedEmailDnsResolverService({
      resolveMx: jest.fn().mockRejectedValue(new Error('resolver details')),
      resolveTxt: jest.fn().mockRejectedValue(new Error('resolver details')),
    });

    await expect(
      service.resolve({
        dkimSelector: 'google',
        domain: 'example.com',
        expectedMxSuffixes: ['.google.com'],
      }),
    ).resolves.toEqual({ dkim: false, dmarc: false, mx: false, spf: false });
  });
});

import { domainToASCII } from 'node:url';

const DNS_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const CUSTOMER_OWNED_DOMAIN_IMPORT_PATTERN = new RegExp(
  `^(?:${DNS_LABEL}\\.)+${DNS_LABEL}$`,
);

export const normalizeCustomerOwnedDomainImport = (
  value: unknown,
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const domain = domainToASCII(value.trim().replace(/\.$/, '')).toLowerCase();

  if (
    !domain ||
    domain.length > 253 ||
    !CUSTOMER_OWNED_DOMAIN_IMPORT_PATTERN.test(domain)
  ) {
    return null;
  }

  return domain;
};

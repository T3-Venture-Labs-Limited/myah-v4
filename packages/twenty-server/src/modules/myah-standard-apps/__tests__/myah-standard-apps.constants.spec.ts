import {
  isMyahStandardAppUniversalIdentifier,
  MYAH_STANDARD_APP_UNIVERSAL_IDENTIFIER_LOOKUP,
} from 'src/modules/myah-standard-apps/myah-standard-apps.constants';

describe('Myah standard app allowlist', () => {
  it('recognizes every immutable Myah standard app identifier', () => {
    expect(
      isMyahStandardAppUniversalIdentifier(
        '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991',
      ),
    ).toBe(true);
    expect(
      isMyahStandardAppUniversalIdentifier(
        '72f2fd16-880c-4c63-852f-dbf63f51c152',
      ),
    ).toBe(true);
    expect(
      isMyahStandardAppUniversalIdentifier(
        '4738ebcd-6662-4ecc-a190-374fa0525951',
      ),
    ).toBe(true);
    expect(
      Object.keys(MYAH_STANDARD_APP_UNIVERSAL_IDENTIFIER_LOOKUP),
    ).toHaveLength(3);
  });

  it('rejects display names and unknown identifiers', () => {
    expect(
      isMyahStandardAppUniversalIdentifier('Brand Brain Record Wiki MVP'),
    ).toBe(false);
    expect(
      isMyahStandardAppUniversalIdentifier(
        '00000000-0000-0000-0000-000000000000',
      ),
    ).toBe(false);
  });
});

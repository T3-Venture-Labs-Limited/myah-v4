import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';

import {
  isRetiredApplicationUniversalIdentifier,
  isSupportedApplicationUniversalIdentifier,
  RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
  RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
  RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';

describe('retired application identifiers', () => {
  it.each([
    RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
    RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
  ])('retires application %s', (universalIdentifier) => {
    expect(isRetiredApplicationUniversalIdentifier(universalIdentifier)).toBe(
      true,
    );
  });

  it.each([
    TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
  ])('supports product application %s', (universalIdentifier) => {
    expect(isSupportedApplicationUniversalIdentifier(universalIdentifier)).toBe(
      true,
    );
  });

  it('does not support a legacy custom application', () => {
    expect(
      isSupportedApplicationUniversalIdentifier(
        '00000000-0000-4000-8000-000000000001',
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { isPermissionError } from 'src/front-components/utils/is-permission-error.util';

describe('isPermissionError', () => {
  it('recognizes forbidden GraphQL errors', () => {
    expect(
      isPermissionError({
        errors: [{ extensions: { code: 'FORBIDDEN' } }],
      }),
    ).toBe(true);
    expect(
      isPermissionError({
        errors: [{ extensions: { subCode: 'PERMISSION_DENIED' } }],
      }),
    ).toBe(true);
  });

  it('does not relabel lifecycle or network errors as permission failures', () => {
    expect(
      isPermissionError({
        errors: [{ extensions: { code: 'BAD_REQUEST' } }],
      }),
    ).toBe(false);
    expect(isPermissionError(new Error('Network unavailable'))).toBe(false);
    expect(isPermissionError(null)).toBe(false);
  });
});

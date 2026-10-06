import { renderHook } from '@testing-library/react';
import { isMyahSubscriptionRequiredState as mockIsMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';

let mockEnabled = true;
let mockState: string | undefined;
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: unknown) =>
    state === mockIsMyahSubscriptionRequiredState
      ? mockEnabled
      : { id: 'workspace' },
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: mockState
      ? { myahWorkspaceUsage: { state: mockState, exhausted: true } }
      : undefined,
  }),
}));

it.each([
  [true, undefined, false],
  [true, 'NEEDS_SUBSCRIPTION', false],
  [true, 'LAPSED', false],
  [true, 'ACTIVE', true],
  [true, 'PAYMENT_RETRYING', true],
  [true, 'COMPLIMENTARY', true],
  [false, undefined, true],
])(
  'enabled=%s state=%s yields access=%s even at the AI limit',
  (enabled, state, expected) => {
    mockEnabled = enabled;
    mockState = state;
    const { result } = renderHook(() => useMyahWorkspaceUsage());
    expect(result.current.hasAccess).toBe(expected);
  },
);

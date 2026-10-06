import { render, screen } from '@testing-library/react';
import { InformationBannerWrapper } from '@/information-banner/components/InformationBannerWrapper';

let mockEnabled = true;
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => {
  const { isMyahSubscriptionRequiredState } = jest.requireActual(
    '@/client-config/states/isMyahSubscriptionRequiredState',
  );
  return {
    useAtomStateValue: (state: unknown) =>
      state === isMyahSubscriptionRequiredState ? mockEnabled : true,
  };
});
jest.mock('@/settings/roles/hooks/usePermissionFlagMap', () => ({
  usePermissionFlagMap: () => ({}),
}));
jest.mock('@/workspace/hooks/useIsWorkspaceActivationStatusEqualsTo', () => ({
  useIsWorkspaceActivationStatusEqualsTo: () => false,
}));
jest.mock('@/workspace/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => 'active',
}));
jest.mock(
  '@/information-banner/components/billing/InformationBannerMyahUsage',
  () => ({ InformationBannerMyahUsage: () => <div>Myah banners</div> }),
);
jest.mock(
  '@/information-banner/components/billing/InformationBannerNoMoreCredits',
  () => ({ InformationBannerNoMoreCredits: () => <div>Legacy credits</div> }),
);
jest.mock(
  '@/information-banner/components/maintenance/InformationBannerMaintenance',
  () => ({ InformationBannerMaintenance: () => <div>Maintenance</div> }),
);

it.each([false, true])(
  'selects only the appropriate billing banners with flag=%s',
  (enabled) => {
    mockEnabled = enabled;
    render(<InformationBannerWrapper />);
    expect(
      screen.getByText(enabled ? 'Myah banners' : 'Legacy credits'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(enabled ? 'Legacy credits' : 'Myah banners'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  },
);

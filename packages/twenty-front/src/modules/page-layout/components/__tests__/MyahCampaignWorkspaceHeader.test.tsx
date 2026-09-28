import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { MyahCampaignWorkspaceHeader } from '@/page-layout/components/MyahCampaignWorkspaceHeader';

let canReadCampaign = true;
let restrictedFields: Record<string, { canRead: boolean }> = {};
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: {
      id: 'campaign-meta',
      fields: [
        { id: 'name-field', name: 'name' },
        { id: 'status-field', name: 'lifecycleStatus' },
        { id: 'objective-field', name: 'objective' },
      ],
    },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: canReadCampaign,
    restrictedFields,
  }),
}));
beforeEach(() => {
  canReadCampaign = true;
  restrictedFields = {};
});

it('shows only the loaded campaign identity and lifecycle without invented metrics or controls', () => {
  const store = createStore();
  store.set(recordStoreFamilyState.atomFamily('campaign-a'), {
    __typename: 'Campaign',
    id: 'campaign-a',
    name: 'Autumn studio launch',
    lifecycleStatus: 'PAUSED',
    objective: 'Creator partnerships',
  });
  render(
    <Provider store={store}>
      <MyahCampaignWorkspaceHeader campaignId="campaign-a" />
    </Provider>,
  );
  const header = screen.getByRole('banner', { name: 'Campaign identity' });
  expect(header).toHaveTextContent('Autumn studio launch');
  expect(header).toHaveTextContent('Stopped');
  expect(header).toHaveTextContent('Creator partnerships');
  expect(header).not.toHaveTextContent(/review launch|\d+ influencers/i);
  expect(header).not.toContainElement(screen.queryByRole('button'));
});

it.each([
  ['name-field', 'Private studio launch', 'Campaign'],
  ['status-field', 'Active', 'Private studio launch'],
  ['objective-field', 'Private Creator plan', 'Private studio launch'],
])(
  'hides cached %s when its read permission is revoked while object read remains allowed',
  (fieldId, hiddenValue, retainedValue) => {
    const store = createStore();
    store.set(recordStoreFamilyState.atomFamily('campaign-a'), {
      __typename: 'Campaign',
      id: 'campaign-a',
      name: 'Private studio launch',
      lifecycleStatus: 'ACTIVE',
      objective: 'Private Creator plan',
    });
    const control = () => (
      <Provider store={store}>
        <MyahCampaignWorkspaceHeader campaignId="campaign-a" />
      </Provider>
    );
    const { rerender } = render(control());
    const header = screen.getByRole('banner', { name: 'Campaign identity' });
    expect(header).toHaveTextContent(hiddenValue);

    restrictedFields = { [fieldId]: { canRead: false } };
    rerender(control());
    expect(header).not.toHaveTextContent(hiddenValue);
    expect(header).toHaveTextContent(retainedValue);

    restrictedFields = {};
    rerender(control());
    expect(header).toHaveTextContent(hiddenValue);
  },
);

it('does not reuse another campaign identity when this record has not loaded', () => {
  const store = createStore();
  store.set(recordStoreFamilyState.atomFamily('campaign-a'), {
    __typename: 'Campaign',
    id: 'campaign-a',
    name: 'Old campaign',
    lifecycleStatus: 'ACTIVE',
  });
  render(
    <Provider store={store}>
      <MyahCampaignWorkspaceHeader campaignId="campaign-b" />
    </Provider>,
  );
  expect(screen.getByRole('heading', { name: 'Campaign' })).toBeVisible();
  expect(screen.queryByText('Old campaign')).not.toBeInTheDocument();
  expect(screen.queryByText('Active')).not.toBeInTheDocument();
});

it('hides cached Campaign identity, objective and lifecycle on read revocation', () => {
  const store = createStore();
  store.set(recordStoreFamilyState.atomFamily('campaign-a'), {
    __typename: 'Campaign',
    id: 'campaign-a',
    name: 'Private studio launch',
    lifecycleStatus: 'ACTIVE',
    objective: 'Private Creator plan',
  });
  const control = () => (
    <Provider store={store}>
      <MyahCampaignWorkspaceHeader campaignId="campaign-a" />
    </Provider>
  );
  const { rerender } = render(control());
  const header = screen.getByRole('banner', { name: 'Campaign identity' });
  expect(header).toHaveTextContent('Private studio launch');
  expect(header).toHaveTextContent('Active');
  expect(header).toHaveTextContent('Private Creator plan');

  canReadCampaign = false;
  rerender(control());
  expect(header).toHaveTextContent('Campaign');
  expect(header).not.toHaveTextContent('Private studio launch');
  expect(header).not.toHaveTextContent('Active');
  expect(header).not.toHaveTextContent('Private Creator plan');

  canReadCampaign = true;
  rerender(control());
  expect(header).toHaveTextContent('Private studio launch');
});

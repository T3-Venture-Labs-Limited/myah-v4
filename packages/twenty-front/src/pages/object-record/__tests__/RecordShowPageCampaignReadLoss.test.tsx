import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { FieldMetadataType } from 'twenty-shared/types';

import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { ObjectRecordShowPageBreadcrumb } from '@/object-record/record-show/components/ObjectRecordShowPageBreadcrumb';
import { RecordShowEffect } from '@/object-record/record-show/components/RecordShowEffect';
import { MyahCampaignWorkspaceHeader } from '@/page-layout/components/MyahCampaignWorkspaceHeader';
import { DocumentTitleProvider } from '@/ui/utilities/page-title/components/DocumentTitleProvider';
import { RecordShowPageTitle } from '~/pages/object-record/RecordShowPageTitle';

const navigateToIndexView = jest.fn();
let groupValueLabel: string | undefined;
let recordAvailable = true;
let showQuery: {
  record?: {
    __typename: string;
    id: string;
    name: string;
    lifecycleStatus: string;
    objective: string;
  };
  loading: boolean;
  error?: Error;
  hasReadPermission: boolean;
};
const nameField = {
  id: 'name-field',
  universalIdentifier: 'name-field',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  name: 'name',
  label: 'Name',
  type: FieldMetadataType.TEXT,
};

jest.mock('@/localization/hooks/useNumberFormat', () => ({
  useNumberFormat: () => ({ formatNumber: String }),
}));
jest.mock('@/object-metadata/components/ObjectMetadataIcon', () => ({
  ObjectMetadataIcon: () => <span aria-hidden="true" />,
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    objectMetadataItem: {
      id: `${objectNameSingular}-meta`,
      labelSingular: objectNameSingular === 'campaign' ? 'Campaign' : 'Company',
      fields: [
        { id: 'name-field', name: 'name' },
        { id: 'status-field', name: 'lifecycleStatus' },
        { id: 'objective-field', name: 'objective' },
      ],
    },
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));
jest.mock(
  '@/object-record/record-show/graphql/operations/factories/findOneRecordForShowPageOperationSignatureFactory',
  () => ({
    buildFindOneRecordForShowPageOperationSignature: () => ({
      fields: { name: true },
    }),
  }),
);
jest.mock(
  '@/object-metadata/hooks/useLabelIdentifierFieldMetadataItem',
  () => ({
    useLabelIdentifierFieldMetadataItem: () => ({
      labelIdentifierFieldMetadataItem: {
        id: 'name-field',
        name: 'name',
        type: 'TEXT',
      },
    }),
  }),
);
// Keep the real native permission calculation, but avoid Apollo/network during this render.
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: ({
    objectNameSingular,
    withSoftDeleted,
  }: {
    objectNameSingular: string;
    withSoftDeleted?: boolean;
  }) => {
    const hasReadPermission = useObjectPermissionsForObject(
      `${objectNameSingular}-meta`,
    ).canReadObjectRecords;
    return withSoftDeleted
      ? {
          ...showQuery,
          hasReadPermission: showQuery.hasReadPermission && hasReadPermission,
        }
      : { loading: false, hasReadPermission };
  },
}));
jest.mock('@/object-record/read-only/hooks/useIsRecordFieldReadOnly', () => ({
  useIsRecordFieldReadOnly: () => true,
}));
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerActions',
  () => ({
    useRecordShowContainerActions: () => ({
      useUpdateOneObjectRecordMutation: jest.fn(),
    }),
  }),
);
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowPagePagination',
  () => ({
    useRecordShowPagePagination: () => ({
      rankInView: 0,
      totalCount: 1,
      navigateToIndexView,
    }),
  }),
);
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowPageGroupByBreadcrumbInfo',
  () => ({
    useRecordShowPageGroupByBreadcrumbInfo: () => ({
      isGroupByActive: Boolean(groupValueLabel),
      isGroupValueLoading: false,
      viewName: 'Current campaigns',
      groupValueLabel,
    }),
  }),
);
jest.mock(
  '@/object-record/record-field/ui/hooks/usePersistFieldFromFieldInputContext',
  () => ({
    usePersistFieldFromFieldInputContext: () => ({
      persistFieldFromFieldInputContext: jest.fn(),
    }),
  }),
);
jest.mock('@/object-record/record-title-cell/hooks/useRecordTitleCell', () => ({
  useRecordTitleCell: () => ({
    openRecordTitleCell: jest.fn(),
    closeRecordTitleCell: jest.fn(),
  }),
}));

const permission = (
  objectMetadataId: string,
  canReadObjectRecords: boolean,
) => ({
  objectMetadataId,
  canReadObjectRecords,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
});

const mount = (objectNameSingular: 'campaign' | 'company') => {
  const store = createStore();
  const id = `${objectNameSingular}-record`;
  store.set(recordStoreFamilyState.atomFamily(id), {
    __typename: objectNameSingular === 'campaign' ? 'Campaign' : 'Company',
    id,
    name: 'Private studio launch',
  });
  store.set(currentWorkspaceState.atom, { id: 'workspace-a' } as never);
  store.set(tokenPairState.atom, {
    accessOrWorkspaceAgnosticToken: {
      token: `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-a', userId: 'test-user', userWorkspaceId: 'test-member' }))}.signature`,
    },
  } as never);
  const allowed = permission(`${objectNameSingular}-meta`, true);
  store.set(currentUserWorkspaceState.atom, {
    permissionFlags: [],
    twoFactorAuthenticationMethodSummary: null,
    objectsPermissions: [allowed],
  });
  const view = () => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/objects/${objectNameSingular}/${id}`]}>
        <DocumentTitleProvider>
          <ObjectRecordShowPageBreadcrumb
            objectNameSingular={objectNameSingular}
            objectRecordId={id}
            objectLabel={
              objectNameSingular === 'campaign' ? 'Campaigns' : 'Companies'
            }
            labelIdentifierFieldMetadataItem={nameField}
            compactOnMobile
            isRecordAvailable={recordAvailable}
          />
          <RecordShowPageTitle
            objectNameSingular={objectNameSingular}
            objectRecordId={id}
            isRecordAvailable={recordAvailable}
          />
        </DocumentTitleProvider>
      </MemoryRouter>
    </Provider>
  );
  const { container, rerender } = render(view());
  return { store, container, allowed, rerenderPage: () => rerender(view()) };
};

describe('retained record title on explicit Campaign read loss', () => {
  beforeEach(() => {
    navigateToIndexView.mockClear();
    groupValueLabel = undefined;
    recordAvailable = true;
    showQuery = { loading: false, hasReadPermission: true };
  });
  it('redacts the cached name in breadcrumb, tooltip and document title while keeping index navigation', () => {
    groupValueLabel = 'Private studio launch';
    const { store, container, allowed } = mount('campaign');
    expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
      'Private studio launch',
    );
    expect(document.title).toBe('Private studio launch - Campaign');
    expect(screen.getByTitle(/Private studio launch/)).toBeInTheDocument();

    act(() => {
      store.set(currentUserWorkspaceState.atom, {
        permissionFlags: [],
        twoFactorAuthenticationMethodSummary: null,
        objectsPermissions: [{ ...allowed, canReadObjectRecords: false }],
      });
    });

    const breadcrumb = screen.getByTestId('top-bar-title');
    expect(breadcrumb).toHaveTextContent('Campaigns');
    expect(breadcrumb).toHaveTextContent('Campaign');
    expect(breadcrumb).not.toHaveTextContent('Private studio launch');
    expect(breadcrumb).not.toHaveTextContent('(1/1)');
    expect(
      screen.queryByTitle(/Private studio launch/),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('Private studio launch');
    expect(document.title).toBe('Campaign');
    const back = screen.getByRole('button', { name: 'Back to Campaigns' });
    fireEvent.keyDown(back, { key: 'Enter' });
    fireEvent.keyDown(back, { key: ' ' });
    expect(navigateToIndexView).toHaveBeenCalledTimes(2);
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-record'))?.name,
    ).toBe('Private studio launch');
  });

  it('redacts a cached Campaign name on field-read revocation without losing object access, then restores it', () => {
    const { store, container, allowed } = mount('campaign');
    expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
      'Private studio launch',
    );
    expect(document.title).toBe('Private studio launch - Campaign');

    act(() => {
      store.set(currentUserWorkspaceState.atom, {
        permissionFlags: [],
        twoFactorAuthenticationMethodSummary: null,
        objectsPermissions: [
          {
            ...allowed,
            restrictedFields: {
              'name-field': { canRead: false, canUpdate: true },
            },
          },
        ],
      });
    });
    expect(screen.getByTestId('top-bar-title')).toHaveTextContent('Campaign');
    expect(container.innerHTML).not.toContain('Private studio launch');
    expect(document.title).toBe('Campaign');
    expect(screen.getByText('(1/1)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Back to Campaigns' }),
    ).toBeVisible();
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-record'))?.name,
    ).toBe('Private studio launch');

    act(() => {
      store.set(currentUserWorkspaceState.atom, {
        permissionFlags: [],
        twoFactorAuthenticationMethodSummary: null,
        objectsPermissions: [allowed],
      });
    });
    expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
      'Private studio launch',
    );
    expect(document.title).toBe('Private studio launch - Campaign');
  });

  it.each([
    ['no record', undefined],
    ['denied query', new Error('Record access denied')],
  ])(
    'removes loaded campaign identity after a settled %s while field and object permissions stay allowed',
    (_reason, error) => {
      const { store, container, allowed } = mount('campaign');
      const campaignRecord = {
        __typename: 'Campaign',
        id: 'campaign-record',
        name: 'Private studio launch',
        lifecycleStatus: 'ACTIVE',
        objective: 'Private Creator plan',
      };
      showQuery = {
        record: campaignRecord,
        loading: false,
        hasReadPermission: true,
      };
      act(() =>
        store.set(
          recordStoreFamilyState.atomFamily('campaign-record'),
          campaignRecord,
        ),
      );
      store.set(recordStoreFamilyState.atomFamily('other-campaign'), {
        __typename: 'Campaign',
        id: 'other-campaign',
        name: 'Other campaign',
      });
      const view = () => (
        <Provider store={store}>
          <RecordShowEffect
            objectNameSingular="campaign"
            recordId="campaign-record"
          />
          <MyahCampaignWorkspaceHeader campaignId="campaign-record" />
        </Provider>
      );
      const { rerender } = render(view());
      expect(
        screen.getByRole('heading', { name: 'Private studio launch' }),
      ).toBeVisible();
      expect(
        screen.getByRole('banner', { name: 'Campaign identity' }),
      ).toHaveTextContent('Private Creator plan');
      expect(document.title).toBe('Private studio launch - Campaign');

      showQuery = { record: undefined, loading: true, hasReadPermission: true };
      rerender(view());
      expect(
        store.get(recordStoreFamilyState.atomFamily('campaign-record'))?.name,
      ).toBe('Private studio launch');

      showQuery = {
        record: error ? campaignRecord : undefined,
        loading: false,
        error,
        hasReadPermission: true,
      };
      rerender(view());
      expect(allowed.canReadObjectRecords).toBe(true);
      expect(allowed.restrictedFields).toEqual({});
      expect(
        store.get(recordStoreFamilyState.atomFamily('campaign-record')),
      ).toBeNull();
      expect(
        store.get(recordStoreFamilyState.atomFamily('other-campaign'))?.name,
      ).toBe('Other campaign');
      expect(screen.getByRole('heading', { name: 'Campaign' })).toBeVisible();
      expect(
        screen.getByRole('banner', { name: 'Campaign identity' }),
      ).not.toHaveTextContent('Private Creator plan');
      expect(container.innerHTML).not.toContain('Private studio launch');
      expect(document.title).toBe('Campaign');

      showQuery = {
        record: campaignRecord,
        loading: false,
        hasReadPermission: true,
      };
      rerender(view());
      expect(
        screen.getByRole('heading', { name: 'Private studio launch' }),
      ).toBeVisible();
      expect(document.title).toBe('Private studio launch - Campaign');
    },
  );

  it.each([
    ['missing', undefined],
    ['failed', new Error('Read denied')],
  ])(
    'keeps only safe index navigation after loaded → %s read with object permission intact',
    (_state, error) => {
      const { store, allowed, rerenderPage } = mount('campaign');
      const campaignRecord = {
        __typename: 'Campaign',
        id: 'campaign-record',
        name: 'Private studio launch',
        lifecycleStatus: 'ACTIVE',
        objective: 'Private Creator plan',
      };
      showQuery = {
        record: campaignRecord,
        loading: false,
        hasReadPermission: true,
      };
      const effect = () => (
        <Provider store={store}>
          <RecordShowEffect
            objectNameSingular="campaign"
            recordId="campaign-record"
          />
        </Provider>
      );
      const { rerender } = render(effect());
      expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
        'Private studio launch',
      );

      showQuery = {
        record: error ? campaignRecord : undefined,
        error,
        loading: false,
        hasReadPermission: true,
      };
      rerender(effect());
      recordAvailable = false;
      rerenderPage();
      expect(allowed.canReadObjectRecords).toBe(true);
      expect(
        store.get(recordStoreFamilyState.atomFamily('campaign-record')),
      ).toBeNull();
      expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
        'Campaigns / Campaign',
      );
      expect(screen.getByTestId('top-bar-title')).not.toHaveTextContent(
        'Untitled',
      );
      expect(screen.getByTestId('top-bar-title')).not.toHaveTextContent(
        '(1/1)',
      );
      expect(document.title).toBe('Campaign');
      fireEvent.keyDown(
        screen.getByRole('button', { name: 'Back to Campaigns' }),
        { key: 'Enter' },
      );
      expect(navigateToIndexView).toHaveBeenCalledTimes(1);
    },
  );

  it('clears a cached record on object read loss even if a skipped query still exposes cached data', () => {
    const { store, allowed } = mount('campaign');
    const campaignRecord = {
      __typename: 'Campaign',
      id: 'campaign-record',
      name: 'Private studio launch',
      lifecycleStatus: 'ACTIVE',
      objective: 'Private Creator plan',
    };
    showQuery = {
      record: campaignRecord,
      loading: false,
      hasReadPermission: true,
    };
    const view = () => (
      <Provider store={store}>
        <RecordShowEffect
          objectNameSingular="campaign"
          recordId="campaign-record"
        />
      </Provider>
    );
    const { rerender } = render(view());
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-record'))?.name,
    ).toBe('Private studio launch');

    act(() => {
      store.set(currentUserWorkspaceState.atom, {
        permissionFlags: [],
        twoFactorAuthenticationMethodSummary: null,
        objectsPermissions: [{ ...allowed, canReadObjectRecords: false }],
      });
    });
    showQuery = {
      record: campaignRecord,
      loading: true,
      hasReadPermission: false,
    };
    rerender(view());
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-record')),
    ).toBeNull();
  });

  it('invalidates a Campaign show effect on workspace change even when the record id is unchanged', () => {
    const { store } = mount('campaign');
    showQuery = {
      record: {
        __typename: 'Campaign',
        id: 'campaign-record',
        name: 'Private studio launch',
        lifecycleStatus: 'ACTIVE',
        objective: '',
      },
      loading: false,
      hasReadPermission: true,
    };
    const view = () => (
      <Provider store={store}>
        <RecordShowEffect
          objectNameSingular="campaign"
          recordId="campaign-record"
        />
      </Provider>
    );
    const { rerender } = render(view());
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-record'))?.name,
    ).toBe('Private studio launch');
    showQuery = {
      record: showQuery.record,
      loading: true,
      hasReadPermission: true,
    };
    rerender(view());
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-record'))?.name,
    ).toBe('Private studio launch');
    act(() =>
      store.set(currentWorkspaceState.atom, { id: 'workspace-b' } as never),
    );
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-record')),
    ).toBeNull();
  });

  it.each([
    ['no record', undefined],
    ['query error', new Error('Read failed')],
  ])(
    'retains a non-Campaign record through settled %s and refetch loading',
    (_case, error) => {
      const { store, allowed } = mount('company');
      const view = () => (
        <Provider store={store}>
          <RecordShowEffect
            objectNameSingular="company"
            recordId="company-record"
          />
        </Provider>
      );
      showQuery = {
        record: {
          __typename: 'Company',
          id: 'company-record',
          name: 'Private studio launch',
          lifecycleStatus: '',
          objective: '',
        },
        loading: false,
        hasReadPermission: true,
      };
      const { rerender } = render(view());
      showQuery = { record: undefined, loading: true, hasReadPermission: true };
      rerender(view());
      expect(
        store.get(recordStoreFamilyState.atomFamily('company-record'))?.name,
      ).toBe('Private studio launch');
      showQuery = {
        record: undefined,
        loading: false,
        error,
        hasReadPermission: true,
      };
      rerender(view());
      expect(
        store.get(recordStoreFamilyState.atomFamily('company-record'))?.name,
      ).toBe('Private studio launch');
      expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
        'Private studio launch',
      );
      act(() =>
        store.set(currentUserWorkspaceState.atom, {
          permissionFlags: [],
          twoFactorAuthenticationMethodSummary: null,
          objectsPermissions: [{ ...allowed, canReadObjectRecords: false }],
        }),
      );
      expect(
        store.get(recordStoreFamilyState.atomFamily('company-record'))?.name,
      ).toBe('Private studio launch');
      act(() =>
        store.set(currentUserWorkspaceState.atom, {
          permissionFlags: [],
          twoFactorAuthenticationMethodSummary: null,
          objectsPermissions: [allowed],
        }),
      );
      showQuery = { record: undefined, loading: true, hasReadPermission: true };
      rerender(view());
      expect(
        store.get(recordStoreFamilyState.atomFamily('company-record'))?.name,
      ).toBe('Private studio launch');
      showQuery = {
        record: {
          __typename: 'Company',
          id: 'company-record',
          name: 'Updated company',
          lifecycleStatus: '',
          objective: '',
        },
        loading: false,
        hasReadPermission: true,
      };
      rerender(view());
      expect(
        store.get(recordStoreFamilyState.atomFamily('company-record'))?.name,
      ).toBe('Updated company');
    },
  );

  it('does not change non-Campaign record title display on the same permission transition', () => {
    const { store, allowed } = mount('company');
    expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
      'Private studio launch',
    );
    act(() => {
      store.set(currentUserWorkspaceState.atom, {
        permissionFlags: [],
        twoFactorAuthenticationMethodSummary: null,
        objectsPermissions: [{ ...allowed, canReadObjectRecords: false }],
      });
    });
    expect(screen.getByTestId('top-bar-title')).toHaveTextContent(
      'Private studio launch',
    );
    expect(document.title).toBe('Private studio launch - Company');
  });
});

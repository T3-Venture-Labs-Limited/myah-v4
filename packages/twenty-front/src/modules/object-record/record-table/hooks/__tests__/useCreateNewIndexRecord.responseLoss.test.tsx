import { useBuildRecordInputFromRLSPredicates } from '@/object-record/hooks/useBuildRecordInputFromRLSPredicates';
import { useBuildRecordInputFromFilters } from '@/object-record/record-table/hooks/useBuildRecordInputFromFilters';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { RecordTableComponentInstanceContext } from '@/object-record/record-table/states/context/RecordTableComponentInstanceContext';
import { RecordTableNoRecordGroupAddNew } from '@/object-record/record-table/components/RecordTableNoRecordGroupAddNew';
import { RecordTableContextProvider } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { totalNumberOfRecordsToVirtualizeComponentState } from '@/object-record/record-table/virtualization/states/totalNumberOfRecordsToVirtualizeComponentState';
import { recordIdByRealIndexComponentState } from '@/object-record/record-table/virtualization/states/recordIdByRealIndexComponentState';
import { encodeCursor } from '@/apollo/utils/encodeCursor';
import { triggerCreateRecordsOptimisticEffect } from '@/apollo/optimistic-effect/utils/triggerCreateRecordsOptimisticEffect';
import { generateGroupByAggregateQuery } from '@/object-record/record-aggregate/utils/generateGroupByAggregateQuery';
import { generateGroupByRecordsQuery } from '@/object-record/utils/generateGroupByRecordsQuery';
import { recordGroupIdsComponentState } from '@/object-record/record-group/states/recordGroupIdsComponentState';
import { recordGroupDefinitionFamilyState } from '@/object-record/record-group/states/recordGroupDefinitionFamilyState';
import { RecordGroupDefinitionType } from '@/object-record/record-group/types/RecordGroupDefinition';
import { recordIndexGroupFieldMetadataItemComponentState } from '@/object-record/record-index/states/recordIndexGroupFieldMetadataComponentState';
import { recordIndexRecordIdsByGroupComponentFamilyState } from '@/object-record/record-index/states/recordIndexRecordIdsByGroupComponentFamilyState';
import { generateAggregateQuery } from '@/object-record/utils/generateAggregateQuery';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { ServerError } from '@apollo/client/errors';
import { assertCampaignCreationCurrent } from '@/apollo/utils/campaignCreationOperation';
import { type CampaignCreationOperationContext } from '@/object-record/record-index/types/CampaignCreationAttempt';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME } from '@/browser-event/constants/ObjectRecordOperationBrowserEventName';
import { CreateNewIndexRecordNoSelectionRecordCommand } from '@/command-menu-item/engine-command/record/no-selection/components/CreateNewIndexRecordNoSelectionRecordCommand';
import { headlessCommandContextApisState } from '@/command-menu-item/engine-command/states/headlessCommandContextApisState';
import { CommandComponentInstanceContext } from '@/command-menu-item/engine-command/states/contexts/CommandComponentInstanceContext';
import { commandMenuItemProgressFamilyState } from '@/command-menu-item/states/commandMenuItemProgressFamilyState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { snackBarInternalComponentState } from '@/ui/feedback/snack-bar-manager/states/snackBarInternalComponentState';
import { getRecordFromCache } from '@/object-record/cache/utils/getRecordFromCache';
import { getRecordNodeFromRecord } from '@/object-record/cache/utils/getRecordNodeFromRecord';
import { generateDepthRecordGqlFieldsFromObject } from '@/object-record/graphql/record-gql-fields/utils/generateDepthRecordGqlFieldsFromObject';
import { useCreateOneRecordInCache } from '@/object-record/cache/hooks/useCreateOneRecordInCache';
import { getRecordFromRecordNode } from '@/object-record/cache/utils/getRecordFromRecordNode';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { triggerAttachRelationOptimisticEffect } from '@/apollo/optimistic-effect/utils/triggerAttachRelationOptimisticEffect';
import { ApolloLink, gql, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { addTypenameToDocument } from '@apollo/client/utilities';
import {
  act,
  fireEvent,
  screen,
  cleanup,
  renderHook,
  render,
  waitFor,
} from '@testing-library/react';
import {
  type DocumentNode,
  getOperationAST,
  Kind,
  parse,
  print,
} from 'graphql';
import { createStore, Provider } from 'jotai';
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';
import { type ReactNode } from 'react';
import { CampaignCreationSessionEffect } from '@/object-record/record-index/components/CampaignCreationSessionEffect';
import { campaignCreationState } from '@/object-record/record-index/states/campaignCreationState';
import { RecordIndexSurfaceCreationOptionsEffect } from '@/object-record/record-index/components/RecordIndexSurface';
import { BrowserRouter } from 'react-router-dom';
import {
  AppPath,
  ViewFilterOperand,
  RowLevelPermissionPredicateOperand,
  RelationType,
  type ObjectPermissions,
} from 'twenty-shared/types';
import { z } from 'zod';
import { ApolloFactory } from '@/apollo/services/apollo.factory';
import {
  currentWorkspaceState,
  type CurrentWorkspace,
} from '@/auth/states/currentWorkspaceState';
import {
  currentUserState,
  type CurrentUser,
} from '@/auth/states/currentUserState';
import {
  currentWorkspaceMemberState,
  type CurrentWorkspaceMember,
} from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import {
  tokenPairState,
  TOKEN_PAIR_LOCAL_STORAGE_KEY,
} from '@/auth/states/tokenPairState';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { ContextStoreViewType } from '@/context-store/types/ContextStoreViewType';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { generateCreateOneRecordMutation } from '@/object-metadata/utils/generateCreateOneRecordMutation';
import { generateUpdateOneRecordMutation } from '@/object-metadata/utils/generateUpdateOneRecordMutation';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { type RecordGqlNode } from '@/object-record/graphql/types/RecordGqlNode';
import { useFindOneRecordQuery } from '@/object-record/hooks/useFindOneRecordQuery';
import { recordIndexOpenRecordInState } from '@/object-record/record-index/states/recordIndexOpenRecordInState';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import {
  type AuthTokenPair,
  EngineComponentKey,
  FieldMetadataType,
  ViewOpenRecordIn,
} from '~/generated-metadata/graphql';
import { JestContextStoreSetter } from '~/testing/jest/JestContextStoreSetter';
import { JestObjectMetadataItemSetter } from '~/testing/jest/JestObjectMetadataItemSetter';
import {
  mockCurrentWorkspace,
  mockedUserData,
  mockedWorkspaceMemberData,
} from '~/testing/mock-data/users';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

// This suite mounts the native creation-options effect, not the visual index/DnD tree.
jest.mock(
  '@/object-record/record-index/components/RecordIndexContainer',
  () => ({
    RecordIndexContainer: () => {
      throw new Error(
        'Unexpected visual index render in Campaign creation fixture',
      );
    },
  }),
);
jest.mock(
  '@/object-record/record-table/record-table-row/components/RecordTableActionRow',
  () => ({
    RecordTableActionRow: ({
      text,
      onClick,
    }: {
      text: string;
      onClick: () => void;
    }) => <button onClick={onClick}>{text}</button>,
  }),
);
const mockNavigate = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();
const mockCloseSidePanelMenu = jest.fn();
jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));
jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: mockCloseSidePanelMenu }),
}));

const CAMPAIGN_METADATA_ID = '34700000-0000-4000-8000-000000000001';
const WORKSPACE_ID = '34700000-0000-4000-8000-000000000002';
const USER_ID = '34700000-0000-4000-8000-000000000003';
const USER_WORKSPACE_ID = '34700000-0000-4000-8000-000000000004';
const MEMBER_ID = '34700000-0000-4000-8000-000000000005';
const VIEW_ID = '34700000-0000-4000-8000-000000000006';
const INDEX_ID = `campaigns-${VIEW_ID}`;
const RETURN_PATH = `/objects/campaigns?viewId=${VIEW_ID}`;
const standardMetadata = getTestEnrichedObjectMetadataItemsMock();
const company = standardMetadata.find(
  (item) => item.nameSingular === 'company',
);
if (!company) throw new Error('Native Company metadata fixture missing');
const requiredField = (name: string): FieldMetadataItem => {
  const field = company.fields.find((item) => item.name === name);
  if (!field) throw new Error(`Native scalar metadata missing: ${name}`);
  return field;
};
const fieldNames = [
  'id',
  'name',
  'objective',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'position',
];
const fields: FieldMetadataItem[] = fieldNames.map((name, index) => ({
  ...requiredField(name === 'objective' ? 'name' : name),
  id: `34700000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
  objectMetadataId: CAMPAIGN_METADATA_ID,
  universalIdentifier: `34700000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`,
  name,
  label: name === 'objective' ? 'Objective' : requiredField(name).label,
  ...(['name', 'objective'].includes(name)
    ? {
        type: FieldMetadataType.TEXT,
        defaultValue: name === 'name' ? "''" : null,
        isNullable: true,
      }
    : {}),
}));
const campaign: EnrichedObjectMetadataItem = {
  ...company,
  id: CAMPAIGN_METADATA_ID,
  universalIdentifier: '34700000-0000-4000-8000-000000000007',
  nameSingular: 'campaign',
  namePlural: 'campaigns',
  labelSingular: 'Campaign',
  labelPlural: 'Campaigns',
  isUICreatable: true,
  isUIEditable: true,
  isRemote: false,
  fields,
  readableFields: fields,
  updatableFields: fields,
  labelIdentifierFieldMetadataId: fields[1].id,
  imageIdentifierFieldMetadataId: null,
  indexMetadatas: [],
  searchFieldMetadatas: [],
};
const metadata = [...standardMetadata, campaign];
const selectedFields = Object.fromEntries(
  fieldNames.map((name) => [name, true]),
);
const permissions: ObjectPermissions & { objectMetadataId: string } = {
  objectMetadataId: CAMPAIGN_METADATA_ID,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
};
const tokenPair = (identity: Record<string, unknown>): AuthTokenPair => ({
  accessOrWorkspaceAgnosticToken: {
    token: `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(
      JSON.stringify({
        type: 'ACCESS',
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
        workspaceMemberId: MEMBER_ID,
        ...identity,
      }),
    )}.fixture`,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
  refreshToken: {
    token: 'synthetic-refresh',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
});
const workspaceMemberMetadata = standardMetadata.find(
  (item) => item.nameSingular === 'workspaceMember',
);
if (!workspaceMemberMetadata)
  throw new Error('Native WorkspaceMember metadata missing');
const ownerBase = company.fields.find((field) => field.name === 'accountOwner');
const inverseBase = workspaceMemberMetadata.fields.find(
  (field) => field.name === 'accountOwnerForCompanies',
);
if (!ownerBase?.relation || !inverseBase?.relation)
  throw new Error('Native owner relation fixture missing');
const ownerFieldId = '34700000-0000-4000-8000-000000000301';
const inverseFieldId = '34700000-0000-4000-8000-000000000302';
const campaignRef = {
  id: campaign.id,
  nameSingular: 'campaign',
  namePlural: 'campaigns',
};
const memberRef = {
  id: workspaceMemberMetadata.id,
  nameSingular: 'workspaceMember',
  namePlural: 'workspaceMembers',
};
const ownerField: FieldMetadataItem = {
  ...ownerBase,
  id: ownerFieldId,
  universalIdentifier: ownerFieldId,
  objectMetadataId: campaign.id,
  name: 'owner',
  label: 'Owner',
  settings: {
    ...ownerBase.settings,
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'ownerId',
  },
  relation: {
    ...ownerBase.relation,
    sourceObjectMetadata: campaignRef,
    targetObjectMetadata: memberRef,
    sourceFieldMetadata: { id: ownerFieldId, name: 'owner' },
    targetFieldMetadata: { id: inverseFieldId, name: 'ownedCampaigns' },
  },
};
const inverseField: FieldMetadataItem = {
  ...inverseBase,
  id: inverseFieldId,
  universalIdentifier: inverseFieldId,
  objectMetadataId: workspaceMemberMetadata.id,
  name: 'ownedCampaigns',
  label: 'Owned campaigns',
  isNullable: true,
  isUIEditable: false,
  settings: { relationType: RelationType.ONE_TO_MANY },
  relation: {
    ...inverseBase.relation,
    sourceObjectMetadata: memberRef,
    targetObjectMetadata: campaignRef,
    sourceFieldMetadata: { id: inverseFieldId, name: 'ownedCampaigns' },
    targetFieldMetadata: { id: ownerFieldId, name: 'owner' },
  },
};
const ownerCampaignFields = [...campaign.fields, ownerField];
const ownerCampaign: EnrichedObjectMetadataItem = {
  ...campaign,
  fields: ownerCampaignFields,
  readableFields: ownerCampaignFields,
  updatableFields: ownerCampaignFields,
};
const memberScalarFields = [
  'id',
  'name',
  'avatarUrl',
  'createdAt',
  'updatedAt',
  'deletedAt',
].map((name) => {
  const field = workspaceMemberMetadata.fields.find(
    (candidate) => candidate.name === name,
  );
  if (!field) throw new Error(`Native member field missing: ${name}`);
  return field;
});
const memberFields = [...memberScalarFields, inverseField];
const ownerMember: EnrichedObjectMetadataItem = {
  ...workspaceMemberMetadata,
  fields: memberFields,
  readableFields: memberFields,
  updatableFields: memberScalarFields,
};
const ownerMetadata = [
  ...standardMetadata.filter((item) => item.id !== ownerMember.id),
  ownerMember,
  ownerCampaign,
];
const ownerPermissions = {
  [ownerCampaign.id]: permissions,
  [ownerMember.id]: {
    ...permissions,
    objectMetadataId: ownerMember.id,
    canReadObjectRecords: true,
  },
};
const ownerSelectedFields = generateDepthRecordGqlFieldsFromObject({
  objectMetadataItem: ownerCampaign,
  objectMetadataItems: ownerMetadata,
  depth: 1,
});
const memberSelectedFields = generateDepthRecordGqlFieldsFromObject({
  objectMetadataItem: ownerMember,
  objectMetadataItems: ownerMetadata,
  depth: 1,
});
const now = '2026-01-01T00:00:00.000Z';
const ownerIdentity = {
  __typename: 'WorkspaceMember',
  id: MEMBER_ID,
  name: { __typename: 'FullName', firstName: 'Campaign', lastName: 'Owner' },
};
const existingCampaign: RecordGqlNode = {
  __typename: 'Campaign',
  id: '34700000-0000-4000-8000-000000000303',
  name: 'Existing owned Campaign',
  objective: 'Existing',
  position: 10,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ownerId: MEMBER_ID,
  owner: ownerIdentity,
};
const memberNode: RecordGqlNode = {
  ...ownerIdentity,
  avatarUrl: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ownedCampaigns: {
    __typename: 'CampaignConnection',
    edges: [
      {
        __typename: 'CampaignEdge',
        node: {
          __typename: 'Campaign',
          id: existingCampaign.id,
          name: existingCampaign.name,
        },
      },
    ],
  },
};

const scalarCampaign = campaign;
const scalarMetadata = metadata;
const scalarSelectedFields = selectedFields;
type Delivery = 'deliver' | 'fail-before-save' | 'fail-after-save';
const listQuery = gql`
  query FindManyCampaigns(
    $filter: CampaignFilterInput
    $orderBy: [CampaignOrderByInput!]
  ) {
    campaigns(filter: $filter, orderBy: $orderBy) {
      edges {
        node {
          id
          name
          objective
          position
          createdAt
          updatedAt
          deletedAt
          __typename
        }
        cursor
        __typename
      }
      totalCount
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
        __typename
      }
      __typename
    }
  }
`;
const unrelatedAggregateQuery = gql`
  query AggregateCompanies {
    companies {
      totalCount
      __typename
    }
  }
`;
const groupVariables = { groupBy: [{ objective: true }], filter: {} };
// Native useRecordCalendarGroupByRecords supplies this position ordering.
const groupRecordVariables = {
  ...groupVariables,
  orderByForRecords: [{ position: 'AscNullsFirst' }],
};
const connection = (nodes: RecordGqlNode[]) => ({
  __typename: 'CampaignConnection',
  edges: nodes.map((node) => ({
    __typename: 'CampaignEdge',
    node,
    cursor: encodeCursor(node),
  })),
  totalCount: nodes.length,
  pageInfo: {
    __typename: 'PageInfo',
    startCursor: nodes.length > 0 ? encodeCursor(nodes[0]) : null,
    endCursor: nodes.at(-1) ? encodeCursor(nodes.at(-1)!) : null,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});
const filterSchema = z.union([
  z.object({}).strict(),
  z
    .object({
      objective: z.object({ eq: z.enum(['MATCH', 'OTHER']) }).strict(),
    })
    .strict(),
]);
const filteredNodes = (rows: Map<string, RecordGqlNode>, filter: unknown) => {
  const parsed = filterSchema.parse(filter);
  return [...rows.values()].filter(
    (node) =>
      !('objective' in parsed) || node.objective === parsed.objective.eq,
  );
};
const groupData = (rows: Map<string, RecordGqlNode>) =>
  ['MATCH', 'OTHER'].map((value) => ({
    ...connection(filteredNodes(rows, { objective: { eq: value } })),
    __typename: 'CampaignGroupByConnection',
    groupByDimensionValues: [value],
  }));
type FixtureOptions = {
  surfaceMounted?: boolean;
  authoritative?: boolean;
  queryResponse?: (
    name: string,
    variables: Record<string, unknown>,
    data: unknown,
    occurrence: number,
  ) => string | Promise<string>;

  beforeCreate?: (
    input: { id: string },
    rows: Map<string, RecordGqlNode>,
    dispatch: number,
  ) => void;
  aggregateResponse?: (count: number) => string | Promise<string>;
  failureResponse?: () => Promise<string>;
  responseStatus?: number;
  owner?: boolean;
  deliveries?: Delivery[];
  readResponse?: (
    id: string,
    rows: Map<string, RecordGqlNode>,
  ) => string | Promise<string>;
  createResponse?: (node: RecordGqlNode) => string | Promise<string>;
};
const originalFetch = globalThis.fetch;
const originalPath =
  window.location.pathname + window.location.search + window.location.hash;
const originalStorage = new Map(
  Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)!]),
);
const disposers: Array<() => void> = [];
const campaignNotConfirmedResponse = {
  data: { campaign: null },
  errors: [
    {
      message: 'Record not found',
      extensions: {
        code: 'NOT_FOUND',
        subCode: 'RECORD_NOT_FOUND',
        userFriendlyMessage: 'This record does not exist or has been deleted.',
      },
    },
  ],
};

const fixture = (options: FixtureOptions = {}) => {
  const campaign = options.owner ? ownerCampaign : scalarCampaign;
  const metadata = options.owner ? ownerMetadata : scalarMetadata;
  const selectedFields = options.owner
    ? ownerSelectedFields
    : scalarSelectedFields;

  enableFetchMocks();
  const aggregateQuery = generateAggregateQuery({
    objectMetadataItem: campaign,
    recordGqlFields: { totalCount: true },
  });
  const groupAggregateQuery = generateGroupByAggregateQuery({
    objectMetadataItem: campaign,
    aggregateOperationGqlFields: ['totalCount'],
  });
  const groupRecordsQuery = generateGroupByRecordsQuery({
    objectMetadataItem: campaign,
    objectMetadataItems: metadata,
    recordGqlFields: selectedFields,
    computeReferences: false,
    objectPermissionsByObjectMetadataId: { [campaign.id]: permissions },
  });
  const expectedDocuments: Partial<Record<string, DocumentNode>> = {
    AggregateCompanies: unrelatedAggregateQuery,
    CampaignsGroupByAggregates: groupAggregateQuery,
    GroupByCampaigns: groupRecordsQuery,

    AggregateCampaigns: aggregateQuery,
    CreateOneCampaign: generateCreateOneRecordMutation({
      objectMetadataItem: campaign,
      objectMetadataItems: metadata,
      recordGqlFields: selectedFields,
      objectPermissionsByObjectMetadataId: {
        [CAMPAIGN_METADATA_ID]: permissions,
      },
    }),
    UpdateOneCampaign: generateUpdateOneRecordMutation({
      objectMetadataItem: campaign,
      objectMetadataItems: metadata,
      recordGqlFields: selectedFields,
      computeReferences: false,
      objectPermissionsByObjectMetadataId: {
        [CAMPAIGN_METADATA_ID]: permissions,
      },
    }),
  };
  const store = createStore();
  const workspace: CurrentWorkspace = {
    ...mockCurrentWorkspace,
    id: WORKSPACE_ID,
  };
  const user: CurrentUser = { ...mockedUserData, id: USER_ID };
  const member: CurrentWorkspaceMember = {
    ...mockedWorkspaceMemberData,
    id: MEMBER_ID,
    userWorkspaceId: USER_WORKSPACE_ID,
  };
  const workspaceMemberMetadata = standardMetadata.find(
    (item) => item.nameSingular === 'workspaceMember',
  );
  if (!workspaceMemberMetadata)
    throw new Error('Native WorkspaceMember metadata missing');
  store.set(currentWorkspaceState.atom, workspace);
  store.set(currentUserState.atom, user);
  store.set(currentWorkspaceMemberState.atom, member);
  store.set(currentUserWorkspaceState.atom, {
    ...mockedUserData.currentUserWorkspace,
    objectsPermissions: options.owner
      ? Object.values(ownerPermissions)
      : [
          permissions,
          {
            ...permissions,
            objectMetadataId: workspaceMemberMetadata.id,
            canReadObjectRecords: false,
          },
        ],
  });
  const tokens = tokenPair({});
  store.set(tokenPairState.atom, tokens);
  localStorage.setItem(TOKEN_PAIR_LOCAL_STORAGE_KEY, JSON.stringify(tokens));
  const cache = new InMemoryCache();
  const contexts: CampaignCreationOperationContext[] = [];
  let nativePayloadCallback: ((message: string) => void) | undefined;
  const onPayloadTooLarge = jest.fn((message: string) => {
    if (!nativePayloadCallback)
      throw new Error('Native snackbar probe missing');
    nativePayloadCallback(message);
  });
  const onNetworkError = jest.fn();
  const factory = new ApolloFactory({
    onPayloadTooLarge,
    onNetworkError,
    extraLinks: [
      new ApolloLink((operation, forward) => {
        const context = operation.getContext().campaignCreation as
          | CampaignCreationOperationContext
          | undefined;
        if (context) contexts.push(context);
        return forward(operation);
      }),
    ],
    uri: 'http://localhost/graphql',
    cache,
    currentWorkspace: workspace,
    currentWorkspaceMember: member,
    onTokenPairChange: (tokens) => store.set(tokenPairState.atom, tokens),
  });
  const client = factory.getClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <BrowserRouter>
        <SnackBarComponentInstanceContext.Provider
          value={{ instanceId: 'campaign-test-snacks' }}
        >
          <ApolloProvider client={client}>
            <JestObjectMetadataItemSetter objectMetadataItems={metadata}>
              <CampaignCreationSessionEffect />
              {options.surfaceMounted !== false && (
                <RecordIndexSurfaceCreationOptionsEffect
                  objectNameSingular="campaign"
                  recordIndexId={INDEX_ID}
                />
              )}
              <RecordComponentInstanceContextsWrapper
                componentInstanceId={INDEX_ID}
              >
                <ViewComponentInstanceContext.Provider
                  value={{ instanceId: INDEX_ID }}
                >
                  <ContextStoreComponentInstanceContext.Provider
                    value={{ instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID }}
                  >
                    <JestContextStoreSetter
                      contextStoreCurrentObjectMetadataNameSingular="campaign"
                      contextStoreCurrentViewId={VIEW_ID}
                      contextStoreCurrentViewType={ContextStoreViewType.Table}
                    >
                      {children}
                    </JestContextStoreSetter>
                  </ContextStoreComponentInstanceContext.Provider>
                </ViewComponentInstanceContext.Provider>
              </RecordComponentInstanceContextsWrapper>
            </JestObjectMetadataItemSetter>
          </ApolloProvider>
        </SnackBarComponentInstanceContext.Provider>
      </BrowserRouter>
    </Provider>
  );
  const envelopeSchema = z
    .object({
      operationName: z.string(),
      query: z.string(),
      variables: z.record(z.string(), z.unknown()),
      extensions: z.unknown().optional(),
    })
    .strict();
  const scalarInputSchema = z
    .object({
      id: z.string().uuid(),
      name: z.string().nullable().optional(),
      objective: z.string().nullable().optional(),
      position: z
        .union([z.number(), z.literal('first'), z.literal('last')])
        .optional(),
    })
    .strict();
  const inputSchema = options.owner
    ? scalarInputSchema.extend({ ownerId: z.literal(MEMBER_ID) })
    : scalarInputSchema;
  const parseRequest = (request: Request) =>
    request.text().then((body) => {
      const envelope = envelopeSchema.parse(JSON.parse(body));
      const document = parse(envelope.query);
      const operation = getOperationAST(document, envelope.operationName);
      if (!operation) throw new Error('Missing named GraphQL operation');
      const roots = operation.selectionSet.selections;
      if (
        roots.length !== 1 ||
        roots[0].kind !== Kind.FIELD ||
        roots[0].alias
      ) {
        throw new Error('Expected one unaliased native root');
      }
      return { ...envelope, operation, root: roots[0], document };
    });
  const rows = new Map<string, RecordGqlNode>();
  if (options.owner) rows.set(existingCampaign.id, existingCampaign);
  const memberReadIds: string[] = [];
  const createInputs: Array<z.infer<typeof inputSchema>> = [];
  const aggregateCounts: number[] = [];
  const readIds: string[] = [];
  const updateIds: string[] = [];
  const requestLog: string[] = [];
  const duplicate = {
    errors: [
      {
        message: 'A duplicate entry was detected',
        extensions: {
          code: 'BAD_USER_INPUT',
          userFriendlyMessage: 'A duplicate entry was detected',
        },
      },
    ],
  };
  let createDeliveries: Delivery[] = options.deliveries ?? [
    'fail-after-save',
    'deliver',
  ];
  const now = '2026-01-01T00:00:00.000Z';
  const transport = async (request: Request): Promise<string> => {
    if (
      request.url !== 'http://localhost/graphql' ||
      request.method !== 'POST'
    ) {
      throw new Error('Unexpected transport endpoint/method');
    }
    const parsed = await parseRequest(request);
    const expected = expectedDocuments[parsed.operationName];
    if (!expected)
      throw new Error(`Unexpected document: ${parsed.operationName}`);
    expect(print(parsed.document)).toBe(print(addTypenameToDocument(expected)));
    requestLog.push(parsed.operationName);
    const root = parsed.root;
    if (parsed.operationName === 'AggregateCompanies') {
      expect(parsed.variables).toEqual({});
      const data = {
        companies: { __typename: 'CompanyConnection', totalCount: 9 },
      };
      return options.queryResponse
        ? options.queryResponse(
            parsed.operationName,
            parsed.variables,
            data,
            requestLog.filter((name) => name === parsed.operationName).length,
          )
        : JSON.stringify({ data });
    }
    if (parsed.operationName === 'GroupByCampaigns') {
      expect(parsed.variables).toEqual(groupRecordVariables);
      return JSON.stringify({ data: { campaignsGroupBy: groupData(rows) } });
    }
    if (parsed.operationName === 'CampaignsGroupByAggregates') {
      expect(parsed.variables).toEqual(groupVariables);
      const data = {
        campaignsGroupBy: groupData(rows).map(
          ({ __typename, totalCount, groupByDimensionValues }) => ({
            __typename,
            totalCount,
            groupByDimensionValues,
          }),
        ),
      };
      return options.queryResponse
        ? options.queryResponse(
            parsed.operationName,
            parsed.variables,
            data,
            requestLog.filter((name) => name === parsed.operationName).length,
          )
        : JSON.stringify({ data });
    }
    if (parsed.operationName === 'AggregateCampaigns') {
      expect(parsed.operation.operation).toBe('query');
      expect(root.name.value).toBe('campaigns');
      const variables = z
        .object({ filter: filterSchema })
        .strict()
        .parse(parsed.variables);
      const count = filteredNodes(rows, variables.filter).length;
      aggregateCounts.push(count);
      if (options.queryResponse)
        return options.queryResponse(
          parsed.operationName,
          parsed.variables,
          {
            campaigns: { __typename: 'CampaignConnection', totalCount: count },
          },
          requestLog.filter((name) => name === parsed.operationName).length,
        );
      return options.aggregateResponse && aggregateCounts.length > 1
        ? options.aggregateResponse(count)
        : JSON.stringify({
            data: {
              campaigns: {
                __typename: 'CampaignConnection',
                totalCount: count,
              },
            },
          });
    }
    if (parsed.operationName === 'FindOneWorkspaceMember') {
      if (!options.owner)
        throw new Error('Unexpected scalar-fixture member read');
      expect(parsed.operation.operation).toBe('query');
      expect(root.name.value).toBe('workspaceMember');
      expect(print(root.arguments?.[0].value!)).toBe(
        '{id: {eq: $objectRecordId}}',
      );
      const variables = z
        .object({ objectRecordId: z.literal(MEMBER_ID) })
        .strict()
        .parse(parsed.variables);
      memberReadIds.push(variables.objectRecordId);
      if (memberReadIds.length !== 1)
        throw new Error('Unexpected extra member read');
      return JSON.stringify({ data: { workspaceMember: memberNode } });
    }
    if (parsed.operationName === 'CreateOneCampaign') {
      expect(parsed.operation.operation).toBe('mutation');
      expect(root.name.value).toBe('createCampaign');
      expect(root.arguments?.map((arg) => arg.name.value)).toEqual(['data']);
      expect(Object.keys(parsed.variables)).toEqual(['input']);
      const input = inputSchema.parse(parsed.variables.input);
      createInputs.push(structuredClone(input));
      options.beforeCreate?.(input, rows, createInputs.length);
      const delivery = createDeliveries.shift();
      if (!delivery) throw new Error('Unplanned create dispatch');
      if (options.failureResponse) return options.failureResponse();
      if (delivery === 'fail-before-save')
        throw new TypeError('Synthetic dispatched failure before save');
      if (rows.has(input.id)) {
        if (delivery === 'fail-after-save')
          throw new TypeError('Synthetic duplicate response loss');
        return JSON.stringify(duplicate);
      }
      const node: RecordGqlNode = {
        __typename: 'Campaign',
        id: input.id,
        name: input.name ?? 'Server Campaign',
        objective: input.objective ?? 'Server objective',
        position: input.position === 'first' ? -1 : 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...(options.authoritative
          ? { name: 'Server Campaign', objective: 'MATCH', position: 15 }
          : {}),
        ...(options.owner
          ? {
              name: 'Authoritative owner Campaign',
              objective: 'Owner test',
              position: 15,
              ownerId: MEMBER_ID,
              owner: ownerIdentity,
            }
          : {}),
      };
      rows.set(input.id, node);
      if (delivery === 'fail-after-save')
        throw new TypeError('Synthetic committed response loss');
      return options.createResponse
        ? options.createResponse(node)
        : JSON.stringify({ data: { createCampaign: node } });
    }
    if (parsed.operationName === 'FindOneCampaign') {
      expect(parsed.operation.operation).toBe('query');
      expect(root.name.value).toBe('campaign');
      expect(print(root.arguments?.[0].value!)).toBe(
        '{id: {eq: $objectRecordId}}',
      );
      const { objectRecordId } = z
        .object({ objectRecordId: z.string().uuid() })
        .strict()
        .parse(parsed.variables);
      readIds.push(objectRecordId);
      return options.readResponse
        ? options.readResponse(objectRecordId, rows)
        : JSON.stringify(
            rows.has(objectRecordId)
              ? { data: { campaign: rows.get(objectRecordId) } }
              : campaignNotConfirmedResponse,
          );
    }
    if (parsed.operationName === 'UpdateOneCampaign') {
      expect(parsed.operation.operation).toBe('mutation');
      expect(root.name.value).toBe('updateCampaign');
      const { idToUpdate, input } = z
        .object({
          idToUpdate: z.string().uuid(),
          input: z.object({ name: z.string(), objective: z.string() }).strict(),
        })
        .strict()
        .parse(parsed.variables);
      const prior = rows.get(idToUpdate);
      if (!prior) throw new Error('Update must target persisted fixture row');
      updateIds.push(idToUpdate);
      const node = { ...prior, ...input };
      rows.set(idToUpdate, node);
      return JSON.stringify({ data: { updateCampaign: node } });
    }
    throw new Error(`Unexpected GraphQL operation: ${parsed.operationName}`);
  };

  window.history.replaceState({}, '', RETURN_PATH);
  store.set(recordIndexOpenRecordInState.atom, ViewOpenRecordIn.RECORD_PAGE);
  fetchMock.mockResponse(async (request) => ({
    body: await transport(request),
    status: options.responseStatus ?? 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  disposers.push(() => client.stop());
  const useFixture = () => {
    const { enqueueErrorSnackBar } = useSnackBar();
    nativePayloadCallback = (message) =>
      enqueueErrorSnackBar({
        message,
        options: { dedupeKey: 'payload-too-large' },
      });
    expectedDocuments.FindOneWorkspaceMember = useFindOneRecordQuery({
      objectNameSingular: 'workspaceMember',
      recordGqlFields: memberSelectedFields,
    }).findOneRecordQuery;
    expectedDocuments.FindOneCampaign = useFindOneRecordQuery({
      objectNameSingular: 'campaign',
      recordGqlFields: selectedFields,
    }).findOneRecordQuery;
    return {
      index: useCreateNewIndexRecord({
        objectMetadataItem: campaign,
        instanceId: INDEX_ID,
      }),
      core: useApolloCoreClient(),
      updateOneRecord: useUpdateOneRecord().updateOneRecord,
      createOneRecordInCache: useCreateOneRecordInCache({
        objectMetadataItem: campaign,
      }),
      upsertRecordsInStore: useUpsertRecordsInStore().upsertRecordsInStore,
    };
  };
  const transition = (boundary: 'workspace-switch' | 'logout-new-actor') => {
    const previous = store.get(currentUserWorkspaceState.atom);
    if (!previous) throw new Error('Expected active identity');
    if (boundary === 'logout-new-actor') {
      localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY);
      store.set(tokenPairState.atom, null);
      store.set(currentUserState.atom, null);
      store.set(currentWorkspaceMemberState.atom, null);
      store.set(currentWorkspaceState.atom, null);
      store.set(currentUserWorkspaceState.atom, null);
    }
    const next = {
      workspaceId: '34700000-0000-4000-8000-000000000012',
      userId:
        boundary === 'logout-new-actor'
          ? '34700000-0000-4000-8000-000000000013'
          : USER_ID,
      userWorkspaceId: '34700000-0000-4000-8000-000000000014',
      workspaceMemberId: '34700000-0000-4000-8000-000000000015',
    };
    const nextTokens = tokenPair(next);
    localStorage.setItem(
      TOKEN_PAIR_LOCAL_STORAGE_KEY,
      JSON.stringify(nextTokens),
    );
    store.set(tokenPairState.atom, nextTokens);
    store.set(currentWorkspaceState.atom, {
      ...workspace,
      id: next.workspaceId,
    });
    store.set(currentUserState.atom, { ...user, id: next.userId });
    store.set(currentWorkspaceMemberState.atom, {
      ...member,
      id: next.workspaceMemberId,
      userWorkspaceId: next.userWorkspaceId,
    });
    store.set(currentUserWorkspaceState.atom, { ...previous });
  };
  return {
    setSurfaceMounted: (mounted: boolean) => {
      options.surfaceMounted = mounted;
    },
    restoreIdentity: () => {
      localStorage.setItem(
        TOKEN_PAIR_LOCAL_STORAGE_KEY,
        JSON.stringify(tokens),
      );
      store.set(tokenPairState.atom, tokens);
      store.set(currentWorkspaceState.atom, workspace);
      store.set(currentUserState.atom, user);
      store.set(currentWorkspaceMemberState.atom, member);
    },
    expectedDocuments,
    aggregateQuery,
    groupAggregateQuery,
    groupRecordsQuery,
    aggregateCounts,
    updateIds,
    contexts,
    onPayloadTooLarge,
    onNetworkError,
    transition,
    store,
    client,
    cache,
    Wrapper,
    useFixture,
    createInputs,
    rows,
    readIds,
    requestLog,
    memberReadIds,
    setDeliveries: (deliveries: Delivery[]) => {
      createDeliveries = deliveries;
    },
  };
};
beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  cleanup();
  disposers.splice(0).forEach((dispose) => dispose());
  fetchMock.resetMocks();
  globalThis.fetch = originalFetch;
  window.history.replaceState({}, '', originalPath);
  localStorage.clear();
  originalStorage.forEach((value, key) => localStorage.setItem(key, value));
  jest.useRealTimers();
  jest.restoreAllMocks();
});
jest.setTimeout(20000);
it('native hook recovers the generated Campaign after persisted response loss and automatic same-ID duplicate', async () => {
  const { client, Wrapper, useFixture, createInputs, rows, readIds } =
    fixture();
  const { result } = renderHook(useFixture, { wrapper: Wrapper });
  expect(result.current.core).toBe(client);
  let settled: { value?: ObjectRecord; error?: unknown } = {};
  await act(async () => {
    settled = await result.current.index
      .createNewIndexRecord({ position: 'first' })
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
  });
  expect(createInputs).toHaveLength(2);
  const attemptedId = createInputs[0].id;
  expect(createInputs[1]).toEqual(createInputs[0]);
  expect(rows.size).toBe(1);
  expect(settled.error).toBeUndefined();
  expect(readIds).toEqual([attemptedId]);
  expect(settled.value?.id).toBe(attemptedId);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith(
    AppPath.RecordShowPage,
    { objectNameSingular: 'campaign', objectRecordId: attemptedId },
    undefined,
    expect.objectContaining({
      state: expect.objectContaining({
        objectRecordId: attemptedId,
        isNewRecord: true,
      }),
    }),
  );
});

it('ordinary verified Campaign insertion is deferred and authoritative', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saved!: () => void;
  const savedPromise = new Promise<void>((resolve) => {
    saved = resolve;
  });
  const f = fixture({
    deliveries: ['deliver'],
    createResponse: async (node) => {
      saved();
      await gate;
      return JSON.stringify({
        data: {
          createCampaign: {
            ...node,
            name: 'Authoritative name',
            objective: 'Authoritative objective',
            position: 15,
          },
        },
      });
    },
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  let invocation!: Promise<ObjectRecord | undefined>;
  act(() => {
    invocation = result.current.index.createNewIndexRecord({
      name: 'Client name',
      position: 'last',
    });
  });
  await savedPromise;
  const id = f.createInputs[0].id;
  expect(f.cache.extract()[`Campaign:${id}`]).toBeUndefined();
  expect(mockNavigate).not.toHaveBeenCalled();
  let record: ObjectRecord | undefined;
  await act(async () => {
    release();
    record = await invocation;
  });
  expect(record).toMatchObject({
    id,
    name: 'Authoritative name',
    objective: 'Authoritative objective',
    position: 15,
  });
  expect(f.cache.extract()[`Campaign:${id}`]).toMatchObject({
    id,
    name: 'Authoritative name',
    position: 15,
  });
  expect(f.readIds).toEqual([]);
  expect(f.createInputs).toHaveLength(1);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it('explicit New progresses after native not-confirmation with immutable original ID and input', async () => {
  jest.useFakeTimers();
  const f = fixture({ deliveries: ['fail-before-save', 'fail-before-save'] });
  const events = jest.fn();
  window.addEventListener(OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME, events);
  disposers.push(() =>
    window.removeEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      events,
    ),
  );
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  let first: ObjectRecord | undefined;
  await act(async () => {
    const invocation = result.current.index.createNewIndexRecord({
      name: 'Original',
      objective: 'Original objective',
      position: 'first',
    });
    await jest.advanceTimersByTimeAsync(7000);
    first = await invocation;
  });
  expect(first).toBeUndefined();
  expect(f.createInputs).toHaveLength(2);
  expect(f.rows.size).toBe(0);
  const input = f.createInputs[0];
  expect(f.createInputs[1]).toEqual(input);
  expect(f.readIds).toEqual([input.id]);
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(f.requestLog).toEqual([
    'CreateOneCampaign',
    'CreateOneCampaign',
    'FindOneCampaign',
  ]);
  expect(
    Object.values(f.store.get(campaignCreationState.atom).attempts),
  ).toEqual([
    expect.objectContaining({
      recordId: input.id,
      phase: 'unconfirmed',
      runId: null,
      completionAttempted: false,
    }),
  ]);
  const retainedInputJson = Object.values(
    f.store.get(campaignCreationState.atom).attempts,
  )[0].inputJson!;
  expect(JSON.parse(retainedInputJson)).toEqual(input);
  expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
  expect(f.store.get(recordStoreFamilyState.atomFamily(input.id))).toBeNull();
  expect(events).not.toHaveBeenCalled();
  expect(
    f.store
      .get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      )
      .queue.filter((snack) => snack.progress !== undefined),
  ).toEqual([]);
  f.setDeliveries(['deliver']);
  let retried: ObjectRecord | undefined;
  await act(async () => {
    retried = await result.current.index.createNewIndexRecord({
      name: 'Must not replace original',
      position: 'last',
    });
  });
  expect(f.requestLog).toEqual([
    'CreateOneCampaign',
    'CreateOneCampaign',
    'FindOneCampaign',
    'FindOneCampaign',
    'CreateOneCampaign',
  ]);
  expect(retried?.id).toBe(input.id);
  expect(f.createInputs).toEqual([input, input, input]);
  expect(f.readIds).toEqual([input.id, input.id]);
  expect(events).toHaveBeenCalledTimes(1);
  expect(f.rows.size).toBe(1);
  const requests = [...f.requestLog];
  await act(async () => {
    await jest.advanceTimersByTimeAsync(7000);
  });
  expect(f.requestLog).toEqual(requests);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it('native not-confirmation shows actionable uncertainty', async () => {
  jest.useFakeTimers();
  const f = fixture({ deliveries: ['fail-before-save', 'fail-before-save'] });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  await act(async () => {
    const invocation = result.current.index.createNewIndexRecord();
    await jest.advanceTimersByTimeAsync(7000);
    expect(await invocation).toBeUndefined();
  });
  expect(
    f.store.get(
      snackBarInternalComponentState.atomFamily({
        instanceId: 'campaign-test-snacks',
      }),
    ).queue,
  ).toEqual([
    expect.objectContaining({
      message:
        'Could not confirm whether the Campaign was saved. Choose New to check again and retry the same creation. If this keeps happening, check your Campaign access.',
    }),
  ]);
});

it.each([
  ['missing root', () => ({ data: {} })],
  [
    'null with errors',
    () => ({
      data: { campaign: null },
      errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
    }),
  ],
  [
    'missing selected objective',
    (node: RecordGqlNode) => ({
      data: { campaign: { ...node, objective: undefined } },
    }),
  ],
  [
    'invalid numeric position',
    (node: RecordGqlNode) => ({
      data: { campaign: { ...node, position: 'first' } },
    }),
  ],
  [
    'missing timestamps',
    (node: RecordGqlNode) => ({
      data: { campaign: { ...node, updatedAt: undefined } },
    }),
  ],
  [
    'wrong ID',
    (node: RecordGqlNode) => ({
      data: {
        campaign: { ...node, id: '34700000-0000-4000-8000-000000000999' },
      },
    }),
  ],
  [
    'wrong typename',
    (node: RecordGqlNode) => ({
      data: { campaign: { ...node, __typename: 'Company' } },
    }),
  ],
  [
    'deleted node',
    (node: RecordGqlNode) => ({
      data: { campaign: { ...node, deletedAt: '2026-01-02' } },
    }),
  ],
  [
    'partial error-bearing node',
    (node: RecordGqlNode) => ({
      data: { campaign: node },
      errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
    }),
  ],
  [
    'invalid Name scalar',
    (node: RecordGqlNode) => ({
      data: { campaign: { ...node, name: { firstName: 'Not TEXT' } } },
    }),
  ],
] as const)(
  'does not treat %s readback as proof or resend authority',
  async (_, response) => {
    jest.useFakeTimers();
    const f = fixture({
      readResponse: (id, rows) => JSON.stringify(response(rows.get(id)!)),
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    let record: ObjectRecord | undefined;
    await act(async () => {
      const invocation = result.current.index.createNewIndexRecord();
      await jest.advanceTimersByTimeAsync(7000);
      record = await invocation;
    });
    expect(record).toBeUndefined();
    expect(f.createInputs).toHaveLength(2);
    expect(f.readIds).toEqual([f.createInputs[0].id]);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      f.cache.extract()[`Campaign:${f.createInputs[0].id}`],
    ).toBeUndefined();
    await act(async () => {
      record = await result.current.index.createNewIndexRecord({
        name: 'Changed',
      });
    });
    expect(record).toBeUndefined();
    expect(f.createInputs).toHaveLength(2);
    expect(f.readIds).toEqual([f.createInputs[0].id, f.createInputs[0].id]);
  },
);

it('fresh duplicate is a genuine handled failure with no recovery read', async () => {
  const f = fixture({
    deliveries: ['deliver'],
    createResponse: () =>
      JSON.stringify({
        errors: [
          {
            message: 'A duplicate entry was detected',
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      }),
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  let record: ObjectRecord | undefined;
  await act(async () => {
    record = await result.current.index.createNewIndexRecord();
  });
  expect(record).toBeUndefined();
  expect(f.createInputs).toHaveLength(1);
  expect(f.readIds).toEqual([]);
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('reserves one synchronous lease across two controls and owns the input ID last', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saved!: () => void;
  const savedPromise = new Promise<void>((resolve) => {
    saved = resolve;
  });
  const f = fixture({
    deliveries: ['deliver'],
    createResponse: async (node) => {
      saved();
      await gate;
      return JSON.stringify({ data: { createCampaign: node } });
    },
  });
  const { result } = renderHook(
    () => ({ first: f.useFixture(), second: f.useFixture() }),
    { wrapper: f.Wrapper },
  );
  let invocation!: Promise<ObjectRecord | undefined>;
  let second: ObjectRecord | undefined;
  const callerInput = {
    id: '34700000-0000-4000-8000-000000000900',
    name: 'Original',
  };
  act(() => {
    invocation = result.current.first.index.createNewIndexRecord(callerInput);
  });
  callerInput.name = 'Later edit';
  await savedPromise;
  await act(async () => {
    second = await result.current.second.index.createNewIndexRecord({
      name: 'Second control',
    });
  });
  expect(second).toBeUndefined();
  expect(f.createInputs).toHaveLength(1);
  expect(f.createInputs[0].id).not.toBe(callerInput.id);
  expect(f.createInputs[0].name).toBe('Original');
  await act(async () => {
    release();
    await invocation;
  });
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it('retains saved identity after navigation failure and never replays completion or creates again to open it', async () => {
  const f = fixture({ deliveries: ['deliver'] });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  mockNavigate.mockImplementationOnce(() => {
    throw new Error('Synthetic navigation failure');
  });
  await act(async () => {
    await result.current.index.createNewIndexRecord();
  });
  expect(f.createInputs).toHaveLength(1);
  const id = f.createInputs[0].id;
  expect(f.cache.extract()[`Campaign:${id}`]).toMatchObject({ id });
  let opened: ObjectRecord | undefined;
  await act(async () => {
    opened = await result.current.index.createNewIndexRecord();
  });
  expect(opened?.id).toBe(id);
  expect(f.createInputs).toHaveLength(1);
  expect(f.readIds).toEqual([]);
  expect(mockNavigate).toHaveBeenCalledTimes(2);
});

describe('Campaign owner inverse', () => {
  it.each([
    ['normal', false],
    ['normal', true],
    ['recovered', false],
    ['recovered', true],
  ] as const)(
    'attaches and dedupes authoritative owner for %s, prior attach=%s',
    async (delivery, priorAttach) => {
      jest.useFakeTimers();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let markSaved!: (node: RecordGqlNode) => void;
      const savedPromise = new Promise<RecordGqlNode>((resolve) => {
        markSaved = resolve;
      });
      const f = fixture({
        owner: true,
        deliveries:
          delivery === 'normal' ? ['deliver'] : ['fail-after-save', 'deliver'],
        createResponse: async (node) => {
          markSaved(node);
          await gate;
          return JSON.stringify({ data: { createCampaign: node } });
        },
        readResponse: async (id, rows) => {
          const node = rows.get(id);
          if (!node) throw new Error('Expected persisted owner Campaign');
          markSaved(node);
          await gate;
          return JSON.stringify({ data: { campaign: node } });
        },
      });
      const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      await waitFor(() => expect(f.memberReadIds).toEqual([MEMBER_ID]));
      act(() =>
        result.current.upsertRecordsInStore({
          partialRecords: [getRecordFromRecordNode({ recordNode: memberNode })],
        }),
      );
      const inverseFragment = gql`
        fragment MemberOwnedCampaigns on WorkspaceMember {
          id
          ownedCampaigns {
            edges {
              node {
                id
              }
            }
          }
        }
      `;
      const inverseIds = () =>
        z
          .object({
            ownedCampaigns: z.object({
              edges: z.array(z.object({ node: z.object({ id: z.string() }) })),
            }),
          })
          .parse(
            f.cache.readFragment({
              id: `WorkspaceMember:${MEMBER_ID}`,
              fragment: inverseFragment,
            }),
          )
          .ownedCampaigns.edges.map((edge) => edge.node.id);
      const storedIds = () =>
        z
          .object({ ownedCampaigns: z.array(z.object({ id: z.string() })) })
          .parse(f.store.get(recordStoreFamilyState.atomFamily(MEMBER_ID)))
          .ownedCampaigns.map((record) => record.id);
      expect(inverseIds()).toEqual([existingCampaign.id]);
      expect(storedIds()).toEqual([existingCampaign.id]);
      let invocation!: Promise<ObjectRecord | undefined>;
      act(() => {
        invocation = result.current.index.createNewIndexRecord({
          name: 'Client Campaign',
          objective: 'Client objective',
          position: 'first',
          ownerId: MEMBER_ID,
        });
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(delivery === 'normal' ? 0 : 7000);
      });
      const node = await savedPromise;
      expect(f.cache.extract()[`Campaign:${node.id}`]).toBeUndefined();
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(node.id)),
      ).toBeNull();
      expect(inverseIds()).toEqual([existingCampaign.id]);
      expect(mockNavigate).not.toHaveBeenCalled();
      if (priorAttach) {
        act(() => {
          const record = getRecordFromRecordNode({ recordNode: node });
          result.current.createOneRecordInCache(record);
          result.current.upsertRecordsInStore({ partialRecords: [record] });
          for (let attach = 0; attach < 2; attach += 1) {
            triggerAttachRelationOptimisticEffect({
              cache: f.cache,
              sourceObjectNameSingular: 'campaign',
              sourceRecordId: node.id,
              targetObjectMetadataItem: ownerMember,
              fieldNameOnTargetRecord: 'ownedCampaigns',
              targetRecordId: MEMBER_ID,
              objectMetadataItems: ownerMetadata,
              objectPermissionsByObjectMetadataId: ownerPermissions,
              upsertRecordsInStore: result.current.upsertRecordsInStore,
            });
          }
        });
        expect(inverseIds()).toEqual([existingCampaign.id, node.id]);
        expect(storedIds()).toEqual([existingCampaign.id, node.id]);
      }
      let record: ObjectRecord | undefined;
      await act(async () => {
        release();
        record = await invocation;
      });
      expect(record?.id).toBe(node.id);
      const cachedRecord = getRecordFromCache({
        cache: f.cache,
        objectMetadataItem: ownerCampaign,
        objectMetadataItems: ownerMetadata,
        recordId: node.id,
        objectPermissionsByObjectMetadataId: ownerPermissions,
      });
      const cachedNode = getRecordNodeFromRecord({
        objectMetadataItem: ownerCampaign,
        objectMetadataItems: ownerMetadata,
        record: cachedRecord,
        computeReferences: false,
      });
      expect(cachedNode?.owner).toEqual(node.owner);
      expect(inverseIds()).toEqual([existingCampaign.id, node.id]);
      expect(storedIds()).toEqual([existingCampaign.id, node.id]);
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(node.id)),
      ).toMatchObject({
        id: node.id,
        name: 'Authoritative owner Campaign',
        objective: 'Owner test',
        position: 15,
        ownerId: MEMBER_ID,
        owner: { id: MEMBER_ID },
      });
      expect(
        f.cache.readFragment({
          id: `Campaign:${node.id}`,
          fragment: gql`
            fragment VerifiedOwnedCampaign on Campaign {
              id
              name
              objective
              position
              ownerId
              owner {
                id
                name {
                  firstName
                  lastName
                }
                avatarUrl
              }
            }
          `,
        }),
      ).toMatchObject({
        id: node.id,
        name: 'Authoritative owner Campaign',
        objective: 'Owner test',
        position: 15,
        ownerId: MEMBER_ID,
        owner: {
          id: MEMBER_ID,
          name: { firstName: 'Campaign', lastName: 'Owner' },
          avatarUrl: null,
        },
      });
      expect(f.createInputs).toHaveLength(delivery === 'normal' ? 1 : 2);
      for (const input of f.createInputs)
        expect(input).toEqual({
          id: node.id,
          name: 'Client Campaign',
          objective: 'Client objective',
          position: 'first',
          ownerId: MEMBER_ID,
        });
      expect(f.readIds).toEqual(delivery === 'normal' ? [] : [node.id]);
      expect(f.requestLog).toEqual(
        delivery === 'normal'
          ? ['FindOneWorkspaceMember', 'CreateOneCampaign']
          : [
              'FindOneWorkspaceMember',
              'CreateOneCampaign',
              'CreateOneCampaign',
              'FindOneCampaign',
            ],
      );
      expect(f.rows.size).toBe(2);
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      expect(inverseIds()).toEqual([existingCampaign.id, node.id]);
      expect(storedIds()).toEqual([existingCampaign.id, node.id]);
    },
  );
});

describe('real command', () => {
  it.each(['response-loss', 'validation'] as const)(
    'settles native command ownership and progress for %s without catching private execute',
    async (outcome) => {
      jest.useFakeTimers();
      const f = fixture(
        outcome === 'validation'
          ? {
              deliveries: ['deliver'],
              createResponse: () =>
                JSON.stringify({
                  errors: [
                    {
                      message: 'Invalid Campaign name',
                      extensions: {
                        code: 'BAD_USER_INPUT',
                        userFriendlyMessage: 'Invalid Campaign name',
                      },
                    },
                  ],
                }),
            }
          : {},
      );
      const commandId = 'campaign-create-command';
      f.store.set(
        headlessCommandContextApisState.atom,
        new Map([
          [
            commandId,
            {
              engineComponentKey: EngineComponentKey.CREATE_NEW_RECORD,
              contextStoreInstanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
              objectMetadataItem: campaign,
              currentViewId: VIEW_ID,
              recordIndexId: INDEX_ID,
              targetedRecordsRule: { mode: 'selection', selectedRecordIds: [] },
              selectedRecords: [],
              graphqlFilter: null,
              payload: null,
            },
          ],
        ]),
      );
      f.store.set(commandMenuItemProgressFamilyState.atomFamily(commandId), 0);
      const CommandHost = () => {
        f.useFixture(); // Register native generated read documents before command effect dispatch.
        const headlessCommandContextApis = useAtomStateValue(
          headlessCommandContextApisState,
        );
        return headlessCommandContextApis.has(commandId) ? (
          <CommandComponentInstanceContext.Provider
            value={{ instanceId: commandId }}
          >
            <CreateNewIndexRecordNoSelectionRecordCommand />
          </CommandComponentInstanceContext.Provider>
        ) : null;
      };
      const mounted = render(<CommandHost />, { wrapper: f.Wrapper });
      expect(
        f.store.get(campaignCreationState.atom).mountedOrigins[INDEX_ID],
      ).toBe(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      await waitFor(() =>
        expect(
          f.store.get(headlessCommandContextApisState.atom).has(commandId),
        ).toBe(false),
      );
      expect(
        f.store.get(commandMenuItemProgressFamilyState.atomFamily(commandId)),
      ).toBeUndefined();
      const queue = f.store.get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      ).queue;
      expect(queue.filter((snack) => snack.progress !== undefined)).toEqual([]);
      if (outcome === 'response-loss') {
        expect(f.createInputs).toHaveLength(2);
        expect(f.readIds).toEqual([f.createInputs[0].id]);
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(queue).toEqual([]);
      } else {
        expect(f.createInputs).toHaveLength(1);
        expect(f.readIds).toEqual([]);
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(queue).toEqual([
          expect.objectContaining({ message: 'Invalid Campaign name' }),
        ]);
      }
      expect(
        f.store.get(campaignCreationState.atom).mountedOrigins[INDEX_ID],
      ).toBe(1);
      mounted.unmount();
      expect(
        f.store.get(campaignCreationState.atom).mountedOrigins[INDEX_ID],
      ).toBeUndefined();
    },
  );
});

describe.each(['workspace-switch', 'logout-new-actor'] as const)(
  'real index %s',
  (boundary) => {
    describe.each(['deferred error', 'awaited false'] as const)(
      '%s',
      (schedule) => {
        it.each(
          schedule === 'awaited false'
            ? ['http413']
            : ['http413', 'http503', 'transport-type-error', 'terminal-error'],
        )(
          'does not leak %s to native callbacks, snackbar, cache, store or navigation',
          async (lateError) => {
            jest.useFakeTimers();
            let release!: () => void;
            const gate = new Promise<void>((resolve) => {
              release = resolve;
            });
            let markDispatched!: () => void;
            const dispatched = new Promise<void>((resolve) => {
              markDispatched = resolve;
            });
            const f = fixture({
              deliveries: ['deliver'],
              responseStatus: lateError === 'http503' ? 503 : 413,
              failureResponse: async () => {
                markDispatched();
                await gate;
                if (lateError === 'transport-type-error')
                  throw new TypeError('Synthetic stale transport failure');
                if (lateError === 'terminal-error')
                  throw new Error('Synthetic stale terminal error');
                return 'Synthetic late HTTP error';
              },
            });
            const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
            const events = jest.fn();
            window.addEventListener(
              OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
              events,
            );
            let transitionRan = false;
            let boundaryWasCurrent = false;
            let diagnosticCount = 0;
            let scheduledTransition: Promise<void> | undefined;
            const diagnostic = jest
              .spyOn(console, 'log')
              .mockImplementation((...args: unknown[]) => {
                if (
                  schedule !== 'awaited false' ||
                  args[0] !== 'retryIf error from retryLink' ||
                  !ServerError.is(args[1]) ||
                  args[1].statusCode !== 413
                )
                  return;
                diagnosticCount += 1;
                assertCampaignCreationCurrent(f.contexts[0]);
                boundaryWasCurrent = true;
                scheduledTransition = Promise.resolve().then(() => {
                  act(() => f.transition(boundary));
                  transitionRan = true;
                });
              });
            let invocation!: Promise<ObjectRecord | undefined>;
            try {
              act(() => {
                invocation = result.current.index.createNewIndexRecord();
              });
              await dispatched;
              expect(f.createInputs).toHaveLength(1);
              expect(f.contexts).toHaveLength(1);
              const id = f.createInputs[0].id;
              expect(
                f.store.get(
                  snackBarInternalComponentState.atomFamily({
                    instanceId: 'campaign-test-snacks',
                  }),
                ).queue,
              ).toEqual([expect.objectContaining({ progress: 0 })]);
              if (schedule === 'deferred error')
                act(() => f.transition(boundary));
              const cacheBefore = f.cache.extract();
              const storeBefore = f.store.get(
                recordStoreFamilyState.atomFamily(id),
              );
              let record: ObjectRecord | undefined;
              await act(async () => {
                release();
                record = await invocation;
                await scheduledTransition;
                await jest.advanceTimersByTimeAsync(7000);
              });
              expect(record).toBeUndefined();
              if (schedule === 'awaited false') {
                expect(diagnosticCount).toBe(1);
                expect(boundaryWasCurrent).toBe(true);
                expect(transitionRan).toBe(true);
              }
              expect(f.createInputs).toHaveLength(1);
              expect(f.contexts).toHaveLength(1);
              expect(f.readIds).toEqual([]);
              expect(f.contexts[0].transport).toEqual({
                dispatched: true,
                uncertain: false,
              });
              expect(f.onPayloadTooLarge).not.toHaveBeenCalled();
              expect(f.onNetworkError).not.toHaveBeenCalled();
              expect(
                f.store.get(
                  snackBarInternalComponentState.atomFamily({
                    instanceId: 'campaign-test-snacks',
                  }),
                ).queue,
              ).toEqual([]);
              expect(f.cache.extract()).toEqual(cacheBefore);
              expect(
                f.store.get(recordStoreFamilyState.atomFamily(id)),
              ).toEqual(storeBefore);
              expect(events).not.toHaveBeenCalled();
              expect(mockNavigate).not.toHaveBeenCalled();
            } finally {
              release();
              diagnostic.mockRestore();
              window.removeEventListener(
                OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
                events,
              );
            }
          },
        );
      },
    );
  },
);

it('retains native current-identity HTTP413 payload notification exactly once', async () => {
  const f = fixture({
    deliveries: ['deliver'],
    responseStatus: 413,
    failureResponse: async () => 'Synthetic HTTP413',
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  await act(async () => {
    await result.current.index.createNewIndexRecord();
  });
  expect(f.createInputs).toHaveLength(1);
  expect(f.readIds).toEqual([]);
  expect(f.onPayloadTooLarge).toHaveBeenCalledTimes(1);
  expect(f.onNetworkError).not.toHaveBeenCalled();
  const snackQueue = f.store.get(
    snackBarInternalComponentState.atomFamily({
      instanceId: 'campaign-test-snacks',
    }),
  ).queue;
  expect(snackQueue).toHaveLength(1);
  expect(snackQueue).toEqual([
    expect.objectContaining({
      message: 'Uploaded content is too large.',
      dedupeKey: 'payload-too-large',
    }),
  ]);
});

it('explains current create-permission denial after a retained retry receives native not-confirmation', async () => {
  jest.useFakeTimers();
  const f = fixture({ deliveries: ['fail-before-save', 'fail-before-save'] });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  await act(async () => {
    const invocation = result.current.index.createNewIndexRecord();
    await jest.advanceTimersByTimeAsync(7000);
    await invocation;
  });
  expect(f.createInputs).toHaveLength(2);
  act(() => {
    const current = f.store.get(currentUserWorkspaceState.atom);
    if (!current) throw new Error('Expected authenticated permissions');
    f.store.set(currentUserWorkspaceState.atom, {
      ...current,
      objectsPermissions: current.objectsPermissions.map((item) =>
        item.objectMetadataId === campaign.id
          ? { ...item, canUpdateObjectRecords: false }
          : item,
      ),
    });
    const snacks = snackBarInternalComponentState.atomFamily({
      instanceId: 'campaign-test-snacks',
    });
    f.store.set(snacks, { ...f.store.get(snacks), queue: [] });
  });
  await act(async () => {
    await result.current.index.createNewIndexRecord();
  });
  expect(f.createInputs).toHaveLength(2);
  expect(f.readIds).toEqual([f.createInputs[0].id, f.createInputs[0].id]);
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(
    f.store.get(
      snackBarInternalComponentState.atomFamily({
        instanceId: 'campaign-test-snacks',
      }),
    ).queue,
  ).toEqual([
    expect.objectContaining({
      message: 'You no longer have permission to create Campaigns.',
    }),
  ]);
  act(() => {
    const current = f.store.get(currentUserWorkspaceState.atom);
    if (!current) throw new Error('Expected authenticated permissions');
    f.store.set(currentUserWorkspaceState.atom, {
      ...current,
      objectsPermissions: current.objectsPermissions.map((item) =>
        item.objectMetadataId === campaign.id
          ? { ...item, canUpdateObjectRecords: true }
          : item,
      ),
    });
  });
  f.setDeliveries(['deliver']);
  let saved: ObjectRecord | undefined;
  await act(async () => {
    saved = await result.current.index.createNewIndexRecord({
      name: 'Must not replace retained input',
    });
  });
  expect(saved?.id).toBe(f.createInputs[0].id);
  expect(f.createInputs).toEqual([
    f.createInputs[0],
    f.createInputs[0],
    f.createInputs[0],
  ]);
  expect(f.readIds).toEqual([
    f.createInputs[0].id,
    f.createInputs[0].id,
    f.createInputs[0].id,
  ]);
});

it.each(['normal', 'recovered'] as const)(
  'updates Name and Objective through native update and exact no-cache read after %s create',
  async (delivery) => {
    jest.useFakeTimers();
    const f = fixture({
      deliveries:
        delivery === 'normal' ? ['deliver'] : ['fail-after-save', 'deliver'],
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    let record: ObjectRecord | undefined;
    await act(async () => {
      const invocation = result.current.index.createNewIndexRecord();
      await jest.advanceTimersByTimeAsync(7000);
      record = await invocation;
    });
    if (!record) throw new Error('Expected verified Campaign');
    const id = record.id;
    const createCount = f.createInputs.length;
    await act(async () => {
      await result.current.updateOneRecord({
        objectNameSingular: 'campaign',
        idToUpdate: id,
        updateOneRecordInput: {
          name: 'Updated name',
          objective: 'Updated objective',
        },
        recordGqlFields: selectedFields,
      });
    });
    const query = f.expectedDocuments.FindOneCampaign;
    if (!query) throw new Error('Native query probe missing');
    const reread = await f.client.query({
      query,
      variables: { objectRecordId: id },
      fetchPolicy: 'no-cache',
      errorPolicy: 'none',
    });
    expect(reread.data).toMatchObject({
      campaign: { id, name: 'Updated name', objective: 'Updated objective' },
    });
    expect(f.rows.get(id)).toMatchObject({
      id,
      name: 'Updated name',
      objective: 'Updated objective',
    });
    expect(f.updateIds).toEqual([id]);
    expect(f.createInputs).toHaveLength(createCount);
  },
);

it.each(['success', 'failure'] as const)(
  'keeps verified save separate from active native aggregate refresh %s',
  async (outcome) => {
    const f = fixture({
      deliveries: ['deliver'],
      aggregateResponse:
        outcome === 'failure'
          ? () =>
              JSON.stringify({
                errors: [
                  {
                    message: 'Synthetic aggregate failure',
                    extensions: { code: 'FORBIDDEN' },
                  },
                ],
              })
          : undefined,
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    const observed: number[] = [];
    const observable = f.client.watchQuery({
      query: f.aggregateQuery,
      variables: { filter: {} },
      fetchPolicy: 'network-only',
    });
    const originalQuery = observable.options.query;
    const originalVariables = structuredClone(observable.variables);
    const subscription = observable.subscribe(({ data }) => {
      const parsed = z
        .object({ campaigns: z.object({ totalCount: z.number() }) })
        .safeParse(data);
      if (parsed.success) observed.push(parsed.data.campaigns.totalCount);
    });
    try {
      await waitFor(() => expect(observed.at(-1)).toBe(0));
      let record: ObjectRecord | undefined;
      await act(async () => {
        record = await result.current.index.createNewIndexRecord();
      });
      expect(record?.id).toBe(f.createInputs[0].id);
      expect(f.aggregateCounts).toEqual([0, 1]);
      expect(f.requestLog).toEqual([
        'AggregateCampaigns',
        'CreateOneCampaign',
        'AggregateCampaigns',
      ]);
      expect(f.contexts.map((context) => context.kind)).toEqual([
        'create',
        'read',
      ]);
      expect(observable.options.query).toBe(originalQuery);
      expect(observable.options.fetchPolicy).toBe('network-only');
      expect(observable.variables).toEqual(originalVariables);
      expect(f.createInputs).toHaveLength(1);
      expect(f.readIds).toEqual([]);
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(
        f.cache.extract()[`Campaign:${f.createInputs[0].id}`],
      ).toMatchObject({ id: f.createInputs[0].id });
      const queue = f.store.get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      ).queue;
      if (outcome === 'success') {
        await waitFor(() => expect(observed.at(-1)).toBe(1));
        expect(queue).toEqual([]);
      } else {
        expect(observed.at(-1)).toBe(0);
        expect(queue).toEqual([
          expect.objectContaining({
            message: 'Campaign saved, but counts could not refresh.',
          }),
        ]);
      }
    } finally {
      subscription.unsubscribe();
    }
  },
);

it.each(['object', 'id', 'deletedAt'] as const)(
  'explains current %s confirmation denial without a request and resumes the retained ID after restoration',
  async (denied) => {
    jest.useFakeTimers();
    const f = fixture({ deliveries: ['fail-before-save', 'fail-before-save'] });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    await act(async () => {
      const invocation = result.current.index.createNewIndexRecord();
      await jest.advanceTimersByTimeAsync(7000);
      await invocation;
    });
    const initialInput = f.createInputs[0];
    const priorPermissions = f.store.get(currentUserWorkspaceState.atom);
    if (!priorPermissions)
      throw new Error('Expected native current permissions');
    act(() => {
      f.store.set(currentUserWorkspaceState.atom, {
        ...priorPermissions,
        objectsPermissions: priorPermissions.objectsPermissions.map((item) => {
          if (item.objectMetadataId !== campaign.id) return item;
          if (denied === 'object')
            return { ...item, canReadObjectRecords: false };
          const field = campaign.fields.find((field) => field.name === denied);
          if (!field) throw new Error('Expected native required field');
          return {
            ...item,
            restrictedFields: {
              ...item.restrictedFields,
              [field.id]: { canRead: false },
            },
          };
        }),
      });
      const snacks = snackBarInternalComponentState.atomFamily({
        instanceId: 'campaign-test-snacks',
      });
      f.store.set(snacks, { ...f.store.get(snacks), queue: [] });
    });
    await act(async () => {
      await result.current.index.createNewIndexRecord();
    });
    expect(f.createInputs).toEqual([initialInput, initialInput]);
    expect(f.readIds).toEqual([initialInput.id]);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      f.store.get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      ).queue,
    ).toEqual([
      expect.objectContaining({
        message:
          'You no longer have permission to confirm this Campaign creation.',
      }),
    ]);
    act(() => {
      f.store.set(currentUserWorkspaceState.atom, priorPermissions);
    });
    f.setDeliveries(['deliver']);
    let saved: ObjectRecord | undefined;
    await act(async () => {
      saved = await result.current.index.createNewIndexRecord();
    });
    expect(saved?.id).toBe(initialInput.id);
    expect(f.createInputs).toEqual([initialInput, initialInput, initialInput]);
    expect(f.readIds).toEqual([initialInput.id, initialInput.id]);
  },
);

it.each([
  ['fail-before-save', 'fail-after-save'],
  ['fail-after-save', 'fail-after-save'],
] as const)(
  'recovers finite lost delivery distribution %j / %j',
  async (first, second) => {
    jest.useFakeTimers();
    const f = fixture({ deliveries: [first, second] });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      listener,
    );
    try {
      let record: ObjectRecord | undefined;
      await act(async () => {
        const pending = result.current.index.createNewIndexRecord({
          name: 'Retained',
        });
        await jest.advanceTimersByTimeAsync(7000);
        record = await pending;
      });
      expect(record?.id).toBe(f.createInputs[0].id);
      expect(f.createInputs).toEqual([f.createInputs[0], f.createInputs[0]]);
      expect(f.readIds).toEqual([record?.id]);
      expect(f.rows.size).toBe(1);
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(record!.id)),
      ).toMatchObject({ id: record?.id, name: 'Retained' });
      expect(events).toHaveLength(1);
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(7000);
      expect(f.requestLog).toHaveLength(3);
    } finally {
      window.removeEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        listener,
      );
    }
  },
);

it('recovers delayed original commit after user retry native not-confirmation and first-response duplicate without a fresh UUID', async () => {
  jest.useFakeTimers();
  const f = fixture({
    deliveries: ['fail-before-save', 'fail-before-save', 'deliver'],
    beforeCreate: (input, rows, dispatch) => {
      if (dispatch === 3)
        rows.set(input.id, { ...existingCampaign, id: input.id });
    },
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  await act(async () => {
    const pending = result.current.index.createNewIndexRecord({
      name: 'Original',
      position: 'first',
    });
    await jest.advanceTimersByTimeAsync(7000);
    expect(await pending).toBeUndefined();
  });
  expect(f.rows.size).toBe(0);
  let record: ObjectRecord | undefined;
  await act(async () => {
    record = await result.current.index.createNewIndexRecord({
      name: 'Do not use',
      position: 'last',
    });
  });
  const input = f.createInputs[0];
  expect(record?.id).toBe(input.id);
  expect(f.createInputs).toEqual([input, input, input]);
  expect(f.readIds).toEqual([input.id, input.id, input.id]);
  expect(f.requestLog).toEqual([
    'CreateOneCampaign',
    'CreateOneCampaign',
    'FindOneCampaign',
    'FindOneCampaign',
    'CreateOneCampaign',
    'FindOneCampaign',
  ]);
  expect(f.rows.size).toBe(1);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it('bounds offline read retries and retains the same payload until a later authorized check', async () => {
  jest.useFakeTimers();
  let offline = true;
  const f = fixture({
    readResponse: (id, rows) => {
      if (offline) throw new TypeError('Read offline');
      return JSON.stringify(
        rows.has(id)
          ? { data: { campaign: rows.get(id) } }
          : campaignNotConfirmedResponse,
      );
    },
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  for (let action = 0; action < 2; action += 1) {
    await act(async () => {
      const pending = result.current.index.createNewIndexRecord({
        name: action === 0 ? 'Original' : 'Changed',
      });
      await jest.advanceTimersByTimeAsync(14000);
      expect(await pending).toBeUndefined();
    });
    expect(f.createInputs).toHaveLength(2);
    expect(f.readIds).toHaveLength((action + 1) * 2);
    expect(mockNavigate).not.toHaveBeenCalled();
  }
  offline = false;
  await act(async () => {
    expect((await result.current.index.createNewIndexRecord())?.id).toBe(
      f.createInputs[0].id,
    );
  });
  expect(f.createInputs).toEqual([f.createInputs[0], f.createInputs[0]]);
  expect(f.readIds).toEqual(Array(5).fill(f.createInputs[0].id));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it.each(['validation', 'auth'] as const)(
  'does not read a known %s rejection after transport uncertainty',
  async (kind) => {
    jest.useFakeTimers();
    let calls = 0;
    const message = kind === 'auth' ? 'Access denied' : 'Invalid Campaign name';
    const f = fixture({
      failureResponse: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Lost first dispatch');
        return JSON.stringify({
          errors: [
            {
              message,
              extensions: {
                code: kind === 'auth' ? 'FORBIDDEN' : 'BAD_USER_INPUT',
                userFriendlyMessage: message,
              },
            },
          ],
        });
      },
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    await act(async () => {
      const pending = result.current.index.createNewIndexRecord();
      await jest.advanceTimersByTimeAsync(7000);
      expect(await pending).toBeUndefined();
    });
    expect(f.createInputs).toHaveLength(2);
    expect(f.readIds).toEqual([]);
    expect(f.rows.size).toBe(0);
    expect(
      Object.values(f.store.get(campaignCreationState.atom).attempts),
    ).toEqual([
      expect.objectContaining({
        phase: 'unconfirmed',
        uncertain: true,
        recordId: f.createInputs[0].id,
        runId: null,
      }),
    ]);
    expect(
      f.store.get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      ).queue,
    ).toEqual([expect.objectContaining({ message })]);
    expect(mockNavigate).not.toHaveBeenCalled();
  },
);

it.each([
  ['normal', 'first', false],
  ['normal', 'last', false],
  ['recovered', 'first', false],
  ['recovered', 'last', false],
  ['recovered', 'first', true],
  ['recovered', 'last', true],
] as const)(
  'real list group count matrix %s %s prior-native-insert=%s',
  async (delivery, position, priorInsert) => {
    jest.useFakeTimers();
    let ready!: (node: RecordGqlNode) => void;
    const savedReady = new Promise<RecordGqlNode>((resolve) => {
      ready = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture({
      authoritative: true,
      deliveries:
        delivery === 'normal' ? ['deliver'] : ['fail-after-save', 'deliver'],
      createResponse:
        delivery === 'normal'
          ? async (node) => {
              ready(node);
              await gate;
              return JSON.stringify({ data: { createCampaign: node } });
            }
          : undefined,
      readResponse:
        delivery === 'recovered'
          ? async (id, rows) => {
              const node = rows.get(id)!;
              ready(node);
              await gate;
              return JSON.stringify({ data: { campaign: node } });
            }
          : undefined,
    });
    const originalNodes = [10, 20, 30].map((value, index) => ({
      ...existingCampaign,
      id: `34700000-0000-4000-8000-00000000040${index}`,
      name: `Existing ${index}`,
      objective: index === 2 ? 'OTHER' : 'MATCH',
      position: value,
    }));
    originalNodes.forEach((node) => f.rows.set(node.id, node));
    const filters = [
      {},
      { objective: { eq: 'MATCH' } },
      { objective: { eq: 'OTHER' } },
    ];
    for (const filter of filters)
      f.client.writeQuery({
        query: listQuery,
        variables: { filter, orderBy: [] },
        data: { campaigns: connection(filteredNodes(f.rows, filter)) },
      });
    f.client.writeQuery({
      query: f.groupRecordsQuery,
      variables: groupRecordVariables,
      data: { campaignsGroupBy: groupData(f.rows) },
    });
    // Independent numeric grouping proves the transient insertion hint never becomes a dimension.
    const numericVariables = { groupBy: [{ position: true }], filter: {} };
    f.client.writeQuery({
      query: f.groupRecordsQuery,
      variables: numericVariables,
      data: {
        campaignsGroupBy: originalNodes.map((node) => ({
          ...connection([node]),
          __typename: 'CampaignGroupByConnection',
          groupByDimensionValues: [String(node.position)],
        })),
      },
    });
    const groupId = 'match-group';
    const groupState =
      recordIndexRecordIdsByGroupComponentFamilyState.atomFamily({
        instanceId: INDEX_ID,
        familyKey: groupId,
      });
    f.store.set(
      recordIndexGroupFieldMetadataItemComponentState.atomFamily({
        instanceId: INDEX_ID,
      }),
      fields.find((field) => field.name === 'objective'),
    );
    f.store.set(
      recordGroupIdsComponentState.atomFamily({ instanceId: INDEX_ID }),
      [groupId],
    );
    f.store.set(recordGroupDefinitionFamilyState.atomFamily(groupId), {
      id: groupId,
      title: 'MATCH',
      value: 'MATCH',
      type: RecordGroupDefinitionType.Value,
      color: 'transparent',
      position: 0,
      isVisible: true,
    });
    f.store.set(
      groupState,
      originalNodes.slice(0, 2).map((node) => node.id),
    );
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    const observed: number[] = [];
    const groups: unknown[] = [];
    const aggregate = f.client.watchQuery({
      query: f.aggregateQuery,
      variables: { filter: {} },
      fetchPolicy: 'network-only',
    });
    const grouped = f.client.watchQuery({
      query: f.groupAggregateQuery,
      variables: groupVariables,
      fetchPolicy: 'network-only',
    });
    const subscriptions = [
      aggregate.subscribe(({ data }) => {
        const parsed = z
          .object({ campaigns: z.object({ totalCount: z.number() }) })
          .safeParse(data);
        if (parsed.success) observed.push(parsed.data.campaigns.totalCount);
      }),
      grouped.subscribe(({ data }) => {
        if (data) groups.push(data);
      }),
      f.client
        .watchQuery({
          query: unrelatedAggregateQuery,
          fetchPolicy: 'network-only',
        })
        .subscribe({}),
    ];
    f.client.watchQuery({
      query: f.aggregateQuery,
      variables: { filter: { objective: { eq: 'OTHER' } } },
      fetchPolicy: 'network-only',
    }); // deliberately inactive
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      listener,
    );
    try {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(observed.at(-1)).toBe(3);
      await f.client.query({
        query: f.groupRecordsQuery,
        variables: groupRecordVariables,
        fetchPolicy: 'network-only',
      });
      expect(
        Object.keys(f.cache.extract().ROOT_QUERY ?? {}).filter((key) =>
          key.startsWith('campaignsGroupBy('),
        ),
      ).toHaveLength(3);
      let pending!: Promise<ObjectRecord | undefined>;
      act(() => {
        pending = result.current.index.createNewIndexRecord({
          name: 'Client default',
          objective: 'OTHER',
          position,
        });
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      const node = await savedReady;
      expect(f.cache.extract()[`Campaign:${node.id}`]).toBeUndefined();
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(node.id)),
      ).toBeNull();
      expect(observed.at(-1)).toBe(3);
      expect(events).toHaveLength(0);
      expect(f.store.get(groupState)).toEqual(
        originalNodes.slice(0, 2).map((node) => node.id),
      );
      expect(
        f.store.get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        ).queue,
      ).toEqual([
        expect.objectContaining({ progress: 0, message: 'Creating Campaign…' }),
      ]);
      if (priorInsert)
        act(() => {
          const record = getRecordFromRecordNode({ recordNode: node });
          result.current.createOneRecordInCache(record);
          result.current.upsertRecordsInStore({ partialRecords: [record] });
          for (let insert = 0; insert < 2; insert += 1)
            triggerCreateRecordsOptimisticEffect({
              cache: f.cache,
              objectMetadataItem: campaign,
              objectMetadataItems: metadata,
              recordsToCreate: [node],
              shouldMatchRootQueryFilter: true,
              creationPosition: position,
              objectPermissionsByObjectMetadataId: {
                [campaign.id]: permissions,
              },
              upsertRecordsInStore: result.current.upsertRecordsInStore,
            });
          f.store.set(groupState, [node.id, ...f.store.get(groupState)]);
        });
      await act(async () => {
        release();
        expect((await pending)?.id).toBe(node.id);
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(f.rows.size).toBe(4);
      expect(f.cache.extract()[`Campaign:${node.id}`]).toMatchObject({
        id: node.id,
        name: 'Server Campaign',
        objective: 'MATCH',
        position: 15,
      });
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(node.id)),
      ).toMatchObject({
        id: node.id,
        name: 'Server Campaign',
        objective: 'MATCH',
        position: 15,
      });
      for (const [index, filter] of filters.entries()) {
        const cached = z
          .object({
            campaigns: z.object({
              edges: z.array(z.object({ node: z.object({ id: z.string() }) })),
              totalCount: z.number(),
            }),
          })
          .parse(
            f.cache.readQuery({
              query: listQuery,
              variables: { filter, orderBy: [] },
            }),
          );
        const original = filteredNodes(
          new Map(originalNodes.map((node) => [node.id, node])),
          filter,
        ).map((node) => node.id);
        const expected =
          index === 2
            ? original
            : position === 'first'
              ? [node.id, ...original]
              : [...original, node.id];
        expect(cached.campaigns.edges.map((edge) => edge.node.id)).toEqual(
          expected,
        );
        expect(cached.campaigns.totalCount).toBe([4, 3, 1][index]);
      }
      const expectedIds = originalNodes.slice(0, 2).map((node) => node.id);
      expect(f.store.get(groupState)).toEqual(
        position === 'first'
          ? [node.id, ...expectedIds]
          : [...expectedIds, node.id],
      );
      const recordGroups = z
        .object({
          campaignsGroupBy: z.array(
            z.object({
              groupByDimensionValues: z.array(z.string()),
              edges: z.array(z.object({ node: z.object({ id: z.string() }) })),
              totalCount: z.number(),
            }),
          ),
        })
        .parse(
          f.cache.readQuery({
            query: f.groupRecordsQuery,
            variables: groupRecordVariables,
          }),
        );
      expect(
        recordGroups.campaignsGroupBy.map((group) => group.totalCount),
      ).toEqual([3, 1]);
      expect(
        recordGroups.campaignsGroupBy[0].edges.map((edge) => edge.node.id),
      ).toEqual([node.id, ...expectedIds]);
      expect(recordGroups.campaignsGroupBy[0].edges).toHaveLength(3);
      const numeric = z
        .object({
          campaignsGroupBy: z.array(
            z.object({
              groupByDimensionValues: z.array(z.string()),
              totalCount: z.number(),
            }),
          ),
        })
        .parse(
          f.cache.readQuery({
            query: f.groupRecordsQuery,
            variables: numericVariables,
          }),
        );
      expect(
        numeric.campaignsGroupBy.map((group) => group.groupByDimensionValues),
      ).toEqual([['10'], ['20'], ['30'], ['15']]);
      expect(numeric.campaignsGroupBy.at(-1)?.totalCount).toBe(1);
      expect(observed.at(-1)).toBe(4);
      expect(groups.at(-1)).toMatchObject({
        campaignsGroupBy: [
          { groupByDimensionValues: ['MATCH'], totalCount: 3 },
          { groupByDimensionValues: ['OTHER'], totalCount: 1 },
        ],
      });
      expect(
        f.requestLog.filter((name) => name === 'AggregateCampaigns'),
      ).toHaveLength(2);
      expect(
        f.requestLog.filter((name) => name === 'CampaignsGroupByAggregates'),
      ).toHaveLength(2);
      expect(
        f.requestLog.filter((name) => name === 'AggregateCompanies'),
      ).toHaveLength(1);
      expect(events).toHaveLength(1);
      expect((events[0] as CustomEvent<unknown>).detail).toMatchObject({
        objectMetadataItem: { id: campaign.id },
        operation: {
          type: 'create-one',
          createdRecord: {
            id: node.id,
            name: 'Server Campaign',
            objective: 'MATCH',
            position,
          },
        },
      });
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(f.createInputs).toHaveLength(delivery === 'normal' ? 1 : 2);
      expect(f.readIds).toEqual(delivery === 'normal' ? [] : [node.id]);
      expect(
        f.store.get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        ).queue,
      ).toEqual([]);
      await jest.advanceTimersByTimeAsync(7000);
      expect(events).toHaveLength(1);
    } finally {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      window.removeEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        listener,
      );
    }
  },
);

it('documents native identical-scope group aggregate replacement before any Campaign creation', async () => {
  const f = fixture({ deliveries: [] });
  f.rows.set(existingCampaign.id, { ...existingCampaign, objective: 'MATCH' });
  renderHook(f.useFixture, { wrapper: f.Wrapper });
  f.client.writeQuery({
    query: f.groupRecordsQuery,
    variables: groupVariables,
    data: { campaignsGroupBy: groupData(f.rows) },
  });
  expect(
    f.cache.readQuery({
      query: f.groupRecordsQuery,
      variables: groupVariables,
    }),
  ).not.toBeNull();
  await f.client.query({
    query: f.groupAggregateQuery,
    variables: groupVariables,
    fetchPolicy: 'network-only',
  });
  expect(
    f.cache.readQuery({
      query: f.groupRecordsQuery,
      variables: groupVariables,
    }),
  ).toBeNull();
  expect(f.createInputs).toEqual([]);
  expect(f.requestLog).toEqual(['CampaignsGroupByAggregates']);
});

it.each([
  'dispose',
  'rescope',
  'missing-data',
  'partial-errors',
  'workspace-switch',
  'logout-new-actor',
] as const)(
  'guards aggregate snapshots through %s while other refreshes settle',
  async (outcome) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const refreshing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const f = fixture({
      deliveries: ['deliver'],
      authoritative: true,
      queryResponse: async (name, _variables, data, occurrence) => {
        if (name === 'AggregateCampaigns' && occurrence === 2) {
          entered();
          await gate;
          if (outcome === 'missing-data')
            return JSON.stringify({
              data: { campaigns: { __typename: 'CampaignConnection' } },
            });
          if (outcome === 'partial-errors')
            return JSON.stringify({
              data,
              errors: [
                {
                  message: 'Denied aggregate',
                  extensions: { code: 'FORBIDDEN' },
                },
              ],
            });
        }
        return JSON.stringify({ data });
      },
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    const observable = f.client.watchQuery({
      query: f.aggregateQuery,
      variables: { filter: {} },
      fetchPolicy: 'network-only',
    });
    const observed: unknown[] = [];
    const subscription = observable.subscribe(({ data }) => {
      if (data) observed.push(data);
    });
    const groupSubscription = f.client
      .watchQuery({
        query: f.groupAggregateQuery,
        variables: groupVariables,
        fetchPolicy: 'network-only',
      })
      .subscribe({});
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      listener,
    );
    try {
      await waitFor(() =>
        expect(observed.at(-1)).toMatchObject({ campaigns: { totalCount: 0 } }),
      );
      const write = jest.spyOn(f.client, 'writeQuery');
      let pending!: Promise<ObjectRecord | undefined>;
      act(() => {
        pending = result.current.index.createNewIndexRecord();
      });
      await refreshing;
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
      ).toMatchObject({ phase: 'saved', completionAttempted: true });
      if (outcome === 'dispose') subscription.unsubscribe();
      if (outcome === 'rescope')
        await act(async () => {
          await observable.setVariables({
            filter: { objective: { eq: 'MATCH' } },
          });
        });
      if (outcome === 'workspace-switch' || outcome === 'logout-new-actor')
        act(() => f.transition(outcome));
      const cacheBeforeRelease = f.cache.extract();
      const writesBeforeRelease = write.mock.calls.length;
      let saved: ObjectRecord | undefined;
      await act(async () => {
        release();
        saved = await pending;
      });
      expect(f.createInputs).toHaveLength(1);
      expect(f.readIds).toEqual([]);
      expect(
        write.mock.calls.filter(
          ([options]) =>
            options.query === f.aggregateQuery &&
            JSON.stringify(options.variables) ===
              JSON.stringify({ filter: {} }),
        ),
      ).toHaveLength(0);
      if (outcome === 'workspace-switch' || outcome === 'logout-new-actor') {
        expect(saved).toBeUndefined();
        expect(f.cache.extract()).toEqual(cacheBeforeRelease);
        expect(write.mock.calls).toHaveLength(writesBeforeRelease);
        expect(events).toHaveLength(0);
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(
          f.store.get(
            snackBarInternalComponentState.atomFamily({
              instanceId: 'campaign-test-snacks',
            }),
          ).queue,
        ).toEqual([]);
      } else {
        expect(saved?.id).toBe(f.createInputs[0].id);
        expect(events).toHaveLength(1);
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(
          f.cache.readQuery({
            query: f.groupAggregateQuery,
            variables: groupVariables,
          }),
        ).toMatchObject({
          campaignsGroupBy: [
            { groupByDimensionValues: ['MATCH'], totalCount: 1 },
            { groupByDimensionValues: ['OTHER'], totalCount: 0 },
          ],
        });
        expect(
          f.cache.readQuery({
            query: f.aggregateQuery,
            variables: { filter: {} },
          }),
        ).toMatchObject({ campaigns: { totalCount: 0 } });
        if (outcome === 'rescope')
          expect(observed.at(-1)).toMatchObject({
            campaigns: { totalCount: 1 },
          });
        const queue = f.store.get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        ).queue;
        expect(queue).toEqual(
          outcome === 'partial-errors' || outcome === 'missing-data'
            ? [
                expect.objectContaining({
                  message: 'Campaign saved, but counts could not refresh.',
                }),
              ]
            : [],
        );
      }
      expect(observable.options.fetchPolicy).toBe('network-only');
      expect(
        f.requestLog.filter((name) => name === 'AggregateCampaigns'),
      ).toHaveLength(outcome === 'rescope' ? 3 : 2);
      expect(
        f.requestLog.filter((name) => name === 'CampaignsGroupByAggregates'),
      ).toHaveLength(2);
    } finally {
      subscription.unsubscribe();
      groupSubscription.unsubscribe();
      window.removeEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        listener,
      );
    }
  },
);

it.each([
  'fragment-throws',
  'fragment-undefined',
  'list',
  'store',
  'group',
  'event',
] as const)(
  'continues independent bounded completion after %s failure without rollback or replay',
  async (fault) => {
    const f = fixture({
      deliveries: ['deliver', 'deliver'],
      authoritative: true,
    });
    f.client.writeQuery({
      query: listQuery,
      variables: { filter: {}, orderBy: [] },
      data: { campaigns: connection([]) },
    });
    const groupState =
      recordIndexRecordIdsByGroupComponentFamilyState.atomFamily({
        instanceId: INDEX_ID,
        familyKey: 'match',
      });
    f.store.set(
      recordIndexGroupFieldMetadataItemComponentState.atomFamily({
        instanceId: INDEX_ID,
      }),
      fields.find((field) => field.name === 'objective'),
    );
    f.store.set(
      recordGroupIdsComponentState.atomFamily({ instanceId: INDEX_ID }),
      ['match'],
    );
    f.store.set(recordGroupDefinitionFamilyState.atomFamily('match'), {
      id: 'match',
      title: 'MATCH',
      value: 'MATCH',
      type: RecordGroupDefinitionType.Value,
      color: 'transparent',
      position: 0,
      isVisible: true,
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    const observed: unknown[] = [];
    const subscription = f.client
      .watchQuery({
        query: f.aggregateQuery,
        variables: { filter: {} },
        fetchPolicy: 'network-only',
      })
      .subscribe(({ data }) => {
        if (data) observed.push(data);
      });
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      listener,
    );
    const injected = jest.fn(() => {
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
      ).toMatchObject({ phase: 'saved', completionAttempted: true });
      if (fault !== 'fragment-undefined')
        throw new Error(`Synthetic ${fault} fault`);
      return undefined;
    });
    const originalModify = f.cache.modify.bind(f.cache);
    const list = jest.spyOn(f.cache, 'modify');
    const originalDispatch = window.dispatchEvent.bind(window);
    const dispatch = jest.spyOn(window, 'dispatchEvent');
    const evict = jest.spyOn(f.cache, 'evict');
    try {
      await waitFor(() =>
        expect(observed.at(-1)).toMatchObject({ campaigns: { totalCount: 0 } }),
      );
      if (fault === 'fragment-throws' || fault === 'fragment-undefined')
        jest.spyOn(f.client, 'writeFragment').mockImplementationOnce(injected);
      if (fault === 'list')
        list.mockImplementation((options) => {
          if (
            typeof options.fields === 'object' &&
            'campaigns' in options.fields &&
            injected.mock.calls.length === 0
          )
            injected();
          return originalModify(options);
        });
      if (fault === 'event')
        dispatch.mockImplementation((event) => {
          if (
            event.type === OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME &&
            injected.mock.calls.length === 0
          )
            injected();
          return originalDispatch(event);
        });
      const originalSet = f.store.set;
      if (fault === 'store' || fault === 'group')
        jest.spyOn(f.store, 'set').mockImplementation((...args) => {
          const target =
            fault === 'group'
              ? groupState
              : recordStoreFamilyState.atomFamily(
                  f.createInputs[0]?.id ?? 'not-yet-dispatched',
                );
          if (args[0] === target && injected.mock.calls.length === 0)
            injected();
          return originalSet(...args);
        });
      let record: ObjectRecord | undefined;
      await act(async () => {
        record = await result.current.index.createNewIndexRecord({
          position: 'first',
        });
      });
      expect(record?.id).toBe(f.createInputs[0].id);
      expect(injected).toHaveBeenCalledTimes(1);
      expect(f.createInputs).toHaveLength(1);
      expect(f.readIds).toEqual([]);
      expect(f.rows.size).toBe(1);
      expect(evict).not.toHaveBeenCalled();
      expect(
        list.mock.calls.filter(
          ([options]) =>
            typeof options.fields === 'object' && 'campaigns' in options.fields,
        ),
      ).toHaveLength(fault.startsWith('fragment') ? 0 : 1);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(fault === 'event' ? 0 : 1);
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(observed.at(-1)).toMatchObject({ campaigns: { totalCount: 1 } });
      expect(f.aggregateCounts).toEqual([0, 1]);
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(record!.id)),
      ).toEqual(
        fault === 'store'
          ? null
          : expect.objectContaining({
              id: record?.id,
              name: 'Server Campaign',
            }),
      );
      const cached = z
        .object({
          campaigns: z.object({
            edges: z.array(z.object({ node: z.object({ id: z.string() }) })),
          }),
        })
        .parse(
          f.cache.readQuery({
            query: listQuery,
            variables: { filter: {}, orderBy: [] },
          }),
        );
      expect(cached.campaigns.edges.map((edge) => edge.node.id)).toEqual(
        fault.startsWith('fragment') || fault === 'list' ? [] : [record?.id],
      );
      expect(f.store.get(groupState)).toEqual(
        fault === 'group' ? [] : [record?.id],
      );
      expect(
        f.store.get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        ).queue,
      ).toEqual([
        expect.objectContaining({
          message:
            'Campaign saved, but some data could not refresh. Reopen the Campaign or refresh this view.',
        }),
      ]);
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts),
      ).toEqual([]);
      await act(async () => {
        expect(
          (await result.current.index.createNewIndexRecord())?.id,
        ).not.toBe(record?.id);
      });
      expect(f.createInputs).toHaveLength(2);
      expect(injected).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      subscription.unsubscribe();
      window.removeEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        listener,
      );
    }
  },
);

it.each([
  'different-path',
  'different-index',
  'unmounted-origin',
  'stale-action',
] as const)(
  'requires explicit original-origin continuation for %s',
  async (origin) => {
    jest.useFakeTimers();
    let confirmed = false;
    const f = fixture({
      readResponse: (id, rows) =>
        JSON.stringify(
          confirmed
            ? { data: { campaign: rows.get(id) } }
            : campaignNotConfirmedResponse,
        ),
    });
    const { result, rerender } = renderHook(
      () => ({
        ...f.useFixture(),
        otherIndex: useCreateNewIndexRecord({
          objectMetadataItem: campaign,
          instanceId: 'other-index',
        }),
      }),
      { wrapper: f.Wrapper },
    );
    await act(async () => {
      const pending = result.current.index.createNewIndexRecord();
      await jest.advanceTimersByTimeAsync(7000);
      expect(await pending).toBeUndefined();
    });
    const id = f.createInputs[0].id;
    const before = [...f.requestLog];
    if (origin === 'different-path' || origin === 'stale-action')
      window.history.replaceState({}, '', '/objects/campaigns?viewId=other');
    if (origin === 'unmounted-origin') {
      f.setSurfaceMounted(false);
      rerender();
    }
    await act(async () => {
      expect(
        await (
          origin === 'different-index'
            ? result.current.otherIndex
            : result.current.index
        ).createNewIndexRecord(),
      ).toBeUndefined();
    });
    const snack = f.store
      .get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      )
      .queue.find((snack) => snack.dedupeKey === `campaign-origin-${id}`);
    expect(snack).toMatchObject({
      buttonLabel: 'Return to original view',
      message:
        origin === 'unmounted-origin'
          ? 'Reopen the original Campaign view to continue this creation.'
          : 'A Campaign creation is pending in another view. Return there to continue.',
    });
    expect(f.requestLog).toEqual(before);
    if (origin === 'stale-action') {
      act(() => f.transition('logout-new-actor'));
      act(() => snack!.buttonOnClick!());
      expect(window.location.search).toBe('?viewId=other');
      expect(f.requestLog).toEqual(before);
      expect(mockNavigate).not.toHaveBeenCalled();
      return;
    }
    act(() => snack!.buttonOnClick!());
    expect(window.location.pathname + window.location.search).toBe(RETURN_PATH);
    expect(f.requestLog).toEqual(before);
    expect(mockNavigate).not.toHaveBeenCalled();
    if (origin === 'unmounted-origin') {
      f.setSurfaceMounted(true);
      rerender();
    }
    confirmed = true;
    await act(async () => {
      expect((await result.current.index.createNewIndexRecord())?.id).toBe(id);
    });
    expect(f.createInputs).toHaveLength(2);
    expect(f.readIds).toEqual([id, id]);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  },
);

it.each(['surface-unmount', 'route-leave'] as const)(
  'retains a saved response after %s and reopens without completion replay',
  async (origin) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const f = fixture({
      deliveries: ['deliver'],
      createResponse: async (node) => {
        ready();
        await gate;
        return JSON.stringify({ data: { createCampaign: node } });
      },
    });
    const { result, rerender } = renderHook(f.useFixture, {
      wrapper: f.Wrapper,
    });
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      listener,
    );
    try {
      let pending!: Promise<ObjectRecord | undefined>;
      act(() => {
        pending = result.current.index.createNewIndexRecord();
      });
      await dispatched;
      if (origin === 'surface-unmount') {
        f.setSurfaceMounted(false);
        rerender();
      } else window.history.replaceState({}, '', '/objects/companies');
      await act(async () => {
        release();
        expect(await pending).toBeUndefined();
      });
      const id = f.createInputs[0].id;
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts),
      ).toEqual([
        expect.objectContaining({
          recordId: id,
          phase: 'saved',
          runId: null,
          completionAttempted: true,
        }),
      ]);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      f.setSurfaceMounted(true);
      window.history.replaceState({}, '', RETURN_PATH);
      rerender();
      await act(async () => {
        expect((await result.current.index.createNewIndexRecord())?.id).toBe(
          id,
        );
      });
      expect(events).toHaveLength(1);
      expect(f.createInputs).toHaveLength(1);
      expect(f.readIds).toEqual([]);
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        listener,
      );
    }
  },
);

it.each([true, false])(
  'keeps pending notice cleanup owner-only after workspace restoration (replacement=%s)',
  async (replacement) => {
    jest.useFakeTimers();
    let releaseCreate!: () => void;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    let createStarted!: () => void;
    const creating = new Promise<void>((resolve) => {
      createStarted = resolve;
    });
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let readStarted!: () => void;
    const reading = new Promise<void>((resolve) => {
      readStarted = resolve;
    });
    const f = fixture({
      deliveries: ['deliver'],
      createResponse: async (node) => {
        createStarted();
        await createGate;
        return JSON.stringify({ data: { createCampaign: node } });
      },
      readResponse: async (id, rows) => {
        readStarted();
        await readGate;
        return JSON.stringify({ data: { campaign: rows.get(id) } });
      },
    });
    const events = jest.fn();
    window.addEventListener(OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME, events);
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    const progressNotices = () =>
      f.store
        .get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        )
        .queue.filter((snack) => snack.progress !== undefined);
    let original!: Promise<ObjectRecord | undefined>;
    let retry: Promise<ObjectRecord | undefined> | undefined;
    try {
      await act(async () => {
        original = result.current.index.createNewIndexRecord({
          name: 'Original',
        });
        await creating;
      });
      const input = f.createInputs[0];
      const oldAttempt = Object.values(
        f.store.get(campaignCreationState.atom).attempts,
      )[0];
      expect(oldAttempt.runId).not.toBeNull();
      expect(progressNotices()).toHaveLength(1);
      const noticeId = progressNotices()[0].id;
      act(() => {
        f.transition('workspace-switch');
        f.restoreIdentity();
      });
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
      ).toMatchObject({
        recordId: input.id,
        runId: null,
        phase: 'unconfirmed',
      });
      if (replacement) {
        await act(async () => {
          retry = result.current.index.createNewIndexRecord({
            name: 'Not retained',
          });
          await reading;
        });
      }
      const currentAttempt = Object.values(
        f.store.get(campaignCreationState.atom).attempts,
      )[0];
      expect(currentAttempt.runId).toEqual(
        replacement ? expect.any(Number) : null,
      );
      expect(currentAttempt.runId).not.toBe(oldAttempt.runId);
      expect(progressNotices()).toEqual([
        expect.objectContaining({ id: noticeId }),
      ]);
      await act(async () => {
        releaseCreate();
        expect(await original).toBeUndefined();
      });
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
      ).toEqual(currentAttempt);
      expect(progressNotices()).toEqual(
        replacement ? [expect.objectContaining({ id: noticeId })] : [],
      );
      expect(f.createInputs).toEqual([input]);
      expect(f.readIds).toEqual(replacement ? [input.id] : []);
      expect(f.requestLog).toEqual(
        replacement
          ? ['CreateOneCampaign', 'FindOneCampaign']
          : ['CreateOneCampaign'],
      );
      expect(f.rows.size).toBe(1);
      expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(input.id)),
      ).toBeNull();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(events).not.toHaveBeenCalled();
      if (replacement) {
        expect(currentAttempt.phase).toBe('checking');
        await act(async () => {
          releaseRead();
          expect((await retry)?.id).toBe(input.id);
        });
        expect(
          Object.values(f.store.get(campaignCreationState.atom).attempts),
        ).toEqual([]);
      }
      expect(progressNotices()).toEqual([]);
      expect(mockNavigate).toHaveBeenCalledTimes(replacement ? 1 : 0);
      expect(events).toHaveBeenCalledTimes(replacement ? 1 : 0);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      expect(f.createInputs).toEqual([input]);
      expect(f.readIds).toEqual(replacement ? [input.id] : []);
      expect(f.requestLog).toEqual(
        replacement
          ? ['CreateOneCampaign', 'FindOneCampaign']
          : ['CreateOneCampaign'],
      );
      expect(f.rows.size).toBe(1);
    } finally {
      await act(async () => {
        releaseCreate();
        releaseRead();
        await original;
        await retry;
      });
      window.removeEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        events,
      );
    }
  },
);

it.each(['workspace-return', 'logout-same-actor'] as const)(
  'handles native lifetime progression %s with no stale completion',
  async (lifetime) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const f = fixture({
      deliveries: ['deliver', 'deliver'],
      createResponse: async (node) => {
        ready();
        await gate;
        return JSON.stringify({ data: { createCampaign: node } });
      },
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    let pending!: Promise<ObjectRecord | undefined>;
    act(() => {
      pending = result.current.index.createNewIndexRecord({ name: 'Original' });
    });
    await dispatched;
    const generation = f.store.get(
      campaignCreationState.atom,
    ).sessionGeneration;
    act(() => {
      if (lifetime === 'logout-same-actor') {
        localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY);
        f.store.set(tokenPairState.atom, null);
        f.store.set(currentUserState.atom, null);
      } else f.transition('workspace-switch');
      f.restoreIdentity();
    });
    await act(async () => {
      release();
      expect(await pending).toBeUndefined();
    });
    const id = f.createInputs[0].id;
    expect(f.cache.extract()[`Campaign:${id}`]).toBeUndefined();
    expect(f.store.get(recordStoreFamilyState.atomFamily(id))).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(f.readIds).toEqual([]);
    expect(f.store.get(campaignCreationState.atom).sessionGeneration).toEqual(
      lifetime === 'workspace-return' ? generation : expect.any(Number),
    );
    if (lifetime === 'logout-same-actor')
      expect(
        f.store.get(campaignCreationState.atom).sessionGeneration,
      ).toBeGreaterThan(generation);
    await act(async () => {
      const record = await result.current.index.createNewIndexRecord({
        name: 'New explicit action',
      });
      expect(record?.id).toEqual(
        lifetime === 'workspace-return' ? id : expect.any(String),
      );
      if (lifetime === 'logout-same-actor') expect(record?.id).not.toBe(id);
    });
    expect(f.createInputs).toHaveLength(
      lifetime === 'workspace-return' ? 1 : 2,
    );
    expect(f.readIds).toEqual(lifetime === 'workspace-return' ? [id] : []);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  },
);

it.each([
  'native not-confirmation',
  'unsupported error-free null',
  'denied',
] as const)(
  'never resends saved retention after an authorization boundary and %s',
  async (outcome) => {
    const f = fixture({
      deliveries: ['deliver'],
      readResponse: () =>
        JSON.stringify(
          outcome === 'native not-confirmation'
            ? campaignNotConfirmedResponse
            : outcome === 'unsupported error-free null'
              ? { data: { campaign: null } }
              : {
                  data: { campaign: null },
                  errors: [
                    {
                      message: 'User does not have permission.',
                      extensions: {
                        code: 'FORBIDDEN',
                        subCode: 'PERMISSION_DENIED',
                      },
                    },
                  ],
                },
        ),
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    mockNavigate.mockImplementationOnce(() => {
      throw new Error('Navigation unavailable');
    });
    await act(async () => {
      expect(await result.current.index.createNewIndexRecord()).toBeUndefined();
    });
    act(() => {
      f.transition('workspace-switch');
      f.restoreIdentity();
    });
    await act(async () => {
      expect(await result.current.index.createNewIndexRecord()).toBeUndefined();
    });
    expect(f.createInputs).toHaveLength(1);
    expect(f.readIds).toEqual([f.createInputs[0].id]);
    expect(
      Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
    ).toMatchObject({ phase: 'saved', completionAttempted: true });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  },
);

const CampaignTableControl = () => (
  <RecordIndexContextProvider
    value={{
      objectMetadataItem: campaign,
      objectNameSingular: 'campaign',
      objectNamePlural: 'campaigns',
      recordIndexId: INDEX_ID,
      viewBarInstanceId: INDEX_ID,
      objectPermissionsByObjectMetadataId: { [campaign.id]: permissions },
      indexIdentifierUrl: () => RETURN_PATH,
      onIndexRecordsLoaded: () => {},
      recordFieldByFieldMetadataItemId: {},
      fieldMetadataItemByFieldMetadataItemId: {},
      fieldDefinitionByFieldMetadataItemId: {},
      labelIdentifierFieldMetadataItem: fields[1],
    }}
  >
    <RecordTableContextProvider
      value={{
        recordTableId: INDEX_ID,
        viewBarId: INDEX_ID,
        objectNameSingular: 'campaign',
        objectMetadataItem: campaign,
        objectMetadataItems: metadata,
        objectPermissions: permissions,
        visibleRecordFields: [],
        triggerEvent: 'CLICK',
      }}
    >
      <RecordTableComponentInstanceContext.Provider
        value={{ instanceId: INDEX_ID }}
      >
        <RecordTableNoRecordGroupAddNew />
      </RecordTableComponentInstanceContext.Provider>
    </RecordTableContextProvider>
  </RecordIndexContextProvider>
);
const installCommand = (f: ReturnType<typeof fixture>, commandId: string) => {
  f.store.set(
    headlessCommandContextApisState.atom,
    new Map([
      [
        commandId,
        {
          engineComponentKey: EngineComponentKey.CREATE_NEW_RECORD,
          contextStoreInstanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
          objectMetadataItem: campaign,
          currentViewId: VIEW_ID,
          recordIndexId: INDEX_ID,
          targetedRecordsRule: { mode: 'selection', selectedRecordIds: [] },
          selectedRecords: [],
          graphqlFilter: null,
          payload: null,
        },
      ],
    ]),
  );
  f.store.set(commandMenuItemProgressFamilyState.atomFamily(commandId), 0);
};

it.each(['toolbar', 'table'] as const)(
  'real command and actual table share one pending owner started by %s',
  async (owner) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const f = fixture({
      deliveries: ['deliver'],
      createResponse: async (node) => {
        ready();
        await gate;
        return JSON.stringify({ data: { createCampaign: node } });
      },
    });
    f.store.set(
      totalNumberOfRecordsToVirtualizeComponentState.atomFamily({
        instanceId: INDEX_ID,
      }),
      3,
    );
    const virtualRows = recordIdByRealIndexComponentState.atomFamily({
      instanceId: INDEX_ID,
    });
    const Host = () => {
      f.useFixture();
      const headlessCommandContextApis = useAtomStateValue(
        headlessCommandContextApisState,
      );
      return (
        <>
          <CampaignTableControl />
          {[...headlessCommandContextApis.keys()].map((id) => (
            <CommandComponentInstanceContext.Provider
              key={id}
              value={{ instanceId: id }}
            >
              <CreateNewIndexRecordNoSelectionRecordCommand />
            </CommandComponentInstanceContext.Provider>
          ))}
        </>
      );
    };
    render(<Host />, { wrapper: f.Wrapper });
    if (owner === 'toolbar') act(() => installCommand(f, 'toolbar'));
    else fireEvent.click(screen.getByRole('button', { name: 'Add New' }));
    await dispatched;
    if (owner === 'toolbar')
      fireEvent.click(screen.getByRole('button', { name: 'Add New' }));
    else act(() => installCommand(f, 'toolbar'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(f.createInputs).toHaveLength(1);
    expect(f.createInputs[0].position).toBe(
      owner === 'toolbar' ? 'first' : 'last',
    );
    expect(f.store.get(virtualRows).size).toBe(0);
    expect(
      f.store.get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      ).queue,
    ).toEqual([
      expect.objectContaining({ progress: 0, message: 'Creating Campaign…' }),
    ]);
    await act(async () => {
      release();
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(f.store.get(headlessCommandContextApisState.atom).size).toBe(0),
    );
    expect(
      f.store.get(commandMenuItemProgressFamilyState.atomFamily('toolbar')),
    ).toBeUndefined();
    expect(f.store.get(virtualRows)).toEqual(
      owner === 'table' ? new Map([[3, f.createInputs[0].id]]) : new Map(),
    );
    expect(f.createInputs).toHaveLength(1);
    expect(f.readIds).toEqual([]);
    expect(
      f.store.get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      ).queue,
    ).toEqual([]);
  },
);

it('real command remount checks retained uncertainty then allows a new intentional ID only after success', async () => {
  jest.useFakeTimers();
  const f = fixture({
    deliveries: ['fail-before-save', 'fail-before-save', 'deliver', 'deliver'],
  });
  const Host = () => {
    f.useFixture();
    const headlessCommandContextApis = useAtomStateValue(
      headlessCommandContextApisState,
    );
    return (
      <>
        {[...headlessCommandContextApis.keys()].map((id) => (
          <CommandComponentInstanceContext.Provider
            key={id}
            value={{ instanceId: id }}
          >
            <CreateNewIndexRecordNoSelectionRecordCommand />
          </CommandComponentInstanceContext.Provider>
        ))}
      </>
    );
  };
  render(<Host />, { wrapper: f.Wrapper });
  for (const id of ['initial', 'retry', 'intentional']) {
    act(() => installCommand(f, id));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(7000);
    });
    expect(f.store.get(headlessCommandContextApisState.atom).size).toBe(0);
    expect(
      f.store.get(commandMenuItemProgressFamilyState.atomFamily(id)),
    ).toBeUndefined();
    expect(
      f.store
        .get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        )
        .queue.filter((snack) => snack.progress !== undefined),
    ).toEqual([]);
  }
  expect(f.createInputs).toHaveLength(4);
  expect(f.createInputs.slice(0, 3)).toEqual(Array(3).fill(f.createInputs[0]));
  expect(f.createInputs[3].id).not.toBe(f.createInputs[0].id);
  expect(f.readIds).toEqual([f.createInputs[0].id, f.createInputs[0].id]);
  expect(f.rows.size).toBe(2);
  expect(mockNavigate).toHaveBeenCalledTimes(2);
});

it('rejects incomplete selected nested owner names without inverse attachment or recovery completion', async () => {
  jest.useFakeTimers();
  const f = fixture({
    owner: true,
    readResponse: (id, rows) =>
      JSON.stringify({
        data: {
          campaign: {
            ...rows.get(id),
            owner: {
              ...ownerIdentity,
              name: { __typename: 'FullName', firstName: 'Campaign' },
            },
          },
        },
      }),
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    const pending = result.current.index.createNewIndexRecord({
      ownerId: MEMBER_ID,
    });
    await jest.advanceTimersByTimeAsync(7000);
    expect(await pending).toBeUndefined();
  });
  const id = f.createInputs[0].id;
  expect(f.readIds).toEqual([id]);
  expect(f.memberReadIds).toEqual([MEMBER_ID]);
  expect(f.createInputs).toHaveLength(2);
  expect(f.cache.extract()[`Campaign:${id}`]).toBeUndefined();
  expect(f.store.get(recordStoreFamilyState.atomFamily(id))).toBeNull();
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => {
    expect(await result.current.index.createNewIndexRecord()).toBeUndefined();
  });
  expect(f.createInputs).toHaveLength(2);
});

it('does not use a stale cache-only Campaign shell as authoritative absence or success', async () => {
  jest.useFakeTimers();
  const f = fixture({
    deliveries: ['fail-before-save', 'fail-before-save', 'deliver'],
    beforeCreate: (input, _rows, dispatch) => {
      if (dispatch === 1)
        f.cache.writeQuery({
          query: listQuery,
          variables: { filter: {}, orderBy: [] },
          data: {
            campaigns: connection([
              { ...existingCampaign, id: input.id, name: 'Cache only' },
            ]),
          },
        });
    },
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  await act(async () => {
    const pending = result.current.index.createNewIndexRecord({
      name: 'Real input',
    });
    await jest.advanceTimersByTimeAsync(7000);
    expect(await pending).toBeUndefined();
  });
  const input = f.createInputs[0];
  expect(f.rows.size).toBe(0);
  expect(f.cache.extract()[`Campaign:${input.id}`]).toMatchObject({
    name: 'Cache only',
  });
  expect(f.readIds).toEqual([input.id]);
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => {
    expect((await result.current.index.createNewIndexRecord())?.id).toBe(
      input.id,
    );
  });
  expect(f.createInputs).toEqual([input, input, input]);
  expect(f.readIds).toEqual([input.id, input.id]);
  expect(f.rows.size).toBe(1);
  expect(f.cache.extract()[`Campaign:${input.id}`]).toMatchObject({
    name: 'Real input',
  });
});

it.each(['preexisting-exact-id', 'different-name-conflict'] as const)(
  'does not follow or evict a fresh %s duplicate target',
  async (conflict) => {
    const conflictingId = existingCampaign.id;
    const f = fixture({
      deliveries: ['deliver'],
      beforeCreate: (input, rows) => {
        const node = {
          ...existingCampaign,
          id: conflict === 'preexisting-exact-id' ? input.id : conflictingId,
        };
        rows.set(node.id, node);
        f.cache.writeQuery({
          query: listQuery,
          variables: { filter: {}, orderBy: [] },
          data: { campaigns: connection([node]) },
        });
      },
      failureResponse: async () =>
        JSON.stringify({
          errors: [
            {
              message: 'A duplicate entry was detected',
              extensions: {
                code: 'BAD_USER_INPUT',
                userFriendlyMessage: 'A duplicate entry was detected',
                subCode: 'DUPLICATE_ENTRY_DETECTED',
                conflictingRecordId: conflictingId,
                objectMetadataId: company.id,
              },
            },
          ],
        }),
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    const evict = jest.spyOn(f.cache, 'evict');
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(
      OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
      listener,
    );
    try {
      await act(async () => {
        expect(
          await result.current.index.createNewIndexRecord(),
        ).toBeUndefined();
      });
      expect(f.createInputs).toHaveLength(1);
      expect(f.readIds).toEqual([]);
      expect(events).toHaveLength(0);
      expect(evict).not.toHaveBeenCalled();
      expect(f.rows.size).toBe(1);
      const preexistingId =
        conflict === 'preexisting-exact-id'
          ? f.createInputs[0].id
          : conflictingId;
      expect(f.cache.extract()[`Campaign:${preexistingId}`]).toMatchObject({
        name: existingCampaign.name,
      });
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts),
      ).toEqual([]);
      expect(
        f.store.get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        ).queue,
      ).toEqual([
        expect.objectContaining({ message: 'A duplicate entry was detected' }),
      ]);
    } finally {
      window.removeEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        listener,
      );
    }
  },
);

it('assigns the owned Campaign ID after real native RLS filters and caller defaults', async () => {
  const f = fixture({ deliveries: ['deliver'] });
  const rlsId = '34700000-0000-4000-8000-000000000051';
  const filterId = '34700000-0000-4000-8000-000000000052';
  const callerId = '34700000-0000-4000-8000-000000000053';
  const current = f.store.get(currentUserWorkspaceState.atom);
  if (!current) throw new Error('Expected native permission fixture');
  f.store.set(currentUserWorkspaceState.atom, {
    ...current,
    objectsPermissions: current.objectsPermissions.map((permission) =>
      permission.objectMetadataId !== campaign.id
        ? permission
        : {
            ...permission,
            rowLevelPermissionPredicates: [
              {
                id: 'id-predicate',
                objectMetadataId: campaign.id,
                fieldMetadataId: fields[0].id,
                roleId: 'role',
                subFieldName: null,
                workspaceMemberFieldMetadataId: null,
                workspaceMemberSubFieldName: null,
                operand: RowLevelPermissionPredicateOperand.IS,
                value: rlsId,
              },
              {
                id: 'name-predicate',
                objectMetadataId: campaign.id,
                fieldMetadataId: fields[1].id,
                roleId: 'role',
                subFieldName: null,
                workspaceMemberFieldMetadataId: null,
                workspaceMemberSubFieldName: null,
                operand: RowLevelPermissionPredicateOperand.CONTAINS,
                value: 'RLS name',
              },
              {
                id: 'objective-predicate',
                objectMetadataId: campaign.id,
                fieldMetadataId: fields[2].id,
                roleId: 'role',
                subFieldName: null,
                workspaceMemberFieldMetadataId: null,
                workspaceMemberSubFieldName: null,
                operand: RowLevelPermissionPredicateOperand.CONTAINS,
                value: 'RLS objective',
              },
            ],
          },
    ),
  });
  f.store.set(
    currentRecordFiltersComponentState.atomFamily({ instanceId: INDEX_ID }),
    [
      {
        id: 'id-filter',
        fieldMetadataId: fields[0].id,
        type: 'UUID',
        value: filterId,
        displayValue: filterId,
        operand: ViewFilterOperand.IS,
        label: 'Id',
      },
      {
        id: 'name-filter',
        fieldMetadataId: fields[1].id,
        type: 'TEXT',
        value: 'Filter name',
        displayValue: 'Filter name',
        operand: ViewFilterOperand.CONTAINS,
        label: 'Name',
      },
    ],
  );
  const { result } = renderHook(
    () => ({
      ...f.useFixture(),
      rls: useBuildRecordInputFromRLSPredicates({
        objectMetadataItem: campaign,
      }),
      filters: useBuildRecordInputFromFilters({
        objectMetadataItem: campaign,
        instanceId: INDEX_ID,
      }),
    }),
    { wrapper: f.Wrapper },
  );
  expect(result.current.rls.buildRecordInputFromRLSPredicates()).toEqual({
    id: rlsId,
    name: 'RLS name',
    objective: 'RLS objective',
  });
  expect(result.current.filters.buildRecordInputFromFilters()).toEqual({
    id: filterId,
    name: 'Filter name',
  });
  await act(async () => {
    await result.current.index.createNewIndexRecord({
      id: callerId,
      name: 'Caller name',
      position: 'last',
    });
  });
  expect(f.createInputs).toEqual([
    {
      id: expect.any(String),
      name: 'Caller name',
      objective: 'RLS objective',
      position: 'last',
    },
  ]);
  expect([rlsId, filterId, callerId]).not.toContain(f.createInputs[0].id);
  expect(f.readIds).toEqual([]);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it.each(['create-response', 'recovery-response'] as const)(
  'blocks revoked read permission before %s completion and resumes exact ID after restoration',
  async (phase) => {
    jest.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const f = fixture({
      deliveries:
        phase === 'create-response'
          ? ['deliver']
          : ['fail-after-save', 'deliver'],
      createResponse:
        phase === 'create-response'
          ? async (node) => {
              ready();
              await gate;
              return JSON.stringify({ data: { createCampaign: node } });
            }
          : undefined,
      readResponse: async (id, rows) => {
        if (phase === 'recovery-response') {
          ready();
          await gate;
        }
        return JSON.stringify({ data: { campaign: rows.get(id) } });
      },
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    let pending!: Promise<ObjectRecord | undefined>;
    act(() => {
      pending = result.current.index.createNewIndexRecord();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(7000);
    });
    await dispatched;
    const current = f.store.get(currentUserWorkspaceState.atom);
    if (!current) throw new Error('Expected native permissions');
    act(() =>
      f.store.set(currentUserWorkspaceState.atom, {
        ...current,
        objectsPermissions: current.objectsPermissions.map((permission) =>
          permission.objectMetadataId === campaign.id
            ? { ...permission, canReadObjectRecords: false }
            : permission,
        ),
      }),
    );
    await act(async () => {
      release();
      expect(await pending).toBeUndefined();
    });
    const id = f.createInputs[0].id;
    expect(f.cache.extract()[`Campaign:${id}`]).toBeUndefined();
    expect(f.store.get(recordStoreFamilyState.atomFamily(id))).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      f.store.get(
        snackBarInternalComponentState.atomFamily({
          instanceId: 'campaign-test-snacks',
        }),
      ).queue,
    ).toEqual([]);
    act(() => f.store.set(currentUserWorkspaceState.atom, current));
    await act(async () => {
      expect((await result.current.index.createNewIndexRecord())?.id).toBe(id);
    });
    expect(f.createInputs).toHaveLength(phase === 'create-response' ? 1 : 2);
    expect(f.readIds).toEqual(
      Array(phase === 'create-response' ? 1 : 2).fill(id),
    );
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  },
);

it.each([
  'null',
  'missing-root',
  'missing-selected-name',
  'wrong-typename',
] as const)(
  'retains malformed dispatched mutation %s without immediate read or false completion',
  async (shape) => {
    const f = fixture({
      deliveries: ['deliver'],
      createResponse: (node) =>
        JSON.stringify(
          shape === 'missing-root'
            ? { data: {} }
            : {
                data: {
                  createCampaign:
                    shape === 'null'
                      ? null
                      : shape === 'missing-selected-name'
                        ? { ...node, name: undefined }
                        : { ...node, __typename: 'Company' },
                },
              },
        ),
    });
    const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
    await act(async () => {
      expect(await result.current.index.createNewIndexRecord()).toBeUndefined();
    });
    const id = f.createInputs[0].id;
    expect(f.readIds).toEqual([]);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(f.cache.extract()[`Campaign:${id}`]).toBeUndefined();
    expect(
      Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
    ).toMatchObject({ phase: 'unconfirmed', uncertain: true, recordId: id });
    await act(async () => {
      expect((await result.current.index.createNewIndexRecord())?.id).toBe(id);
    });
    expect(f.createInputs).toHaveLength(1);
    expect(f.readIds).toEqual([id]);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  },
);

it('keeps a real concurrent unrelated query retry from making a fresh index duplicate recoverable', async () => {
  jest.useFakeTimers();
  const f = fixture({
    deliveries: ['deliver'],
    failureResponse: async () =>
      JSON.stringify({
        errors: [
          {
            message: 'A duplicate entry was detected',
            extensions: {
              code: 'BAD_USER_INPUT',
              userFriendlyMessage: 'A duplicate entry was detected',
            },
          },
        ],
      }),
    queryResponse: (name, _variables, data, occurrence) => {
      if (name === 'AggregateCompanies' && occurrence === 1)
        throw new TypeError('Unrelated request loss');
      return JSON.stringify({ data });
    },
  });
  const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
  await act(async () => {
    const unrelated = expect(
      f.client.query({
        query: unrelatedAggregateQuery,
        fetchPolicy: 'no-cache',
      }),
    ).resolves.toMatchObject({ data: { companies: { totalCount: 9 } } });
    const create = result.current.index.createNewIndexRecord();
    await jest.advanceTimersByTimeAsync(7000);
    await unrelated;
    expect(await create).toBeUndefined();
  });
  expect(
    f.requestLog.filter((name) => name === 'AggregateCompanies'),
  ).toHaveLength(2);
  expect(f.createInputs).toHaveLength(1);
  expect(f.readIds).toEqual([]);
  expect(f.rows.size).toBe(0);
  expect(f.contexts[0].transport).toEqual({
    dispatched: true,
    uncertain: false,
  });
  expect(
    Object.values(f.store.get(campaignCreationState.atom).attempts),
  ).toEqual([]);
  expect(mockNavigate).not.toHaveBeenCalled();
});

describe('native not-confirmation safety', () => {
  it.each([
    'workspace-switch',
    'logout-new-actor',
    'member',
    'token',
    'impersonation',
    'read-permission',
    'create-permission',
  ] as const)(
    'blocks same-ID resend when %s changes during the explicit native read',
    async (boundary) => {
      jest.useFakeTimers();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let readStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        readStarted = resolve;
      });
      let reads = 0;
      const f = fixture({
        deliveries: ['fail-before-save', 'fail-before-save'],
        readResponse: async () => {
          reads += 1;
          if (reads === 2) {
            readStarted();
            await gate;
          }
          return JSON.stringify(campaignNotConfirmedResponse);
        },
      });
      const events = jest.fn();
      window.addEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        events,
      );
      disposers.push(() =>
        window.removeEventListener(
          OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
          events,
        ),
      );
      const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
      await act(async () => {
        const pending = result.current.index.createNewIndexRecord({
          name: 'Original',
        });
        await jest.advanceTimersByTimeAsync(7000);
        expect(await pending).toBeUndefined();
      });
      const input = f.createInputs[0];
      let retry!: Promise<ObjectRecord | undefined>;
      await act(async () => {
        retry = result.current.index.createNewIndexRecord({
          name: 'Not retained',
        });
        await started;
      });
      act(() => {
        if (boundary === 'workspace-switch' || boundary === 'logout-new-actor')
          f.transition(boundary);
        else if (boundary === 'member') {
          const member = f.store.get(currentWorkspaceMemberState.atom);
          if (!member) throw new Error('Expected member');
          f.store.set(currentWorkspaceMemberState.atom, {
            ...member,
            id: '34700000-0000-4000-8000-000000000099',
          });
        } else if (boundary === 'token')
          localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY);
        else if (boundary === 'impersonation') {
          const tokens = tokenPair({
            workspaceId: WORKSPACE_ID,
            userId: USER_ID,
            userWorkspaceId: USER_WORKSPACE_ID,
            workspaceMemberId: MEMBER_ID,
            isImpersonating: true,
          });
          localStorage.setItem(
            TOKEN_PAIR_LOCAL_STORAGE_KEY,
            JSON.stringify(tokens),
          );
          f.store.set(tokenPairState.atom, tokens);
        } else {
          const current = f.store.get(currentUserWorkspaceState.atom);
          if (!current) throw new Error('Expected permissions');
          f.store.set(currentUserWorkspaceState.atom, {
            ...current,
            objectsPermissions: current.objectsPermissions.map((permission) =>
              permission.objectMetadataId !== campaign.id
                ? permission
                : {
                    ...permission,
                    ...(boundary === 'read-permission'
                      ? { canReadObjectRecords: false }
                      : { canUpdateObjectRecords: false }),
                  },
            ),
          });
        }
      });
      await act(async () => {
        release();
        expect(await retry).toBeUndefined();
      });
      expect(f.requestLog).toEqual([
        'CreateOneCampaign',
        'CreateOneCampaign',
        'FindOneCampaign',
        'FindOneCampaign',
      ]);
      expect(f.createInputs).toEqual([input, input]);
      expect(f.readIds).toEqual([input.id, input.id]);
      expect(f.rows.size).toBe(0);
      expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(input.id)),
      ).toBeNull();
      expect(events).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts).every(
          (attempt) => attempt.runId === null && !attempt.completionAttempted,
        ),
      ).toBe(true);
      expect(
        f.store
          .get(
            snackBarInternalComponentState.atomFamily({
              instanceId: 'campaign-test-snacks',
            }),
          )
          .queue.filter((snack) => snack.progress !== undefined),
      ).toEqual([]);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      expect(f.requestLog).toHaveLength(4);
    },
  );

  it('owns both controls through explicit retry read and resend without speculative UI', async () => {
    jest.useFakeTimers();
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let readStarted!: () => void;
    const reading = new Promise<void>((resolve) => {
      readStarted = resolve;
    });
    let releaseCreate!: () => void;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    let createStarted!: () => void;
    const creating = new Promise<void>((resolve) => {
      createStarted = resolve;
    });
    let reads = 0;
    const f = fixture({
      deliveries: ['fail-before-save', 'fail-before-save', 'deliver'],
      readResponse: async () => {
        reads += 1;
        if (reads === 2) {
          readStarted();
          await readGate;
        }
        return JSON.stringify(campaignNotConfirmedResponse);
      },
      createResponse: async (node) => {
        createStarted();
        await createGate;
        return JSON.stringify({ data: { createCampaign: node } });
      },
    });
    const { result } = renderHook(
      () => ({ first: f.useFixture(), second: f.useFixture() }),
      { wrapper: f.Wrapper },
    );
    await act(async () => {
      const pending = result.current.first.index.createNewIndexRecord({
        name: 'Original',
      });
      await jest.advanceTimersByTimeAsync(7000);
      expect(await pending).toBeUndefined();
    });
    const input = f.createInputs[0];
    let retry!: Promise<ObjectRecord | undefined>;
    await act(async () => {
      retry = result.current.first.index.createNewIndexRecord({
        name: 'New defaults',
      });
      await reading;
    });
    for (const phase of ['checking', 'creating'] as const) {
      if (phase === 'creating')
        await act(async () => {
          releaseRead();
          await creating;
        });
      const requests = [...f.requestLog];
      const attempt = Object.values(
        f.store.get(campaignCreationState.atom).attempts,
      )[0];
      expect(attempt).toMatchObject({
        phase,
        recordId: input.id,
        completionAttempted: false,
      });
      expect(attempt.runId).not.toBeNull();
      await act(async () => {
        expect(
          await result.current.second.index.createNewIndexRecord({
            name: 'Other control',
          }),
        ).toBeUndefined();
      });
      expect(f.requestLog).toEqual(requests);
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts)[0]
          .runId,
      ).toBe(attempt.runId);
      expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(input.id)),
      ).toBeNull();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        f.store
          .get(
            snackBarInternalComponentState.atomFamily({
              instanceId: 'campaign-test-snacks',
            }),
          )
          .queue.filter((snack) => snack.progress !== undefined),
      ).toHaveLength(1);
    }
    await act(async () => {
      releaseCreate();
      expect((await retry)?.id).toBe(input.id);
    });
    expect(f.requestLog).toEqual([
      'CreateOneCampaign',
      'CreateOneCampaign',
      'FindOneCampaign',
      'FindOneCampaign',
      'CreateOneCampaign',
    ]);
    expect(f.createInputs).toEqual([input, input, input]);
    expect(f.rows.size).toBe(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(
      f.store
        .get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        )
        .queue.filter((snack) => snack.progress !== undefined),
    ).toEqual([]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(7000);
    });
    expect(f.requestLog).toHaveLength(5);
  });

  const missingError = campaignNotConfirmedResponse.errors[0];
  it.each([
    [
      'code only',
      {
        data: { campaign: null },
        errors: [
          { message: missingError.message, extensions: { code: 'NOT_FOUND' } },
        ],
      },
    ],
    [
      'wrong subCode',
      {
        data: { campaign: null },
        errors: [
          {
            ...missingError,
            extensions: { code: 'NOT_FOUND', subCode: 'OTHER' },
          },
        ],
      },
    ],
    [
      'wrong message',
      {
        data: { campaign: null },
        errors: [{ ...missingError, message: 'Other missing record' }],
      },
    ],
    ['missing data', { errors: [missingError] }],
    ['missing root', { data: {}, errors: [missingError] }],
    ['other root', { data: { person: null }, errors: [missingError] }],
    [
      'extra root',
      { data: { campaign: null, person: null }, errors: [missingError] },
    ],
    [
      'inherited root is not on wire',
      { data: Object.create({ campaign: null }), errors: [missingError] },
    ],
    ['array data', { data: [], errors: [missingError] }],
    [
      'wrong path',
      {
        data: { campaign: null },
        errors: [{ ...missingError, path: ['person'] }],
      },
    ],
    [
      'nested path',
      {
        data: { campaign: null },
        errors: [{ ...missingError, path: ['campaign', 'owner'] }],
      },
    ],
    [
      'null path',
      { data: { campaign: null }, errors: [{ ...missingError, path: null }] },
    ],
    [
      'mixed duplicate',
      {
        data: { campaign: null },
        errors: [
          missingError,
          {
            message: 'A duplicate entry was detected',
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      },
    ],
    [
      'mixed forbidden',
      {
        data: { campaign: null },
        errors: [
          missingError,
          { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
        ],
      },
    ],
    [
      'null forbidden',
      {
        data: { campaign: null },
        errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
      },
    ],
    [
      'partial nonnull',
      { data: { campaign: existingCampaign }, errors: [missingError] },
    ],
    ['unsupported error-free null', { data: { campaign: null } }],
    ['HTTP404', campaignNotConfirmedResponse],
    ['malformed JSON', null],
    ['arbitrary rejection', null],
  ])(
    'never resends or completes after explicit %s read',
    async (name, envelope) => {
      jest.useFakeTimers();
      let explicit = false;
      const options: FixtureOptions = {
        deliveries: ['fail-before-save', 'fail-before-save'],
        readResponse: () => {
          if (!explicit) return JSON.stringify(campaignNotConfirmedResponse);
          if (name === 'arbitrary rejection')
            throw new Error('Unrelated read failure');
          return name === 'malformed JSON'
            ? '{not-json'
            : JSON.stringify(envelope);
        },
      };
      const f = fixture(options);
      const events = jest.fn();
      window.addEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        events,
      );
      disposers.push(() =>
        window.removeEventListener(
          OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
          events,
        ),
      );
      const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
      for (let action = 0; action < 2; action += 1) {
        explicit = action === 1;
        if (explicit && name === 'HTTP404') options.responseStatus = 404;
        await act(async () => {
          const pending = result.current.index.createNewIndexRecord({
            name: action ? 'Not retained' : 'Original',
          });
          await jest.advanceTimersByTimeAsync(14000);
          expect(await pending).toBeUndefined();
        });
      }
      const input = f.createInputs[0];
      expect(f.createInputs).toEqual([input, input]);
      expect(f.readIds).toEqual(
        Array(
          ['HTTP404', 'malformed JSON', 'arbitrary rejection'].includes(name)
            ? 3
            : 2,
        ).fill(input.id),
      );
      expect(f.rows.size).toBe(0);
      expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(input.id)),
      ).toBeNull();
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
      ).toMatchObject({
        recordId: input.id,
        phase: 'unconfirmed',
        runId: null,
        completionAttempted: false,
      });
      expect(events).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        f.store
          .get(
            snackBarInternalComponentState.atomFamily({
              instanceId: 'campaign-test-snacks',
            }),
          )
          .queue.filter((snack) => snack.progress !== undefined),
      ).toEqual([]);
      const requests = [...f.requestLog];
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      expect(f.requestLog).toEqual(requests);
    },
  );

  // Storage-wide uniqueness with filtered read visibility is a frontend/source model, not live RLS/PK locking proof.
  it.each(['hidden', 'soft-deleted'] as const)(
    'preserves the full %s occupant across same-ID insert conflict',
    async (visibility) => {
      jest.useFakeTimers();
      const f = fixture({
        deliveries: ['fail-after-save', 'deliver', 'deliver'],
        readResponse: () => JSON.stringify(campaignNotConfirmedResponse),
      });
      const events = jest.fn();
      window.addEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        events,
      );
      disposers.push(() =>
        window.removeEventListener(
          OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
          events,
        ),
      );
      const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
      await act(async () => {
        const pending = result.current.index.createNewIndexRecord({
          name: 'Original occupant',
          objective: 'Never overwrite',
          position: 'first',
        });
        await jest.advanceTimersByTimeAsync(7000);
        expect(await pending).toBeUndefined();
      });
      const input = f.createInputs[0];
      const original = {
        ...f.rows.get(input.id)!,
        deletedAt:
          visibility === 'soft-deleted' ? '2026-01-02T00:00:00.000Z' : null,
      };
      f.rows.set(input.id, structuredClone(original));
      expect(f.rows.size).toBe(1);
      await act(async () => {
        expect(
          await result.current.index.createNewIndexRecord({
            name: 'Never overwrite',
            position: 'last',
          }),
        ).toBeUndefined();
      });
      expect(f.rows.size).toBe(1);
      expect(f.rows.get(input.id)).toEqual(original);
      expect(f.createInputs).toEqual([input, input, input]);
      expect(f.readIds).toEqual([input.id, input.id, input.id]);
      expect(f.requestLog).toEqual([
        'CreateOneCampaign',
        'CreateOneCampaign',
        'FindOneCampaign',
        'FindOneCampaign',
        'CreateOneCampaign',
        'FindOneCampaign',
      ]);
      expect(f.updateIds).toEqual([]);
      expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
      expect(
        f.store.get(recordStoreFamilyState.atomFamily(input.id)),
      ).toBeNull();
      expect(events).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
      ).toMatchObject({
        phase: 'unconfirmed',
        runId: null,
        completionAttempted: false,
      });
      const requests = [...f.requestLog];
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      expect(f.requestLog).toEqual(requests);
    },
  );

  it.each(['confirmed', 'not-confirmed'] as const)(
    'bounds delayed-commit conflict with final read %s',
    async (outcome) => {
      jest.useFakeTimers();
      let reads = 0;
      let original: RecordGqlNode | undefined;
      const f = fixture({
        deliveries: ['fail-before-save', 'fail-before-save', 'deliver'],
        beforeCreate: (input, rows, dispatch) => {
          if (dispatch === 3) {
            original = { ...existingCampaign, id: input.id };
            rows.set(input.id, structuredClone(original));
          }
        },
        readResponse: (id, rows) => {
          reads += 1;
          return JSON.stringify(
            reads === 3 && outcome === 'confirmed'
              ? { data: { campaign: rows.get(id) } }
              : campaignNotConfirmedResponse,
          );
        },
      });
      const events = jest.fn();
      window.addEventListener(
        OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
        events,
      );
      disposers.push(() =>
        window.removeEventListener(
          OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME,
          events,
        ),
      );
      const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
      await act(async () => {
        const pending = result.current.index.createNewIndexRecord({
          name: 'Original input',
        });
        await jest.advanceTimersByTimeAsync(7000);
        expect(await pending).toBeUndefined();
      });
      expect(f.rows.size).toBe(0);
      let saved: ObjectRecord | undefined;
      await act(async () => {
        saved = await result.current.index.createNewIndexRecord({
          name: 'Changed defaults',
        });
      });
      const input = f.createInputs[0];
      expect(saved?.id).toBe(outcome === 'confirmed' ? input.id : undefined);
      expect(f.requestLog).toEqual([
        'CreateOneCampaign',
        'CreateOneCampaign',
        'FindOneCampaign',
        'FindOneCampaign',
        'CreateOneCampaign',
        'FindOneCampaign',
      ]);
      expect(f.createInputs).toEqual([input, input, input]);
      expect(f.readIds).toEqual([input.id, input.id, input.id]);
      expect(f.rows.size).toBe(1);
      expect(f.rows.get(input.id)).toEqual(original);
      expect(f.updateIds).toEqual([]);
      expect(events).toHaveBeenCalledTimes(outcome === 'confirmed' ? 1 : 0);
      expect(mockNavigate).toHaveBeenCalledTimes(
        outcome === 'confirmed' ? 1 : 0,
      );
      if (outcome === 'not-confirmed') {
        expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
        expect(
          f.store.get(recordStoreFamilyState.atomFamily(input.id)),
        ).toBeNull();
        expect(
          Object.values(f.store.get(campaignCreationState.atom).attempts)[0],
        ).toMatchObject({ phase: 'unconfirmed', runId: null });
      }
      const requests = [...f.requestLog];
      await act(async () => {
        await jest.advanceTimersByTimeAsync(7000);
      });
      expect(f.requestLog).toEqual(requests);
    },
  );

  it.each([
    ['server permission', 'FORBIDDEN', 'User does not have permission.'],
    ['field write', 'FORBIDDEN', 'Cannot write this field.'],
    [
      'current RLS',
      'BAD_USER_INPUT',
      'Record does not satisfy row-level security constraints of your current role',
    ],
    ['invalid owner connect', 'BAD_USER_INPUT', 'Invalid owner connect.'],
    ['revoked relation access', 'FORBIDDEN', 'User does not have permission.'],
    ['unique wait timeout', 'INTERNAL_SERVER_ERROR', 'Query timeout'],
  ])(
    'preserves genuine %s rejection before uniqueness and allows restored original-input continuation',
    async (_, code, message) => {
      jest.useFakeTimers();
      const options: FixtureOptions = {
        deliveries: [
          'fail-before-save',
          'fail-before-save',
          'deliver',
          'deliver',
        ],
      };
      const f = fixture(options);
      const { result } = renderHook(f.useFixture, { wrapper: f.Wrapper });
      await act(async () => {
        const pending = result.current.index.createNewIndexRecord({
          name: 'Original',
        });
        await jest.advanceTimersByTimeAsync(7000);
        expect(await pending).toBeUndefined();
      });
      const input = f.createInputs[0];
      options.failureResponse = async () =>
        JSON.stringify({
          errors: [
            { message, extensions: { code, userFriendlyMessage: message } },
          ],
        });
      await act(async () => {
        expect(
          await result.current.index.createNewIndexRecord({ name: 'Changed' }),
        ).toBeUndefined();
      });
      expect(f.requestLog).toEqual([
        'CreateOneCampaign',
        'CreateOneCampaign',
        'FindOneCampaign',
        'FindOneCampaign',
        'CreateOneCampaign',
      ]);
      expect(f.createInputs).toEqual([input, input, input]);
      expect(f.rows.size).toBe(0);
      expect(f.cache.extract()[`Campaign:${input.id}`]).toBeUndefined();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        f.store.get(
          snackBarInternalComponentState.atomFamily({
            instanceId: 'campaign-test-snacks',
          }),
        ).queue,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ message })]));
      options.failureResponse = undefined;
      await act(async () => {
        expect(
          (
            await result.current.index.createNewIndexRecord({
              name: 'Changed again',
            })
          )?.id,
        ).toBe(input.id);
      });
      expect(f.createInputs).toEqual([input, input, input, input]);
      expect(f.readIds).toEqual([input.id, input.id, input.id]);
      expect(f.rows.size).toBe(1);
    },
  );
});

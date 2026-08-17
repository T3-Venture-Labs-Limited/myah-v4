import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { CampaignInfluencerIndex } from '@/myah/creator-crm/components/CampaignInfluencerIndex';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  FieldMetadataType,
  ViewFilterOperand,
  ViewType,
} from 'twenty-shared/types';
const campaignInfluencersViewId = 'campaign-influencers-view';
const campaignInfluencersViewUniversalIdentifier =
  'b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b';

const mockApplyCreatorBulkRelationship = jest.fn();
const mockRecordIndexSurface = jest.fn(
  ({
    contextStoreInstanceId,
    headerActionButton,
    initialQueryOnlyRecordFilters,
    onViewChange,
    viewId,
  }: {
    contextStoreInstanceId: string;
    headerActionButton?: ReactNode;
    hideQueryOnlyRecordFilters?: boolean;
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onViewChange?: (viewId: string) => void;
    viewId: string;
  }) => (
    <div
      data-context-store-id={contextStoreInstanceId}
      data-testid="record-index-surface"
    >
      {headerActionButton}
      {`Rows for ${initialQueryOnlyRecordFilters[0]?.value} in ${viewId}`}
      <button onClick={() => onViewChange?.('campaign-secondary-view')}>
        Switch Campaign view
      </button>
    </div>
  ),
);

let objectMetadataItems: Array<{
  id: string;
  nameSingular: string;
  fields: Array<{
    id: string;
    name: string;
    relation?: { targetObjectMetadata: { id: string } };
    type?: FieldMetadataType;
  }>;
}>;

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: jest.fn(),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormMultiRecordPicker',
  () => ({
    FormMultiRecordPicker: ({
      onChange,
    }: {
      onChange: (value: string[]) => void;
    }) => (
      <button onClick={() => onChange(['creator-a', 'creator-b'])}>
        Select creators
      </button>
    ),
  }),
);

jest.mock('@/object-record/record-index/components/RecordIndexSurface', () => ({
  RecordIndexSurface: (props: {
    contextStoreInstanceId: string;
    headerActionButton?: ReactNode;
    hideQueryOnlyRecordFilters?: boolean;
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onViewChange?: (viewId: string) => void;
    viewId: string;
  }) => mockRecordIndexSurface(props),
}));

jest.mock('@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship', () => ({
  useApplyCreatorBulkRelationship: () => ({
    applyCreatorBulkRelationship: mockApplyCreatorBulkRelationship,
  }),
}));

jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: jest.fn(), openModal: jest.fn() }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: jest.fn(),
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ariaLabel?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      // oxlint-disable-next-line react/jsx-props-no-spreading
      {...props}
    >
      {children}
    </button>
  ),
}));
const setCampaignMetadata = () => {
  objectMetadataItems = [
    {
      id: 'campaign-creator-object',
      nameSingular: 'campaignCreator',
      fields: [
        {
          id: 'campaign-creator-campaign-field',
          name: 'campaign',
          type: FieldMetadataType.RELATION,
          relation: { targetObjectMetadata: { id: 'campaign-object' } },
        },
      ],
    },
    {
      id: 'campaign-object',
      nameSingular: 'campaign',
      fields: [{ id: 'campaign-id-field', name: 'id' }],
    },
  ];
};

describe('CampaignInfluencerIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setCampaignMetadata();
    mockApplyCreatorBulkRelationship.mockResolvedValue(undefined);
    (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
    });
    (useAtomStateValue as jest.Mock).mockReturnValue([
      {
        id: 'decoy-campaign-creator-table-widget-view',
        objectMetadataId: 'campaign-creator-object',
        type: ViewType.TABLE_WIDGET,
      },
      {
        id: campaignInfluencersViewId,
        objectMetadataId: 'campaign-creator-object',
        type: ViewType.TABLE_WIDGET,
        universalIdentifier: campaignInfluencersViewUniversalIdentifier,
      },
    ]);
  });

  it('renders the fixed Campaign Influencers view in an isolated native index', () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      contextStoreInstanceId: 'campaign-influencers-campaign-a',
      objectNameSingular: 'campaignCreator',
      viewId: campaignInfluencersViewId,
      hideQueryOnlyRecordFilters: true,
      initialQueryOnlyRecordFilters: [
        {
          id: 'a03b0867-2a0d-49ee-afd3-8a91de66462e',
          fieldMetadataId: 'campaign-creator-campaign-field',
          relationTargetFieldMetadataId: 'campaign-id-field',
          type: 'RELATION',
          operand: ViewFilterOperand.IS,
          value: 'campaign-a',
          displayValue: '',
          label: 'Campaign influencers',
          subFieldName: null,
        },
      ],
      headerTitle: 'Influencers',
    });
  });

  it('uses the source-controlled Campaign Influencers view when a field widget has no view ID', () => {
    render(<CampaignInfluencerIndex campaignId="campaign-a" />);

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      viewId: campaignInfluencersViewId,
    });
  });

  it('changes only the scoped Campaign view when its native picker selects a view', () => {
    const parentUrl = window.location.href;

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0].onViewChange).toEqual(
      expect.any(Function),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch Campaign view' }),
    );
    const indexSurfaceProps = mockRecordIndexSurface.mock.calls.at(-1)?.[0];

    if (!indexSurfaceProps) {
      throw new Error('RecordIndexSurface was not rendered');
    }

    expect(indexSurfaceProps).toMatchObject({
      contextStoreInstanceId: 'campaign-influencers-campaign-a',
      viewId: 'campaign-secondary-view',
    });
    expect(indexSurfaceProps.indexIdentifierUrl).toEqual(expect.any(Function));
    expect(indexSurfaceProps.indexIdentifierUrl('campaign-creator-a')).toBe(
      '/object/campaignCreator/campaign-creator-a?viewId=campaign-secondary-view',
    );
    expect(window.location.href).toBe(parentUrl);
  });

  it('renders a bounded state when the Campaign Influencers view is unavailable', () => {
    (useAtomStateValue as jest.Mock).mockReturnValue([]);

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(
      screen.getByText('Campaign Influencers are unavailable.'),
    ).toBeVisible();
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();
  });

  it('hides Direct addition when Campaign updates are forbidden', () => {
    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (objectMetadataId: string) =>
        objectMetadataId === 'campaign-object'
          ? { canUpdateObjectRecords: false }
          : { canReadObjectRecords: true },
    );

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(screen.getByTestId('record-index-surface')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add Influencers' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      description: 'CampaignCreator metadata is unavailable',
      setup: () => {
        objectMetadataItems = [];
      },
      message: 'Campaign Influencers are unavailable.',
    },
    {
      description: 'CampaignCreator records are not readable',
      setup: () => {
        (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
          canReadObjectRecords: false,
        });
      },
      message: 'You do not have permission to view Campaign Influencers.',
    },
  ])('renders a bounded state when $description', ({ setup, message }) => {
    setup();

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(screen.getByText(message)).toBeVisible();
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();
  });

  it('creates Direct CampaignCreator rows from the native Creator multi-select', async () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Add selected influencers' }),
      );
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
      creatorIdsToAdd: ['creator-a', 'creator-b'],
    });
  });

  it('keeps direct-add bounded and retryable when the guarded mutation fails', async () => {
    mockApplyCreatorBulkRelationship.mockRejectedValueOnce(
      new Error('direct add failed'),
    );

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Add selected influencers' }),
      );
    });

    expect(screen.getByText('Unable to add influencers.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    ).toBeVisible();
  });
});

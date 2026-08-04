import { render, screen } from '@testing-library/react';

import { SummaryCard } from '@/object-record/record-show/components/SummaryCard';

const mockUsePersonAvatarUpload = jest.fn(
  (): { onUploadPicture: (file: File) => Promise<void> } => {
    throw new Error('Person metadata must not be resolved for Campaign');
  },
);
type MockShowPageSummaryCardProps = {
  onUploadPicture?: (file: File) => Promise<void>;
};

let capturedOnUploadPicture: MockShowPageSummaryCardProps['onUploadPicture'];

const mockShowPageSummaryCard = jest.fn(
  (_props: MockShowPageSummaryCardProps) => (
    <div data-testid="show-page-summary-card" />
  ),
);

const campaignMetadata = {
  fields: [
    {
      defaultValue: null,
      id: 'campaign-name',
      label: 'Name',
      name: 'name',
      type: 'TEXT',
    },
  ],
  id: 'campaign-object',
  nameSingular: 'campaign',
};

jest.mock('@/client-config/states/allowRequestsToTwentyIcons', () => ({
  allowRequestsToTwentyIconsState: Symbol('allowRequestsToTwentyIconsState'),
}));

jest.mock(
  '@/object-metadata/hooks/useLabelIdentifierFieldMetadataItem',
  () => ({
    useLabelIdentifierFieldMetadataItem: () => ({
      labelIdentifierFieldMetadataItem: campaignMetadata.fields[0],
    }),
  }),
);

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: campaignMetadata }),
}));

jest.mock('@/object-record/read-only/hooks/useIsRecordFieldReadOnly', () => ({
  useIsRecordFieldReadOnly: () => false,
}));

jest.mock('@/object-record/record-field/ui/contexts/FieldContext', () => ({
  FieldContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

jest.mock('@/object-record/record-show/hooks/usePersonAvatarUpload', () => ({
  usePersonAvatarUpload: () => mockUsePersonAvatarUpload(),
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
  '@/object-record/record-show/hooks/useRecordShowContainerData',
  () => ({
    useRecordShowContainerData: () => ({ recordLoading: false }),
  }),
);

jest.mock(
  '@/object-record/record-store/states/selectors/recordStoreFamilySelector',
  () => ({
    recordStoreFamilySelector: Symbol('recordStoreFamilySelector'),
  }),
);

jest.mock(
  '@/object-record/record-store/states/selectors/recordStoreIdentifierFamilySelector',
  () => ({
    recordStoreIdentifierFamilySelector: Symbol(
      'recordStoreIdentifierFamilySelector',
    ),
  }),
);

jest.mock(
  '@/object-record/record-title-cell/components/RecordTitleCell',
  () => ({
    RecordTitleCell: () => <div />,
  }),
);

jest.mock(
  '@/object-record/record-title-cell/types/RecordTitleCellContainerType',
  () => ({
    RecordTitleCellContainerType: { ShowPage: 'ShowPage' },
  }),
);

jest.mock('@/ui/layout/show-page/components/ShowPageSummaryCard', () => ({
  ShowPageSummaryCard: (props: MockShowPageSummaryCardProps) => {
    capturedOnUploadPicture = props.onUploadPicture;

    return mockShowPageSummaryCard(props);
  },
}));

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({
    useAtomFamilySelectorValue: (
      _selector: unknown,
      params: { fieldName?: string },
    ) =>
      params.fieldName === 'createdAt'
        ? 'createdAt'
        : {
            avatarType: 'rounded',
            avatarUrl: 'https://example.com/campaign.png',
            name: 'Campaign',
          },
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => false,
}));

jest.mock('~/generated-metadata/graphql', () => ({
  FieldMetadataType: { TEXT: 'TEXT' },
}));

jest.mock('twenty-shared/types', () => ({
  CoreObjectNameSingular: { Person: 'person' },
}));

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== null && value !== undefined,
}));

describe('SummaryCard', () => {
  beforeEach(() => {
    mockUsePersonAvatarUpload.mockReset();
    mockUsePersonAvatarUpload.mockImplementation(() => {
      throw new Error('Person metadata must not be resolved for Campaign');
    });
    mockShowPageSummaryCard.mockClear();
    capturedOnUploadPicture = undefined;
  });

  it('passes the Person avatar callback to the summary card', () => {
    const mockOnUploadPicture = jest.fn(async (_file: File) => undefined);
    mockUsePersonAvatarUpload.mockReturnValue({
      onUploadPicture: mockOnUploadPicture,
    });

    render(
      <SummaryCard
        isInSidePanel={false}
        objectNameSingular="person"
        objectRecordId="person-record"
      />,
    );

    expect(capturedOnUploadPicture).toBe(mockOnUploadPicture);
  });

  it('does not mount the Person avatar hook for a Campaign summary', () => {
    render(
      <SummaryCard
        isInSidePanel={false}
        objectNameSingular="campaign"
        objectRecordId="campaign-record"
      />,
    );

    expect(mockUsePersonAvatarUpload).not.toHaveBeenCalled();
    expect(screen.getByTestId('show-page-summary-card')).toBeInTheDocument();
  });
});

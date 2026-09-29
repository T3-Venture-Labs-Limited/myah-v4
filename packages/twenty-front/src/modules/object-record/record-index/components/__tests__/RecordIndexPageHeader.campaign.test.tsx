import { render, screen } from '@testing-library/react';
import { RecordIndexPageHeader } from '@/object-record/record-index/components/RecordIndexPageHeader';
import { RecordIndexCommandMenu } from '@/command-menu-item/components/RecordIndexCommandMenu';

jest.mock('@/command-menu-item/components/RecordIndexCommandMenu', () => ({
  RecordIndexCommandMenu: jest.fn(() => <div data-testid="native-menu" />),
}));
jest.mock('@/myah/creator-crm/components/MyahCreatorBulkActions', () => ({
  MyahCreatorBulkActions: () => null,
}));
jest.mock('@/side-panel/components/SidePanelToggleButton', () => ({
  SidePanelToggleButton: () => null,
}));
jest.mock(
  '@/object-record/record-index/components/RecordIndexPageHeaderIcon',
  () => ({ RecordIndexPageHeaderIcon: () => null }),
);
jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({
    title,
    actionButton,
    showTitleOnMobile,
  }: {
    title?: React.ReactNode;
    actionButton?: React.ReactNode;
    showTitleOnMobile?: boolean;
  }) => (
    <div>
      <div data-testid="header-title" data-show-on-mobile={showTitleOnMobile}>
        {title}
      </div>
      <div>{actionButton}</div>
    </div>
  ),
}));
let embeddedSurfaceOptions: { hideAddNew: boolean } | undefined = {
  hideAddNew: true,
};
let selectedCount = 0;
jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectNamePlural: 'campaigns',
    embeddedSurfaceOptions,
  }),
}));
jest.mock('@/localization/hooks/useNumberFormat', () => ({
  useNumberFormat: () => ({ formatNumber: String }),
}));
jest.mock('@/object-metadata/hooks/useFilteredObjectMetadataItems', () => ({
  useFilteredObjectMetadataItems: () => ({
    findObjectMetadataItemByNamePlural: () => ({ labelPlural: 'Campaigns' }),
  }),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (_atom: unknown, instanceId?: string) =>
      instanceId ? 'view-id' : selectedCount,
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => false,
}));

describe('Campaign index header seam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    embeddedSurfaceOptions = { hideAddNew: true };
    selectedCount = 0;
  });

  it('places the overview subtitle under the Campaign title beside native creation', () => {
    render(
      <RecordIndexPageHeader
        contextStoreInstanceId="main"
        campaignCreationAction={<button>Named draft</button>}
      />,
    );
    const title = screen.getByTestId('header-title');
    expect(title).toHaveTextContent(
      /^CampaignsYour campaigns, from first draft to outreach/,
    );
    expect(title.firstElementChild?.children[0]).toHaveTextContent('Campaigns');
    expect(title.firstElementChild?.children[1]).toHaveTextContent(
      'Your campaigns, from first draft to outreach.',
    );
    expect(title).not.toHaveTextContent(
      'Accessible campaigns across all views',
    );
    expect(title).toHaveAttribute('data-show-on-mobile', 'true');
    expect(screen.getByRole('button', { name: 'Named draft' })).toBeVisible();
  });

  it('keeps the selected-record header and ordinary indexes free of overview copy', () => {
    selectedCount = 2;
    const { rerender } = render(
      <RecordIndexPageHeader
        contextStoreInstanceId="main"
        campaignCreationAction={<button>Named draft</button>}
      />,
    );
    expect(screen.getByTestId('header-title')).toHaveTextContent('2 selected');
    expect(
      screen.queryByText(/Your campaigns, from first draft/),
    ).not.toBeInTheDocument();
    selectedCount = 0;
    rerender(<RecordIndexPageHeader contextStoreInstanceId="main" />);
    expect(screen.getByTestId('header-title')).toHaveTextContent('Campaigns');
    expect(
      screen.queryByText(/Your campaigns, from first draft/),
    ).not.toBeInTheDocument();
  });

  it('keeps other native menu actions while replacing only native New', () => {
    render(
      <RecordIndexPageHeader
        contextStoreInstanceId="main"
        campaignCreationAction={<button>Named draft</button>}
      />,
    );
    expect(screen.getByText('Named draft')).toBeVisible();
    expect(screen.getByTestId('native-menu')).toBeVisible();
    expect(RecordIndexCommandMenu).toHaveBeenCalledWith(
      { hideCreateNewRecord: true },
      undefined,
    );
  });

  it('retains the native menu including New on ordinary non-embedded indexes', () => {
    embeddedSurfaceOptions = undefined;
    render(<RecordIndexPageHeader contextStoreInstanceId="main" />);
    expect(screen.getByTestId('native-menu')).toBeVisible();
    expect(RecordIndexCommandMenu).toHaveBeenCalledWith(
      { hideCreateNewRecord: false },
      undefined,
    );
  });

  it('does not display an embedded surface header action without Campaign creation', () => {
    render(<RecordIndexPageHeader contextStoreInstanceId="main" />);
    expect(screen.queryByTestId('native-menu')).not.toBeInTheDocument();
  });
});

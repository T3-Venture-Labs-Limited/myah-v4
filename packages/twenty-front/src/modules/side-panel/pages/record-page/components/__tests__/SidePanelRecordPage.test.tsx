import { render } from '@testing-library/react';

import {
  SidePanelRecordPage,
  SidePanelRecordPageContent,
} from '@/side-panel/pages/record-page/components/SidePanelRecordPage';

const mockPageLayoutRecordPageRenderer = jest.fn();
const mockUseAtomComponentStateValue = jest.fn();

jest.mock(
  '@/object-record/components/RecordComponentInstanceContextsWrapper',
  () => ({
    RecordComponentInstanceContextsWrapper: ({
      children,
    }: {
      children: React.ReactNode;
    }) => children,
  }),
);

jest.mock(
  '@/object-record/record-show/components/PageLayoutRecordPageRenderer',
  () => ({
    PageLayoutRecordPageRenderer: (props: unknown) => {
      mockPageLayoutRecordPageRenderer(props);

      return <div />;
    },
  }),
);

jest.mock('@/object-record/record-show/hooks/useRecordShowPage', () => ({
  useRecordShowPage: (objectNameSingular: string, objectRecordId: string) => ({
    objectNameSingular,
    objectRecordId,
  }),
}));

jest.mock(
  '@/object-record/record-store/states/selectors/recordStoreFamilySelector',
  () => ({
    recordStoreFamilySelector: {},
  }),
);

jest.mock(
  '@/side-panel/pages/record-page/states/viewableRecordIdComponentState',
  () => ({
    viewableRecordIdComponentState: {},
  }),
);

jest.mock(
  '@/side-panel/pages/record-page/states/viewableRecordNameSingularComponentState',
  () => ({
    viewableRecordNameSingularComponentState: {},
  }),
);

jest.mock(
  '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext',
  () => ({
    SidePanelPageComponentInstanceContext: {},
  }),
);

jest.mock(
  '@/command-menu/states/contexts/CommandMenuComponentInstanceContext',
  () => ({
    CommandMenuComponentInstanceContext: {
      Provider: ({ children }: { children: React.ReactNode }) => children,
    },
  }),
);

jest.mock(
  '@/context-store/states/contexts/ContextStoreComponentInstanceContext',
  () => ({
    ContextStoreComponentInstanceContext: {
      Provider: ({ children }: { children: React.ReactNode }) => children,
    },
  }),
);

jest.mock(
  '@/activities/timeline-activities/contexts/TimelineActivityContext',
  () => ({
    TimelineActivityContext: {
      Provider: ({ children }: { children: React.ReactNode }) => children,
    },
  }),
);

jest.mock(
  '@/ui/utilities/state/component-state/hooks/useComponentInstanceStateContext',
  () => ({
    useComponentInstanceStateContext: () => ({ instanceId: 'side-panel-1' }),
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (...args: unknown[]) =>
      mockUseAtomComponentStateValue(...args),
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({
    useAtomFamilySelectorValue: () => null,
  }),
);

describe('SidePanelRecordPage', () => {
  beforeEach(() => {
    mockPageLayoutRecordPageRenderer.mockClear();
    mockUseAtomComponentStateValue.mockReset();
  });

  it('renders reusable native content in default-tab-only mode', () => {
    render(
      <SidePanelRecordPageContent
        objectNameSingular="creator"
        objectRecordId="creator-1"
        renderMode="default-tab-only"
      />,
    );

    expect(mockPageLayoutRecordPageRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRecordIdentifier: {
          id: 'creator-1',
          targetObjectNameSingular: 'creator',
        },
        isInSidePanel: true,
        renderMode: 'default-tab-only',
      }),
    );
  });

  it('keeps the registered native record drawer in all-tabs mode', () => {
    mockUseAtomComponentStateValue
      .mockReturnValueOnce('creator')
      .mockReturnValueOnce('creator-1');

    render(<SidePanelRecordPage />);

    expect(mockPageLayoutRecordPageRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRecordIdentifier: {
          id: 'creator-1',
          targetObjectNameSingular: 'creator',
        },
        isInSidePanel: true,
        renderMode: undefined,
      }),
    );
  });
});

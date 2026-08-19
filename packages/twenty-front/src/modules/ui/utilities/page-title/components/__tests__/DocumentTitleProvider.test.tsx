import { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

import { RootAppProviders } from '@/app/components/RootAppProviders';
import { WorkspaceAppProviders } from '@/app/components/WorkspaceAppProviders';
import { PageTitleEffect } from '@/ui/utilities/page-title/components/PageTitleEffect';
import { DocumentTitleProvider } from '@/ui/utilities/page-title/components/DocumentTitleProvider';
import { useDocumentTitleContextOrThrow } from '@/ui/utilities/page-title/contexts/DocumentTitleContext';

jest.mock('@/ai/components/AgentChatProvider', () => ({
  AgentChatProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@/analytics/components/TrackPageViewEffect', () => ({
  TrackPageViewEffect: () => null,
}));
jest.mock('@/app/components/SharedAppProviders', () => ({
  SharedAppProviders: ({ children }: React.PropsWithChildren) => (
    <>{children}</>
  ),
}));
jest.mock('@/app/effect-components/GotoHotkeysEffectsProvider', () => ({
  GotoHotkeysEffectsProvider: () => null,
}));
jest.mock('@/app/effect-components/InitializeQueryParamStateEffect', () => ({
  InitializeQueryParamStateEffect: () => null,
}));
jest.mock('@/app/effect-components/PageChangeEffect', () => ({
  PageChangeEffect: () => null,
}));
jest.mock('@/auth/components/AuthProvider', () => ({
  AuthProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@/auth/effect-components/SignOutOnOtherTabSignOutEffect', () => ({
  SignOutOnOtherTabSignOutEffect: () => null,
}));
jest.mock('@/captcha/components/CaptchaProvider', () => ({
  CaptchaProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@/captcha/components/RequestFreshCaptchaTokenEffect', () => ({
  RequestFreshCaptchaTokenEffect: () => null,
}));
jest.mock(
  '@/command-menu-item/confirmation-modal/components/CommandMenuConfirmationModalManager',
  () => ({
    CommandMenuConfirmationModalManager: () => null,
  }),
);
jest.mock(
  '@/command-menu-item/engine-command/components/CommandRunner',
  () => ({
    CommandRunner: () => null,
  }),
);
jest.mock('@/context-store/components/MainContextStoreProvider', () => ({
  MainContextStoreProvider: () => null,
}));
jest.mock('@/error-handler/components/ErrorMessageEffect', () => ({
  ErrorMessageEffect: () => null,
}));
jest.mock('@/error-handler/components/PromiseRejectionEffect', () => ({
  PromiseRejectionEffect: () => null,
}));
jest.mock(
  '@/metadata-store/effect-components/IsMinimalMetadataReadyEffect',
  () => ({
    IsMinimalMetadataReadyEffect: () => null,
  }),
);
jest.mock(
  '@/metadata-store/effect-components/MinimalMetadataLoadEffect',
  () => ({
    MinimalMetadataLoadEffect: () => null,
  }),
);
jest.mock(
  '@/metadata-store/effect-components/UserMetadataProviderInitialEffect',
  () => ({
    UserMetadataProviderInitialEffect: () => null,
  }),
);
jest.mock('@/object-metadata/components/ApolloCoreProvider', () => ({
  ApolloCoreProvider: ({ children }: React.PropsWithChildren) => (
    <>{children}</>
  ),
}));
jest.mock(
  '@/settings/admin-panel/apollo/components/ApolloAdminProvider',
  () => ({
    ApolloAdminProvider: ({ children }: React.PropsWithChildren) => (
      <>{children}</>
    ),
  }),
);
jest.mock(
  '@/settings/billing/components/EndTrialAfterPaymentMethodGater',
  () => ({
    EndTrialAfterPaymentMethodGater: () => null,
  }),
);
jest.mock('@/sse-db-event/components/SSEProvider', () => ({
  SSEProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@/support/components/SupportChatEffect', () => ({
  SupportChatEffect: () => null,
}));
jest.mock('@/ui/feedback/dialog-manager/components/DialogManager', () => ({
  DialogManager: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock(
  '@/ui/feedback/snack-bar-manager/components/SnackBarProvider',
  () => ({
    SnackBarProvider: ({ children }: React.PropsWithChildren) => (
      <>{children}</>
    ),
  }),
);
jest.mock('@/ui/field/display/components/GlobalFilePreviewModal', () => ({
  GlobalFilePreviewModal: () => null,
}));
jest.mock('@/ui/theme/components/UserThemeProviderEffect', () => ({
  UserThemeProviderEffect: () => null,
}));
jest.mock('@/ui/utilities/page-favicon/components/PageFavicon', () => ({
  PageFavicon: () => null,
}));
jest.mock('@/users/components/UserContextProvider', () => ({
  UserContextProvider: ({ children }: React.PropsWithChildren) => (
    <>{children}</>
  ),
}));
jest.mock('@/workspace/components/WorkspaceProviderEffect', () => ({
  WorkspaceProviderEffect: () => null,
}));

const campaignPath = '/objects/campaigns/campaign-a';
const campaignBPath = '/objects/campaigns/campaign-b';

const RecordTitleNavigation = ({
  destination,
  label,
}: {
  destination: string;
  label: string;
}) => (
  <>
    <PageTitleEffect title="Campaign A - Campaign" />
    <Link to={destination}>{label}</Link>
  </>
);

const SameRecordUrlUpdatePage = () => (
  <>
    <PageTitleEffect title="Campaign A - Campaign" />
    <Link to="?tab=timeline">Timeline</Link>
    <Link to="#activity">Activity</Link>
  </>
);

const PersistentRecordIndexAndViewPage = () => {
  const { recordIndexId = '', viewId = '' } = useParams();
  const destination =
    recordIndexId === 'campaigns'
      ? '/objects/companies/views/active'
      : '/objects/campaigns/views/all';

  return (
    <>
      <PageTitleEffect key={recordIndexId} title={`${recordIndexId} index`} />
      <PageTitleEffect
        key={`${recordIndexId}:${viewId}`}
        title={`${viewId} ${recordIndexId}`}
      />
      <Link to={destination}>Change list and view</Link>
    </>
  );
};

const PersistentRecordIndexAndViewRoutes = () => (
  <Routes>
    <Route
      path="/objects/:recordIndexId/views/:viewId"
      element={<PersistentRecordIndexAndViewPage />}
    />
  </Routes>
);
const inboxPath = '/myah/inbox';

const createDeferred = <T,>() => {
  let resolve: (value: T) => void;

  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve: resolve! };
};

const DeferredRecordTitleClaimEffect = ({
  titlePromise,
}: {
  titlePromise: Promise<string>;
}) => {
  const { claimTitle, pathnameVisitToken } = useDocumentTitleContextOrThrow();
  const [mountedPathnameVisitToken] = useState(pathnameVisitToken);

  useEffect(() => {
    void titlePromise.then((title) => {
      claimTitle({
        title,
        pathnameVisitToken: mountedPathnameVisitToken,
      });
    });
  }, [claimTitle, mountedPathnameVisitToken, titlePromise]);

  return null;
};

const RecordPage = ({ titlePromise }: { titlePromise?: Promise<string> }) => (
  <>
    <PageTitleEffect title="Campaign A - Campaign" />
    {titlePromise && (
      <DeferredRecordTitleClaimEffect titlePromise={titlePromise} />
    )}
    <Link to={inboxPath}>Inbox</Link>
  </>
);

const InboxPage = () => <Link to={campaignPath}>Campaign</Link>;

const HistoryNavigationControls = () => (
  <>
    <Link to={inboxPath}>Back</Link>
    <Link to={campaignPath}>Forward</Link>
  </>
);

const TitleRoutes = ({ titlePromise }: { titlePromise?: Promise<string> }) => (
  <Routes>
    <Route
      path={campaignPath}
      element={<RecordPage titlePromise={titlePromise} />}
    />
    <Route path={inboxPath} element={<InboxPage />} />
  </Routes>
);

const PersistentRecordPage = ({
  campaignBTitlePromise,
}: {
  campaignBTitlePromise: Promise<string>;
}) => {
  const { campaignId } = useParams();
  const [campaignBTitle, setCampaignBTitle] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (campaignId === 'campaign-b') {
      void campaignBTitlePromise.then(setCampaignBTitle);
    }
  }, [campaignBTitlePromise, campaignId]);

  const title =
    campaignId === 'campaign-a'
      ? 'Campaign A - Campaign'
      : (campaignBTitle ?? 'Loading campaign');

  return (
    <>
      <PageTitleEffect key={`campaign:${campaignId}`} title={title} />
      <Link to={campaignBPath}>Campaign B</Link>
    </>
  );
};

const PersistentRecordTitleRoutes = ({
  campaignBTitlePromise,
}: {
  campaignBTitlePromise: Promise<string>;
}) => (
  <Routes>
    <Route
      path="/objects/campaigns/:campaignId"
      element={
        <PersistentRecordPage campaignBTitlePromise={campaignBTitlePromise} />
      }
    />
  </Routes>
);

const RecordShowPageTitleWriter = ({
  campaignId,
  campaignATitlePromise,
  campaignBTitlePromise,
  onUnmount,
}: {
  campaignId: string;
  campaignATitlePromise: Promise<string>;
  campaignBTitlePromise: Promise<string>;
  onUnmount: (campaignId: string) => void;
}) => {
  const [title, setTitle] = useState(
    campaignId === 'campaign-a' ? 'Campaign A - Campaign' : 'Campaign',
  );

  const titlePromise =
    campaignId === 'campaign-a' ? campaignATitlePromise : campaignBTitlePromise;

  useEffect(() => {
    void titlePromise.then(setTitle);

    return () => onUnmount(campaignId);
  }, [campaignId, onUnmount, titlePromise]);

  return (
    <>
      <PageTitleEffect title={title} />
      <DeferredRecordTitleClaimEffect titlePromise={titlePromise} />
    </>
  );
};

const KeyedRecordShowPage = ({
  campaignATitlePromise,
  campaignBTitlePromise,
  onUnmount,
}: {
  campaignATitlePromise: Promise<string>;
  campaignBTitlePromise: Promise<string>;
  onUnmount: (campaignId: string) => void;
}) => {
  const { campaignId = '' } = useParams();

  return (
    <>
      <RecordShowPageTitleWriter
        key={`campaign:${campaignId}`}
        campaignId={campaignId}
        campaignATitlePromise={campaignATitlePromise}
        campaignBTitlePromise={campaignBTitlePromise}
        onUnmount={onUnmount}
      />
      <Link to={campaignBPath}>Campaign B</Link>
    </>
  );
};

const KeyedRecordShowTitleRoutes = ({
  campaignATitlePromise,
  campaignBTitlePromise,
  onUnmount,
}: {
  campaignATitlePromise: Promise<string>;
  campaignBTitlePromise: Promise<string>;
  onUnmount: (campaignId: string) => void;
}) => (
  <Routes>
    <Route
      path="/objects/campaigns/:campaignId"
      element={
        <KeyedRecordShowPage
          campaignATitlePromise={campaignATitlePromise}
          campaignBTitlePromise={campaignBTitlePromise}
          onUnmount={onUnmount}
        />
      }
    />
  </Routes>
);

describe('DocumentTitleProvider', () => {
  it('preserves the record title across query and hash updates on the same pathname', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[campaignPath]}
      >
        <DocumentTitleProvider>
          <Routes>
            <Route path={campaignPath} element={<SameRecordUrlUpdatePage />} />
          </Routes>
        </DocumentTitleProvider>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Timeline' }));
    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Activity' }));
    expect(document.title).toBe('Campaign A - Campaign');
  });

  it('uses the destination title when keyed record-index and view owners change', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/objects/campaigns/views/all']}
      >
        <DocumentTitleProvider>
          <PersistentRecordIndexAndViewRoutes />
        </DocumentTitleProvider>
      </MemoryRouter>,
    );

    expect(document.title).toBe('all campaigns');

    await user.click(
      screen.getByRole('link', { name: 'Change list and view' }),
    );

    expect(document.title).toBe('active companies');
  });

  it('uses the destination title when a keyed record writer owner changes', async () => {
    const lateCampaignBTitle = createDeferred<string>();
    const user = userEvent.setup();

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[campaignPath]}
      >
        <DocumentTitleProvider>
          <PersistentRecordTitleRoutes
            campaignBTitlePromise={lateCampaignBTitle.promise}
          />
        </DocumentTitleProvider>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Campaign B' }));

    lateCampaignBTitle.resolve('Campaign B - Campaign');
    await waitFor(() => expect(document.title).toBe('Campaign B - Campaign'));
  });

  it('rejects a late record-A title after its keyed writer unmounts for record B', async () => {
    const lateCampaignATitle = createDeferred<string>();
    const lateCampaignBTitle = createDeferred<string>();
    const unmountedCampaignIds: string[] = [];
    const user = userEvent.setup();

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[campaignPath]}
      >
        <DocumentTitleProvider>
          <KeyedRecordShowTitleRoutes
            campaignATitlePromise={lateCampaignATitle.promise}
            campaignBTitlePromise={lateCampaignBTitle.promise}
            onUnmount={(campaignId) => unmountedCampaignIds.push(campaignId)}
          />
        </DocumentTitleProvider>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Campaign B' }));

    expect(unmountedCampaignIds).toEqual(['campaign-a']);
    expect(document.title).toBe('Campaign');

    lateCampaignATitle.resolve('Late Campaign A - Campaign');
    await lateCampaignATitle.promise;
    expect(document.title).toBe('Campaign');

    lateCampaignBTitle.resolve('Campaign B - Campaign');
    await waitFor(() => expect(document.title).toBe('Campaign B - Campaign'));
  });

  it('resets the RootAppProviders record title through its Outlet on Settings navigation', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[campaignPath]}
      >
        <Routes>
          <Route element={<RootAppProviders />}>
            <Route
              path={campaignPath}
              element={
                <RecordTitleNavigation
                  destination="/settings/email"
                  label="Settings"
                />
              }
            />
            <Route path="/settings/email" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Settings' }));

    expect(document.title).toBe('Myah');
  });

  it('resets the WorkspaceAppProviders record title through its Outlet on Inbox navigation', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[campaignPath]}
      >
        <Routes>
          <Route element={<WorkspaceAppProviders />}>
            <Route
              path={campaignPath}
              element={
                <RecordTitleNavigation destination={inboxPath} label="Inbox" />
              }
            />
            <Route path={inboxPath} element={null} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Inbox' }));

    expect(document.title).toBe('Myah');
  });

  it('keeps Myah after a stale record title claim settles following Inbox navigation', async () => {
    const lateRecordTitle = createDeferred<string>();
    const user = userEvent.setup();

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[campaignPath]}
      >
        <DocumentTitleProvider>
          <TitleRoutes titlePromise={lateRecordTitle.promise} />
        </DocumentTitleProvider>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Inbox' }));
    expect(document.title).toBe('Myah');

    lateRecordTitle.resolve('Campaign A - Campaign');
    await lateRecordTitle.promise;
    expect(document.title).toBe('Myah');
  });

  it('uses the destination title on repeated link navigation', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[campaignPath, inboxPath, campaignPath]}
        initialIndex={2}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DocumentTitleProvider>
          <HistoryNavigationControls />
          <TitleRoutes />
        </DocumentTitleProvider>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(document.title).toBe('Myah');

    await user.click(screen.getByRole('link', { name: 'Forward' }));
    expect(document.title).toBe('Campaign A - Campaign');

    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(document.title).toBe('Myah');
  });
});

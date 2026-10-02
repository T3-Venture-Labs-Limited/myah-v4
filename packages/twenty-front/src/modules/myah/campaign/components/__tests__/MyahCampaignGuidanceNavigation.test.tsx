import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { useState } from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  Link,
  useParams,
} from 'react-router-dom';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { MyahCampaignAgent } from '@/page-layout/components/MyahCampaignAgent';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

const mockUpdateOneRecord = jest.fn();
let openConfirmation: (() => void) | undefined;
let closeConfirmation: (() => void) | undefined;

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      {
        nameSingular: 'campaign',
        fields: [
          'campaignBrief',
          'communicationGuidelines',
          'replyRules',
          'escalationBoundaries',
          'additionalNotes',
        ].map((name) => ({
          id: name,
          name,
          label: name,
          description: '',
        })),
      },
    ],
  }),
}));
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerData',
  () => ({
    useRecordShowContainerData: () => ({ recordLoading: false }),
  }),
);
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({
    openModal: () => openConfirmation?.(),
    closeModal: () => closeConfirmation?.(),
  }),
}));
jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    onClose,
    onConfirmClick,
  }: {
    onClose: () => void;
    onConfirmClick: () => void;
  }) => {
    const [open, setOpen] = useState(false);
    openConfirmation = () => setOpen(true);
    closeConfirmation = () => setOpen(false);
    return open ? (
      <div role="dialog" aria-label="Unsaved guidance">
        <button onClick={onClose}>Keep editing</button>
        <button onClick={onConfirmClick}>Discard changes</button>
      </div>
    ) : null;
  },
}));
jest.mock(
  '@/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor',
  () => ({
    RichTextFieldEditor: ({
      fieldName,
      recordId,
      onBodyChange,
    }: {
      fieldName: string;
      recordId: string;
      onBodyChange: (value: string) => void;
    }) => (
      <button
        onClick={() => onBodyChange('draft')}
      >{`Edit ${fieldName} for ${recordId}`}</button>
    ),
  }),
);

const CampaignRoute = () => {
  const { campaignId } = useParams();
  return (
    <>
      <Link to="/campaigns/c2">Next Campaign</Link>
      <MyahCampaignAgent
        key={campaignId}
        campaignId={campaignId ?? ''}
        title="Campaign Agent"
      />
    </>
  );
};

it('blocks a cross-Campaign route while guidance is dirty and discards before mounting the next record', async () => {
  const store = resetJotaiStore();
  for (const id of ['c1', 'c2']) {
    store.set(recordStoreFamilyState.atomFamily(id), {
      id,
      __typename: 'Campaign',
      ...Object.fromEntries(
        [
          'campaignBrief',
          'communicationGuidelines',
          'replyRules',
          'escalationBoundaries',
          'additionalNotes',
        ].map((name) => [name, { blocknote: `${id}-${name}`, markdown: null }]),
      ),
    });
  }
  // JSDOM does not install the browser Request constructor needed by the data router.
  globalThis.TextDecoder = jest.requireActual('node:util').TextDecoder;
  globalThis.TextEncoder = jest.requireActual('node:util').TextEncoder;
  globalThis.ReadableStream =
    jest.requireActual('node:stream/web').ReadableStream;
  globalThis.MessagePort = jest.requireActual(
    'node:worker_threads',
  ).MessagePort;
  globalThis.Request = jest.requireActual('undici').Request;
  const router = createMemoryRouter(
    [{ path: '/campaigns/:campaignId', element: <CampaignRoute /> }],
    { initialEntries: ['/campaigns/c1'] },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Edit campaignBrief for c1' }),
  );
  fireEvent.click(screen.getByRole('link', { name: 'Next Campaign' }));
  expect(
    screen.getByRole('dialog', { name: 'Unsaved guidance' }),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/campaigns/c1');
  expect(
    screen.queryByRole('button', { name: 'Edit campaignBrief for c2' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(router.state.location.pathname).toBe('/campaigns/c1');
  fireEvent.click(screen.getByRole('link', { name: 'Next Campaign' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/campaigns/c2'),
  );
  expect(
    screen.getByRole('button', { name: 'Edit campaignBrief for c2' }),
  ).toBeInTheDocument();
  expect(mockUpdateOneRecord).not.toHaveBeenCalled();
});

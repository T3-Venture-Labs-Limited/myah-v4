import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { messages as enMessages } from '~/locales/generated/en';
import { type ReactNode } from 'react';

import { FilesCard } from '@/activities/files/components/FilesCard';

const mockUseFindManyRecords = jest.fn();
let canReadCreator = true;

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (...args: unknown[]) => mockUseFindManyRecords(...args),
}));

jest.mock('@/activities/files/components/AttachmentList', () => ({
  AttachmentList: ({
    attachments,
    button,
  }: {
    attachments: Array<{ name: string }>;
    button?: ReactNode;
  }) => (
    <div>
      {attachments.map(({ name }) => name).join(', ')}
      {button}
    </div>
  ),
}));

jest.mock('@/activities/components/SkeletonLoader', () => ({
  SkeletonLoader: () => <div>Loading files</div>,
}));

jest.mock('@/activities/files/hooks/useUploadAttachmentFile', () => ({
  useUploadAttachmentFile: () => ({ uploadAttachmentFile: jest.fn() }),
}));

jest.mock('@/ui/layout/contexts/useTargetRecord', () => ({
  useTargetRecord: () => ({
    id: 'creator-id',
    targetObjectNameSingular: 'creator',
  }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    objectMetadataItem: { id: `${objectNameSingular}-object-metadata-id` },
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: (objectMetadataId: string) => ({
    canReadObjectRecords:
      objectMetadataId === 'creator-object-metadata-id' ? canReadCreator : true,
    canUpdateObjectRecords: true,
  }),
}));

jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => true,
}));

const cachedAttachment = { id: 'attachment-id', name: 'Private draft.pdf' };
const defaultAttachmentResult = {
  records: [cachedAttachment],
  loading: false,
  error: undefined,
  hasReadPermission: true,
};

const renderFilesCard = () =>
  render(
    <I18nProvider i18n={i18n}>
      <FilesCard />
    </I18nProvider>,
  );

describe('FilesCard', () => {
  beforeEach(() => {
    i18n.load('en', enMessages);
    i18n.activate('en');
    canReadCreator = true;
    mockUseFindManyRecords.mockReturnValue(defaultAttachmentResult);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each(['FORBIDDEN', 'UNAUTHENTICATED'])(
    'hides cached files and upload on a %s GraphQL response even when local read permission remains true',
    (code) => {
      mockUseFindManyRecords.mockReturnValue({
        ...defaultAttachmentResult,
        error: new CombinedGraphQLErrors({
          errors: [{ message: 'Access denied', extensions: { code } }],
        }),
      });

      renderFilesCard();

      expect(screen.getByText('Files are not available')).toBeVisible();
      expect(screen.queryByText('Private draft.pdf')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add file' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('No Files')).not.toBeInTheDocument();
    },
  );

  it('hides cached files and upload when the target Creator cannot be read', () => {
    canReadCreator = false;

    renderFilesCard();

    expect(screen.getByText('Files are not available')).toBeVisible();
    expect(screen.queryByText('Private draft.pdf')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add file' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No Files')).not.toBeInTheDocument();
  });

  it('keeps cached files and upload visible but reports an ordinary failed refresh', () => {
    mockUseFindManyRecords.mockReturnValue({
      ...defaultAttachmentResult,
      error: new Error('Connection lost'),
    });

    renderFilesCard();

    expect(screen.getByText('Private draft.pdf')).toBeVisible();
    expect(screen.getByText("Files couldn't be loaded")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add file' })).toBeVisible();
    expect(screen.queryByText('No Files')).not.toBeInTheDocument();
  });
});

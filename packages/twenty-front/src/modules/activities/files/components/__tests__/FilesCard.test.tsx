import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { render as renderWithoutI18n, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { FilesCard } from '@/activities/files/components/FilesCard';

const render = (node: ReactNode) =>
  renderWithoutI18n(<I18nProvider i18n={i18n}>{node}</I18nProvider>);

const mockUseAttachments = jest.fn();
const mockUseObjectPermissionsForObject = jest.fn();

jest.mock('@/activities/files/hooks/useAttachments', () => ({
  useAttachments: (...args: unknown[]) => mockUseAttachments(...args),
}));

jest.mock('@/activities/components/SkeletonLoader', () => ({
  SkeletonLoader: () => <div>Loading files</div>,
}));

jest.mock('@/activities/files/components/AttachmentList', () => ({
  AttachmentList: ({ attachments }: { attachments: Array<{ id: string }> }) => (
    <div>{attachments.map(({ id }) => id).join(', ')}</div>
  ),
}));

jest.mock('@/activities/files/components/DropZone', () => ({
  DropZone: () => null,
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
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'creator-object-metadata-id' },
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: (...args: unknown[]) =>
    mockUseObjectPermissionsForObject(...args),
}));

jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => false,
}));

const defaultAttachmentsResult = {
  attachments: [],
  loading: false,
  hasReadPermission: true,
  error: undefined,
};

describe('FilesCard', () => {
  beforeEach(() => {
    mockUseAttachments.mockReturnValue(defaultAttachmentsResult);
    mockUseObjectPermissionsForObject.mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the empty state after a successful read', () => {
    render(<FilesCard />);

    expect(screen.getByText('No Files')).toBeVisible();
  });

  it('does not claim there are no files when attachment reads are forbidden', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultAttachmentsResult,
      hasReadPermission: false,
    });

    render(<FilesCard />);

    expect(
      screen.getByText("You don't have permission to view files"),
    ).toBeVisible();
    expect(screen.queryByText('No Files')).not.toBeInTheDocument();
  });

  it('hides cached files after read permission is revoked', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultAttachmentsResult,
      attachments: [{ id: 'previously-visible-file' }],
      hasReadPermission: false,
    });

    render(<FilesCard />);

    expect(
      screen.getByText("You don't have permission to view files"),
    ).toBeVisible();
    expect(
      screen.queryByText('previously-visible-file'),
    ).not.toBeInTheDocument();
  });

  it('does not claim there are no files when the initial read fails', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultAttachmentsResult,
      error: new Error('Unable to load files'),
    });

    render(<FilesCard />);

    expect(screen.getByText("Files couldn't be loaded")).toBeVisible();
    expect(screen.queryByText('No Files')).not.toBeInTheDocument();
  });

  it('hides cached files after target Creator read permission is revoked', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultAttachmentsResult,
      attachments: [{ id: 'previously-visible-file' }],
    });
    mockUseObjectPermissionsForObject.mockReturnValue({
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
    });

    render(<FilesCard />);

    expect(
      screen.getByText("You don't have permission to view files"),
    ).toBeVisible();
    expect(
      screen.queryByText('previously-visible-file'),
    ).not.toBeInTheDocument();
  });

  it.each(['FORBIDDEN', 'UNAUTHENTICATED'])(
    'hides cached files when the server responds %s despite stale local permission',
    (code) => {
      mockUseAttachments.mockReturnValue({
        ...defaultAttachmentsResult,
        attachments: [{ id: 'previously-visible-file' }],
        error: new CombinedGraphQLErrors({
          errors: [{ message: 'Access denied', extensions: { code } }],
          data: null,
        }),
      });

      render(<FilesCard />);

      expect(
        screen.getByText("You don't have permission to view files"),
      ).toBeVisible();
      expect(
        screen.queryByText('previously-visible-file'),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps cached files visible when a later read fails', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultAttachmentsResult,
      attachments: [{ id: 'cached-file' }],
      error: new Error('Unable to refresh files'),
    });

    render(<FilesCard />);

    expect(screen.getByText('cached-file')).toBeVisible();
    expect(
      screen.queryByText("Files couldn't be loaded"),
    ).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';

import { AttachmentRow } from '@/activities/files/components/AttachmentRow';
import { type AttachmentWithFile } from '@/activities/files/utils/filterAttachmentsWithFile';

jest.mock('@/activities/components/ActivityRow', () => ({
  ActivityRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/activities/files/components/AttachmentDropdown', () => ({
  AttachmentDropdown: () => null,
}));
jest.mock('@/file/components/FileIcon', () => ({ FileIcon: () => null }));
jest.mock('@/object-record/hooks/useDestroyOneRecord', () => ({
  useDestroyOneRecord: () => ({ destroyOneRecord: jest.fn() }),
}));
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: jest.fn() }),
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => false,
}));
jest.mock('twenty-ui/surfaces', () => ({
  OverflowingTextWithTooltip: ({ text }: { text: string }) => (
    <span>{text}</span>
  ),
}));

const attachment = {
  id: 'attachment-id',
  name: 'brief.pdf',
  file: {
    fileId: 'file-id',
    label: 'brief.pdf',
    extension: 'pdf',
    url: 'https://example.test/brief.pdf',
  },
  createdAt: '2026-09-22T12:00:00.000Z',
  __typename: 'Attachment',
} as AttachmentWithFile;

describe('AttachmentRow attribution', () => {
  it('shows the attachment actor and recorded creation time', () => {
    render(
      <AttachmentRow
        attachment={{
          ...attachment,
          createdBy: {
            name: 'Sam Lee',
            source: 'API',
            workspaceMemberId: null,
          },
        }}
      />,
    );

    expect(screen.getByText(/Created by Sam Lee.*Source: API/)).toBeVisible();
    expect(screen.getByText(/Sep 22, 2026/)).toBeVisible();
  });

  it('marks absent attribution without inventing a creator or source', () => {
    render(<AttachmentRow attachment={attachment} />);

    expect(screen.getByText(/Author unavailable/)).toBeVisible();
    expect(screen.queryByText(/Source:/)).not.toBeInTheDocument();
  });
});

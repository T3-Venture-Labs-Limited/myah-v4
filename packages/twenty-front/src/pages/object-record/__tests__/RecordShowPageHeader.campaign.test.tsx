import { render, screen } from '@testing-library/react';

import { RecordShowPageHeader } from '~/pages/object-record/RecordShowPageHeader';

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowPagePagination',
  () => ({
    useRecordShowPagePagination: () => ({
      objectMetadataItem: { labelPlural: 'Campaigns' },
    }),
  }),
);

jest.mock('@/object-metadata/utils/getObjectMetadataIdentifierFields', () => ({
  getObjectMetadataIdentifierFields: () => ({}),
}));

jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({
    breadcrumb,
    actionButton,
    compactBreadcrumbOnMobile,
  }: {
    breadcrumb: React.ReactNode;
    actionButton: React.ReactNode;
    compactBreadcrumbOnMobile: boolean;
  }) => (
    <header data-compact={compactBreadcrumbOnMobile}>
      {breadcrumb}
      {actionButton}
    </header>
  ),
}));

jest.mock(
  '@/object-record/record-show/components/ObjectRecordShowPageBreadcrumb',
  () => ({
    ObjectRecordShowPageBreadcrumb: ({
      compactOnMobile,
    }: {
      compactOnMobile: boolean;
    }) => <span data-testid="breadcrumb" data-compact={compactOnMobile} />,
  }),
);

describe('RecordShowPageHeader mobile breadcrumb scope', () => {
  it.each([
    ['campaign', 'true'],
    ['company', 'false'],
  ])(
    'only opts %s into compact mobile layout',
    (objectNameSingular, compact) => {
      render(
        <RecordShowPageHeader
          objectNameSingular={objectNameSingular}
          objectRecordId="record-id"
        >
          <button type="button">Actions</button>
        </RecordShowPageHeader>,
      );

      expect(screen.getByRole('banner')).toHaveAttribute(
        'data-compact',
        compact,
      );
      expect(screen.getByTestId('breadcrumb')).toHaveAttribute(
        'data-compact',
        compact,
      );
      expect(screen.getByRole('button', { name: 'Actions' })).toBeVisible();
    },
  );
});

import { fireEvent, render, screen } from '@testing-library/react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { RelationToOneFieldDisplay } from '@/object-record/record-field/ui/meta-types/display/components/RelationToOneFieldDisplay';

const onOpenMembership = jest.fn();

jest.mock(
  '@/object-record/record-field/ui/meta-types/hooks/useRelationToOneFieldDisplay',
  () => ({
    useRelationToOneFieldDisplay: () => ({
      fieldValue: { id: 'creator-a' },
      fieldDefinition: {
        metadata: { relationObjectMetadataNameSingular: 'creator' },
      },
      generateRecordChipData: () => ({
        recordId: 'creator-a',
        objectNameSingular: 'creator',
      }),
    }),
  }),
);
jest.mock('@/object-record/components/RecordChip', () => ({
  RecordChip: ({
    onClick,
    record,
  }: {
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    record: { id: string };
  }) => (
    <a href={`/object/creator/${record.id}`} onClick={onClick}>
      Creator name
    </a>
  ),
}));

it('passes the campaign membership handler to a relation chip while keeping the Creator profile href', () => {
  render(
    <FieldContext.Provider
      value={{ onRecordChipClick: onOpenMembership } as never}
    >
      <RelationToOneFieldDisplay />
    </FieldContext.Provider>,
  );
  const link = screen.getByRole('link', { name: 'Creator name' });
  expect(link).toHaveAttribute('href', '/object/creator/creator-a');
  fireEvent.click(link);
  expect(onOpenMembership).toHaveBeenCalledTimes(1);
});

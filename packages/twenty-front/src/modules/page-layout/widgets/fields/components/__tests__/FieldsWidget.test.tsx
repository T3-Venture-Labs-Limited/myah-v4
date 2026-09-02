import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FieldsWidget } from '@/page-layout/widgets/fields/components/FieldsWidget';
import {
  type FieldsWidgetGroup,
  type FieldsWidgetGroupField,
} from '@/page-layout/widgets/fields/types/FieldsWidgetGroup';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';

const createField = (
  name: string,
  globalIndex: number,
): FieldsWidgetGroupField => ({
  fieldMetadataItem: {
    id: `${name}-id`,
    name,
  } as FieldMetadataItem,
  position: globalIndex,
  isVisible: true,
  globalIndex,
});

const groups: FieldsWidgetGroup[] = [
  {
    id: 'lifecycle-group',
    name: 'Lifecycle group',
    position: 0,
    isVisible: true,
    fields: [createField('lifecycleStatus', 0)],
  },
  {
    id: 'signature-group',
    name: 'Signature group',
    position: 1,
    isVisible: true,
    fields: [createField('emailSignature', 1)],
  },
];

const hiddenFields = [createField('hiddenField', 2)];
let mockGroupsForDisplay = groups;

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: { id: 'object-id' } }),
}));

jest.mock('@/ui/layout/contexts/useTargetRecord', () => ({
  useTargetRecord: () => ({
    id: 'record-id',
    targetObjectNameSingular: 'campaign',
  }),
}));

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({ isInSidePanel: false }),
}));

jest.mock(
  '@/page-layout/widgets/fields/hooks/useFieldsWidgetGroupsForDisplay',
  () => ({
    useFieldsWidgetGroupsForDisplay: () => ({
      groups: mockGroupsForDisplay,
      displayMode: 'grouped',
    }),
  }),
);

jest.mock(
  '@/page-layout/widgets/fields/hooks/useFieldsWidgetHiddenFieldsForDisplay',
  () => ({
    useFieldsWidgetHiddenFieldsForDisplay: () => ({ hiddenFields }),
  }),
);

jest.mock(
  '@/page-layout/widgets/fields/components/FieldsWidgetGroupContainer',
  () => ({
    FieldsWidgetGroupContainer: ({
      title,
      children,
    }: {
      title: string;
      children: ReactNode;
    }) => (
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    ),
  }),
);

jest.mock(
  '@/page-layout/widgets/fields/components/FieldsWidgetFieldList',
  () => ({
    FieldsWidgetFieldList: ({
      fields,
    }: {
      fields: Array<{
        fieldMetadataItem: { name: string };
        globalIndex: number;
      }>;
    }) => (
      <>
        {fields.map(({ fieldMetadataItem, globalIndex }) => (
          <div
            data-global-index={globalIndex}
            data-testid="rendered-field"
            key={fieldMetadataItem.name}
          >
            {fieldMetadataItem.name}
          </div>
        ))}
      </>
    ),
  }),
);

jest.mock(
  '@/page-layout/widgets/fields/components/FieldsWidgetCellHoveredPortal',
  () => ({
    FieldsWidgetCellHoveredPortal: ({
      flattenedFieldMetadataItems,
    }: {
      flattenedFieldMetadataItems: Array<{ name: string }>;
    }) => (
      <div data-testid="hover-portal">
        {flattenedFieldMetadataItems.map(({ name }) => name).join(',')}
      </div>
    ),
  }),
);

jest.mock(
  '@/page-layout/widgets/fields/components/FieldsWidgetCellEditModePortal',
  () => ({
    FieldsWidgetCellEditModePortal: ({
      flattenedFieldMetadataItems,
    }: {
      flattenedFieldMetadataItems: Array<{ name: string }>;
    }) => (
      <div data-testid="edit-portal">
        {flattenedFieldMetadataItems.map(({ name }) => name).join(',')}
      </div>
    ),
  }),
);

const operationsWidget = {
  id: 'operations-widget-id',
  configuration: {
    viewId: 'operations-view-id',
    shouldAllowUserToSeeHiddenFields: true,
  },
} as PageLayoutWidget;

describe('FieldsWidget', () => {
  it('filters visible and hidden fields, empty groups, and portal metadata', () => {
    render(
      <FieldsWidget
        widget={operationsWidget}
        includeFieldNames={['lifecycleStatus']}
      />,
    );

    expect(screen.getAllByTestId('rendered-field')).toHaveLength(1);
    expect(screen.getByTestId('rendered-field')).toHaveTextContent(
      'lifecycleStatus',
    );
    expect(screen.queryByText('Signature group')).not.toBeInTheDocument();
    expect(screen.queryByText('More (1)')).not.toBeInTheDocument();
    expect(screen.getByTestId('hover-portal')).toHaveTextContent(
      'lifecycleStatus',
    );
    expect(screen.getByTestId('hover-portal')).not.toHaveTextContent(
      'emailSignature',
    );
    expect(screen.getByTestId('hover-portal')).not.toHaveTextContent(
      'hiddenField',
    );
    expect(screen.getByTestId('edit-portal')).toHaveTextContent(
      'lifecycleStatus',
    );
    expect(screen.getByTestId('edit-portal')).not.toHaveTextContent(
      'emailSignature',
    );
    expect(screen.getByTestId('edit-portal')).not.toHaveTextContent(
      'hiddenField',
    );
  });

  it('keeps every visible and hidden field and group when no field names are included', () => {
    render(<FieldsWidget widget={operationsWidget} />);

    expect(screen.getAllByTestId('rendered-field')).toHaveLength(3);
    expect(
      screen
        .getAllByTestId('rendered-field')
        .map((renderedField) => renderedField.textContent),
    ).toEqual(['lifecycleStatus', 'emailSignature', 'hiddenField']);
    expect(screen.getByText('Lifecycle group')).toBeInTheDocument();
    expect(screen.getByText('Signature group')).toBeInTheDocument();
    expect(screen.getByText('More (1)')).toBeInTheDocument();
    expect(screen.getByTestId('hover-portal')).toHaveTextContent(
      'lifecycleStatus,emailSignature,hiddenField',
    );
    expect(screen.getByTestId('edit-portal')).toHaveTextContent(
      'lifecycleStatus,emailSignature,hiddenField',
    );
  });

  it('reindexes retained visible and hidden fields for compact portal metadata', () => {
    render(
      <FieldsWidget
        widget={operationsWidget}
        includeFieldNames={['emailSignature', 'hiddenField']}
      />,
    );

    expect(screen.getByText('emailSignature')).toHaveAttribute(
      'data-global-index',
      '0',
    );
    expect(screen.getByText('hiddenField')).toHaveAttribute(
      'data-global-index',
      '1',
    );
    expect(screen.getByTestId('hover-portal')).toHaveTextContent(
      'emailSignature,hiddenField',
    );
    expect(screen.getByTestId('edit-portal')).toHaveTextContent(
      'emailSignature,hiddenField',
    );
  });

  it('renders included hidden fields without included visible fields', () => {
    render(
      <FieldsWidget
        widget={operationsWidget}
        includeFieldNames={['hiddenField']}
      />,
    );

    expect(screen.getByText('More (1)')).toBeInTheDocument();
    expect(screen.getByTestId('rendered-field')).toHaveTextContent(
      'hiddenField',
    );
    expect(screen.getByTestId('hover-portal')).toHaveTextContent('hiddenField');
    expect(screen.getByTestId('edit-portal')).toHaveTextContent('hiddenField');
    expect(screen.queryByText('No fields to display')).not.toBeInTheDocument();
  });

  it('keeps the empty state when only hidden fields exist and no names are included', () => {
    mockGroupsForDisplay = [];

    render(<FieldsWidget widget={operationsWidget} />);

    expect(screen.getByText('No fields to display')).toBeInTheDocument();
    expect(screen.queryByText('More (1)')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hover-portal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-portal')).not.toBeInTheDocument();
  });
});

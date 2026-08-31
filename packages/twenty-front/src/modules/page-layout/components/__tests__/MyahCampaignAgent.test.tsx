import { render, screen, within } from '@testing-library/react';

import { MyahCampaignAgent } from '@/page-layout/components/MyahCampaignAgent';

let mockRecordLoading = false;
let mockObjectMetadataItems: Array<{
  fields: Array<{
    description: string;
    id: string;
    label: string;
    name: string;
  }>;
  id: string;
  nameSingular: string;
}> = [];

const campaignFields = [
  {
    description:
      'The detailed campaign-specific brief: outcome, offer/context, intended creator work, and relevant operating context.',
    id: 'campaign-brief',
    label: 'Detailed Campaign brief',
    name: 'campaignBrief',
  },
  {
    description:
      'Voice, claims, tone, channel, and communication constraints for campaign drafting.',
    id: 'communication-guidelines',
    label: 'Communication guidelines',
    name: 'communicationGuidelines',
  },
  {
    description:
      'Reply boundaries, approved answer patterns, and situations requiring a draft instead of action.',
    id: 'reply-rules',
    label: 'Reply rules and approved answers',
    name: 'replyRules',
  },
  {
    description:
      'Situations that must be escalated to an operator and campaign-specific escalation constraints.',
    id: 'escalation-boundaries',
    label: 'Escalation boundaries',
    name: 'escalationBoundaries',
  },
  {
    description:
      'Campaign-specific material not represented by another guided section.',
    id: 'additional-notes',
    label: 'Additional notes',
    name: 'additionalNotes',
  },
];

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerData',
  () => ({
    useRecordShowContainerData: () => ({ recordLoading: mockRecordLoading }),
  }),
);

jest.mock(
  '@/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor',
  () => ({
    RichTextFieldEditor: ({
      editorMinHeight,
      fieldName,
      objectNameSingular,
      recordId,
    }: {
      editorMinHeight?: number;
      fieldName: string;
      objectNameSingular: string;
      recordId: string;
    }) => (
      <div
        data-editor-min-height={editorMinHeight}
        data-field-name={fieldName}
        data-object-name={objectNameSingular}
        data-record-id={recordId}
        data-testid="campaign-agent-editor"
      />
    ),
  }),
);

describe('MyahCampaignAgent', () => {
  beforeEach(() => {
    mockRecordLoading = false;
    mockObjectMetadataItems = [
      {
        fields: campaignFields,
        id: 'campaign-object',
        nameSingular: 'campaign',
      },
    ];
  });

  it('renders the five canonical native editors in metadata order', () => {
    render(
      <MyahCampaignAgent campaignId="campaign-1" title="Campaign agent" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Campaign agent' }),
    ).toBeVisible();

    const editors = screen.getAllByTestId('campaign-agent-editor');
    expect(editors).toHaveLength(5);
    expect(editors.map((editor) => editor.dataset.fieldName)).toEqual([
      'campaignBrief',
      'communicationGuidelines',
      'replyRules',
      'escalationBoundaries',
      'additionalNotes',
    ]);

    for (const field of campaignFields) {
      const group = screen.getByRole('group', { name: field.label });
      expect(within(group).getByText(field.description)).toBeVisible();
      expect(
        within(group).getByTestId('campaign-agent-editor'),
      ).toHaveAttribute('data-editor-min-height', '80');
      expect(
        within(group).getByTestId('campaign-agent-editor'),
      ).toHaveAttribute('data-object-name', 'campaign');
      expect(
        within(group).getByTestId('campaign-agent-editor'),
      ).toHaveAttribute('data-record-id', 'campaign-1');
    }
  });

  it.each([
    ['the record is loading', () => (mockRecordLoading = true)],
    ['Campaign metadata is incomplete', () => (mockObjectMetadataItems = [])],
  ])('shows row placeholders while %s', (_description, arrange) => {
    arrange();

    render(
      <MyahCampaignAgent campaignId="campaign-1" title="Campaign agent" />,
    );

    expect(screen.getByTestId('campaign-agent-loading')).toBeVisible();
    expect(screen.queryAllByTestId('campaign-agent-editor')).toHaveLength(0);
  });
});

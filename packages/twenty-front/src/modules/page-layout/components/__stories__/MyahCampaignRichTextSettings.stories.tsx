import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, within } from 'storybook/test';
import { MOBILE_VIEWPORT } from 'twenty-ui/theme-constants';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const campaignId = 'campaign-long-signature';

const longSignatureBlocknote = JSON.stringify(
  Array.from({ length: 24 }, (_, index) => ({
    id: `signature-line-${index}`,
    type: 'paragraph',
    props: {
      textColor: 'default',
      backgroundColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: `Signature line ${index + 1}`,
        styles: index === 0 ? { bold: true } : {},
      },
    ],
    children: [],
  })),
);

const mockTaskObjectMetadataItem = getMockObjectMetadataItemOrThrow('task');
const mockRichTextFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: mockTaskObjectMetadataItem,
  fieldName: 'bodyV2',
});

const campaignObjectMetadataItem = {
  ...mockTaskObjectMetadataItem,
  id: 'campaign-object',
  labelPlural: 'Campaigns',
  labelSingular: 'Campaign',
  namePlural: 'campaigns',
  nameSingular: 'campaign',
  fields: [
    {
      ...mockRichTextFieldMetadataItem,
      description: 'The signature automatically appended to Campaign email.',
      id: 'campaign-email-signature-field',
      label: 'Email signature',
      name: 'emailSignature',
    },
  ],
};

const objectMetadataItems = [
  ...getTestEnrichedObjectMetadataItemsMock(),
  campaignObjectMetadataItem,
];

const JestMetadataAndApolloMocksWrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
  objectMetadataItems,
  onInitializeJotaiStore: (store) => {
    store.set(recordStoreFamilyState.atomFamily(campaignId), {
      __typename: 'Campaign',
      id: campaignId,
      emailSignature: {
        blocknote: longSignatureBlocknote,
        markdown: null,
      },
    });
  },
});

const RenderStory = () => {
  const router = createMemoryRouter([
    {
      element: <StorySurface />,
      path: '/',
    },
  ]);

  return <RouterProvider router={router} />;
};

const StorySurface = () => (
  <MyahCampaignRichTextSettings
    campaignId={campaignId}
    contentBeforeFields={<div>Native Status</div>}
    copy={{
      keepEditing: 'Keep editing',
      saveError: 'Email signature could not be saved.',
      saveSuccess: 'Email signature saved.',
      unsavedChangesSubtitle:
        'Your Email signature changes have not been saved.',
    }}
    fields={[
      {
        fieldName: 'emailSignature',
        placeholder: 'Enter email signature',
        showFormattingControls: true,
      },
    ]}
    modalIdPrefix="campaign-operations-unsaved-changes"
    title="Campaign operations"
  />
);

const meta: Meta<typeof MyahCampaignRichTextSettings> = {
  title: 'Modules/PageLayout/MyahCampaignRichTextSettings',
  component: MyahCampaignRichTextSettings,
  decorators: [
    (Story) => (
      <JestMetadataAndApolloMocksWrapper>
        <Story />
      </JestMetadataAndApolloMocksWrapper>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <RenderStory />,
};

export default meta;

type Story = StoryObj<typeof meta>;

const desktopViewport = {
  name: 'Desktop 1200 × 900',
  styles: {
    height: '900px',
    width: '1200px',
  },
  type: 'desktop' as const,
};

const mobile390Viewport = {
  name: 'Mobile 390 × 844',
  styles: {
    height: '844px',
    width: '390px',
  },
  type: 'mobile' as const,
};

const getSurfaceElements = (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const group = canvas.getByRole('group', { name: 'Email signature' });
  const editorCard = canvas.getByTestId(
    'campaign-rich-text-settings-editor-card',
  );
  const surface = canvas.getByTestId('campaign-rich-text-settings-surface');

  return { editorCard, group, surface };
};

const expectEditorCardScrollContract = async (editorCard: HTMLElement) => {
  await expect(getComputedStyle(editorCard).minHeight).toBe('112px');
  await expect(getComputedStyle(editorCard).maxHeight).toBe('280px');
  await expect(getComputedStyle(editorCard).overflowY).toBe('auto');
  await expect(editorCard.scrollHeight).toBeGreaterThan(
    editorCard.clientHeight,
  );
};

export const DesktopLongSignature: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'desktopLongSignature',
      viewports: {
        desktopLongSignature: desktopViewport,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { editorCard, group, surface } = getSurfaceElements(canvasElement);

    await expect(window.innerWidth).toBeGreaterThan(MOBILE_VIEWPORT);
    await expect(getComputedStyle(group).gridTemplateColumns).toMatch(
      /^220px\s+.+$/,
    );
    await expectEditorCardScrollContract(editorCard);
    await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
  },
};

export const Mobile390LongSignature: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile390LongSignature',
      viewports: {
        mobile390LongSignature: mobile390Viewport,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { editorCard, group, surface } = getSurfaceElements(canvasElement);

    await expect(window.innerWidth).toBe(390);
    await expect(
      getComputedStyle(group).gridTemplateColumns.trim().split(/\s+/),
    ).toHaveLength(1);
    await expect(editorCard.getBoundingClientRect().width).toBeCloseTo(
      group.getBoundingClientRect().width,
      0,
    );
    await expectEditorCardScrollContract(editorCard);
    await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
  },
};

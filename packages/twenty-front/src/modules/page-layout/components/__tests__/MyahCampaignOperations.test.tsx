import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { MyahCampaignOperations } from '@/page-layout/components/MyahCampaignOperations';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';

type MockSettingsProps = {
  campaignId: string;
  title: string;
  fields: readonly {
    fieldName: string;
    placeholder: string;
    showFormattingControls: boolean;
  }[];
  copy: {
    keepEditing: string;
    saveSuccess: string;
    saveError: string;
    unsavedChangesSubtitle: string;
  };
  modalIdPrefix: string;
  contentBeforeFields: ReactNode;
};

jest.mock('@/page-layout/components/MyahCampaignEmailAccounts', () => ({
  MyahCampaignEmailAccounts: ({ campaignId }: { campaignId: string }) => (
    <div data-testid="email-accounts" data-campaign-id={campaignId} />
  ),
}));

jest.mock('@/page-layout/components/MyahCampaignRichTextSettings', () => ({
  MyahCampaignRichTextSettings: ({
    campaignId,
    title,
    fields,
    copy,
    modalIdPrefix,
    contentBeforeFields,
  }: MockSettingsProps) => (
    <>
      {contentBeforeFields}
      <div
        data-campaign-id={campaignId}
        data-field-names={fields.map(({ fieldName }) => fieldName).join(',')}
        data-formatting-controls={String(
          fields.every(({ showFormattingControls }) => showFormattingControls),
        )}
        data-modal-id-prefix={modalIdPrefix}
        data-placeholder={fields
          .map(({ placeholder }) => placeholder)
          .join(',')}
        data-save-error={copy.saveError}
        data-keep-editing={copy.keepEditing}
        data-save-success={copy.saveSuccess}
        data-testid="settings-adapter"
        data-title={title}
        data-unsaved-subtitle={copy.unsavedChangesSubtitle}
      />
    </>
  ),
}));

const operationsFieldsWidget = {
  id: 'campaign-operations-fields-widget',
} as PageLayoutWidget;

describe('MyahCampaignOperations', () => {
  it('delegates one email signature editor without generic lifecycle editing', () => {
    render(
      <MyahCampaignOperations
        campaignId="campaign-1"
        fieldsWidget={operationsFieldsWidget}
        title="Campaign operations"
      />,
    );

    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-campaign-id',
      'campaign-1',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-title',
      'Campaign operations',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-field-names',
      'emailSignature',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-placeholder',
      'Enter email signature',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-formatting-controls',
      'true',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-modal-id-prefix',
      'campaign-operations-unsaved-changes',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-save-success',
      'Email signature saved.',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-save-error',
      'Email signature could not be saved.',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-unsaved-subtitle',
      'Your Email signature changes have not been saved.',
    );
    expect(screen.getByTestId('settings-adapter')).toHaveAttribute(
      'data-keep-editing',
      'Keep editing',
    );
    expect(screen.getByTestId('email-accounts')).toHaveAttribute(
      'data-campaign-id',
      'campaign-1',
    );
    expect(screen.queryByTestId('native-status')).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId('email-accounts')
        .compareDocumentPosition(screen.getByTestId('settings-adapter')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

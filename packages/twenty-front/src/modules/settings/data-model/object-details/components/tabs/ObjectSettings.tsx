import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { AdvancedSettingsWrapper } from '@/settings/components/AdvancedSettingsWrapper';
import { SettingsObjectIndexesSection } from '@/settings/data-model/object-details/components/tabs/SettingsObjectIndexesSection';
import { SettingsObjectSearchSection } from '@/settings/data-model/object-details/components/tabs/SettingsObjectSearchSection';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type ObjectSettingsProps = {
  objectMetadataItem: EnrichedObjectMetadataItem;
};

const StyledContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
`;

const StyledSectionContainer = styled.div`
  > * {
    padding-left: 0 !important;
  }
`;

export const ObjectSettings = ({ objectMetadataItem }: ObjectSettingsProps) => {
  const { t } = useLingui();

  return (
    <StyledContentContainer>
      <AdvancedSettingsWrapper>
        <StyledSectionContainer>
          <Section>
            <H2Title
              title={t`Search`}
              description={t`See how this object appears in search results`}
            />
            <SettingsObjectSearchSection
              objectMetadataItem={objectMetadataItem}
              isReadOnly
            />
          </Section>
        </StyledSectionContainer>
      </AdvancedSettingsWrapper>
      <AdvancedSettingsWrapper>
        <StyledSectionContainer>
          <Section>
            <H2Title
              title={t`Indexes`}
              description={t`Inspect the indexes used by this object`}
            />
            <SettingsObjectIndexesSection
              objectMetadataItem={objectMetadataItem}
              isReadOnly
            />
          </Section>
        </StyledSectionContainer>
      </AdvancedSettingsWrapper>
    </StyledContentContainer>
  );
};

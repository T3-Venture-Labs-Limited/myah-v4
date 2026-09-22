import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isHiddenSystemField } from '@/object-metadata/utils/isHiddenSystemField';
import { SettingsObjectRelationsTable } from '@/settings/data-model/object-details/components/SettingsObjectRelationsTable';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { FieldMetadataType } from 'twenty-shared/types';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { SettingsObjectFieldTable } from '~/pages/settings/data-model/SettingsObjectFieldTable';

const StyledContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
`;

type ObjectFieldsProps = {
  objectMetadataItem: EnrichedObjectMetadataItem;
};

export const ObjectFields = ({ objectMetadataItem }: ObjectFieldsProps) => {
  const { t } = useLingui();
  const objectLabelSingular = objectMetadataItem.labelSingular;

  const hasRelations = objectMetadataItem.fields.some(
    (field) =>
      !isHiddenSystemField(field) &&
      (field.type === FieldMetadataType.RELATION ||
        field.type === FieldMetadataType.MORPH_RELATION),
  );

  return (
    <StyledContentContainer>
      {hasRelations && (
        <Section>
          <H2Title
            title={t`Relations`}
            description={t`Relations between this object and other objects`}
          />
          <SettingsObjectRelationsTable
            objectMetadataItem={objectMetadataItem}
          />
        </Section>
      )}
      <Section>
        <H2Title
          title={t`Fields`}
          description={t`Fields available on ${objectLabelSingular} records`}
        />
        <SettingsObjectFieldTable
          objectMetadataItem={objectMetadataItem}
          mode="view"
          excludeRelations
        />
      </Section>
    </StyledContentContainer>
  );
};

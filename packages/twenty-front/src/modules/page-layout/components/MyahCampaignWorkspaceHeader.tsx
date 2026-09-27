import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomValue } from 'jotai';
import { styled } from '@linaria/react';
import { IconArrowUpRight } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledHeader = styled.header`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  box-sizing: border-box;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 96px;
  min-width: 0;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};

  @container (max-width: 600px) {
    min-height: 0;
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledCampaignMark = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.pink3};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.color.pink11};
  display: flex;
  flex: 0 0 40px;
  height: 40px;
  justify-content: center;
`;

const StyledIdentity = styled.div`
  min-width: 0;
`;

const StyledTitleLine = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTitle = styled.h1`
  font-size: ${themeCssVariables.font.size.lg};
  margin: 0;
  overflow-wrap: anywhere;
`;

const StyledStatus = styled.span`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]};
`;

const StyledObjective = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: ${themeCssVariables.spacing[1]} 0 0;
  overflow-wrap: anywhere;
`;

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Stopped',
  COMPLETED: 'Completed',
};

export const MyahCampaignWorkspaceHeader = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { canReadObjectRecords, restrictedFields } =
    useObjectPermissionsForObject(objectMetadataItem.id);
  const cachedRecord = useAtomValue(
    recordStoreFamilyState.atomFamily(campaignId),
  );
  const canReadField = (name: string) => {
    const fieldId = objectMetadataItem.fields.find(
      (field) => field.name === name,
    )?.id;
    return (
      canReadObjectRecords &&
      fieldId !== undefined &&
      restrictedFields[fieldId]?.canRead !== false
    );
  };
  const name =
    canReadField('name') && typeof cachedRecord?.name === 'string'
      ? cachedRecord.name.trim()
      : '';
  const status =
    canReadField('lifecycleStatus') &&
    typeof cachedRecord?.lifecycleStatus === 'string'
      ? statusLabels[cachedRecord.lifecycleStatus]
      : undefined;
  const objective =
    canReadField('objective') && typeof cachedRecord?.objective === 'string'
      ? cachedRecord.objective.trim()
      : '';

  return (
    <StyledHeader aria-label="Campaign identity">
      <StyledCampaignMark aria-hidden="true">
        <IconArrowUpRight size={22} />
      </StyledCampaignMark>
      <StyledIdentity>
        <StyledTitleLine>
          <StyledTitle>{name || 'Campaign'}</StyledTitle>
          {status && <StyledStatus>{status}</StyledStatus>}
        </StyledTitleLine>
        {objective && <StyledObjective>{objective}</StyledObjective>}
      </StyledIdentity>
    </StyledHeader>
  );
};

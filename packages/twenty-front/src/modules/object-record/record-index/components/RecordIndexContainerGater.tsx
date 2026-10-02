import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useHandleIndexIdentifierClick } from '@/object-record/record-index/hooks/useHandleIndexIdentifierClick';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { type ReactNode, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';
import { ViewType } from '@/views/types/ViewType';

export type RecordIndexContainerGaterProps = {
  indexIdentifierUrl?: (recordId: string) => string;
  onOpenRecordFromIndexView?: (request: RecordIndexOpenRequest) => void;
  campaignCreationAction?: ReactNode;
  campaignOverviewSummary?: ReactNode;
  campaignOverviewContent?: ReactNode;
};

export const RecordIndexContainerGater = ({
  indexIdentifierUrl: indexIdentifierUrlOverride,
  onOpenRecordFromIndexView,
  campaignCreationAction,
  campaignOverviewSummary,
  campaignOverviewContent,
}: RecordIndexContainerGaterProps) => {
  const [showAdvancedCampaignTable, setShowAdvancedCampaignTable] =
    useState(false);
  const { objectMetadataItem } = useRecordIndexIdFromCurrentContextStore();
  const { currentView } = useGetCurrentViewOnly();
  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const { indexIdentifierUrl: defaultIndexIdentifierUrl } =
    useHandleIndexIdentifierClick({
      objectMetadataItem,
    });

  if (!contextStoreCurrentViewId) {
    return null;
  }

  const isCampaignOverview =
    objectMetadataItem.nameSingular === 'campaign' &&
    currentView?.universalIdentifier ===
      '5865bdbf-be33-5457-9d91-184885276b94' &&
    currentView.type === ViewType.TABLE;

  return (
    <RecordIndexSurface
      contextStoreInstanceId={MAIN_CONTEXT_STORE_INSTANCE_ID}
      objectNameSingular={objectMetadataItem.nameSingular}
      viewId={contextStoreCurrentViewId}
      indexIdentifierUrl={
        indexIdentifierUrlOverride ?? defaultIndexIdentifierUrl
      }
      onOpenRecordFromIndexView={onOpenRecordFromIndexView}
      campaignOverviewSummary={
        isCampaignOverview ? (
          <>
            {campaignOverviewSummary}
            {campaignOverviewContent !== undefined && (
              <div style={{ padding: '0 16px 16px' }}>
                <Button
                  title={
                    showAdvancedCampaignTable
                      ? 'Campaign overview'
                      : 'Advanced table'
                  }
                  variant="secondary"
                  onClick={() =>
                    setShowAdvancedCampaignTable(!showAdvancedCampaignTable)
                  }
                />
              </div>
            )}
          </>
        ) : undefined
      }
      campaignOverviewContent={
        isCampaignOverview && !showAdvancedCampaignTable
          ? campaignOverviewContent
          : undefined
      }
      campaignCreationAction={
        isCampaignOverview ? campaignCreationAction : undefined
      }
    />
  );
};

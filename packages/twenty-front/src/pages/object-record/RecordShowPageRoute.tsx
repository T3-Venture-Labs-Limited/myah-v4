import { Navigate, useLocation, useParams } from 'react-router-dom';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { RecordShowPage } from '~/pages/object-record/RecordShowPage';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { getMyahCampaignPath } from '@/myah/navigation/myah-navigation-registry';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignHomeTabUniversalIdentifier';
import { MYAH_CAMPAIGN_OUTREACH_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignOutreachTabUniversalIdentifier';
import { MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignOperationsTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { pageLayoutsWithRelationsSelector } from '@/page-layout/states/pageLayoutsWithRelationsSelector';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const legacyCampaignSections: Record<string, string> = {
  [MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER]: 'home',
  [MYAH_CAMPAIGN_OUTREACH_TAB_UNIVERSAL_IDENTIFIER]: 'outreach',
  [MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER]: 'agent',
  [MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER]: 'operations',
  '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596': 'influencers',
  '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0': 'tasks',
  'cd78ad8c-883a-4ce1-9b74-526adadb751d': 'notes',
};

const CampaignRecordRedirect = ({ campaignId }: { campaignId: string }) => {
  const { search, hash, state } = useLocation();
  const pageLayoutsWithRelations = useAtomStateValue(
    pageLayoutsWithRelationsSelector,
  );
  const params = new URLSearchParams(search);
  const legacyTab = pageLayoutsWithRelations
    .find(
      (layout) =>
        layout.universalIdentifier ===
          MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
        !layout.deletedAt,
    )
    ?.tabs.find((tab) => tab.id === hash.slice(1) && tab.isActive);
  const section =
    hash === `#${MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER}` ||
    hash === '#operations'
      ? 'operations'
      : legacyTab?.universalIdentifier
        ? legacyCampaignSections[legacyTab.universalIdentifier]
        : undefined;

  if (!params.has('section') && section) {
    params.set('section', section);
  }

  const query = params.toString();
  return (
    <Navigate
      replace
      to={`${getMyahCampaignPath(campaignId)}${query ? `?${query}` : ''}${section ? '' : hash}`}
      state={state}
    />
  );
};

export const RecordShowPageRoute = () => {
  const { objectNameSingular, objectRecordId } = useParams<{
    objectNameSingular: string;
    objectRecordId: string;
  }>();

  return objectNameSingular === CoreObjectNameSingular.Dashboard ? (
    <PageCardLayout header={null}>
      Dashboards are no longer available.
    </PageCardLayout>
  ) : objectNameSingular === 'campaign' && objectRecordId ? (
    <CampaignRecordRedirect campaignId={objectRecordId} />
  ) : (
    <RecordShowPage />
  );
};

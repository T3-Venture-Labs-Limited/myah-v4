import { subscribeCampaignCreationSession } from '@/object-record/record-index/states/campaignCreationState';
import { useStore } from 'jotai';
import { useEffect } from 'react';

export const CampaignCreationSessionEffect = () => {
  const store = useStore();
  useEffect(() => subscribeCampaignCreationSession(store), [store]);
  return null;
};

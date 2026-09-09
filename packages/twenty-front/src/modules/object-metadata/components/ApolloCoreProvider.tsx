import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';
import { CampaignCreationSessionEffect } from '@/object-record/record-index/components/CampaignCreationSessionEffect';

import { ApolloCoreClientContext } from '@/object-metadata/contexts/ApolloCoreClientContext';

export const ApolloCoreProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const apolloCoreClient = useApolloFactory();

  return (
    <ApolloCoreClientContext.Provider value={apolloCoreClient}>
      <CampaignCreationSessionEffect />
      {children}
    </ApolloCoreClientContext.Provider>
  );
};

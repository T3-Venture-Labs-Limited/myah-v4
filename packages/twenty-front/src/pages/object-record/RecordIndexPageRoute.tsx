import { useParams } from 'react-router-dom';

import { RecordIndexPage } from '~/pages/object-record/RecordIndexPage';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';

export const RecordIndexPageRoute = () => {
  const { objectNamePlural } = useParams<{ objectNamePlural: string }>();

  return objectNamePlural === 'dashboards' ? (
    <PageContainer>Dashboards are no longer available.</PageContainer>
  ) : (
    <RecordIndexPage />
  );
};

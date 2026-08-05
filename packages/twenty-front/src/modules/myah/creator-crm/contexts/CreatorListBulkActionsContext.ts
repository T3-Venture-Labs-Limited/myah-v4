import { type CreatorListContext } from '@/myah/creator-crm/hooks/useCreatorListContext';
import { createContext, useContext } from 'react';

export const CreatorListBulkActionsContext = createContext<
  CreatorListContext | undefined
>(undefined);

export const useCreatorListBulkActionsContext = () =>
  useContext(CreatorListBulkActionsContext);

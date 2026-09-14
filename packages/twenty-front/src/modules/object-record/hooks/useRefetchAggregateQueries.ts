import { getOperationAST } from 'graphql';
import {
  assertCampaignCreationCurrent,
  hasCompleteCampaignCreationSelection,
} from '@/apollo/utils/campaignCreationOperation';
import { type CampaignCreationOperationContext } from '@/object-record/record-index/types/CampaignCreationAttempt';
import { isDeeplyEqual } from '~/utils/isDeeplyEqual';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { getGroupByAggregateQueryName } from '@/object-record/record-aggregate/utils/getGroupByAggregateQueryName';
import { getAggregateQueryName } from '@/object-record/utils/getAggregateQueryName';

export const useRefetchAggregateQueries = () => {
  const apolloCoreClient = useApolloCoreClient();

  const refetchAggregateQueries = async ({
    objectMetadataNamePlural,
    campaignCreation,
  }: {
    objectMetadataNamePlural: string;
    campaignCreation?: CampaignCreationOperationContext;
  }) => {
    const queryName = getAggregateQueryName(objectMetadataNamePlural);

    const groupByAggregateQueryName = getGroupByAggregateQueryName({
      objectMetadataNamePlural,
    });

    const activeQueryNames = new Set(
      [...apolloCoreClient.getObservableQueries('active')]
        .map(({ queryName: activeQueryName }) => activeQueryName)
        .filter((activeQueryName): activeQueryName is string =>
          Boolean(activeQueryName),
        ),
    );
    const activeAggregateQueryNames = [
      queryName,
      groupByAggregateQueryName,
    ].filter((aggregateQueryName) => activeQueryNames.has(aggregateQueryName));

    if (activeAggregateQueryNames.length === 0) {
      return;
    }

    if (!campaignCreation) {
      await apolloCoreClient.refetchQueries({
        include: activeAggregateQueryNames,
      });
      return;
    }
    const snapshots = [...apolloCoreClient.getObservableQueries('active')]
      .filter((observable) =>
        activeAggregateQueryNames.includes(observable.queryName ?? ''),
      )
      .map((observable) => ({
        observable,
        query: observable.options.query,
        variables: structuredClone(observable.variables),
      }));
    const refreshed = await Promise.allSettled(
      snapshots.map(async (snapshot) => {
        const stillActive = () =>
          apolloCoreClient
            .getObservableQueries('active')
            .has(snapshot.observable) &&
          snapshot.observable.options.query === snapshot.query &&
          isDeeplyEqual(snapshot.observable.variables, snapshot.variables);
        if (!stillActive()) return;
        const context: CampaignCreationOperationContext = {
          ...campaignCreation,
          kind: 'read',
          transport: { dispatched: false, uncertain: false },
        };
        assertCampaignCreationCurrent(context);
        const result = await apolloCoreClient.query({
          query: snapshot.query,
          variables: snapshot.variables,
          fetchPolicy: 'no-cache',
          errorPolicy: 'none',
          context: { campaignCreation: context, queryDeduplication: false },
        });
        assertCampaignCreationCurrent(context);
        const operation = getOperationAST(snapshot.query);
        if (
          !result.data ||
          result.error !== undefined ||
          !operation ||
          !hasCompleteCampaignCreationSelection(
            result.data,
            operation.selectionSet,
          )
        ) {
          throw new Error(
            'Campaign aggregate refresh returned no authoritative data',
          );
        }
        if (!stillActive()) return;
        apolloCoreClient.writeQuery({
          query: snapshot.query,
          variables: snapshot.variables,
          data: result.data,
        });
      }),
    );
    const failed = refreshed.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  };

  return {
    refetchAggregateQueries,
  };
};

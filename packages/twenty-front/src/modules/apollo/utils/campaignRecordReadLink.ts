import { ApolloLink } from '@apollo/client';
import { defer, tap } from 'rxjs';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import {
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
} from '@/apollo/utils/campaignCreationOperation';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import type { useStore } from 'jotai';

export type CampaignRecordReadContext = {
  store: ReturnType<typeof useStore>;
  workspaceId: string;
  identityKey: string | undefined;
};

export class CampaignRecordReadBoundaryError extends Error {
  readonly code = 'CAMPAIGN_RECORD_READ_BOUNDARY_CHANGED';
}

export const campaignRecordReadLink = new ApolloLink((operation, forward) =>
  defer(() => {
    const context = operation.getContext().campaignRecordRead as
      | CampaignRecordReadContext
      | undefined;
    if (!context) return forward(operation);

    const assertCurrent = () => {
      const header = operation.getContext().headers?.authorization as
        | string
        | undefined;
      const headerIdentity = decodeCampaignCreationIdentity(
        header?.startsWith('Bearer ') ? header.slice(7) : undefined,
      );
      const activeIdentity = decodeCampaignCreationIdentity(
        getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
      );
      if (
        !context.identityKey ||
        !headerIdentity ||
        !activeIdentity ||
        headerIdentity.workspaceId !== context.workspaceId ||
        campaignCreationIdentityKey(headerIdentity) !== context.identityKey ||
        campaignCreationIdentityKey(activeIdentity) !== context.identityKey ||
        context.store.get(currentWorkspaceState.atom)?.id !==
          context.workspaceId
      ) {
        throw new CampaignRecordReadBoundaryError(
          'Campaign show read authority changed',
        );
      }
    };

    assertCurrent();
    return forward(operation).pipe(
      tap({ next: assertCurrent, error: assertCurrent }),
    );
  }),
);

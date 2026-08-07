import { Injectable } from '@nestjs/common';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

type CreatorPayload = { data?: Record<string, unknown> | Record<string, unknown>[] };

const guardCreatorData = (payload: CreatorPayload) => {
  const rows = Array.isArray(payload.data) ? payload.data : [payload.data];
  if (rows.some((row) => row && !Object.prototype.hasOwnProperty.call(row, 'isDirectlyAdded'))) throw new Error('CampaignCreator rows must be created through an audience intent');
  return payload;
};

@Injectable()
@WorkspaceQueryHook('campaignCreator.createOne')
export class MyahCampaignCreatorCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(_authContext: WorkspaceAuthContext, _objectName: string, payload: CreatorPayload) { return guardCreatorData(payload); }
}

@Injectable()
@WorkspaceQueryHook('campaignCreator.createMany')
export class MyahCampaignCreatorCreateManyPreQueryHook extends MyahCampaignCreatorCreateOnePreQueryHook {}

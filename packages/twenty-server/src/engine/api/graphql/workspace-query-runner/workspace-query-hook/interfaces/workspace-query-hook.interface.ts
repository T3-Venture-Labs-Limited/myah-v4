import { type QueryResultFieldValue } from 'src/engine/api/graphql/workspace-query-runner/factories/query-result-getters/interfaces/query-result-field-value';
import { type ResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

export type WorkspaceRawInputPreQueryHookContext = {
  objectMetadataId: string;
  objectMetadataUniversalIdentifier: string;
};

export interface WorkspacePreQueryHookInstance {
  validateRawInput?(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: ResolverArgs,
    context: WorkspaceRawInputPreQueryHookContext,
  ): Promise<void> | void;
  execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: ResolverArgs,
  ): Promise<ResolverArgs>;
}

export interface WorkspacePostQueryHookInstance {
  execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: QueryResultFieldValue,
  ): Promise<void>;
}

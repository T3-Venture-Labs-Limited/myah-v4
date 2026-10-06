import {
  Injectable,
  Catch,
  type CanActivate,
  type ExecutionContext,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { HttpExceptionHandlerService } from 'src/engine/core-modules/exception-handler/http-exception-handler.service';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import { getOperationAST, Kind, parse, type SelectionSetNode } from 'graphql';

import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';

// Root fields, NOT caller-chosen operation names or aliases. All new metadata
// operations are denied by default. Existing auth/permission guards still apply.
export const MYAH_UNSUBSCRIBED_METADATA_FIELDS = new Set([
  '__typename',
  'currentUser',
  'currentWorkspace',
  'myahCheckoutPrice',
  'myahWorkspaceUsage',
  'createMyahCheckoutSession',
  'syncMyahCheckoutSession',
  'createMyahCustomerPortalSession',
  'activateWorkspace',
  // Deletion must remain retryable after billing cancellation succeeds.
  'deleteCurrentWorkspace',
  'signIn',
  'signUpInNewWorkspace',
  'signUpInWorkspace',
  'renewToken',
  'getAuthTokensFromLoginToken',
  'getAuthTokensFromOTP',
  'getWorkspaceCreationDefaults',
  'checkWorkspaceSubdomainAvailability',
  'getPublicWorkspaceDataByDomain',
  'getPublicWorkspaceDataById',
  'skipSyncEmailOnboardingStep',
  'skipBookOnboardingStep',
  // Metadata hydration can race the onboarding redirect on a cold app load.
  'minimalMetadata',
  'objects',
  'getViews',
  'getPageLayouts',
  'navigationMenuItems',
  'commandMenuItems',
  'frontComponents',
  'findManyLogicFunctions',
]);

export const isMyahSubscriptionMetadataAllowed = (body: unknown): boolean => {
  if (Array.isArray(body))
    return body.length > 0 && body.every(isMyahSubscriptionMetadataAllowed);
  if (
    !body ||
    typeof body !== 'object' ||
    !('query' in body) ||
    typeof body.query !== 'string'
  )
    return false;
  try {
    const document = parse(body.query);
    const operationName =
      'operationName' in body && typeof body.operationName === 'string'
        ? body.operationName
        : undefined;
    const operation = getOperationAST(document, operationName);
    if (!operation) return false;
    const fragments = new Map(
      document.definitions
        .filter((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)
        .map((fragment) => [fragment.name.value, fragment]),
    );
    const allowed = (
      selectionSet: SelectionSetNode,
      visited = new Set<string>(),
    ): boolean =>
      selectionSet.selections.every((selection) => {
        if (selection.kind === Kind.FIELD)
          return MYAH_UNSUBSCRIBED_METADATA_FIELDS.has(selection.name.value);
        if (selection.kind === Kind.INLINE_FRAGMENT)
          return allowed(selection.selectionSet, visited);
        const name = selection.name.value;
        const fragment = fragments.get(name);
        return (
          !!fragment &&
          !visited.has(name) &&
          allowed(fragment.selectionSet, new Set([...visited, name]))
        );
      });
    return allowed(operation.selectionSet);
  } catch {
    return false;
  }
};

@Injectable()
export class MyahSubscriptionApiAccessService {
  constructor(private readonly usage: MyahUsageService) {}

  async assertRequestAllowed(request: Request) {
    if (!request.workspace) return;
    try {
      await this.usage.assertCanAct(request.workspace.id);
    } catch (error) {
      // Parse the document only for workspaces without access, not every request.
      if (
        error instanceof AiException &&
        error.code === AiExceptionCode.SUBSCRIPTION_REQUIRED &&
        request.path.replace(/\/+$/, '') === '/metadata' &&
        isMyahSubscriptionMetadataAllowed(
          request.method === 'GET' ? request.query : request.body,
        )
      )
        return;
      throw error;
    }
  }
}

@Injectable()
export class MyahSubscriptionApiGuard implements CanActivate {
  constructor(private readonly access: MyahSubscriptionApiAccessService) {}

  async canActivate(context: ExecutionContext) {
    await this.access.assertRequestAllowed(
      context.switchToHttp().getRequest<Request>(),
    );
    return true;
  }
}

// REST adapters preserve the same domain code as GraphQL's extensions.subCode.
@Catch(AiException)
export class MyahUsageRestApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly handler: HttpExceptionHandlerService) {}

  catch(error: AiException, host: ArgumentsHost) {
    const status =
      error.code === AiExceptionCode.SUBSCRIPTION_REQUIRED ||
      error.code === AiExceptionCode.INCLUDED_USAGE_EXHAUSTED
        ? 403
        : 500;
    return this.handler.handleError(
      error,
      host.switchToHttp().getResponse<Response>(),
      status,
    );
  }
}

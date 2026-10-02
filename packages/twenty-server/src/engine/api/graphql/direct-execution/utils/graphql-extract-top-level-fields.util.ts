import {
  type DocumentNode,
  type FieldNode,
  getDirectiveValues,
  GraphQLIncludeDirective,
  GraphQLSkipDirective,
  Kind,
  type SelectionNode,
} from 'graphql';

import { findOperationDefinition } from 'src/engine/api/graphql/direct-execution/utils/find-operation-definition.util';
import { graphQLBuildFragmentMap } from 'src/engine/api/graphql/direct-execution/utils/graphql-build-fragment-map.util';

export const graphQLExtractTopLevelFields = (
  document: DocumentNode,
  operationName: string | undefined,
  execution?: { checkedVariables: Record<string, unknown> },
): FieldNode[] => {
  const operationDefinition = findOperationDefinition(document, operationName);

  if (!operationDefinition) {
    return [];
  }

  const fragmentMap = graphQLBuildFragmentMap(document);
  const fields: FieldNode[] = [];
  const visitedFragments = new Set<string>();
  const pending: SelectionNode[] = [
    ...operationDefinition.selectionSet.selections,
  ].reverse();

  // Explore only root-level selections. A visited fragment is never expanded
  // twice, so cyclic spreads cannot hang routing or duplicate dispatch.
  while (pending.length > 0) {
    const selection = pending.pop()!;

    // Structural routing omits execution; checked directives are evaluated
    // only after full workspace preflight. Check before marking a spread visited.
    if (execution) {
      const skipped = getDirectiveValues(
        GraphQLSkipDirective,
        selection,
        execution.checkedVariables,
      );
      if (skipped?.if === true) continue;
      const included = getDirectiveValues(
        GraphQLIncludeDirective,
        selection,
        execution.checkedVariables,
      );
      if (included?.if === false) continue;
    }

    if (selection.kind === Kind.FIELD) {
      fields.push(selection);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      pending.push(...[...selection.selectionSet.selections].reverse());
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const name = selection.name.value;
      if (visitedFragments.has(name)) continue;
      visitedFragments.add(name);
      const fragment = fragmentMap.get(name);
      if (fragment)
        pending.push(...[...fragment.selectionSet.selections].reverse());
    }
  }

  return fields;
};

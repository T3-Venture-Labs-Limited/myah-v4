import {
  type FieldNode,
  type FragmentDefinitionNode,
  type GraphQLResolveInfo,
} from 'graphql';

export const graphQLBuildPartialResolveInfo = (
  field: FieldNode,
  fragmentMap: Map<string, FragmentDefinitionNode>,
  variableValues: Record<string, unknown>,
): Pick<GraphQLResolveInfo, 'fieldNodes' | 'fragments' | 'variableValues'> => ({
  fieldNodes: [field],
  fragments: Object.fromEntries(fragmentMap),
  variableValues,
});

import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  type DocumentNode,
  type GraphQLFormattedError,
  type GraphQLSchema,
  type GraphQLScalarType,
  Kind,
  getVariableValues,
  separateOperations,
  validate,
  visit,
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';

import { scalars } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

const MAX_AST_NODES = 2500;
const MAX_VARIABLE_BYTES = 64_000;
const MAX_ERRORS = 10;
const MAX_SCHEMAS = 8;
const INVALID = 'Unsupported GraphQL operation or input reference.';

type PreflightResult =
  | { errors: GraphQLFormattedError[]; variables?: never }
  | { errors?: never; variables: Record<string, unknown> };

const error = (message: string): GraphQLFormattedError => ({
  message,
  extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
});

// The authoritative SDL is fetched per workspace/application for each request.
// This bounded local cache holds schemas only, never role/permission decisions.
const schemas = new Map<string, { sdl: string; schema: GraphQLSchema }>();

export const validateWorkspaceOperation = ({
  document,
  operationName,
  variables,
  workspaceId,
  applicationId,
  sdl,
  usedScalarNames,
}: {
  document: DocumentNode;
  operationName?: string;
  variables: unknown;
  workspaceId: string;
  applicationId?: string;
  sdl: string;
  usedScalarNames: string[];
}): PreflightResult => {
  let nodeCount = 0;
  let tooComplex = false;

  // Inspect the source tree, never expanding fragment references here.
  visit(document, {
    enter(_node, _key, _parent, _path, ancestors) {
      nodeCount++;
      if (nodeCount > MAX_AST_NODES || ancestors.length > 80) {
        tooComplex = true;
      }
      if (tooComplex) return false;
    },
  });
  if (tooComplex)
    return { errors: [error('GraphQL operation exceeds limits.')] };

  if (
    !variables ||
    typeof variables !== 'object' ||
    Array.isArray(variables) ||
    !isBoundedVariables(variables)
  ) {
    return { errors: [error('Invalid or oversized GraphQL variables.')] };
  }

  const operations = document.definitions.filter(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );
  const names = new Set<string>();
  for (const definition of document.definitions) {
    if (
      definition.kind !== Kind.OPERATION_DEFINITION &&
      definition.kind !== Kind.FRAGMENT_DEFINITION
    ) {
      return { errors: [error(INVALID)] };
    }
    const name = definition.name?.value;
    if (name) {
      const key = `${definition.kind}:${name}`;
      if (names.has(key)) return { errors: [error(INVALID)] };
      names.add(key);
    }
  }
  if (
    operations.length === 0 ||
    (operations.length > 1 && operations.some((operation) => !operation.name))
  ) {
    return { errors: [error(INVALID)] };
  }
  const selected =
    operations.find((operation) => operation.name?.value === operationName) ??
    (operationName === undefined && operations.length === 1
      ? operations[0]
      : undefined);
  if (!selected) return { errors: [error(INVALID)] };

  const scope = `${workspaceId}:${applicationId ?? ''}`;
  let cached = schemas.get(scope);
  if (!cached || cached.sdl !== sdl) {
    const scalarResolvers: Record<string, GraphQLScalarType> =
      Object.fromEntries(
        scalars
          .filter((scalar) => usedScalarNames.includes(scalar.name))
          .map((scalar) => [scalar.name, scalar]),
      );
    if (usedScalarNames.includes('JSON')) scalarResolvers.JSON = GraphQLJSON;
    cached = {
      sdl,
      schema: makeExecutableSchema({
        typeDefs: sdl,
        resolvers: scalarResolvers,
      }),
    };
    schemas.delete(scope);
    schemas.set(scope, cached);
    if (schemas.size > MAX_SCHEMAS)
      schemas.delete(schemas.keys().next().value!);
  }

  // Selected operation and reachable fragments only: unselected operations
  // may belong to the separate static-core endpoint.
  const selectedDocument =
    separateOperations(document)[selected.name?.value ?? ''];
  if (!selectedDocument) return { errors: [error(INVALID)] };
  const issues = validate(cached.schema, selectedDocument, undefined, {
    maxErrors: MAX_ERRORS,
  });
  if (issues.length) {
    return {
      errors: issues
        .slice(0, MAX_ERRORS)
        .map((issue) => ({ ...error(INVALID), locations: issue.locations })),
    };
  }

  const coerced = getVariableValues(
    cached.schema,
    selected.variableDefinitions ?? [],
    variables as Record<string, unknown>,
    { maxErrors: MAX_ERRORS },
  );
  if (coerced.errors?.length) {
    return {
      errors: coerced.errors.slice(0, MAX_ERRORS).map((issue) => ({
        ...error('Invalid GraphQL variable value.'),
        locations: issue.locations,
      })),
    };
  }
  return { variables: coerced.coerced ?? {} };
};

const isBoundedVariables = (value: unknown): boolean => {
  let budget = MAX_VARIABLE_BYTES;
  const seen = new Set<object>();
  const check = (item: unknown, depth: number): boolean => {
    if (--budget < 0 || depth > 40) return false;
    if (typeof item === 'string') return (budget -= item.length) >= 0;
    if (item === null || typeof item !== 'object') return true;
    if (seen.has(item)) return false;
    seen.add(item);
    const entries = Object.entries(item);
    if (entries.length > 2000) return false;
    for (const [key, child] of entries) {
      budget -= key.length;
      if (!check(child, depth + 1)) return false;
    }
    seen.delete(item);
    return budget >= 0;
  };
  return check(value, 0);
};

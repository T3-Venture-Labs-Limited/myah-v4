import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';

type Value = string | Value[] | { [key: string]: Value } | undefined;
type Declaration = {
  universalIdentifier?: string;
  objectUniversalIdentifier?: string;
  fieldUniversalIdentifier?: string;
  relationTargetObjectMetadataUniversalIdentifier?: string;
  relationTargetFieldMetadataUniversalIdentifier?: string;
  fields?: Declaration[];
  filters?: Declaration[];
  options?: { id?: string }[];
  tabs?: {
    universalIdentifier?: string;
    widgets?: { universalIdentifier?: string }[];
  }[];
};

const root = resolve(__dirname, '../../../../../../../../');
const brand = 'packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp/src';
const creatorOps = 'packages/twenty-apps/internal/myah-creator-ops/src';
const modules = (folder: string, names: readonly string[]) =>
  names.map((name) => `${folder}/${name}`);
const objectPaths = [
  ...modules(`${brand}/objects`, [
    'brand-brain-link.object.ts',
    'brand-brain-page.object.ts',
    'brand-brain-update-proposal.object.ts',
  ]),
  ...modules(`${creatorOps}/objects`, [
    'offer.object.ts',
    'outreach-action.object.ts',
    'outreach-sequence.object.ts',
    'outreach-step.object.ts',
    'promoted-asset.object.ts',
    'campaign-creator.object.ts',
    'campaign.object.ts',
    'creator-list-member.object.ts',
    'creator-list.object.ts',
    'creator.object.ts',
  ]),
];
const fieldPaths = [
  ...modules(`${brand}/fields`, [
    'target-page-links-on-brand-brain-page.field.ts',
    'target-page-on-brand-brain-link.field.ts',
    'target-page-on-brand-brain-update-proposal.field.ts',
    'update-proposals-on-brand-brain-page.field.ts',
    'child-pages-on-brand-brain-page.field.ts',
    'parent-page-on-brand-brain-page.field.ts',
    'source-page-links-on-brand-brain-page.field.ts',
    'source-page-on-brand-brain-link.field.ts',
  ]),
  `${creatorOps}/fields/owned-creators-on-workspace-member.field.ts`,
];
const viewPaths = [
  ...modules(`${brand}/views`, [
    'brand-brain-page-record-page-fields.view.ts',
    'pending-brand-brain-proposals.view.ts',
    'all-brand-brain-pages.view.ts',
  ]),
  ...modules(`${creatorOps}/views`, [
    'campaigns.view.ts',
    'creator-lists.view.ts',
    'creators.view.ts',
    'qualified-creators-with-email.view.ts',
  ]),
];
const navigationPaths = [
  `${brand}/navigation-menu-items/brand-brain-pages.navigation-menu-item.ts`,
  ...modules(`${creatorOps}/navigation-menu-items`, [
    'campaigns.navigation-menu-item.ts',
    'creator-lists.navigation-menu-item.ts',
    'creators.navigation-menu-item.ts',
  ]),
];
const layoutPaths = [
  `${brand}/page-layouts/brand-brain-page-record-page.page-layout.ts`,
];
const indexPaths = [
  `${brand}/indexes/brand-brain-page-canonical-path.index.ts`,
];
const rolePaths = [
  `${brand}/roles/brand-brain-admin.role.ts`,
  `${creatorOps}/default-role.ts`,
];

const fileCache = new Map<string, ts.SourceFile>();
const file = (path: string) =>
  fileCache.get(path) ??
  (fileCache.set(
    path,
    ts.createSourceFile(
      path,
      readFileSync(resolve(root, path), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  ),
  fileCache.get(path)!);
const resolveImport = (from: string, spec: string) =>
  spec.startsWith('src/')
    ? `${from.split('/src/')[0]}/${spec}.ts`
    : spec.startsWith('.')
      ? `${join(dirname(from), spec)}.ts`
      : undefined;

const evalExpr = (node: ts.Node, source: string): Value => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node)
  )
    return evalExpr(node.expression, source);
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map((element) => evalExpr(element, source));
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, Value> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name =
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : undefined;
      if (name) out[name] = evalExpr(property.initializer, source);
    }
    return out;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const base = evalExpr(node.expression, source);
    return base && typeof base === 'object' && !Array.isArray(base)
      ? (base as Record<string, Value>)[node.name.text]
      : undefined;
  }
  if (ts.isIdentifier(node)) {
    if (node.text === 'STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS')
      return STANDARD_OBJECTS as unknown as Value;
    const sf = file(source);
    const importDeclaration = sf.statements.find(
      (statement): statement is ts.ImportDeclaration =>
        Boolean(
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.importClause?.namedBindings &&
          ts.isNamedImports(statement.importClause.namedBindings) &&
          statement.importClause.namedBindings.elements.some(
            (element) => element.name.text === node.text,
          ),
        ),
    );
    if (
      importDeclaration &&
      ts.isStringLiteral(importDeclaration.moduleSpecifier)
    ) {
      const element = (
        importDeclaration.importClause!.namedBindings as ts.NamedImports
      ).elements.find((item) => item.name.text === node.text)!;
      const target = resolveImport(
        source,
        importDeclaration.moduleSpecifier.text,
      );
      if (!target) return undefined;
      const exportedName = element.propertyName?.text ?? node.text;
      const declaration = file(target)
        .statements.flatMap((statement) =>
          ts.isVariableStatement(statement)
            ? [...statement.declarationList.declarations]
            : [],
        )
        .find(
          (item) =>
            ts.isIdentifier(item.name) && item.name.text === exportedName,
        );
      return declaration?.initializer
        ? evalExpr(declaration.initializer, target)
        : undefined;
    }
    const declaration = sf.statements
      .flatMap((statement) =>
        ts.isVariableStatement(statement)
          ? [...statement.declarationList.declarations]
          : [],
      )
      .find(
        (item) => ts.isIdentifier(item.name) && item.name.text === node.text,
      );
    return declaration?.initializer
      ? evalExpr(declaration.initializer, source)
      : undefined;
  }
  return undefined;
};

const declaration = (path: string, callee: string): Declaration => {
  const sf = file(path);
  let result: Declaration | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === callee &&
      node.arguments[0]
    )
      result = evalExpr(node.arguments[0], path) as Declaration;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!result) throw new Error(`Missing ${callee} declaration in ${path}`);
  return result;
};

const requireId = (value: string | undefined, description: string): string => {
  if (!value)
    throw new Error(`Missing universal identifier for ${description}`);
  return value;
};
const unique = (values: readonly string[]) => [...new Set(values)];
const objects = objectPaths.map((path) => declaration(path, 'defineObject'));
const standaloneFields = fieldPaths.map((path) =>
  declaration(path, 'defineField'),
);
const views = viewPaths.map((path) => declaration(path, 'defineView'));
const nav = navigationPaths.map((path) =>
  declaration(path, 'defineNavigationMenuItem'),
);
const layouts = layoutPaths.map((path) =>
  declaration(path, 'definePageLayout'),
);
const indexes = indexPaths.map((path) => declaration(path, 'defineIndex'));
const roles = rolePaths.flatMap((path) =>
  ['defineRole', 'defineApplicationRole'].flatMap((callee) => {
    const sf = file(path);
    return sf.getFullText().includes(callee) ? [declaration(path, callee)] : [];
  }),
);

const objectIds = objects.map((object) =>
  requireId(object.universalIdentifier, 'object'),
);
const objectFields = objects.flatMap((object) =>
  (object.fields ?? []).map((field) => ({
    ...field,
    objectUniversalIdentifier: requireId(
      object.universalIdentifier,
      'object field parent',
    ),
  })),
);
const fields = [...objectFields, ...standaloneFields].map((field) =>
  requireId(field.universalIdentifier, 'field'),
);
const nestedOptionUniversalIdentifiers = unique(
  objectFields.flatMap((field) =>
    (field.options ?? []).map((option) =>
      requireId(option.id, 'select option'),
    ),
  ),
);
const viewIds = views.map((view) =>
  requireId(view.universalIdentifier, 'view'),
);
const viewFieldIds = views.flatMap((view) =>
  (view.fields ?? []).map((field) =>
    requireId(field.universalIdentifier, 'view field'),
  ),
);
const viewFilterIds = views.flatMap((view) =>
  (view.filters ?? []).map((filter) =>
    requireId(filter.universalIdentifier, 'view filter'),
  ),
);
const layoutIds = layouts.map((layout) =>
  requireId(layout.universalIdentifier, 'page layout'),
);
const layoutTabIds = layouts.flatMap((layout) =>
  (layout.tabs ?? []).map((tab) =>
    requireId(tab.universalIdentifier, 'page layout tab'),
  ),
);
const layoutWidgetIds = layouts.flatMap((layout) =>
  (layout.tabs ?? []).flatMap((tab) =>
    (tab.widgets ?? []).map((widget) =>
      requireId(widget.universalIdentifier, 'page layout widget'),
    ),
  ),
);

export type RelationContract = Readonly<{
  sourceField: string;
  sourceObject: string;
  targetObject: string;
  targetField: string;
}>;
const relationFields = [...objectFields, ...standaloneFields].filter(
  (field) =>
    field.relationTargetObjectMetadataUniversalIdentifier ||
    field.relationTargetFieldMetadataUniversalIdentifier,
);
const relations: RelationContract[] = relationFields.map((field) => ({
  sourceField: requireId(field.universalIdentifier, 'relation source field'),
  sourceObject: requireId(
    field.objectUniversalIdentifier,
    'relation source object',
  ),
  targetObject: requireId(
    field.relationTargetObjectMetadataUniversalIdentifier,
    'relation target object',
  ),
  targetField: requireId(
    field.relationTargetFieldMetadataUniversalIdentifier,
    'relation target field',
  ),
}));

type FlatContract = {
  readonly [K in keyof TwentyStandardAllFlatEntityMaps]: readonly string[];
};
export type MyahStandardMetadataContract = FlatContract &
  Readonly<{
    relations: readonly RelationContract[];
    nestedOptionUniversalIdentifiers: readonly string[];
    canonicalPathIndex: Readonly<{
      index: string;
      object: string;
      field: string;
    }>;
  }>;
const canonicalIndex = indexes[0];
const canonicalIndexField = canonicalIndex.fields?.[0];
export const buildMyahStandardMetadataContract =
  (): MyahStandardMetadataContract => ({
    flatObjectMetadataMaps: unique(objectIds),
    flatFieldMetadataMaps: unique(fields),
    flatIndexMaps: unique(
      indexes.map((index) => requireId(index.universalIdentifier, 'index')),
    ),
    flatSearchFieldMetadataMaps: [],
    flatViewMaps: unique(viewIds),
    flatViewGroupMaps: [],
    flatViewFilterMaps: unique(viewFilterIds),
    flatViewFieldGroupMaps: [],
    flatViewFieldMaps: unique(viewFieldIds),
    flatRoleMaps: unique(
      roles.map((role) => requireId(role.universalIdentifier, 'role')),
    ),
    flatPermissionFlagMaps: [],
    flatFieldPermissionMaps: [],
    flatObjectPermissionMaps: [],
    flatAgentMaps: [],
    flatSkillMaps: [],
    flatPageLayoutMaps: unique(layoutIds),
    flatPageLayoutTabMaps: unique(layoutTabIds),
    flatPageLayoutWidgetMaps: unique(layoutWidgetIds),
    flatNavigationMenuItemMaps: unique(
      nav.map((item) => requireId(item.universalIdentifier, 'navigation item')),
    ),
    flatCommandMenuItemMaps: [],
    relations,
    nestedOptionUniversalIdentifiers,
    canonicalPathIndex: {
      index: requireId(canonicalIndex.universalIdentifier, 'canonical index'),
      object: requireId(
        canonicalIndex.objectUniversalIdentifier,
        'canonical index object',
      ),
      field: requireId(
        canonicalIndexField?.fieldUniversalIdentifier,
        'canonical index field',
      ),
    },
  });

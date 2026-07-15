import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { MYAH_STANDARD_SOURCE_DECLARATIONS } from './myah-standard-source-declarations.constant';

type AnyDeclaration = Record<string, any>;
const stamp = (declaration: AnyDeclaration, applicationId: string, workspaceId: string, now: string): AnyDeclaration => ({
  ...declaration,
  id: declaration.universalIdentifier,
  applicationId,
  workspaceId,
  createdAt: now,
  updatedAt: now,
  isActive: true,
});
const add = (map: FlatEntityMaps<any>, declaration: AnyDeclaration, applicationId: string, workspaceId: string, now: string, extras: AnyDeclaration = {}) => {
  const entity = stamp({ ...declaration, ...extras }, applicationId, workspaceId, now);
  return {
    byUniversalIdentifier: { ...map.byUniversalIdentifier, [entity.universalIdentifier]: entity },
    universalIdentifierById: { ...map.universalIdentifierById, [entity.id]: entity.universalIdentifier },
    universalIdentifiersByApplicationId: { ...map.universalIdentifiersByApplicationId, [applicationId]: [...(map.universalIdentifiersByApplicationId?.[applicationId] ?? []), entity.universalIdentifier] },
  } as FlatEntityMaps<any>;
};
const merge = (map: FlatEntityMaps<any>, declarations: readonly AnyDeclaration[], applicationId: string, workspaceId: string, now: string, extras?: (d: AnyDeclaration) => AnyDeclaration) => declarations.reduce((acc, d) => add(acc, d, applicationId, workspaceId, now, extras?.(d)), map);

export const mergeMyahStandardSourceMetadata = ({ maps, workspaceId, twentyStandardApplicationId, now }: { maps: TwentyStandardAllFlatEntityMaps; workspaceId: string; twentyStandardApplicationId: string; now: string }): TwentyStandardAllFlatEntityMaps => {
  const source = MYAH_STANDARD_SOURCE_DECLARATIONS;
  const objectDeclarations = source.objects as readonly AnyDeclaration[];
    const objectFields = objectDeclarations.flatMap((object) => (object.fields ?? []).map((field: AnyDeclaration) => ({ ...field, objectUniversalIdentifier: object.universalIdentifier })));
  let out = { ...maps } as TwentyStandardAllFlatEntityMaps;
  out.flatObjectMetadataMaps = merge(out.flatObjectMetadataMaps, objectDeclarations as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now, (d) => ({ objectMetadataUniversalIdentifier: d.universalIdentifier })) as any;
  out.flatFieldMetadataMaps = merge(out.flatFieldMetadataMaps, [...objectFields, ...source.fields] as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now, (d) => ({ objectMetadataUniversalIdentifier: d.objectUniversalIdentifier, relationTargetObjectMetadataUniversalIdentifier: d.relationTargetObjectMetadataUniversalIdentifier ?? null, relationTargetFieldMetadataUniversalIdentifier: d.relationTargetFieldMetadataUniversalIdentifier ?? null })) as any;
  out.flatIndexMaps = merge(out.flatIndexMaps, source.indexes as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now, (d) => ({ objectMetadataUniversalIdentifier: d.objectUniversalIdentifier, universalFlatIndexFieldMetadatas: (d.fields ?? []).map((f: AnyDeclaration) => ({ indexMetadataUniversalIdentifier: d.universalIdentifier, fieldMetadataUniversalIdentifier: f.fieldUniversalIdentifier })) }));
  out.flatViewMaps = merge(out.flatViewMaps, source.views as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now, (d) => ({ objectMetadataUniversalIdentifier: d.objectUniversalIdentifier })) as any;
  const viewFields = source.views.flatMap((view) => (view.fields ?? []).map((field: AnyDeclaration) => ({ ...field, viewUniversalIdentifier: view.universalIdentifier })));
  const viewFilters = source.views.flatMap((view) => (view.filters ?? []).map((filter: AnyDeclaration) => ({ ...filter, viewUniversalIdentifier: view.universalIdentifier })));
  out.flatViewFieldMaps = merge(out.flatViewFieldMaps, viewFields as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now) as any;
  out.flatViewFilterMaps = merge(out.flatViewFilterMaps, viewFilters as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now) as any;
  out.flatNavigationMenuItemMaps = merge(out.flatNavigationMenuItemMaps, source.nav as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now, (d) => ({ viewUniversalIdentifier: d.viewUniversalIdentifier ?? null })) as any;
  out.flatPageLayoutMaps = merge(out.flatPageLayoutMaps, source.layouts as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now) as any;
  const tabs = (source.layouts as readonly AnyDeclaration[]).flatMap((layout) => (layout.tabs ?? []).map((tab: AnyDeclaration) => ({ ...tab, pageLayoutUniversalIdentifier: layout.universalIdentifier })));
  const widgets = tabs.flatMap((tab: AnyDeclaration) => (tab.widgets ?? []).map((widget: AnyDeclaration) => ({ ...widget, pageLayoutTabUniversalIdentifier: tab.universalIdentifier })));
  out.flatPageLayoutTabMaps = merge(out.flatPageLayoutTabMaps, tabs, twentyStandardApplicationId, workspaceId, now) as any;
  out.flatPageLayoutWidgetMaps = merge(out.flatPageLayoutWidgetMaps, widgets, twentyStandardApplicationId, workspaceId, now, (d) => ({ objectMetadataUniversalIdentifier: d.objectMetadataUniversalIdentifier ?? null })) as any;
  out.flatRoleMaps = merge(out.flatRoleMaps, source.roles as unknown as AnyDeclaration[], twentyStandardApplicationId, workspaceId, now) as any;
  return out;
};

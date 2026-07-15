import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Declaration = { universalIdentifier?: string; objectUniversalIdentifier?: string; fields?: Declaration[]; tabs?: Declaration[]; widgets?: Declaration[]; fieldUniversalIdentifier?: string };
const root = resolve(__dirname, '../../../../../../../../');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const ids = (paths: readonly string[]) => [...new Set(paths.flatMap((path) => read(path).match(uuid) ?? []))];
const files = (folder: string, names: readonly string[]) => names.map((name) => `${folder}/${name}`);
const brand = 'packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp/src';
const creatorOps = 'packages/twenty-apps/internal/myah-creator-ops/src';
const objectFiles = [...files(`${brand}/objects`, ['brand-brain-link.object.ts', 'brand-brain-page.object.ts', 'brand-brain-update-proposal.object.ts']), ...files(`${creatorOps}/objects`, ['offer.object.ts', 'outreach-action.object.ts', 'outreach-sequence.object.ts', 'outreach-step.object.ts', 'promoted-asset.object.ts', 'campaign-creator.object.ts', 'campaign.object.ts', 'creator-list-member.object.ts', 'creator-list.object.ts', 'creator.object.ts'])];
const fieldFiles = files(`${brand}/fields`, ['target-page-links-on-brand-brain-page.field.ts', 'target-page-on-brand-brain-link.field.ts', 'target-page-on-brand-brain-update-proposal.field.ts', 'update-proposals-on-brand-brain-page.field.ts', 'child-pages-on-brand-brain-page.field.ts', 'parent-page-on-brand-brain-page.field.ts', 'source-page-links-on-brand-brain-page.field.ts', 'source-page-on-brand-brain-link.field.ts']);
const viewFiles = [...files(`${brand}/views`, ['brand-brain-page-record-page-fields.view.ts', 'pending-brand-brain-proposals.view.ts', 'all-brand-brain-pages.view.ts']), ...files(`${creatorOps}/views`, ['campaigns.view.ts', 'creator-lists.view.ts', 'creators.view.ts'])];
const indexFiles = [`${brand}/indexes/brand-brain-page-canonical-path.index.ts`];
const navFiles = [ `${brand}/navigation-menu-items/brand-brain-pages.navigation-menu-item.ts`, ...files(`${creatorOps}/navigation-menu-items`, ['campaigns.navigation-menu-item.ts', 'creator-lists.navigation-menu-item.ts', 'creators.navigation-menu-item.ts'])];
const layoutFiles = [`${brand}/page-layouts/brand-brain-page-record-page.page-layout.ts`];
const roleFiles = [`${brand}/roles/brand-brain-admin.role.ts`];
const constants = [`${creatorOps}/constants/universal-identifiers.ts`, `${creatorOps}/constants/creator-field-universal-identifiers.ts`];
const all = (paths: readonly string[]) => ids(paths);
const constantsText = constants.map(read).join('\n');
const namedConstants = (suffix: string) => [...constantsText.matchAll(new RegExp(`([A-Z0-9_]+${suffix})\\s*=\\s*['\\"](${uuid.source})['\\"]`, 'g'))].map((match) => match[2]);
const objectIds = [...new Set([...namedConstants('OBJECT_UNIVERSAL_IDENTIFIER'), ...objectFiles.map((path) => read(path).match(uuid)?.[0]).filter((id): id is string => Boolean(id))])];
const fieldIds = [...new Set([...namedConstants('FIELD_UNIVERSAL_IDENTIFIER'), ...all(objectFiles), ...all(fieldFiles)])].filter((id) => !objectIds.includes(id));
const viewIds = all(viewFiles);
const viewFieldIds = viewFiles.flatMap((path) => [...read(path).matchAll(/universalIdentifier:\s*['\"]([0-9a-f-]{36})['\"]/gi)].map((match) => match[1])).filter((id, index, values) => values.indexOf(id) !== index || !viewIds.includes(id));
const indexIds = [all(indexFiles)[0]];
const layoutIds = all(layoutFiles);
const layoutTabIds = layoutIds.slice(1, 4);
const layoutWidgetIds = layoutIds.slice(4);
export type RelationContract = Readonly<{ sourceField: string; sourceObject: string; targetObject: string; targetField: string }>;
export type MyahStandardMetadataContract = Readonly<{ [key: string]: unknown; relations: readonly RelationContract[]; canonicalPathIndex: Readonly<{ index: string; object: string; indexField: string; field: string }> }>;
export const buildMyahStandardMetadataContract = (): MyahStandardMetadataContract => ({
  flatObjectMetadataMaps: objectIds, flatFieldMetadataMaps: fieldIds, flatIndexMaps: indexIds, flatSearchFieldMetadataMaps: [], flatViewMaps: viewIds, flatViewGroupMaps: [], flatViewFilterMaps: [], flatViewFieldGroupMaps: [], flatViewFieldMaps: viewFieldIds, flatRoleMetadataMaps: all(roleFiles), flatPermissionFlagMaps: [], flatAgentMaps: [], flatSkillMaps: [], flatPageLayoutMaps: [layoutIds[0]], flatPageLayoutTabMaps: layoutTabIds, flatPageLayoutWidgetMaps: layoutWidgetIds, flatNavigationMenuItemMaps: all(navFiles), flatCommandMenuItemMaps: [], relations: [], canonicalPathIndex: { index: 'b75fa72e-7365-4da0-a910-b6ef96f306c2', object: '6a8289d7-8034-4f70-b3fa-47bc0e52828f', indexField: '30cf8266-372a-44b7-bdf5-f1188b168d6a', field: '4452d201-44a5-46fc-bf11-e26fa85cc3b2' },
});

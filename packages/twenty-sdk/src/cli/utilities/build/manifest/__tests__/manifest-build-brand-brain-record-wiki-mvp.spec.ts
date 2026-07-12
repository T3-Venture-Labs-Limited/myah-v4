import { resolve } from 'path';

import { buildManifest } from '@/cli/utilities/build/manifest/manifest-build';
import { FieldType, RelationType } from '@/sdk/define';
import type {
  FieldManifest,
  LogicFunctionManifest,
  ObjectManifest,
  PageLayoutManifest,
  RoleManifest,
  ViewFieldManifest,
  ViewManifest,
} from 'twenty-shared/application';

const UUID_REGEX = /^[0-9a-f-]{36}$/;

const BRAND_BRAIN_RECORD_WIKI_MVP_APP_PATH = resolve(
  __dirname,
  '../../../../../../../twenty-apps/fixtures/brand-brain-record-wiki-mvp',
);

describe('buildManifest for Brand Brain record-backed wiki MVP', () => {
  it('models a simplified agentic Brand Brain with pages, hierarchy, backlinks, and usable views', async () => {
    const { manifest, errors } = await buildManifest(
      BRAND_BRAIN_RECORD_WIKI_MVP_APP_PATH,
    );

    expect(errors).toEqual([]);
    expect(manifest).not.toBeNull();

    const objectNames = manifest?.objects.map(
      (object: ObjectManifest) => object.nameSingular,
    );

    expect(objectNames).toEqual(
      expect.arrayContaining(['brandBrainPage', 'brandBrainLink']),
    );

    const brandBrainPage = manifest?.objects.find(
      (object: ObjectManifest) => object.nameSingular === 'brandBrainPage',
    );
    const brandBrainLink = manifest?.objects.find(
      (object: ObjectManifest) => object.nameSingular === 'brandBrainLink',
    );
    const brandBrainUpdateProposal = manifest?.objects.find(
      (object: ObjectManifest) =>
        object.nameSingular === 'brandBrainUpdateProposal',
    );
    expect(brandBrainUpdateProposal).toBeDefined();

    const brandBrainPageFields = brandBrainPage?.fields ?? [];
    const brandBrainPageFieldNames = brandBrainPageFields.map(
      (field: FieldManifest) => field.name,
    );

    expect(brandBrainPageFieldNames).toEqual(
      expect.arrayContaining([
        'title',
        'slug',
        'canonicalPath',
        'idPath',
        'pageType',
        'status',
        'body',
        'summary',
        'tags',
        'sortOrder',
        'aliases',
      ]),
    );

    expect(brandBrainPageFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'body',
          type: FieldType.RICH_TEXT,
        }),
        expect.objectContaining({
          name: 'canonicalPath',
          type: FieldType.TEXT,
        }),
        expect.objectContaining({
          name: 'pageType',
          options: expect.arrayContaining([
            expect.objectContaining({ value: 'INDEX' }),
            expect.objectContaining({ value: 'LOG' }),
          ]),
        }),
      ]),
    );

    const relationFields = manifest?.fields ?? [];

    expect(relationFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'parentPage',
          objectUniversalIdentifier: brandBrainPage?.universalIdentifier,
          isNullable: true,
          universalSettings: expect.objectContaining({
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'parentPageId',
          }),
        }),
        expect.objectContaining({
          name: 'childPages',
          objectUniversalIdentifier: brandBrainPage?.universalIdentifier,
          universalSettings: expect.objectContaining({
            relationType: RelationType.ONE_TO_MANY,
          }),
        }),
        expect.objectContaining({
          name: 'sourcePage',
          objectUniversalIdentifier: brandBrainLink?.universalIdentifier,
          universalSettings: expect.objectContaining({
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'sourcePageId',
          }),
        }),
        expect.objectContaining({
          name: 'targetPage',
          objectUniversalIdentifier: brandBrainLink?.universalIdentifier,
          universalSettings: expect.objectContaining({
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'targetPageId',
          }),
        }),
        expect.objectContaining({
          name: 'targetPage',
          objectUniversalIdentifier:
            brandBrainUpdateProposal?.universalIdentifier,
          isNullable: true,
          universalSettings: expect.objectContaining({
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: 'targetPageId',
          }),
        }),
        expect.objectContaining({
          name: 'updateProposals',
          objectUniversalIdentifier: brandBrainPage?.universalIdentifier,
          universalSettings: expect.objectContaining({
            relationType: RelationType.ONE_TO_MANY,
          }),
        }),
      ]),
    );

    expect(manifest?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectUniversalIdentifier: brandBrainPage?.universalIdentifier,
          fields: expect.arrayContaining([
            expect.objectContaining({
              fieldUniversalIdentifier: expect.stringMatching(UUID_REGEX),
            }),
          ]),
        }),
      ]),
    );

    const brandBrainLinkFieldNames = brandBrainLink?.fields.map(
      (field: FieldManifest) => field.name,
    );

    expect(brandBrainLinkFieldNames).toEqual(
      expect.arrayContaining(['name', 'linkType', 'description']),
    );

    expect(manifest?.views.map((view: ViewManifest) => view.name)).toEqual(
      expect.arrayContaining([
        'All Brand Brain',
        'Brand Brain Page Record Fields',
      ]),
    );
    expect(manifest?.views.map((view: ViewManifest) => view.name)).not.toEqual(
      expect.arrayContaining(['Brand Brain Index']),
    );
    expect(manifest?.views.map((view: ViewManifest) => view.name)).toEqual(
      expect.arrayContaining(['Pending Brand Brain Proposals']),
    );

    const allBrandBrainView = manifest?.views.find(
      (view: ViewManifest) => view.name === 'All Brand Brain',
    );
    const recordFieldsView = manifest?.views.find(
      (view: ViewManifest) => view.name === 'Brand Brain Page Record Fields',
    );
    const statusField = brandBrainPage?.fields.find(
      (field: FieldManifest) => field.name === 'status',
    );

    expect(statusField).toBeDefined();
    for (const userFacingView of [allBrandBrainView, recordFieldsView]) {
      expect(
        userFacingView?.fields?.map(
          (field: ViewFieldManifest) => field.fieldMetadataUniversalIdentifier,
        ),
      ).not.toContain(statusField?.universalIdentifier);
    }

    expect(
      recordFieldsView?.fields?.map(
        (field: ViewFieldManifest) => field.fieldMetadataUniversalIdentifier,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ]),
    );
    const recordFieldUniversalIdentifiers = recordFieldsView?.fields?.map(
      (field: ViewFieldManifest) => field.fieldMetadataUniversalIdentifier,
    );
    const updateProposalsRelation = relationFields.find(
      (field: FieldManifest) => field.name === 'updateProposals',
    );

    expect(recordFieldsView?.fields?.length).toBeGreaterThanOrEqual(11);
    expect(recordFieldUniversalIdentifiers).not.toContain(
      updateProposalsRelation?.universalIdentifier,
    );

    expect(manifest?.navigationMenuItems.length).toBe(1);
    expect(manifest?.navigationMenuItems[0]).toEqual(
      expect.objectContaining({
        targetObjectUniversalIdentifier: brandBrainPage?.universalIdentifier,
      }),
    );
    expect(
      manifest?.pageLayouts.map(
        (pageLayout: PageLayoutManifest) => pageLayout.name,
      ),
    ).toEqual(expect.arrayContaining(['Brand Brain Page Record Page']));
    expect(manifest?.roles.map((role: RoleManifest) => role.label)).toEqual(
      expect.arrayContaining(['Brand Brain Admin']),
    );

    const brandBrainAdminRole = manifest?.roles.find(
      (role: RoleManifest) => role.label === 'Brand Brain Admin',
    );

    expect(brandBrainAdminRole).toEqual(
      expect.objectContaining({
        canReadAllObjectRecords: false,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
      }),
    );
    expect(brandBrainAdminRole?.objectPermissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectUniversalIdentifier: brandBrainPage?.universalIdentifier,
          canReadObjectRecords: true,
          canUpdateObjectRecords: true,
          canSoftDeleteObjectRecords: true,
          canDestroyObjectRecords: false,
        }),
        expect.objectContaining({
          objectUniversalIdentifier: brandBrainLink?.universalIdentifier,
          canReadObjectRecords: true,
          canUpdateObjectRecords: true,
          canSoftDeleteObjectRecords: true,
          canDestroyObjectRecords: false,
        }),
      ]),
    );
    expect(brandBrainAdminRole?.objectPermissions).toHaveLength(2);

    const logicFunctions = manifest?.logicFunctions ?? [];
    const logicFunctionNames = logicFunctions.map(
      (logicFunction: LogicFunctionManifest) => logicFunction.name,
    );

    expect(logicFunctionNames).toEqual(
      expect.arrayContaining([
        'brand-brain-seed-or-update-from-brief',
        'brand-brain-get-context',
        'brand-brain-search-or-read',
        'brand-brain-update-page-content',
      ]),
    );

    const seedTool = logicFunctions.find(
      (logicFunction: LogicFunctionManifest) =>
        logicFunction.name === 'brand-brain-seed-or-update-from-brief',
    );
    const contextTool = logicFunctions.find(
      (logicFunction: LogicFunctionManifest) =>
        logicFunction.name === 'brand-brain-get-context',
    );
    const searchOrReadTool = logicFunctions.find(
      (logicFunction: LogicFunctionManifest) =>
        logicFunction.name === 'brand-brain-search-or-read',
    );
    const updatePageContentTool = logicFunctions.find(
      (logicFunction: LogicFunctionManifest) =>
        logicFunction.name === 'brand-brain-update-page-content',
    );

    expect(seedTool).toEqual(
      expect.objectContaining({
        sourceHandlerPath:
          'src/logic-functions/brand-brain-seed-or-update-from-brief.function.ts',
        toolTriggerSettings: expect.objectContaining({
          inputSchema: expect.objectContaining({
            type: 'object',
            required: expect.arrayContaining(['brandName', 'actor']),
          }),
        }),
      }),
    );
    expect(contextTool).toEqual(
      expect.objectContaining({
        sourceHandlerPath:
          'src/logic-functions/brand-brain-get-context.function.ts',
        toolTriggerSettings: expect.objectContaining({
          inputSchema: expect.objectContaining({
            type: 'object',
            required: expect.arrayContaining(['brandNameOrSlug']),
          }),
        }),
      }),
    );
    expect(searchOrReadTool).toEqual(
      expect.objectContaining({
        sourceHandlerPath:
          'src/logic-functions/brand-brain-search-or-read.function.ts',
        toolTriggerSettings: expect.objectContaining({
          inputSchema: expect.objectContaining({
            type: 'object',
            required: expect.arrayContaining(['brandNameOrSlug']),
          }),
        }),
      }),
    );
    expect(updatePageContentTool).toEqual(
      expect.objectContaining({
        sourceHandlerPath:
          'src/logic-functions/brand-brain-update-page-content.function.ts',
        toolTriggerSettings: expect.objectContaining({
          inputSchema: expect.objectContaining({
            type: 'object',
            required: expect.arrayContaining([
              'brandNameOrSlug',
              'canonicalPath',
              'appendMarkdown',
              'actor',
            ]),
          }),
        }),
      }),
    );
  }, 60000);
});

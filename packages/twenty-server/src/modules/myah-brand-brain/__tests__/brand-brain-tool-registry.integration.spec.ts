import { BrandBrainToolProvider } from 'src/engine/core-modules/tool-provider/providers/brand-brain-tool.provider';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MyahBrandBrainStoreService } from 'src/modules/myah-brand-brain/services/myah-brand-brain-store.service';
import { MyahBrandBrainWorkspaceService } from 'src/modules/myah-brand-brain/services/myah-brand-brain.workspace-service';

type StoredRecord = {
  id: string;
  canonicalPath?: string;
  body?: { markdown?: string | null };
  [key: string]: unknown;
};

const createRepository = (records: StoredRecord[]) => ({
  find: jest.fn().mockImplementation(async () => records),
  create: jest.fn((input: StoredRecord) => ({
    ...input,
    id: input.id ?? `record-${records.length + 1}`,
  })),
  save: jest.fn(async (record: StoredRecord) => {
    const existingIndex = records.findIndex(({ id }) => id === record.id);

    if (existingIndex === -1) {
      records.push(record);

      return record;
    }

    const savedRecord = { ...records[existingIndex], ...record };

    records[existingIndex] = savedRecord;

    return savedRecord;
  }),
});

describe('Brand Brain public tool provider journey', () => {
  it('seeds and non-destructively updates Brand Brain through public descriptors', async () => {
    const pages: StoredRecord[] = [];
    const links: StoredRecord[] = [];
    const pageRepository = createRepository(pages);
    const linkRepository = createRepository(links);
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
      getRepository: jest.fn(
        async (_workspaceId: string, objectMetadataName: string) =>
          objectMetadataName === 'brandBrainPage'
            ? pageRepository
            : linkRepository,
      ),
    } as unknown as GlobalWorkspaceOrmManager;
    const storeService = new MyahBrandBrainStoreService(
      globalWorkspaceOrmManager,
    );
    const workspaceService = new MyahBrandBrainWorkspaceService(storeService);
    const provider = new BrandBrainToolProvider(workspaceService);
    const context = {
      workspaceId: 'workspace-id',
      roleId: 'role-id',
      rolePermissionConfig: { unionOf: ['role-id'] },
    };
    const descriptors = await provider.generateDescriptors(context, {
      includeSchemas: true,
    });
    const executePublicTool = async (
      publicToolName: string,
      args: Record<string, unknown>,
    ) => {
      const descriptor = descriptors.find(
        ({ name }) => name === publicToolName,
      );

      if (!descriptor || descriptor.executionRef.kind !== 'static') {
        throw new Error(`Public Brand Brain tool not found: ${publicToolName}`);
      }

      return provider.executeStaticTool(
        descriptor.executionRef.toolId,
        args,
        context,
      );
    };

    const seeded = await executePublicTool(
      'app_brand_brain_seed_or_update_from_brief',
      {
        brandName: 'Lash Glow',
        primaryOffer: 'Lash serum',
        contentGuidelines: 'Use a calm, expert voice.',
        products: [
          {
            name: 'Lash serum',
            description: 'Our hero product.',
          },
        ],
        sourceNotes: [
          {
            label: 'Founder brief',
            sourceType: 'user-provided',
            excerpt: 'Use this tone for creator campaigns.',
            informedPaths: ['lash-glow/content-guidelines'],
            confidence: 'high',
          },
        ],
        actor: 'agent',
        occurredAt: '2026-07-15',
      },
    );

    expect(seeded).toMatchObject({
      brandSlug: 'lash-glow',
      pagesCreated: expect.any(Number),
      linksCreated: expect.any(Number),
      logAppended: true,
    });
    expect(links).not.toHaveLength(0);

    const updated = await executePublicTool(
      'app_brand_brain_update_page_content',
      {
        brandNameOrSlug: 'Lash Glow',
        canonicalPath: 'content-guidelines',
        appendMarkdown: 'Use short, direct sentences in paid social copy.',
        actor: 'agent',
        occurredAt: '2026-07-15',
      },
    );

    expect(updated).toMatchObject({ updated: true, logAppended: true });
    expect(
      pages.find(
        ({ canonicalPath }) => canonicalPath === 'lash-glow/content-guidelines',
      )?.body?.markdown,
    ).toContain('Use short, direct sentences in paid social copy.');
    expect(
      pages.find(({ canonicalPath }) => canonicalPath === 'lash-glow/log')?.body
        ?.markdown,
    ).toContain('Updated lash-glow/content-guidelines');
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workspace-id',
      'brandBrainPage',
      { unionOf: ['role-id'] },
    );
  });
});

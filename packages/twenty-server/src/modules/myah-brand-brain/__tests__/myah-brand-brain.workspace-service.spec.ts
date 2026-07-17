import { Test } from '@nestjs/testing';

import { z } from 'zod';

import { MyahBrandBrainStoreService } from 'src/modules/myah-brand-brain/services/myah-brand-brain-store.service';
import { MyahBrandBrainWorkspaceService } from 'src/modules/myah-brand-brain/services/myah-brand-brain.workspace-service';

describe('MyahBrandBrainWorkspaceService', () => {
  it('generates the four source-compatible Brand Brain tool descriptors', () => {
    const createStore = jest.fn();
    const service = new MyahBrandBrainWorkspaceService({
      createStore,
    } as never);

    const tools = service.generateBrandBrainTools({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });

    expect(Object.keys(tools)).toEqual([
      'brand-brain-get-context',
      'brand-brain-search-or-read',
      'brand-brain-seed-or-update-from-brief',
      'brand-brain-update-page-content',
    ]);
  });

  it('resolves its workspace store dependency through Nest', async () => {
    const createStore = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        MyahBrandBrainWorkspaceService,
        {
          provide: MyahBrandBrainStoreService,
          useValue: { createStore },
        },
      ],
    }).compile();
    const service = module.get(MyahBrandBrainWorkspaceService);

    service.generateBrandBrainTools({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });

    expect(createStore).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
  });
  it('preserves the published search and section-read inputs', () => {
    const service = new MyahBrandBrainWorkspaceService({
      createStore: jest.fn(),
    } as never);
    const tools = service.generateBrandBrainTools({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    const schema = tools['brand-brain-search-or-read']
      ?.inputSchema as z.ZodType;
    const result = schema.safeParse({
      brandNameOrSlug: 'Lash Glow',
      canonicalPath: 'content-guidelines',
      sectionHeading: 'Voice',
      maxResults: 3,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        sectionHeading: 'Voice',
        maxResults: 3,
      }),
    );
  });

  it('preserves published source types and social display labels', () => {
    const service = new MyahBrandBrainWorkspaceService({
      createStore: jest.fn(),
    } as never);
    const tools = service.generateBrandBrainTools({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    const schema = tools['brand-brain-seed-or-update-from-brief']
      ?.inputSchema as z.ZodType;
    const result = schema.safeParse({
      brandName: 'Lash Glow',
      actor: 'agent',
      socialChannels: [
        {
          platform: 'Instagram',
          value: '@lashglow',
          displayLabel: 'Lash Glow on Instagram',
        },
      ],
      sourceNotes: [
        'user-provided',
        'website',
        'shopify',
        'instagram',
        'x-twitter',
        'tiktok',
        'youtube',
        'other',
      ].map((sourceType) => ({
        label: `${sourceType} source`,
        sourceType,
        capturedAt: '2026-07-17',
      })),
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        socialChannels: [
          expect.objectContaining({
            displayLabel: 'Lash Glow on Instagram',
          }),
        ],
      }),
    );
  });

  it('requires audit provenance while allowing occurredAt to default', () => {
    const service = new MyahBrandBrainWorkspaceService({
      createStore: jest.fn(),
    } as never);
    const tools = service.generateBrandBrainTools({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    const schema = tools['brand-brain-seed-or-update-from-brief']
      ?.inputSchema as z.ZodType;

    expect(
      schema.safeParse({
        brandName: 'Lash Glow',
        sourceNotes: [
          {
            label: 'Founder brief',
            sourceType: 'user-provided',
            capturedAt: '2026-07-17',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        brandName: 'Lash Glow',
        actor: 'agent',
        sourceNotes: [
          {
            label: 'Founder brief',
            sourceType: 'user-provided',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        brandName: 'Lash Glow',
        actor: 'agent',
        sourceNotes: [
          {
            label: 'Founder brief',
            sourceType: 'user-provided',
            capturedAt: '2026-07-17',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

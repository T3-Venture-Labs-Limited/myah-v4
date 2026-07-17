import { Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { z } from 'zod';

import type { RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { MyahBrandBrainStoreService } from 'src/modules/myah-brand-brain/services/myah-brand-brain-store.service';
import {
  getBrandBrainContext,
  searchOrReadBrandBrain,
  seedOrUpdateBrandBrainFromBrief,
  updateBrandBrainPageContent,
} from 'src/modules/myah-brand-brain/utils/brand-brain-agent-tools.util';

const brandBrainSeedInputSchema = z.object({
  brandName: z.string(),
  websiteUrl: z.string().optional(),
  whatItIs: z.string().optional(),
  primaryOffer: z.string().optional(),
  audience: z.string().optional(),
  positioning: z.string().optional(),
  contentGuidelines: z.string().optional(),
  products: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        url: z.string().optional(),
        price: z.string().optional(),
      }),
    )
    .optional(),
  socialChannels: z
    .array(
      z.object({
        platform: z.string(),
        value: z.string(),
        displayLabel: z.string().optional(),
      }),
    )
    .optional(),
  sourceNotes: z
    .array(
      z.object({
        label: z.string(),
        sourceType: z.enum([
          'user-provided',
          'website',
          'shopify',
          'instagram',
          'x-twitter',
          'tiktok',
          'youtube',
          'other',
        ]),
        sourceUrl: z.string().optional(),
        capturedAt: z.string(),
        excerpt: z.string().optional(),
        informedPaths: z.array(z.string()).optional(),
        confidence: z.enum(['low', 'medium', 'high']).optional(),
      }),
    )
    .optional(),
  actor: z.string(),
  occurredAt: z.string().optional(),
});
@Injectable()
export class MyahBrandBrainWorkspaceService {
  constructor(private readonly storeFactory: MyahBrandBrainStoreService) {}

  generateBrandBrainTools({
    workspaceId,
    rolePermissionConfig,
  }: {
    workspaceId: string;
    rolePermissionConfig: RolePermissionConfig;
  }): ToolSet {
    const store = this.storeFactory.createStore({
      workspaceId,
      rolePermissionConfig,
    });

    return {
      'brand-brain-get-context': {
        description: 'Read a compact Brand Brain context pack for a brand.',
        inputSchema: z.object({
          brandNameOrSlug: z.string(),
          task: z.string().optional(),
        }),
        execute: ({ brandNameOrSlug, task }) =>
          getBrandBrainContext({ brandNameOrSlug, task, store }),
      },
      'brand-brain-search-or-read': {
        description:
          'Search or read specific Brand Brain pages and markdown sections.',
        inputSchema: z.object({
          brandNameOrSlug: z.string(),
          canonicalPath: z.string().optional(),
          sectionHeading: z.string().optional(),
          query: z.string().optional(),
          maxResults: z.number().max(10).optional(),
        }),
        execute: (input) => searchOrReadBrandBrain({ ...input, store }),
      },
      'brand-brain-seed-or-update-from-brief': {
        description:
          'Seed missing Brand Brain pages from a brand brief without overwriting useful existing content.',
        inputSchema: brandBrainSeedInputSchema,
        execute: (input) =>
          seedOrUpdateBrandBrainFromBrief({
            input: {
              ...input,
              occurredAt:
                input.occurredAt ?? new Date().toISOString().slice(0, 10),
            },
            store,
          }),
      },
      'brand-brain-update-page-content': {
        description:
          'Append a targeted, non-destructive update to a specific Myah Brand Brain page and log the change.',
        inputSchema: z.object({
          brandNameOrSlug: z.string(),
          canonicalPath: z.string(),
          appendMarkdown: z.string(),
          actor: z.string(),
          occurredAt: z.string().optional(),
          reason: z.string().optional(),
        }),
        execute: (input) =>
          updateBrandBrainPageContent({
            input: {
              ...input,
              occurredAt:
                input.occurredAt ?? new Date().toISOString().slice(0, 10),
            },
            store,
          }),
      },
    } as ToolSet;
  }
}

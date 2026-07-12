import { defineLogicFunction } from 'twenty-sdk/define';

import { type BrandBrainSeedInput } from 'src/utils/brand-brain-agent-memory.util';
import { seedOrUpdateBrandBrainFromBrief } from 'src/utils/brand-brain-agent-tools.util';
import { createBrandBrainRuntimeStore } from 'src/utils/brand-brain-runtime-store.util';

const handler = async (
  params: Omit<BrandBrainSeedInput, 'occurredAt'> & {
    occurredAt?: string;
  },
) => {
  const input: BrandBrainSeedInput = {
    ...params,
    occurredAt: params.occurredAt ?? new Date().toISOString().slice(0, 10),
  };

  return seedOrUpdateBrandBrainFromBrief({
    input,
    store: createBrandBrainRuntimeStore(),
  });
};

export default defineLogicFunction({
  universalIdentifier: 'dd35dca1-92fd-44ed-b7f8-17d39586ce41',
  name: 'brand-brain-seed-or-update-from-brief',
  description:
    'Seed or update Myah Brand Brain records from a structured brand brief. Use before/after onboarding durable brand business context.',
  timeoutSeconds: 30,
  handler,
  toolTriggerSettings: {
    inputSchema: {
      type: 'object',
      properties: {
        brandName: {
          type: 'string',
          description: 'Brand name to seed or update in Brand Brain.',
        },
        websiteUrl: { type: 'string' },
        whatItIs: { type: 'string' },
        primaryOffer: { type: 'string' },
        audience: { type: 'string' },
        positioning: { type: 'string' },
        contentGuidelines: { type: 'string' },
        products: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              url: { type: 'string' },
              price: { type: 'string' },
            },
            required: ['name'],
          },
        },
        socialChannels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string' },
              value: { type: 'string' },
              displayLabel: { type: 'string' },
            },
            required: ['platform', 'value'],
          },
        },
        sourceNotes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              sourceType: {
                type: 'string',
                enum: [
                  'user-provided',
                  'website',
                  'shopify',
                  'instagram',
                  'x-twitter',
                  'tiktok',
                  'youtube',
                  'other',
                ],
              },
              sourceUrl: { type: 'string' },
              capturedAt: { type: 'string' },
              excerpt: { type: 'string' },
              informedPaths: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['label', 'sourceType', 'capturedAt'],
          },
        },
        actor: {
          type: 'string',
          description: 'Agent or system actor making the Brand Brain write.',
        },
        occurredAt: { type: 'string' },
      },
      required: ['brandName', 'actor'],
    },
  },
});

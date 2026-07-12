import { defineLogicFunction } from 'twenty-sdk/define';

import {
  type BrandBrainUpdatePageContentInput,
  updateBrandBrainPageContent,
} from 'src/utils/brand-brain-agent-tools.util';
import { createBrandBrainRuntimeStore } from 'src/utils/brand-brain-runtime-store.util';

const handler = async (
  params: Omit<BrandBrainUpdatePageContentInput, 'occurredAt'> & {
    occurredAt?: string;
  },
) =>
  updateBrandBrainPageContent({
    input: {
      ...params,
      occurredAt: params.occurredAt ?? new Date().toISOString().slice(0, 10),
    },
    store: createBrandBrainRuntimeStore(),
  });

export default defineLogicFunction({
  universalIdentifier: 'b9a8413e-7379-4b81-aee0-5549ddb0b922',
  name: 'brand-brain-update-page-content',
  description:
    'Append a targeted, non-destructive update to a specific Myah Brand Brain page and log the change.',
  timeoutSeconds: 15,
  handler,
  toolTriggerSettings: {
    inputSchema: {
      type: 'object',
      properties: {
        brandNameOrSlug: {
          type: 'string',
          description: 'Brand name or canonical Brand Brain slug.',
        },
        canonicalPath: {
          type: 'string',
          description:
            'Exact Brand Brain page path to update. Relative paths are scoped under the brand slug.',
        },
        appendMarkdown: {
          type: 'string',
          description:
            'Markdown fact/rule/section to append if it is not already present.',
        },
        actor: {
          type: 'string',
          description: 'Agent or system actor making the Brand Brain update.',
        },
        occurredAt: { type: 'string' },
        reason: {
          type: 'string',
          description: 'Optional reason/provenance for the update log entry.',
        },
      },
      required: ['brandNameOrSlug', 'canonicalPath', 'appendMarkdown', 'actor'],
    },
  },
});

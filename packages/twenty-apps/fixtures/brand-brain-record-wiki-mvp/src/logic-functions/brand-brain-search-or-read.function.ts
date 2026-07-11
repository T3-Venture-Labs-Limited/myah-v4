import { defineLogicFunction } from 'twenty-sdk/define';

import {
  type BrandBrainSearchOrReadInput,
  searchOrReadBrandBrain,
} from 'src/utils/brand-brain-agent-tools.util';
import { createBrandBrainRuntimeStore } from 'src/utils/brand-brain-runtime-store.util';

const handler = async (params: BrandBrainSearchOrReadInput) =>
  searchOrReadBrandBrain({
    input: params,
    store: createBrandBrainRuntimeStore(),
  });

export default defineLogicFunction({
  universalIdentifier: 'fdda0461-3f58-4438-8468-cf7340aecfa7',
  name: 'brand-brain-search-or-read',
  description:
    'Search or read specific Myah Brand Brain pages/sections when compact context is insufficient, especially for large wiki pages.',
  timeoutSeconds: 15,
  handler,
  toolTriggerSettings: {
    inputSchema: {
      type: 'object',
      properties: {
        brandNameOrSlug: {
          type: 'string',
          description: 'Brand name or canonical Brand Brain slug to search/read.',
        },
        canonicalPath: {
          type: 'string',
          description:
            'Optional exact Brand Brain path to read. Relative paths are scoped under the brand slug.',
        },
        sectionHeading: {
          type: 'string',
          description:
            'Optional exact markdown section heading to read within canonicalPath.',
        },
        query: {
          type: 'string',
          description:
            'Optional search query. Searches page bodies/sections, not just summaries.',
        },
        maxResults: {
          type: 'number',
          maximum: 10,
          description: 'Maximum number of matching pages/sections to return.',
        },
      },
      required: ['brandNameOrSlug'],
    },
  },
});

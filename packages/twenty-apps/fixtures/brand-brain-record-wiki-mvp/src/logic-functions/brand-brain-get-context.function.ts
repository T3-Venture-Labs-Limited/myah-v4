import { defineLogicFunction } from 'twenty-sdk/define';

import { getBrandBrainContext } from 'src/utils/brand-brain-agent-tools.util';
import { createBrandBrainRuntimeStore } from 'src/utils/brand-brain-runtime-store.util';

const handler = async (params: { brandNameOrSlug: string; task?: string }) =>
  getBrandBrainContext({
    brandNameOrSlug: params.brandNameOrSlug,
    task: params.task,
    store: createBrandBrainRuntimeStore(),
  });

export default defineLogicFunction({
  universalIdentifier: 'f4960b34-0638-499d-a189-f740c51e7216',
  name: 'brand-brain-get-context',
  description:
    'Read Myah Brand Brain records and return a compact context pack before doing brand-specific work.',
  timeoutSeconds: 15,
  handler,
  toolTriggerSettings: {
    inputSchema: {
      type: 'object',
      properties: {
        brandNameOrSlug: {
          type: 'string',
          description: 'Brand name or canonical Brand Brain slug to read.',
        },
        task: {
          type: 'string',
          description:
            'Optional task the agent is about to perform, used to label the context pack.',
        },
      },
      required: ['brandNameOrSlug'],
    },
  },
});

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { isWorkflowRelatedObject } from 'src/engine/metadata-modules/ai/ai-agent/utils/is-workflow-related-object.util';

const RETIRED_AGENT_OBJECT_UNIVERSAL_IDENTIFIERS = new Set<string>([
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
]);

type FlatObjectWithActivityAndIdentifier = {
  isActive: boolean;
  universalIdentifier: string;
};

export const getDatabaseCrudToolFlatObjects = <
  T extends FlatObjectWithActivityAndIdentifier,
>(
  byUniversalIdentifier: Partial<Record<string, T>>,
): T[] => {
  return Object.values(byUniversalIdentifier)
    .filter(isDefined)
    .filter(
      (obj) =>
        obj.isActive &&
        !isWorkflowRelatedObject(obj) &&
        !RETIRED_AGENT_OBJECT_UNIVERSAL_IDENTIFIERS.has(
          obj.universalIdentifier,
        ),
    );
};

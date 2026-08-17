export type WorkflowToolOutreachAccessGuardTarget =
  | { type: 'agent'; id: string }
  | { type: 'logicFunction'; id: string }
  | { type: 'workflow'; id: string }
  | { type: 'workflowRun'; id: string }
  | { type: 'workflowVersion'; id: string };

const workflowTargetDefinitions: ReadonlyArray<{
  property: string;
  type: Extract<
    WorkflowToolOutreachAccessGuardTarget,
    { type: 'workflow' | 'workflowRun' | 'workflowVersion' }
  >['type'];
}> = [
  { property: 'workflowId', type: 'workflow' },
  { property: 'workflowVersionId', type: 'workflowVersion' },
  { property: 'workflowVersionIdToCopy', type: 'workflowVersion' },
  { property: 'workflowRunId', type: 'workflowRun' },
];

const resourceTargetTypes = {
  agentId: 'agent',
  logicFunctionId: 'logicFunction',
} as const;

const getStringProperty = (parameters: unknown, property: string) => {
  if (typeof parameters !== 'object' || parameters === null) {
    return undefined;
  }

  const value = (parameters as Record<string, unknown>)[property];

  return typeof value === 'string' ? value : undefined;
};

const appendResourceTargets = ({
  targets,
  value,
  visited,
}: {
  targets: WorkflowToolOutreachAccessGuardTarget[];
  value: unknown;
  visited: WeakSet<object>;
}): void => {
  if (typeof value !== 'object' || value === null || visited.has(value)) {
    return;
  }

  visited.add(value);

  for (const [property, nestedValue] of Object.entries(value)) {
    const type =
      resourceTargetTypes[property as keyof typeof resourceTargetTypes];

    if (type !== undefined && typeof nestedValue === 'string') {
      targets.push({ id: nestedValue, type });
    }

    appendResourceTargets({ targets, value: nestedValue, visited });
  }
};

export const getWorkflowToolOutreachAccessGuardTargets = (
  parameters: unknown,
): WorkflowToolOutreachAccessGuardTarget[] => {
  const targets = workflowTargetDefinitions.flatMap(({ property, type }) => {
    const id = getStringProperty(parameters, property);

    return id === undefined ? [] : [{ id, type }];
  });

  appendResourceTargets({
    targets,
    value: parameters,
    visited: new WeakSet<object>(),
  });

  return targets.filter(
    (target, index) =>
      targets.findIndex(
        (otherTarget) =>
          otherTarget.id === target.id && otherTarget.type === target.type,
      ) === index,
  );
};

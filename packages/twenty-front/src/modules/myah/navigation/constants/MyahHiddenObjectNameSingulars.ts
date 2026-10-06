import { CoreObjectNameSingular } from 'twenty-shared/types';

// Objects Myah keeps out of navigation, search and the command menu.
// Campaigns run on workflows internally; users never manage them directly
// (MYAH-460, founder decision 5 Oct 2026: hide Automations for now).
export const MYAH_HIDDEN_OBJECT_NAME_SINGULARS: readonly string[] = [
  CoreObjectNameSingular.Workflow,
  CoreObjectNameSingular.WorkflowRun,
  CoreObjectNameSingular.WorkflowVersion,
  'workflowAutomatedTrigger',
];

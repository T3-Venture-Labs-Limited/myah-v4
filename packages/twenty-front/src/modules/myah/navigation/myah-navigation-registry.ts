import {
  type MyahNavigationPageId,
  type MyahNavigationRoute,
} from '@/myah/navigation/types/MyahNavigationRoute';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import {
  IconBox,
  IconBrain,
  IconChartBar,
  IconCheckbox,
  IconCircle,
  IconFileText,
  IconHistory,
  IconInbox,
  IconLayoutDashboard,
  IconList,
  IconPlug,
  IconSearch,
  IconSend,
  IconSettingsAutomation,
  IconUsers,
  IconVersions,
  IconVideo,
} from 'twenty-ui/icon';

const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
const CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER =
  'd51f2758-055b-5367-8250-859cb3f58631';
const CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER =
  '9a09d54a-d464-5692-ac74-70527fb00ddd';
const BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER =
  '6a8289d7-8034-4f70-b3fa-47bc0e52828f';

export const MYAH_NAVIGATION_ROUTES = [
  {
    id: 'today',
    label: 'Today',
    Icon: IconLayoutDashboard,
    group: null,
    entryPath: '/myah/today',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.Dashboard,
      },
    },
  },
  {
    id: 'inbox',
    label: 'Inbox',
    Icon: IconInbox,
    group: null,
    entryPath: '/myah/inbox',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.MessageThread,
      },
    },
  },
  {
    id: 'creators',
    label: 'Creators',
    Icon: IconUsers,
    group: 'creator-crm',
    entryPath: '/myah/creators',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      },
    },
  },
  {
    id: 'creator-lists',
    label: 'Creator Lists',
    Icon: IconList,
    group: 'creator-crm',
    entryPath: '/myah/creator-lists',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
      },
    },
  },
  {
    id: 'segments',
    label: 'Segments',
    Icon: IconCircle,
    group: 'creator-crm',
    entryPath: '/myah/segments',
    availability: 'deferred',
  },
  {
    id: 'creator-discovery',
    label: 'Creator Discovery',
    Icon: IconSearch,
    group: 'creator-crm',
    entryPath: '/myah/creator-discovery',
    availability: 'soon',
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    Icon: IconSend,
    group: 'campaign-operations',
    entryPath: '/myah/campaigns',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      },
    },
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    Icon: IconBox,
    group: 'campaign-operations',
    entryPath: '/myah/deliverables',
    availability: 'soon',
  },
  {
    id: 'creator-briefs',
    label: 'Creator Briefs',
    Icon: IconFileText,
    group: 'campaign-operations',
    entryPath: '/myah/creator-briefs',
    availability: 'soon',
  },
  {
    id: 'creator-videos',
    label: 'Creator Videos',
    Icon: IconVideo,
    group: 'campaign-operations',
    entryPath: '/myah/creator-videos',
    availability: 'soon',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    Icon: IconChartBar,
    group: 'campaign-operations',
    entryPath: '/myah/analytics',
    availability: 'soon',
  },
  {
    id: 'automations',
    label: 'Automations',
    Icon: IconSettingsAutomation,
    group: 'outreach',
    entryPath: '/myah/automations',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.Workflow,
      },
    },
  },
  {
    id: 'automation-runs',
    label: 'Automation runs',
    Icon: IconHistory,
    group: 'outreach',
    entryPath: '/myah/automation-runs',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.WorkflowRun,
      },
    },
  },
  {
    id: 'automation-versions',
    label: 'Automation versions',
    Icon: IconVersions,
    group: 'outreach',
    entryPath: '/myah/automation-versions',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.WorkflowVersion,
      },
    },
  },
  {
    id: 'tasks',
    label: 'Tasks',
    Icon: IconCheckbox,
    group: 'outreach',
    entryPath: '/myah/tasks',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.Task,
      },
    },
  },
  {
    id: 'approvals',
    label: 'Approvals',
    Icon: IconCircle,
    group: 'outreach',
    entryPath: '/myah/approvals',
    availability: 'deferred',
  },
  {
    id: 'brand-brain',
    label: 'Brand Brain',
    Icon: IconBrain,
    group: 'brand-workspace',
    entryPath: '/myah/brand-brain',
    availability: 'available',
    destination: {
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
      },
    },
  },
  {
    id: 'connected-channels',
    label: 'Connected Channels',
    Icon: IconPlug,
    group: 'brand-workspace',
    entryPath: '/myah/connected-channels',
    availability: 'deferred',
  },
] as const satisfies readonly MyahNavigationRoute[];

export const getMyahNavigationRoute = (
  pageId: MyahNavigationPageId,
): MyahNavigationRoute => {
  const route = MYAH_NAVIGATION_ROUTES.find(({ id }) => id === pageId);

  if (route === undefined) {
    throw new Error(`Unknown Myah navigation route: ${pageId}`);
  }

  return route;
};

export const getMyahEntryPath = (pageId: MyahNavigationPageId): string =>
  getMyahNavigationRoute(pageId).entryPath;

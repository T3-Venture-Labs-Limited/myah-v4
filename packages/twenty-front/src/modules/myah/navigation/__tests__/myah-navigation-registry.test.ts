import {
  getMyahEntryPath,
  getMyahNavigationRoute,
  MYAH_NAVIGATION_ROUTES,
} from '@/myah/navigation/myah-navigation-registry';
import {
  IconBox,
  IconChartBar,
  IconFileText,
  IconSearch,
  IconVideo,
} from 'twenty-ui/icon';
import { CoreObjectNameSingular } from 'twenty-shared/types';

describe('MYAH_NAVIGATION_ROUTES', () => {
  it('defines the approved two-level Core MVP hierarchy', () => {
    expect(
      MYAH_NAVIGATION_ROUTES.map(({ id, group, availability }) => ({
        id,
        group,
        availability,
      })),
    ).toEqual([
      { id: 'today', group: null, availability: 'available' },
      { id: 'inbox', group: null, availability: 'available' },
      { id: 'creators', group: 'creator-crm', availability: 'available' },
      {
        id: 'creator-lists',
        group: 'creator-crm',
        availability: 'available',
      },
      { id: 'segments', group: 'creator-crm', availability: 'deferred' },
      {
        id: 'creator-discovery',
        group: 'creator-crm',
        availability: 'soon',
      },
      {
        id: 'campaigns',
        group: 'campaign-operations',
        availability: 'available',
      },
      {
        id: 'deliverables',
        group: 'campaign-operations',
        availability: 'soon',
      },
      {
        id: 'creator-briefs',
        group: 'campaign-operations',
        availability: 'soon',
      },
      {
        id: 'creator-videos',
        group: 'campaign-operations',
        availability: 'soon',
      },
      {
        id: 'analytics',
        group: 'campaign-operations',
        availability: 'soon',
      },
      { id: 'automations', group: 'outreach', availability: 'available' },
      {
        id: 'automation-runs',
        group: 'outreach',
        availability: 'available',
      },
      {
        id: 'automation-versions',
        group: 'outreach',
        availability: 'available',
      },
      { id: 'tasks', group: 'outreach', availability: 'available' },
      { id: 'approvals', group: 'outreach', availability: 'deferred' },
      {
        id: 'brand-brain',
        group: 'brand-workspace',
        availability: 'available',
      },
      {
        id: 'connected-channels',
        group: 'brand-workspace',
        availability: 'deferred',
      },
    ]);

    expect(
      MYAH_NAVIGATION_ROUTES.filter(({ group }) => group === null),
    ).toEqual([
      expect.objectContaining({ id: 'today', entryPath: '/myah/today' }),
      expect.objectContaining({ id: 'inbox', entryPath: '/myah/inbox' }),
    ]);
    expect(MYAH_NAVIGATION_ROUTES.map(({ id }) => id)).not.toContain(
      'settings',
    );
    expect(MYAH_NAVIGATION_ROUTES.map(({ id }) => id)).not.toContain(
      'sequences',
    );
  });

  it('preserves one stable entry path for every Core MVP page', () => {
    for (const route of MYAH_NAVIGATION_ROUTES) {
      expect(route.entryPath).toBe(`/myah/${route.id}`);
      expect(getMyahEntryPath(route.id)).toBe(route.entryPath);
    }

    expect(getMyahEntryPath('creator-briefs')).toBe('/myah/creator-briefs');
    expect(getMyahNavigationRoute('creator-briefs').availability).toBe('soon');
    expect(
      getMyahEntryPath('automations' as Parameters<typeof getMyahEntryPath>[0]),
    ).toBe('/myah/automations');
    expect(
      getMyahEntryPath(
        'automation-runs' as Parameters<typeof getMyahEntryPath>[0],
      ),
    ).toBe('/myah/automation-runs');
    expect(
      getMyahEntryPath(
        'automation-versions' as Parameters<typeof getMyahEntryPath>[0],
      ),
    ).toBe('/myah/automation-versions');
  });

  it('assigns actual native targets only to available routes', () => {
    expect(getMyahNavigationRoute('today').destination).toEqual({
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.Dashboard,
      },
    });
    expect(getMyahNavigationRoute('inbox').destination).toEqual({
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.MessageThread,
      },
    });
    expect(getMyahNavigationRoute('creators').destination).toEqual({
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
      },
    });
    expect(getMyahNavigationRoute('creator-lists').destination).toEqual({
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: 'd51f2758-055b-5367-8250-859cb3f58631',
      },
    });
    expect(getMyahNavigationRoute('campaigns').destination).toEqual({
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
      },
    });
    expect(
      getMyahNavigationRoute(
        'automations' as Parameters<typeof getMyahNavigationRoute>[0],
      ).destination,
    ).toEqual({
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.Workflow,
      },
    });
    expect(
      getMyahNavigationRoute(
        'automation-runs' as Parameters<typeof getMyahNavigationRoute>[0],
      ).destination,
    ).toEqual({
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.WorkflowRun,
      },
    });
    expect(
      getMyahNavigationRoute(
        'automation-versions' as Parameters<typeof getMyahNavigationRoute>[0],
      ).destination,
    ).toEqual({
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.WorkflowVersion,
      },
    });
    expect(getMyahNavigationRoute('tasks').destination).toEqual({
      kind: 'native-object',
      object: {
        kind: 'core-object',
        nameSingular: CoreObjectNameSingular.Task,
      },
    });
    expect(getMyahNavigationRoute('brand-brain').destination).toEqual({
      kind: 'native-object',
      object: {
        kind: 'app-object',
        universalIdentifier: '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
      },
    });

    for (const route of MYAH_NAVIGATION_ROUTES.filter(
      ({ availability }) => availability !== 'available',
    )) {
      expect(route).not.toHaveProperty('destination');
    }
  });

  it('uses semantic icons for visible Soon entries', () => {
    expect(getMyahNavigationRoute('creator-discovery').Icon).toBe(IconSearch);
    expect(getMyahNavigationRoute('deliverables').Icon).toBe(IconBox);
    expect(getMyahNavigationRoute('creator-briefs').Icon).toBe(IconFileText);
    expect(getMyahNavigationRoute('creator-videos').Icon).toBe(IconVideo);
    expect(getMyahNavigationRoute('analytics').Icon).toBe(IconChartBar);
  });

  it('does not duplicate IDs, labels, or entry paths', () => {
    const ids = MYAH_NAVIGATION_ROUTES.map(({ id }) => id);
    const labels = MYAH_NAVIGATION_ROUTES.map(({ label }) => label);
    const entryPaths = MYAH_NAVIGATION_ROUTES.map(({ entryPath }) => entryPath);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(entryPaths).size).toBe(entryPaths.length);
  });
});

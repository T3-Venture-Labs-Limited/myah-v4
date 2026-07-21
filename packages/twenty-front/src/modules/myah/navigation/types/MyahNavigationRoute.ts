import { type ComponentType } from 'react';
import { type CoreObjectNameSingular } from 'twenty-shared/types';
import { type IconComponent } from 'twenty-ui/icon';

export type MyahNavigationPageId =
  | 'today'
  | 'inbox'
  | 'creators'
  | 'creator-lists'
  | 'segments'
  | 'creator-discovery'
  | 'campaigns'
  | 'deliverables'
  | 'creator-briefs'
  | 'creator-videos'
  | 'analytics'
  | 'automations'
  | 'automation-runs'
  | 'automation-versions'
  | 'tasks'
  | 'approvals'
  | 'brand-brain'
  | 'connected-channels';

export type MyahNavigationAvailability = 'available' | 'deferred' | 'soon';

export type MyahNavigationRouteGroupId =
  | 'creator-crm'
  | 'campaign-operations'
  | 'outreach'
  | 'brand-workspace';

export type MyahNavigationObjectIdentity =
  | {
      kind: 'core-object';
      nameSingular: CoreObjectNameSingular;
    }
  | {
      kind: 'app-object';
      universalIdentifier: string;
    };

export type MyahNavigationPageComponent = ComponentType;

export type MyahNavigationDestination =
  | { kind: 'native-object'; object: MyahNavigationObjectIdentity }
  | { kind: 'native-page-layout'; pageLayoutUniversalIdentifier: string }
  | { kind: 'myah-page'; Component: MyahNavigationPageComponent };

type MyahNavigationRouteBase = {
  id: MyahNavigationPageId;
  label: string;
  Icon: IconComponent;
  group: MyahNavigationRouteGroupId | null;
  entryPath: `/myah/${MyahNavigationPageId}`;
};

export type MyahNavigationRoute =
  | (MyahNavigationRouteBase & {
      availability: 'available';
      destination: MyahNavigationDestination;
    })
  | (MyahNavigationRouteBase & {
      availability: 'deferred' | 'soon';
      destination?: never;
    });

export type ResolvedMyahNavigationRoute =
  | { status: 'pending'; route: MyahNavigationRoute }
  | {
      status: 'ready';
      route: MyahNavigationRoute;
      destination:
        | { kind: 'native'; path: string; objectNameSingular?: string }
        | { kind: 'myah-page'; Component: MyahNavigationPageComponent };
    }
  | {
      status: 'forbidden';
      route: MyahNavigationRoute;
      destination: {
        kind: 'native';
        path: string;
        objectNameSingular?: string;
      };
    }
  | { status: 'deferred' | 'missing' | 'soon'; route: MyahNavigationRoute };

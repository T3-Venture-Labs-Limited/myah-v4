export const MyahPlatformScope = {
  PLATFORM_READ: 'platform:read',
  WORKSPACE_FLAGS_READ: 'workspace-flags:read',
  WORKSPACE_FLAGS_WRITE: 'workspace-flags:write',
  APPLICATIONS_READ: 'applications:read',
  APPLICATION_ROLLOUTS_WRITE: 'application-rollouts:write',
  OPERATIONS_READ: 'operations:read',
} as const;

export type MyahPlatformScope =
  (typeof MyahPlatformScope)[keyof typeof MyahPlatformScope];

const MYAH_PLATFORM_SCOPE_LOOKUP: Record<MyahPlatformScope, true> = {
  [MyahPlatformScope.PLATFORM_READ]: true,
  [MyahPlatformScope.WORKSPACE_FLAGS_READ]: true,
  [MyahPlatformScope.WORKSPACE_FLAGS_WRITE]: true,
  [MyahPlatformScope.APPLICATIONS_READ]: true,
  [MyahPlatformScope.APPLICATION_ROLLOUTS_WRITE]: true,
  [MyahPlatformScope.OPERATIONS_READ]: true,
};

export const isMyahPlatformScope = (
  value: unknown,
): value is MyahPlatformScope =>
  typeof value === 'string' && value in MYAH_PLATFORM_SCOPE_LOOKUP;

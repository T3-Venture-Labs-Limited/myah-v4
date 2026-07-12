export type ImpersonationAuthorizationUser = {
  email?: string | null;
  canImpersonate: boolean;
  canAccessFullAdminPanel: boolean;
};

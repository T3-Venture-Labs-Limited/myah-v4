export const getWorkspaceMailboxTlsServername = (host: string): string => {
  try {
    return new URL(host).hostname.toLowerCase();
  } catch {
    return host.trim().toLowerCase();
  }
};

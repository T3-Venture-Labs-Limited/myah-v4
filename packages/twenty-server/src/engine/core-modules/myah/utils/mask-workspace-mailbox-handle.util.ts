export const maskWorkspaceMailboxHandle = (handle: string): string => {
  const separatorIndex = handle.lastIndexOf('@');
  const localPart = handle.slice(0, separatorIndex);
  const domain = handle.slice(separatorIndex + 1);

  if (
    separatorIndex <= 0 ||
    separatorIndex !== handle.indexOf('@') ||
    domain.length === 0 ||
    localPart.includes(' ') ||
    domain.includes(' ')
  ) {
    throw new Error('Invalid mailbox handle');
  }

  const visibleSuffix =
    localPart.length > 1 ? localPart.charAt(localPart.length - 1) : '';

  return `${localPart[0]}***${visibleSuffix}@${domain}`;
};

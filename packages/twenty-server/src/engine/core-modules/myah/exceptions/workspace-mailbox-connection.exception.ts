import { type WorkspaceMailboxConnectionErrorCode } from 'src/engine/core-modules/myah/types/workspace-mailbox-connection.type';

const WORKSPACE_MAILBOX_CONNECTION_ERROR_MESSAGES: Record<
  WorkspaceMailboxConnectionErrorCode,
  string
> = {
  INVALID_CONFIGURATION:
    'Provide complete SMTP and IMAP settings, then try again.',
  INSECURE_CONNECTION:
    'This mailbox must use a secure TLS connection for SMTP and IMAP.',
  AUTHENTICATION_FAILED:
    'We could not sign in to this mailbox. Check the address and app password, then try again.',
  CONNECTION_REFUSED:
    'The email server refused the connection. Check the server and port settings, then try again.',
  CONNECTION_UNAVAILABLE:
    'We could not establish a secure connection to the email server. Check the settings and try again.',
  MAILBOX_ALREADY_CONNECTED:
    'This workspace already has a different shared mailbox. Revoke it before connecting another mailbox.',
  MAILBOX_NOT_FOUND: 'The shared mailbox was not found.',
  RECONNECT_REQUIRED:
    'This mailbox needs to be reconnected with valid credentials.',
  UNKNOWN: 'We could not complete the mailbox operation. Please try again.',
};

export class WorkspaceMailboxConnectionException extends Error {
  readonly code: WorkspaceMailboxConnectionErrorCode;
  readonly cause?: unknown;

  constructor(
    code: WorkspaceMailboxConnectionErrorCode,
    options?: { cause?: unknown },
  ) {
    super(WORKSPACE_MAILBOX_CONNECTION_ERROR_MESSAGES[code]);
    this.name = WorkspaceMailboxConnectionException.name;
    this.code = code;
    Object.defineProperty(this, 'cause', {
      configurable: true,
      enumerable: false,
      value: options?.cause,
    });
  }
}

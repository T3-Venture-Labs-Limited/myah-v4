import { ConnectedAccountProvider } from 'twenty-shared/types';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { ImapSmtpCaldavResolver } from 'src/engine/core-modules/imap-smtp-caldav-connection/imap-smtp-caldav-connection.resolver';
import { type ImapSmtpCaldavService } from 'src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service';
import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { ConnectedAccountResolver } from 'src/engine/metadata-modules/connected-account/resolvers/connected-account.resolver';
import { type ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { type ImapSmtpCalDavAPIService } from 'src/modules/connected-account/services/imap-smtp-caldav-apis.service';

const workspace = { id: 'workspace-id' } as WorkspaceEntity;
const myahAccount = {
  handle: 'outreach@example.com',
  id: 'account-id',
  name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
  provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
  visibility: 'workspace',
  workspaceId: 'workspace-id',
} as ConnectedAccountEntity;

describe('workspace mailbox generic mutation boundaries', () => {
  it('rejects generic connected-account deletion of the shared mailbox', async () => {
    const metadataService = {
      delete: jest.fn(),
      verifyOwnership: jest.fn().mockResolvedValue(myahAccount),
    };
    const resolver = new ConnectedAccountResolver(
      metadataService as unknown as ConnectedAccountMetadataService,
    );

    await expect(
      resolver.deleteConnectedAccount(
        myahAccount.id,
        workspace,
        'user-workspace-id',
      ),
    ).rejects.toThrow('Connected account not found');

    expect(metadataService.delete).not.toHaveBeenCalled();
  });

  it('rejects legacy personal-account updates of the shared mailbox', async () => {
    const metadataService = {
      findByIdAndUserWorkspaceId: jest.fn().mockResolvedValue(myahAccount),
    };
    const validationService = {
      validateAndTestConnectionParameters: jest.fn(),
    };
    const apiService = { upsertConnectedAccount: jest.fn() };
    const encryptionService = { decryptConnectionParameters: jest.fn() };
    const resolver = new ImapSmtpCaldavResolver(
      validationService as unknown as ImapSmtpCaldavService,
      apiService as unknown as ImapSmtpCalDavAPIService,
      metadataService as unknown as ConnectedAccountMetadataService,
      encryptionService as unknown as ConnectedAccountTokenEncryptionService,
    );

    await expect(
      resolver.saveImapSmtpCaldavAccount(
        'outreach@example.com',
        {
          IMAP: {
            connectionSecurity: EmailConnectionSecurity.NONE,
            host: 'imap.example.com',
            password: 'workspace-secret',
            port: 143,
          },
        },
        workspace,
        'user-workspace-id',
        myahAccount.id,
      ),
    ).rejects.toThrow('Connected account not found');

    expect(
      encryptionService.decryptConnectionParameters,
    ).not.toHaveBeenCalled();
    expect(
      validationService.validateAndTestConnectionParameters,
    ).not.toHaveBeenCalled();
    expect(apiService.upsertConnectedAccount).not.toHaveBeenCalled();
  });
});

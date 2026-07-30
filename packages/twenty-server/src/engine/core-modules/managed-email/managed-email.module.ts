import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { ManagedEmailAcquisitionOperationEntity } from './entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from './entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from './entities/managed-email-mailbox.entity';
import { IcemailClient } from './providers/icemail/icemail.client';
import { WarmupInboxClient } from './providers/warmup-inbox/warmup-inbox.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagedEmailDomainEntity,
      ManagedEmailMailboxEntity,
      ManagedEmailAcquisitionOperationEntity,
    ]),
  ],
  providers: [
    provideWorkspaceScopedRepository(ManagedEmailDomainEntity),
    provideWorkspaceScopedRepository(ManagedEmailMailboxEntity),
    provideWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity),
    IcemailClient,
    WarmupInboxClient,
  ],
  exports: [
    getWorkspaceScopedRepositoryToken(ManagedEmailDomainEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailMailboxEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailAcquisitionOperationEntity),
    IcemailClient,
    WarmupInboxClient,
  ],
})
export class ManagedEmailModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { ManagedEmailAcquisitionOperationEntity } from './entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from './entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from './entities/managed-email-mailbox.entity';

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
  ],
  exports: [
    getWorkspaceScopedRepositoryToken(ManagedEmailDomainEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailMailboxEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailAcquisitionOperationEntity),
  ],
})
export class ManagedEmailModule {}

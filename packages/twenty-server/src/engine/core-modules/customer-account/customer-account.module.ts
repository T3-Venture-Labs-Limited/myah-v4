import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CustomerAccountEntity } from 'src/engine/core-modules/customer-account/entities/customer-account.entity';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { CustomerAccountService } from 'src/engine/core-modules/customer-account/services/customer-account.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerAccountEntity,
      MyahWorkspaceInstallationEntity,
    ]),
  ],
  providers: [CustomerAccountService],
  exports: [CustomerAccountService],
})
export class CustomerAccountModule {}

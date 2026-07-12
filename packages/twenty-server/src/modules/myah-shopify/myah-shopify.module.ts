import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { DomainServerConfigModule } from 'src/engine/core-modules/domain/domain-server-config/domain-server-config.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountTokenEncryptionModule } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { MyahShopifyController } from 'src/modules/myah-shopify/controllers/myah-shopify.controller';
import { MyahShopifyService } from 'src/modules/myah-shopify/services/myah-shopify.service';

@Module({
  imports: [
    ConnectedAccountTokenEncryptionModule,
    DomainServerConfigModule,
    PermissionsModule,
    TokenModule,
    TypeOrmModule.forFeature([ConnectedAccountEntity]),
    WorkspaceCacheStorageModule,
  ],
  controllers: [MyahShopifyController],
  providers: [MyahShopifyService],
})
export class MyahShopifyModule {}

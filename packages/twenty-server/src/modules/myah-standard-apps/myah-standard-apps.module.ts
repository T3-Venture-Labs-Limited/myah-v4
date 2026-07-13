import { Module } from '@nestjs/common';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { MyahStandardAppsController } from './myah-standard-apps.controller';
import { MyahStandardAppsDeploymentGuard } from './guards/myah-standard-apps-deployment.guard';
import { MyahStandardAppsService } from './myah-standard-apps.service';

@Module({
  imports: [MessageQueueModule, ThrottlerModule],
  controllers: [MyahStandardAppsController],
  providers: [MyahStandardAppsDeploymentGuard, MyahStandardAppsService],
  exports: [MyahStandardAppsService],
})
export class MyahStandardAppsModule {}

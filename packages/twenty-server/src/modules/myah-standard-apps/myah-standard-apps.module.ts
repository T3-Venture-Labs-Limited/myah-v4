import { Module } from '@nestjs/common';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { MyahStandardAppsService } from './myah-standard-apps.service';

@Module({
  imports: [MessageQueueModule],
  providers: [MyahStandardAppsService],
  exports: [MyahStandardAppsService],
})
export class MyahStandardAppsModule {}

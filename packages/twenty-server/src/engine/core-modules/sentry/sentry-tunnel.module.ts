import { Module } from '@nestjs/common';

import { SentryTunnelController } from 'src/engine/core-modules/sentry/sentry-tunnel.controller';

@Module({
  controllers: [SentryTunnelController],
})
export class SentryTunnelModule {}

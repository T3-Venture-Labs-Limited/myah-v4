import { Module } from '@nestjs/common';

/**
 * Deliberately unconfigured source leaf. A later reviewed integration must bind
 * the trusted operation-specific authorization port before exposing the
 * timezone service; this candidate does not invent or register that provider.
 */
@Module({})
export class WorkspaceCampaignCapacityTimeZoneModule {}

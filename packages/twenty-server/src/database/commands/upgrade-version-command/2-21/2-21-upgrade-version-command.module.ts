import { Module } from '@nestjs/common';

import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-21/2-21-workspace-command-1825100000000-synchronize-myah-standard-metadata.command';

@Module({
  providers: [SynchronizeMyahStandardMetadataCommand],
})
export class V2_21_UpgradeVersionCommandModule {}

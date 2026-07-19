import { Controller, Get, UseGuards } from '@nestjs/common';

import { type ClientConfig } from 'src/engine/core-modules/client-config/client-config.entity';
import { ClientConfigService } from 'src/engine/core-modules/client-config/services/client-config.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

@Controller('/client-config')
export class ClientConfigController {
  constructor(private readonly clientConfigService: ClientConfigService) {}

  @Get()
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  async getClientConfig(
    @AuthWorkspace({ allowUndefined: true })
    workspace: WorkspaceEntity | undefined,
  ): Promise<ClientConfig> {
    return this.clientConfigService.getClientConfig(workspace?.id);
  }
}

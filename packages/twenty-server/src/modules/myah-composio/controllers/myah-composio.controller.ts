import {
  Controller,
  Get,
  GoneException,
  Post,
  UseGuards,
} from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';

import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

const PROVIDER_CUTOVER_MESSAGE =
  'Composio Instagram routes are disabled after the Unipile provider cutover';

@Controller('rest/myah/instagram')
@UseGuards(
  JwtAuthGuard,
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS),
)
export class MyahComposioController {
  @Get('accounts')
  listInstagramAccounts(): never {
    throw new GoneException(PROVIDER_CUTOVER_MESSAGE);
  }

  @Post('oauth-link')
  startInstagramOAuth(): never {
    throw new GoneException(PROVIDER_CUTOVER_MESSAGE);
  }
}

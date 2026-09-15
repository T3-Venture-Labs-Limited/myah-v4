import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RequestTimeoutException,
  UseGuards,
} from '@nestjs/common';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { UnipileInstagramWebhookIntakeService } from 'src/modules/myah-unipile/services/unipile-instagram-webhook-intake.service';

@Controller('webhooks/unipile/instagram')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class MyahUnipileInstagramWebhookController {
  constructor(
    private readonly intakeService: UnipileInstagramWebhookIntakeService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Headers('x-myah-unipile-secret') secret: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true; duplicate: boolean }> {
    let rejectDeadline!: (reason?: unknown) => void;
    const deadline = new Promise<never>((_, reject) => {
      rejectDeadline = reject;
    });
    const timeout = setTimeout(
      () =>
        rejectDeadline(
          new RequestTimeoutException(
            'Unipile Instagram webhook intake timed out',
          ),
        ),
      20_000,
    );

    try {
      return await Promise.race([
        this.intakeService.intake({ secret, body }),
        deadline,
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

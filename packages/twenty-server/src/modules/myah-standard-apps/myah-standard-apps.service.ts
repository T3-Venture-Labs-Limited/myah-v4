import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ApplicationRegistrationEntity } from 'src/engine/core-modules/application/application-registration/application-registration.entity';
import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import {
  BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
  type BackfillApplicationInstallationJobData,
} from 'src/engine/core-modules/application/jobs/backfill-application-installation.job-constants';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import { isMyahStandardAppUniversalIdentifier } from './myah-standard-apps.constants';

export type PromoteMyahStandardAppResult = {
  applicationRegistrationId: string;
  backfillJobId: string;
};

@Injectable()
export class MyahStandardAppsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly workspaceQueueService: MessageQueueService,
  ) {}

  async getPublishedStandardApp(
    applicationUniversalIdentifier: string,
  ): Promise<ApplicationRegistrationEntity> {
    if (!isMyahStandardAppUniversalIdentifier(applicationUniversalIdentifier)) {
      throw new BadRequestException(
        'Application is not an approved Myah standard app',
      );
    }
    const ownerWorkspaceId = process.env.MYAH_STANDARD_APPS_OWNER_WORKSPACE_ID;
    if (!ownerWorkspaceId) {
      throw new InternalServerErrorException(
        'MYAH_STANDARD_APPS_OWNER_WORKSPACE_ID is not configured',
      );
    }
    const registration = await this.dataSource.manager.findOneBy(
      ApplicationRegistrationEntity,
      { universalIdentifier: applicationUniversalIdentifier },
    );
    this.assertPublisherRegistration(registration, ownerWorkspaceId);
    return registration;
  }

  async promoteAndBackfill(
    applicationUniversalIdentifier: string,
    operationId?: string,
  ): Promise<PromoteMyahStandardAppResult> {
    if (!isMyahStandardAppUniversalIdentifier(applicationUniversalIdentifier)) {
      throw new BadRequestException(
        'Application is not an approved Myah standard app',
      );
    }

    const ownerWorkspaceId = process.env.MYAH_STANDARD_APPS_OWNER_WORKSPACE_ID;

    if (!ownerWorkspaceId) {
      throw new InternalServerErrorException(
        'MYAH_STANDARD_APPS_OWNER_WORKSPACE_ID is not configured',
      );
    }

    const registration = await this.dataSource.transaction(async (manager) => {
      const initialRegistration = await manager.findOneBy(
        ApplicationRegistrationEntity,
        { universalIdentifier: applicationUniversalIdentifier },
      );

      this.assertPublisherRegistration(initialRegistration, ownerWorkspaceId);

      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        initialRegistration.id,
      ]);

      const lockedRegistration = await manager.findOneBy(
        ApplicationRegistrationEntity,
        { universalIdentifier: applicationUniversalIdentifier },
      );

      this.assertPublisherRegistration(lockedRegistration, ownerWorkspaceId);

      if (!lockedRegistration.isPreInstalled) {
        await manager.update(
          ApplicationRegistrationEntity,
          { id: lockedRegistration.id },
          { isPreInstalled: true },
        );
      }

      return lockedRegistration;
    });

    const backfillJobId = `${BACKFILL_APPLICATION_INSTALLATION_JOB_NAME}-${registration.id}${operationId === undefined ? '' : `-${operationId}`}`;

    await this.workspaceQueueService.add<BackfillApplicationInstallationJobData>(
      BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
      {
        applicationRegistrationId: registration.id,
        ...(operationId === undefined ? {} : { operationId }),
      },
      {
        id: backfillJobId,
        ...(operationId === undefined ? {} : { retryLimit: 3 }),
      },
    );

    return {
      applicationRegistrationId: registration.id,
      backfillJobId,
    };
  }
  private assertPublisherRegistration(
    registration: ApplicationRegistrationEntity | null,
    ownerWorkspaceId: string,
  ): asserts registration is ApplicationRegistrationEntity {
    if (!registration) {
      throw new NotFoundException(
        'Approved Myah standard app is not published',
      );
    }

    if (
      registration.sourceType !== ApplicationRegistrationSourceType.TARBALL ||
      registration.ownerWorkspaceId !== ownerWorkspaceId
    ) {
      throw new ForbiddenException(
        'Application is not owned by the configured Myah publisher workspace',
      );
    }
  }
}

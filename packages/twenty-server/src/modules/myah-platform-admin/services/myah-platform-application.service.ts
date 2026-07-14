import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import {
  MyahPlatformOperationEntity,
  MyahPlatformOperationStatus,
} from 'src/modules/myah-platform-admin/entities/myah-platform-operation.entity';
import { MyahPlatformOperationService } from 'src/modules/myah-platform-admin/services/myah-platform-operation.service';
import { MyahStandardAppsService } from 'src/modules/myah-standard-apps/myah-standard-apps.service';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
export type MyahPlatformApplicationStatus = {
  installedWorkspaceCount: number;
  isPreInstalled: boolean;
  latestAvailableVersion: string | null;
  name: string;
  registrationId: string;
  universalIdentifier: string;
};

@Injectable()
export class MyahPlatformApplicationService {
  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    private readonly standardAppsService: MyahStandardAppsService,
    private readonly operationService: MyahPlatformOperationService,
  ) {}

  async getApplicationStatus(
    applicationUniversalIdentifier: string,
  ): Promise<MyahPlatformApplicationStatus> {
    const registration = await this.standardAppsService.getPublishedStandardApp(
      applicationUniversalIdentifier,
    );
    return {
      installedWorkspaceCount: await this.applicationRepository.count({
        where: { universalIdentifier: applicationUniversalIdentifier },
      }),
      isPreInstalled: registration.isPreInstalled,
      latestAvailableVersion: registration.latestAvailableVersion,
      name: registration.name,
      registrationId: registration.id,
      universalIdentifier: registration.universalIdentifier,
    };
  }

  async rollout({
    applicationUniversalIdentifier,
    idempotencyKey,
    operatorId,
  }: {
    applicationUniversalIdentifier: string;
    idempotencyKey: string;
    operatorId: string;
  }): Promise<MyahPlatformOperationEntity> {
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey))
      throw new BadRequestException(
        'Idempotency-Key must be 8-200 URL-safe characters',
      );
    const { operation, replayed } = await this.operationService.beginOperation({
      action: 'application-rollout.start',
      idempotencyKey,
      operatorId,
      requestBody: { applicationUniversalIdentifier },
      resourceId: applicationUniversalIdentifier,
      resourceType: 'application-rollout',
    });
    if (
      replayed &&
      (operation.status === MyahPlatformOperationStatus.SUCCEEDED ||
        operation.status === MyahPlatformOperationStatus.FAILED)
    )
      return operation;
    try {
      await this.operationService.markRunning(operation.id);
      const result = await this.standardAppsService.promoteAndBackfill(
        applicationUniversalIdentifier,
        operation.id,
      );
      return await this.operationService.markQueued(operation.id, {
        ...result,
        state: 'queued',
      });
    } catch (error) {
      await this.operationService.markFailed(operation.id, {
        code: 'APPLICATION_ROLLOUT_FAILED',
        message:
          error instanceof Error ? error.message : 'Application rollout failed',
      });
      throw error;
    }
  }
}

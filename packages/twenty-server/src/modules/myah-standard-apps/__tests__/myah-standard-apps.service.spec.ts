import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ApplicationRegistrationEntity } from 'src/engine/core-modules/application/application-registration/application-registration.entity';
import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import {
  BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
  type BackfillApplicationInstallationJobData,
} from 'src/engine/core-modules/application/jobs/backfill-application-installation.job-constants';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/modules/myah-standard-apps/myah-standard-apps.constants';
import { MyahStandardAppsService } from 'src/modules/myah-standard-apps/myah-standard-apps.service';

describe('MyahStandardAppsService', () => {
  const publisherWorkspaceId = '11111111-1111-4111-8111-111111111111';
  const registrationId = '22222222-2222-4222-8222-222222222222';
  const originalEnvironment = process.env;

  let service: MyahStandardAppsService;
  let transactionalApplicationRegistrationRepository: {
    findOneBy: jest.Mock;
    update: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: {
    query: jest.Mock;
    findOneBy: jest.Mock;
    update: jest.Mock;
  };
  let workspaceQueueService: {
    add: jest.Mock<
      Promise<void>,
      [string, BackfillApplicationInstallationJobData, { id: string }]
    >;
  };

  beforeEach(async () => {
    process.env = {
      ...originalEnvironment,
      MYAH_STANDARD_APPS_OWNER_WORKSPACE_ID: publisherWorkspaceId,
    };
    transactionalApplicationRegistrationRepository = {
      findOneBy: jest.fn(),
      update: jest.fn(),
    };
    transactionalManager = {
      query: jest.fn(),
      findOneBy: transactionalApplicationRegistrationRepository.findOneBy,
      update: transactionalApplicationRegistrationRepository.update,
    };
    dataSource = {
      transaction: jest.fn(async (callback) => callback(transactionalManager)),
    };
    workspaceQueueService = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MyahStandardAppsService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getQueueToken(MessageQueue.workspaceQueue),
          useValue: workspaceQueueService,
        },
      ],
    }).compile();

    service = module.get(MyahStandardAppsService);
  });

  afterEach(() => {
    process.env = originalEnvironment;
    jest.clearAllMocks();
  });

  it('promotes an allowlisted tarball owned by the platform publisher and queues its backfill', async () => {
    transactionalApplicationRegistrationRepository.findOneBy.mockResolvedValue({
      id: registrationId,
      universalIdentifier: BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      ownerWorkspaceId: publisherWorkspaceId,
      sourceType: ApplicationRegistrationSourceType.TARBALL,
      isPreInstalled: false,
    } as ApplicationRegistrationEntity);

    await expect(
      service.promoteAndBackfill(BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER),
    ).resolves.toEqual({
      applicationRegistrationId: registrationId,
      backfillJobId: `${BACKFILL_APPLICATION_INSTALLATION_JOB_NAME}-${registrationId}`,
    });

    expect(
      transactionalApplicationRegistrationRepository.update,
    ).toHaveBeenCalledWith(
      ApplicationRegistrationEntity,
      { id: registrationId },
      { isPreInstalled: true },
    );
    expect(transactionalManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER],
    );
    expect(workspaceQueueService.add).toHaveBeenCalledWith(
      BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
      { applicationRegistrationId: registrationId },
      { id: `${BACKFILL_APPLICATION_INSTALLATION_JOB_NAME}-${registrationId}` },
    );
  });

  it('keeps an approved registration preinstalled when queueing fails so a retry can resume the backfill', async () => {
    transactionalApplicationRegistrationRepository.findOneBy.mockResolvedValue({
      id: registrationId,
      universalIdentifier: BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      ownerWorkspaceId: publisherWorkspaceId,
      sourceType: ApplicationRegistrationSourceType.TARBALL,
      isPreInstalled: false,
    } as ApplicationRegistrationEntity);
    workspaceQueueService.add.mockRejectedValue(new Error('queue unavailable'));

    await expect(
      service.promoteAndBackfill(BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER),
    ).rejects.toThrow('queue unavailable');

    expect(
      transactionalApplicationRegistrationRepository.update,
    ).toHaveBeenCalledWith(
      ApplicationRegistrationEntity,
      { id: registrationId },
      { isPreInstalled: true },
    );
    expect(workspaceQueueService.add).toHaveBeenCalledWith(
      BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
      { applicationRegistrationId: registrationId },
      { id: `${BACKFILL_APPLICATION_INSTALLATION_JOB_NAME}-${registrationId}` },
    );
  });
  it('rejects an application outside the first-party allowlist', async () => {
    await expect(
      service.promoteAndBackfill('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('not an approved Myah standard app');

    expect(
      transactionalApplicationRegistrationRepository.findOneBy,
    ).not.toHaveBeenCalled();
    expect(workspaceQueueService.add).not.toHaveBeenCalled();
  });

  it('rejects a registration not owned by the configured publisher workspace', async () => {
    transactionalApplicationRegistrationRepository.findOneBy.mockResolvedValue({
      id: registrationId,
      universalIdentifier: BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      ownerWorkspaceId: '33333333-3333-4333-8333-333333333333',
      sourceType: ApplicationRegistrationSourceType.TARBALL,
      isPreInstalled: false,
    } as ApplicationRegistrationEntity);

    await expect(
      service.promoteAndBackfill(BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER),
    ).rejects.toThrow('not owned by the configured Myah publisher workspace');

    expect(
      transactionalApplicationRegistrationRepository.update,
    ).not.toHaveBeenCalled();
    expect(workspaceQueueService.add).not.toHaveBeenCalled();
  });
});

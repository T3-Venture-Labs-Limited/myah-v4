import { ConflictException } from '@nestjs/common';

import {
  MyahPlatformOperationService,
  type BeginMyahPlatformOperationInput,
} from 'src/modules/myah-platform-admin/services/myah-platform-operation.service';

const operationInput: BeginMyahPlatformOperationInput = {
  action: 'workspace-feature-flag.update',
  idempotencyKey: 'release-2026-07-14-flag',
  operatorId: 'staging-deployer',
  requestBody: {
    enabled: true,
    featureFlag: 'IS_AI_ENABLED',
    workspaceId: 'workspace-1',
  },
  resourceId: 'workspace-1:IS_AI_ENABLED',
  resourceType: 'workspace-feature-flag',
};

describe('MyahPlatformOperationService', () => {
  it('persists a newly requested operation', async () => {
    const repository = {
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MyahPlatformOperationService(repository as never);

    const result = await service.beginOperation(operationInput);

    expect(result.replayed).toBe(false);
    expect(result.operation).toMatchObject({
      ...operationInput,
      resourceId: 'workspace-1:IS_AI_ENABLED',
      status: 'pending',
    });
    expect(result.operation.id).toEqual(expect.any(String));
    expect(repository.insert).toHaveBeenCalledWith(result.operation);
  });

  it('replays an existing request when only JSON property order differs', async () => {
    const existingOperation = {
      action: operationInput.action,
      idempotencyKey: operationInput.idempotencyKey,
      operatorId: operationInput.operatorId,
      requestHash:
        '3334ab2e7de9eb1548402900c0df26b2f75f623349843aee85e7088bcf5fa75d',
      resourceId: operationInput.resourceId,
      resourceType: operationInput.resourceType,
    };
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(existingOperation),
      insert: jest.fn().mockRejectedValue(new Error('duplicate key')),
    };
    const service = new MyahPlatformOperationService(repository as never);

    const result = await service.beginOperation({
      ...operationInput,
      requestBody: {
        workspaceId: 'workspace-1',
        featureFlag: 'IS_AI_ENABLED',
        enabled: true,
      },
    });

    expect(result).toEqual({ operation: existingOperation, replayed: true });
  });

  it('rejects a reused idempotency key for a different payload', async () => {
    const repository = {
      findOneBy: jest.fn().mockResolvedValue({
        action: operationInput.action,
        idempotencyKey: operationInput.idempotencyKey,
        operatorId: operationInput.operatorId,
        requestHash:
          '3334ab2e7de9eb1548402900c0df26b2f75f623349843aee85e7088bcf5fa75d',
        resourceId: operationInput.resourceId,
        resourceType: operationInput.resourceType,
      }),
      insert: jest.fn().mockRejectedValue(new Error('duplicate key')),
    };
    const service = new MyahPlatformOperationService(repository as never);

    await expect(
      service.beginOperation({
        ...operationInput,
        requestBody: { ...operationInput.requestBody, enabled: false },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('can close an operation that failed before it reached running', async () => {
    const failedOperation = { id: 'operation-1', status: 'failed' };
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(failedOperation),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MyahPlatformOperationService(repository as never);

    await service.markFailed('operation-1', {
      code: 'APPLICATION_ROLLOUT_FAILED',
      message: 'Queue unavailable',
    });

    const sourceStatuses = repository.update.mock.calls[0][0].status.value;
    expect(sourceStatuses).toContain('pending');
  });
});

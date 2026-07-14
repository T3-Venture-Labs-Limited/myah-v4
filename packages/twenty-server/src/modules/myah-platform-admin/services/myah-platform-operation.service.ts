import { createHash, randomUUID } from 'crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  type FindOptionsWhere,
  type QueryDeepPartialEntity,
  Repository,
} from 'typeorm';

import {
  MyahPlatformOperationEntity,
  MyahPlatformOperationStatus,
} from 'src/modules/myah-platform-admin/entities/myah-platform-operation.entity';

export type BeginMyahPlatformOperationInput = {
  action: string;
  idempotencyKey: string;
  operatorId: string;
  requestBody: Record<string, unknown>;
  resourceId?: string;
  resourceType: string;
};

export type BeginMyahPlatformOperationResult = {
  operation: MyahPlatformOperationEntity;
  replayed: boolean;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
};

@Injectable()
export class MyahPlatformOperationService {
  constructor(
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- Platform operations are global control-plane audit records.
    @InjectRepository(MyahPlatformOperationEntity)
    private readonly operationRepository: Repository<MyahPlatformOperationEntity>,
  ) {}

  async beginOperation(
    input: BeginMyahPlatformOperationInput,
  ): Promise<BeginMyahPlatformOperationResult> {
    const requestHash = createHash('sha256')
      .update(JSON.stringify(canonicalize(input.requestBody)))
      .digest('hex');
    const now = new Date();
    const operation: MyahPlatformOperationEntity = {
      id: randomUUID(),
      operatorId: input.operatorId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      requestHash,
      requestBody: input.requestBody,
      status: MyahPlatformOperationStatus.PENDING,
      result: null,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    try {
      await this.operationRepository.insert(
        operation as QueryDeepPartialEntity<MyahPlatformOperationEntity>,
      );
      return { operation, replayed: false };
    } catch (error) {
      const existing = await this.operationRepository.findOneBy({
        operatorId: input.operatorId,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing === null) throw error;
      if (
        existing.requestHash !== requestHash ||
        existing.action !== input.action ||
        existing.resourceType !== input.resourceType ||
        existing.resourceId !== (input.resourceId ?? null)
      ) {
        throw new ConflictException(
          'Idempotency key was already used for a different platform operation',
        );
      }
      return { operation: existing, replayed: true };
    }
  }

  async markRunning(id: string): Promise<MyahPlatformOperationEntity> {
    await this.operationRepository.update(
      { id, status: MyahPlatformOperationStatus.PENDING },
      { status: MyahPlatformOperationStatus.RUNNING },
    );
    return this.getOperation(id);
  }

  async markQueued(
    id: string,
    result: Record<string, unknown>,
  ): Promise<MyahPlatformOperationEntity> {
    await this.operationRepository.update(
      { id, status: MyahPlatformOperationStatus.RUNNING },
      { result, status: MyahPlatformOperationStatus.QUEUED },
    );
    return this.getOperation(id);
  }

  async markSucceeded(
    id: string,
    result: Record<string, unknown>,
  ): Promise<MyahPlatformOperationEntity> {
    await this.operationRepository.update(
      {
        id,
        status: In([
          MyahPlatformOperationStatus.RUNNING,
          MyahPlatformOperationStatus.QUEUED,
        ]),
      },
      {
        completedAt: new Date(),
        result,
        status: MyahPlatformOperationStatus.SUCCEEDED,
      },
    );
    return this.getOperation(id);
  }

  async markFailed(
    id: string,
    error: { code: string; message: string },
  ): Promise<MyahPlatformOperationEntity> {
    await this.operationRepository.update(
      {
        id,
        status: In([
          MyahPlatformOperationStatus.PENDING,
          MyahPlatformOperationStatus.RUNNING,
          MyahPlatformOperationStatus.QUEUED,
        ]),
      },
      {
        completedAt: new Date(),
        errorCode: error.code,
        errorMessage: error.message,
        status: MyahPlatformOperationStatus.FAILED,
      },
    );
    return this.getOperation(id);
  }

  async getOperation(id: string): Promise<MyahPlatformOperationEntity> {
    const operation = await this.operationRepository.findOneBy({ id });
    if (operation === null)
      throw new NotFoundException('Platform operation not found');
    return operation;
  }

  async listOperations({
    limit,
    offset,
    status,
  }: {
    limit: number;
    offset: number;
    status?: MyahPlatformOperationStatus;
  }): Promise<{ operations: MyahPlatformOperationEntity[]; total: number }> {
    const where: FindOptionsWhere<MyahPlatformOperationEntity> =
      status === undefined ? {} : { status };
    const [operations, total] = await this.operationRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
      where,
    });
    return { operations, total };
  }
}

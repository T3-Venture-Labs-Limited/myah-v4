import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { CustomerAccountEntity } from 'src/engine/core-modules/customer-account/entities/customer-account.entity';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';

export class CustomerAccountWorkspaceConflictError extends Error {
  constructor(workspaceId: string) {
    super(
      `Workspace ${workspaceId} is already installed for another customer account`,
    );
    this.name = 'CustomerAccountWorkspaceConflictError';
  }
}

const isUniqueConstraintViolation = (
  error: unknown,
): error is { code: string } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';

@Injectable()
export class CustomerAccountService {
  constructor(
    // customerAccount is a cross-workspace control-plane table, not a tenant record.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(CustomerAccountEntity)
    private readonly customerAccountRepository: Repository<CustomerAccountEntity>,
    // myahWorkspaceInstallation maps accounts across workspace boundaries.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(MyahWorkspaceInstallationEntity)
    private readonly myahWorkspaceInstallationRepository: Repository<MyahWorkspaceInstallationEntity>,
  ) {}

  async createCustomerAccount(): Promise<CustomerAccountEntity> {
    const customerAccount = this.customerAccountRepository.create({});

    return await this.customerAccountRepository.save(customerAccount);
  }

  async getWorkspaceInstallation(
    workspaceId: string,
  ): Promise<MyahWorkspaceInstallationEntity | null> {
    return await this.myahWorkspaceInstallationRepository.findOneBy({
      workspaceId,
    });
  }

  async attachWorkspace({
    customerAccountId,
    workspaceId,
  }: {
    customerAccountId: string;
    workspaceId: string;
  }): Promise<MyahWorkspaceInstallationEntity> {
    const existingInstallation =
      await this.getWorkspaceInstallation(workspaceId);

    if (existingInstallation) {
      return this.assertCustomerAccountOwnership({
        customerAccountId,
        installation: existingInstallation,
        workspaceId,
      });
    }

    const installation = this.myahWorkspaceInstallationRepository.create({
      customerAccountId,
      workspaceId,
    });

    try {
      return await this.myahWorkspaceInstallationRepository.save(installation);
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const concurrentInstallation =
        await this.getWorkspaceInstallation(workspaceId);

      if (!concurrentInstallation) {
        throw error;
      }

      return this.assertCustomerAccountOwnership({
        customerAccountId,
        installation: concurrentInstallation,
        workspaceId,
      });
    }
  }

  private assertCustomerAccountOwnership({
    customerAccountId,
    installation,
    workspaceId,
  }: {
    customerAccountId: string;
    installation: MyahWorkspaceInstallationEntity;
    workspaceId: string;
  }): MyahWorkspaceInstallationEntity {
    if (installation.customerAccountId !== customerAccountId) {
      throw new CustomerAccountWorkspaceConflictError(workspaceId);
    }

    return installation;
  }
}

import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  CustomerAccountWorkspaceConflictError,
  CustomerAccountService,
} from 'src/engine/core-modules/customer-account/services/customer-account.service';
import { CustomerAccountEntity } from 'src/engine/core-modules/customer-account/entities/customer-account.entity';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

describe('CustomerAccountService', () => {
  let service: CustomerAccountService;
  let customerAccountRepository: jest.Mocked<{
    create: jest.Mock;
    save: jest.Mock;
  }>;
  let myahWorkspaceInstallationRepository: jest.Mocked<{
    create: jest.Mock;
    findOneBy: jest.Mock;
    manager: { transaction: jest.Mock };
    save: jest.Mock;
  }>;
  let transactionManager: jest.Mocked<{
    create: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    save: jest.Mock;
  }>;

  const customerAccountId = 'customer-account-id';
  const otherCustomerAccountId = 'other-customer-account-id';
  const workspaceId = 'workspace-id';
  const secondWorkspaceId = 'second-workspace-id';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAccountService,
        {
          provide: getRepositoryToken(CustomerAccountEntity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MyahWorkspaceInstallationEntity),
          useValue: {
            create: jest.fn(),
            findOneBy: jest.fn(),
            save: jest.fn(),
            manager: { transaction: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get(CustomerAccountService);
    customerAccountRepository = module.get(
      getRepositoryToken(CustomerAccountEntity),
    );
    myahWorkspaceInstallationRepository = module.get(
      getRepositoryToken(MyahWorkspaceInstallationEntity),
    );
    transactionManager = {
      create: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(),
    };
    myahWorkspaceInstallationRepository.manager.transaction.mockImplementation(
      (callback) => callback(transactionManager),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a control-plane account without billing dependencies', async () => {
    const customerAccount = { id: customerAccountId };

    customerAccountRepository.create.mockReturnValue(customerAccount);
    customerAccountRepository.save.mockResolvedValue(customerAccount);

    await expect(service.createCustomerAccount()).resolves.toBe(
      customerAccount,
    );

    expect(customerAccountRepository.create).toHaveBeenCalledWith({});
    expect(customerAccountRepository.save).toHaveBeenCalledWith(
      customerAccount,
    );
  });

  it('looks up an installation by workspace ID', async () => {
    const installation = { customerAccountId, workspaceId };

    myahWorkspaceInstallationRepository.findOneBy.mockResolvedValue(
      installation,
    );

    await expect(service.getWorkspaceInstallation(workspaceId)).resolves.toBe(
      installation,
    );

    expect(myahWorkspaceInstallationRepository.findOneBy).toHaveBeenCalledWith({
      workspaceId,
    });
  });

  it('reuses an existing installation after locking its workspace', async () => {
    const workspace = { id: workspaceId };
    const installation = { customerAccountId, workspaceId };

    transactionManager.findOne.mockResolvedValue(workspace);
    transactionManager.findOneBy.mockResolvedValue(installation);

    await expect(
      service.ensureWorkspaceInstallation(workspaceId),
    ).resolves.toBe(installation);

    expect(transactionManager.findOne).toHaveBeenCalledWith(WorkspaceEntity, {
      lock: { mode: 'pessimistic_write' },
      where: { id: workspaceId },
    });
    expect(transactionManager.findOneBy).toHaveBeenCalledWith(
      MyahWorkspaceInstallationEntity,
      { workspaceId },
    );
    expect(transactionManager.create).not.toHaveBeenCalled();
    expect(transactionManager.save).not.toHaveBeenCalled();
  });

  it('creates one account and installation transactionally for a new workspace', async () => {
    const workspace = { id: workspaceId };
    const customerAccount = { id: customerAccountId };
    const installation = { customerAccountId, workspaceId };

    transactionManager.findOne.mockResolvedValue(workspace);
    transactionManager.findOneBy.mockResolvedValue(null);
    transactionManager.create
      .mockReturnValueOnce(customerAccount)
      .mockReturnValueOnce(installation);
    transactionManager.save
      .mockResolvedValueOnce(customerAccount)
      .mockResolvedValueOnce(installation);

    await expect(
      service.ensureWorkspaceInstallation(workspaceId),
    ).resolves.toBe(installation);

    expect(transactionManager.create).toHaveBeenNthCalledWith(
      1,
      CustomerAccountEntity,
      {},
    );
    expect(transactionManager.save).toHaveBeenNthCalledWith(
      1,
      CustomerAccountEntity,
      customerAccount,
    );
    expect(transactionManager.create).toHaveBeenNthCalledWith(
      2,
      MyahWorkspaceInstallationEntity,
      { customerAccountId, workspaceId },
    );
    expect(transactionManager.save).toHaveBeenNthCalledWith(
      2,
      MyahWorkspaceInstallationEntity,
      installation,
    );
  });

  it('attaches distinct workspaces to the same customer account', async () => {
    const firstInstallation = { customerAccountId, workspaceId };
    const secondInstallation = {
      customerAccountId,
      workspaceId: secondWorkspaceId,
    };

    myahWorkspaceInstallationRepository.findOneBy.mockResolvedValue(null);
    myahWorkspaceInstallationRepository.create
      .mockReturnValueOnce(firstInstallation)
      .mockReturnValueOnce(secondInstallation);
    myahWorkspaceInstallationRepository.save
      .mockResolvedValueOnce(firstInstallation)
      .mockResolvedValueOnce(secondInstallation);

    await expect(
      service.attachWorkspace({ customerAccountId, workspaceId }),
    ).resolves.toEqual({ created: true, installation: firstInstallation });
    await expect(
      service.attachWorkspace({
        customerAccountId,
        workspaceId: secondWorkspaceId,
      }),
    ).resolves.toEqual({ created: true, installation: secondInstallation });

    expect(myahWorkspaceInstallationRepository.create).toHaveBeenNthCalledWith(
      1,
      { customerAccountId, workspaceId },
    );
    expect(myahWorkspaceInstallationRepository.create).toHaveBeenNthCalledWith(
      2,
      { customerAccountId, workspaceId: secondWorkspaceId },
    );
  });

  it('returns the existing installation when attaching the same workspace again', async () => {
    const existingInstallation = { customerAccountId, workspaceId };

    myahWorkspaceInstallationRepository.findOneBy.mockResolvedValue(
      existingInstallation,
    );

    await expect(
      service.attachWorkspace({ customerAccountId, workspaceId }),
    ).resolves.toEqual({
      created: false,
      installation: existingInstallation,
    });

    expect(myahWorkspaceInstallationRepository.create).not.toHaveBeenCalled();
    expect(myahWorkspaceInstallationRepository.save).not.toHaveBeenCalled();
  });

  it('rejects assigning an installed workspace to another customer account', async () => {
    myahWorkspaceInstallationRepository.findOneBy.mockResolvedValue({
      customerAccountId: otherCustomerAccountId,
      workspaceId,
    });

    await expect(
      service.attachWorkspace({ customerAccountId, workspaceId }),
    ).rejects.toThrow(CustomerAccountWorkspaceConflictError);

    expect(myahWorkspaceInstallationRepository.create).not.toHaveBeenCalled();
    expect(myahWorkspaceInstallationRepository.save).not.toHaveBeenCalled();
  });

  it('treats a unique-constraint race as idempotent for the same account', async () => {
    const installation = { customerAccountId, workspaceId };

    myahWorkspaceInstallationRepository.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(installation);
    myahWorkspaceInstallationRepository.create.mockReturnValue(installation);
    myahWorkspaceInstallationRepository.save.mockRejectedValue({
      code: '23505',
    });

    await expect(
      service.attachWorkspace({ customerAccountId, workspaceId }),
    ).resolves.toEqual({ created: false, installation });
  });

  it('rejects a unique-constraint race when another account won it', async () => {
    const installation = { customerAccountId, workspaceId };

    myahWorkspaceInstallationRepository.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        customerAccountId: otherCustomerAccountId,
        workspaceId,
      });
    myahWorkspaceInstallationRepository.create.mockReturnValue(installation);
    myahWorkspaceInstallationRepository.save.mockRejectedValue({
      code: '23505',
    });

    await expect(
      service.attachWorkspace({ customerAccountId, workspaceId }),
    ).rejects.toThrow(CustomerAccountWorkspaceConflictError);
  });
});

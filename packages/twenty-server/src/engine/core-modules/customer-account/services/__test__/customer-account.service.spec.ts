import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  CustomerAccountWorkspaceConflictError,
  CustomerAccountService,
} from 'src/engine/core-modules/customer-account/services/customer-account.service';
import { CustomerAccountEntity } from 'src/engine/core-modules/customer-account/entities/customer-account.entity';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';

describe('CustomerAccountService', () => {
  let service: CustomerAccountService;
  let customerAccountRepository: jest.Mocked<{
    create: jest.Mock;
    save: jest.Mock;
  }>;
  let myahWorkspaceInstallationRepository: jest.Mocked<{
    create: jest.Mock;
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
    ).resolves.toBe(firstInstallation);
    await expect(
      service.attachWorkspace({
        customerAccountId,
        workspaceId: secondWorkspaceId,
      }),
    ).resolves.toBe(secondInstallation);

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
    ).resolves.toBe(existingInstallation);

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
    ).resolves.toBe(installation);
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

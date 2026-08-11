import { Logger } from '@nestjs/common';
import { type Repository } from 'typeorm';

import { ManagedEmailAttachPilotWorkspaceCommand } from 'src/database/commands/managed-email-attach-pilot-workspace.command';
import {
  CustomerAccountWorkspaceConflictError,
  type CustomerAccountService,
} from 'src/engine/core-modules/customer-account/services/customer-account.service';
import { type EventLogEmitterService } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.service';
import { type MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

jest.mock(
  'src/engine/core-modules/event-logs/emit/event-log-emitter.service',
  () => ({
    EventLogEmitterService: class EventLogEmitterService {},
  }),
);
jest.mock(
  'src/engine/core-modules/myah/services/myah-team-authorization.service',
  () => ({
    MyahTeamAuthorizationService: class MyahTeamAuthorizationService {},
  }),
);
jest.mock('src/engine/core-modules/user/user.entity', () => ({
  UserEntity: class UserEntity {},
}));
jest.mock(
  'src/engine/core-modules/user-workspace/user-workspace.entity',
  () => ({
    UserWorkspaceEntity: class UserWorkspaceEntity {},
  }),
);
jest.mock('src/engine/core-modules/workspace/workspace.entity', () => ({
  WorkspaceEntity: class WorkspaceEntity {},
}));

const OPERATOR_ID = '7c637646-bede-4bc4-8132-aad3751b4d45';
const OPERATOR_EMAIL = 'operator@myah.test';
const SOURCE_WORKSPACE_ID = 'cca53cff-220e-41a7-835a-a598b2e87ddf';
const TARGET_WORKSPACE_ID = '927a7acc-de15-4b4a-bd2b-6c98229b611c';
const CUSTOMER_ACCOUNT_ID = '48c851bd-886a-4828-b5c4-d54027c28a7d';
const REASON = 'MYAH-258 controlled managed-email pilot';

const options = {
  operatorEmail: ` ${OPERATOR_EMAIL.toUpperCase()} `,
  reason: ` ${REASON} `,
  sourceWorkspaceId: ` ${SOURCE_WORKSPACE_ID} `,
  targetWorkspaceId: ` ${TARGET_WORKSPACE_ID} `,
};

type Installation = {
  customerAccountId: string;
  workspaceId: string;
};

type FixtureOverrides = {
  eventEnabled?: boolean;
  eventSuccess?: boolean;
  operatorAuthorized?: boolean;
  operatorDisabled?: boolean;
  operatorFound?: boolean;
  sourceInstallation?: Installation | null;
  targetExists?: boolean;
  targetInstallation?: Installation | null;
  workspaceMemberships?: string[];
};

const createFixture = (overrides: FixtureOverrides = {}) => {
  const operator = {
    email: OPERATOR_EMAIL,
    id: OPERATOR_ID,
    disabled: overrides.operatorDisabled ?? false,
    isEmailVerified: true,
  } as UserEntity;
  let targetInstallation =
    overrides.targetInstallation === undefined
      ? null
      : overrides.targetInstallation;
  const sourceInstallation =
    overrides.sourceInstallation === undefined
      ? {
          customerAccountId: CUSTOMER_ACCOUNT_ID,
          workspaceId: SOURCE_WORKSPACE_ID,
        }
      : overrides.sourceInstallation;
  const workspaceMemberships = new Set(
    overrides.workspaceMemberships ?? [
      SOURCE_WORKSPACE_ID,
      TARGET_WORKSPACE_ID,
    ],
  );
  const userRepository = {
    findOneBy: jest
      .fn()
      .mockImplementation(({ disabled }) =>
        Promise.resolve(
          overrides.operatorFound === false ||
            (disabled === false && operator.disabled)
            ? null
            : operator,
        ),
      ),
  } as unknown as Repository<UserEntity>;
  const userWorkspaceRepository = {
    existsBy: jest
      .fn()
      .mockImplementation(({ userId, workspaceId }) =>
        Promise.resolve(
          userId === OPERATOR_ID && workspaceMemberships.has(workspaceId),
        ),
      ),
  } as unknown as Repository<UserWorkspaceEntity>;
  const workspaceRepository = {
    existsBy: jest
      .fn()
      .mockImplementation(({ id }) =>
        Promise.resolve(
          id === SOURCE_WORKSPACE_ID ||
            (id === TARGET_WORKSPACE_ID && overrides.targetExists !== false),
        ),
      ),
  } as unknown as Repository<WorkspaceEntity>;
  const customerAccountService = {
    attachWorkspace: jest
      .fn()
      .mockImplementation(
        async ({
          customerAccountId,
          workspaceId,
        }: {
          customerAccountId: string;
          workspaceId: string;
        }) => {
          if (
            targetInstallation !== null &&
            targetInstallation.customerAccountId !== customerAccountId
          ) {
            throw new CustomerAccountWorkspaceConflictError(workspaceId);
          }
          const created = targetInstallation === null;

          targetInstallation = { customerAccountId, workspaceId };

          return { created, installation: targetInstallation };
        },
      ),
    getWorkspaceInstallation: jest
      .fn()
      .mockImplementation(async (workspaceId: string) =>
        workspaceId === SOURCE_WORKSPACE_ID
          ? sourceInstallation
          : targetInstallation,
      ),
  } as unknown as jest.Mocked<CustomerAccountService>;
  const myahTeamAuthorizationService = {
    isMyahTeamMember: jest
      .fn()
      .mockImplementation(
        (user: UserEntity | null | undefined) =>
          user !== null &&
          user !== undefined &&
          overrides.operatorAuthorized !== false,
      ),
  } as unknown as jest.Mocked<MyahTeamAuthorizationService>;
  const insertWorkspaceEvent = jest
    .fn()
    .mockResolvedValue({ success: overrides.eventSuccess !== false });
  const eventLogEmitterService = {
    isEnabled: jest.fn().mockReturnValue(overrides.eventEnabled !== false),
    createContext: jest.fn().mockReturnValue({ insertWorkspaceEvent }),
  } as unknown as jest.Mocked<EventLogEmitterService>;
  const command = new ManagedEmailAttachPilotWorkspaceCommand(
    userRepository,
    userWorkspaceRepository,
    workspaceRepository,
    customerAccountService,
    myahTeamAuthorizationService,
    eventLogEmitterService,
  );

  return {
    command,
    customerAccountService,
    eventLogEmitterService,
    insertWorkspaceEvent,
    myahTeamAuthorizationService,
    userWorkspaceRepository,
    workspaceRepository,
  };
};

describe('ManagedEmailAttachPilotWorkspaceCommand', () => {
  let loggerLogSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches the pilot idempotently and records a deterministic audit receipt', async () => {
    const fixture = createFixture();

    await fixture.command.run([], options);
    await fixture.command.run([], options);

    expect(
      fixture.myahTeamAuthorizationService.isMyahTeamMember,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ email: OPERATOR_EMAIL, id: OPERATOR_ID }),
    );
    expect(fixture.userWorkspaceRepository.existsBy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR_ID,
        workspaceId: SOURCE_WORKSPACE_ID,
      }),
    );
    expect(fixture.userWorkspaceRepository.existsBy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR_ID,
        workspaceId: TARGET_WORKSPACE_ID,
      }),
    );
    expect(
      fixture.customerAccountService.attachWorkspace,
    ).toHaveBeenCalledTimes(2);
    expect(fixture.customerAccountService.attachWorkspace).toHaveBeenCalledWith(
      {
        customerAccountId: CUSTOMER_ACCOUNT_ID,
        workspaceId: TARGET_WORKSPACE_ID,
      },
    );
    expect(fixture.eventLogEmitterService.createContext).toHaveBeenCalledWith({
      userId: OPERATOR_ID,
      workspaceId: TARGET_WORKSPACE_ID,
    });
    expect(fixture.insertWorkspaceEvent).toHaveBeenNthCalledWith(
      1,
      'ManagedEmailPilotWorkspaceAttached',
      expect.objectContaining({
        attachmentCreated: true,
        reason: REASON,
        sourceWorkspaceId: SOURCE_WORKSPACE_ID,
        targetWorkspaceId: TARGET_WORKSPACE_ID,
      }),
    );
    expect(fixture.insertWorkspaceEvent).toHaveBeenNthCalledWith(
      2,
      'ManagedEmailPilotWorkspaceAttached',
      expect.objectContaining({ attachmentCreated: false }),
    );

    const receipts = loggerLogSpy.mock.calls.map(([line]) =>
      JSON.parse(line as string),
    );

    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({
      attachmentCreated: true,
      operatorUserId: OPERATOR_ID,
      reason: REASON,
      sourceWorkspaceId: SOURCE_WORKSPACE_ID,
      targetWorkspaceId: TARGET_WORKSPACE_ID,
    });
    expect(receipts[1]).toMatchObject({
      ...receipts[0],
      attachmentCreated: false,
    });
    expect(receipts[0].receiptId).toMatch(/^[a-f0-9]{64}$/);
    expect(receipts[1].receiptId).toBe(receipts[0].receiptId);
  });

  it('records exactly one creation across simultaneous idempotent attachments', async () => {
    const fixture = createFixture();

    await Promise.all([
      fixture.command.run([], options),
      fixture.command.run([], options),
    ]);

    const attachmentCreatedValues = fixture.insertWorkspaceEvent.mock.calls
      .map(([, properties]) => properties.attachmentCreated)
      .sort();

    expect(attachmentCreatedValues).toEqual([false, true]);
  });

  it.each([
    {
      operatorAuthorized: false,
      operatorDisabled: false,
      operatorFound: true,
    },
    {
      operatorAuthorized: true,
      operatorDisabled: false,
      operatorFound: false,
    },
    {
      operatorAuthorized: true,
      operatorDisabled: true,
      operatorFound: true,
    },
  ])(
    'rejects an unauthorized or inactive operator identity',
    async (overrides) => {
      const fixture = createFixture(overrides);

      await expect(fixture.command.run([], options)).rejects.toThrow(
        'Managed email pilot operator is not authorized',
      );
      expect(
        fixture.customerAccountService.attachWorkspace,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([SOURCE_WORKSPACE_ID, TARGET_WORKSPACE_ID])(
    'rejects when the operator is not a member of workspace %s',
    async (missingWorkspaceId) => {
      const fixture = createFixture({
        workspaceMemberships: [SOURCE_WORKSPACE_ID, TARGET_WORKSPACE_ID].filter(
          (workspaceId) => workspaceId !== missingWorkspaceId,
        ),
      });

      await expect(fixture.command.run([], options)).rejects.toThrow(
        'Managed email pilot operator is not a member of both workspaces',
      );
      expect(
        fixture.customerAccountService.attachWorkspace,
      ).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing target workspace', async () => {
    const fixture = createFixture({ targetExists: false });

    await expect(fixture.command.run([], options)).rejects.toThrow(
      'Managed email pilot target workspace was not found',
    );
    expect(
      fixture.customerAccountService.attachWorkspace,
    ).not.toHaveBeenCalled();
  });

  it('rejects a source workspace without an installation', async () => {
    const fixture = createFixture({ sourceInstallation: null });

    await expect(fixture.command.run([], options)).rejects.toThrow(
      'Managed email pilot source installation was not found',
    );
    expect(
      fixture.customerAccountService.attachWorkspace,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when the target belongs to another customer account', async () => {
    const fixture = createFixture({
      targetInstallation: {
        customerAccountId: '608f52d9-bef2-443d-a44e-fba729fed299',
        workspaceId: TARGET_WORKSPACE_ID,
      },
    });

    await expect(fixture.command.run([], options)).rejects.toThrow(
      CustomerAccountWorkspaceConflictError,
    );
    expect(fixture.insertWorkspaceEvent).not.toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalled();
  });

  it('fails before attachment when durable audit storage is disabled', async () => {
    const fixture = createFixture({ eventEnabled: false });

    await expect(fixture.command.run([], options)).rejects.toThrow(
      'Managed email pilot audit storage is disabled',
    );
    expect(
      fixture.customerAccountService.attachWorkspace,
    ).not.toHaveBeenCalled();
    expect(fixture.insertWorkspaceEvent).not.toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalled();
  });

  it('fails without printing a receipt when audit emission fails', async () => {
    const fixture = createFixture({ eventSuccess: false });

    await expect(fixture.command.run([], options)).rejects.toThrow(
      'Managed email pilot audit receipt could not be recorded',
    );
    expect(
      fixture.customerAccountService.attachWorkspace,
    ).toHaveBeenCalledTimes(1);
    expect(loggerLogSpy).not.toHaveBeenCalled();
  });

  it('rejects blank command options before querying production state', async () => {
    const fixture = createFixture();

    await expect(
      fixture.command.run([], { ...options, reason: '   ' }),
    ).rejects.toThrow('Managed email pilot reason is required');
    expect(
      fixture.myahTeamAuthorizationService.isMyahTeamMember,
    ).not.toHaveBeenCalled();
  });
});

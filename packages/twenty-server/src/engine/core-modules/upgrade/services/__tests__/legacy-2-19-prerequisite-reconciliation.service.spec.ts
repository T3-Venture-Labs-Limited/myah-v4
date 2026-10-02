import { Legacy219PrerequisiteReconciliationService } from 'src/engine/core-modules/upgrade/services/legacy-2-19-prerequisite-reconciliation.service';

describe('Legacy219PrerequisiteReconciliationService', () => {
  it('rejects a generic incomplete migration without opening a write transaction', async () => {
    const createQueryRunner = jest.fn();
    const service = new Legacy219PrerequisiteReconciliationService(
      { createQueryRunner } as never,
      {
        isLastAttemptCompleted: jest.fn().mockResolvedValue(false),
        hasInstanceAttempt: jest.fn().mockResolvedValue(false),
      } as never,
      { runFastInstanceCommand: jest.fn() } as never,
    );

    await expect(
      service.reconcile({
        workspaceIds: [],
        workspaceCursors: new Map(),
        sequence: [],
        maintenanceWindowConfirmed: true,
      }),
    ).rejects.toThrow(/pinned.*Rebrand/i);
    expect(createQueryRunner).not.toHaveBeenCalled();
  });

  it('rejects mixed legacy/generic authority before invoking the native DDL runner', async () => {
    const ids = [
      '1784106536000',
      '1784112688976',
      '1784112963055',
      '1784112963056',
      '1784112963058',
      '1784266302003',
      '1784486000000',
      '1784487000000',
      '1784488000000',
      '1785453079000',
      '1785453081000',
    ];
    const sequence = [
      ...ids.map((id) => ({
        kind: 'fast-instance',
        version: '2.19.0',
        name: `2.19.0_FastCommand_${id}`,
      })),
      ...[
        'RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206',
        'AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001',
        'FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059',
      ].map((name) => ({
        kind: 'slow-instance',
        version: '2.19.0',
        name: `2.19.0_${name}`,
      })),
    ];
    const queryRunner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM pg_class'))
          return [
            { name: 'instagramReplyApprovalRequest', kind: 'r' },
            { name: 'actionApprovalBinding', kind: 'r' },
            { name: 'myahWorkspaceInstallation', kind: 'r' },
          ];
        return [];
      }),
    };
    const runFastInstanceCommand = jest.fn();
    const service = new Legacy219PrerequisiteReconciliationService(
      { createQueryRunner: () => queryRunner } as never,
      {
        isLastAttemptCompleted: jest
          .fn()
          .mockImplementation(({ name }: { name: string }) =>
            Promise.resolve(name.includes('RebrandEmailSender')),
          ),
        hasInstanceAttempt: jest.fn().mockResolvedValue(false),
      } as never,
      { runFastInstanceCommand } as never,
    );
    await expect(
      service.reconcile({
        workspaceIds: [],
        workspaceCursors: new Map(),
        sequence: sequence as never,
        maintenanceWindowConfirmed: true,
      }),
    ).rejects.toThrow(/mixed or partial authority tables/);
    expect(runFastInstanceCommand).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { MessagingMessageParticipantService } from 'src/modules/messaging/message-participant-manager/services/messaging-message-participant.service';

describe('MessagingMessageParticipantService', () => {
  it('reuses role and normalized handle identity without adding a display-name variant', async () => {
    const manager = {} as WorkspaceEntityManager;
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          messageId: 'message-id',
          role: 'TO',
          handle: 'Creator@Example.com',
          displayName: 'Creator Name',
        },
      ]),
      insert: jest.fn().mockResolvedValue({ raw: [] }),
    };
    const globalManager = {
      executeInWorkspaceContext: jest.fn(async (work) => work()),
      getRepository: jest.fn().mockResolvedValue(repository),
    };
    const matchParticipantService = { matchParticipants: jest.fn() };
    const service = new MessagingMessageParticipantService(
      globalManager as never,
      matchParticipantService as never,
    );

    await service.saveMessageParticipants(
      [
        {
          messageId: 'message-id',
          role: 'TO',
          handle: ' creator@example.com ',
          displayName: 'creator@example.com',
        },
      ] as never,
      'workspace-id',
      manager,
    );

    expect(repository.find).toHaveBeenCalledWith(
      { where: { messageId: expect.anything() } },
      manager,
    );
    expect(repository.insert).toHaveBeenCalledWith([], manager);
    expect(matchParticipantService.matchParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        participants: [],
        transactionManager: manager,
      }),
    );
  });
});

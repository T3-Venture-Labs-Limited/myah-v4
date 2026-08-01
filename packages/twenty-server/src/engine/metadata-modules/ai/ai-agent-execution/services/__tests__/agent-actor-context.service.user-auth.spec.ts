import { AgentActorContextService } from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-actor-context.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const roleId = '20202020-0b5c-4178-bed7-d371f6411eab';

describe('AgentActorContextService user auth context', () => {
  it('reconstructs a real user auth context from persisted workspace, user-workspace, and member records', async () => {
    const workspace = { id: workspaceId, displayName: 'Workspace' };
    const user = { id: userId, email: 'operator@example.com' };
    const userWorkspace = {
      id: userWorkspaceId,
      workspaceId,
      userId,
      user,
      locale: 'en',
    };
    const workspaceMember = {
      id: workspaceMemberId,
      userId,
      name: { firstName: 'Operator', lastName: 'User' },
      timeZone: null,
    };
    const userWorkspaceService = {
      findByIdWithUser: jest.fn().mockResolvedValue(userWorkspace),
    };
    const userRoleService = {
      getRoleIdForUserWorkspace: jest.fn().mockResolvedValue(roleId),
    };
    const workspaceMemberRepository = {
      findOne: jest.fn().mockResolvedValue(workspaceMember),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation((run: () => unknown) => run()),
      getRepository: jest.fn().mockResolvedValue(workspaceMemberRepository),
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const service = new AgentActorContextService(
      userWorkspaceService as never,
      userRoleService as never,
      globalWorkspaceOrmManager as never,
      workspaceRepository as never,
    );

    await expect(
      service.buildUserAndAgentActorContext(userWorkspaceId, workspaceId),
    ).resolves.toMatchObject({
      roleId,
      userId,
      userWorkspaceId,
      actorContext: { workspaceMemberId },
      authContext: {
        type: 'user',
        workspace,
        userWorkspaceId,
        user,
        workspaceMemberId,
        workspaceMember,
      },
    });
    expect(userWorkspaceService.findByIdWithUser).toHaveBeenCalledWith(
      userWorkspaceId,
    );
    expect(workspaceRepository.findOne).toHaveBeenCalledWith({
      where: { id: workspaceId },
    });
  });
});

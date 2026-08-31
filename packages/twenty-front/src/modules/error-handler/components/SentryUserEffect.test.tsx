import { render, waitFor } from '@testing-library/react';
import * as Sentry from '@sentry/react';

import { SentryUserEffect } from '@/error-handler/components/SentryUserEffect';

const mockAtomValues: Record<string, unknown> = {};
const mockUseAtomStateValue = jest.fn((state: string) => mockAtomValues[state]);

jest.mock('@sentry/react', () => ({ setUser: jest.fn() }));
jest.mock('@/auth/states/currentUserState', () => ({
  currentUserState: 'currentUserState',
}));
jest.mock('@/auth/states/currentWorkspaceMemberState', () => ({
  currentWorkspaceMemberState: 'currentWorkspaceMemberState',
}));
jest.mock('@/auth/states/currentWorkspaceState', () => ({
  currentWorkspaceState: 'currentWorkspaceState',
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: string) => mockUseAtomStateValue(state),
}));

describe('SentryUserEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockAtomValues.currentUserState;
    delete mockAtomValues.currentWorkspaceState;
    delete mockAtomValues.currentWorkspaceMemberState;
  });

  it('sets authenticated user and workspace context', async () => {
    mockAtomValues.currentUserState = {
      email: 'user@example.com',
      id: 'user-id',
    };
    mockAtomValues.currentWorkspaceState = { id: 'workspace-id' };
    mockAtomValues.currentWorkspaceMemberState = {
      id: 'workspace-member-id',
    };

    render(<SentryUserEffect />);

    await waitFor(() => {
      expect(Sentry.setUser).toHaveBeenCalledWith({
        email: 'user@example.com',
        id: 'user-id',
        workspaceId: 'workspace-id',
        workspaceMemberId: 'workspace-member-id',
      });
    });
  });

  it('clears Sentry user context when signed out', async () => {
    render(<SentryUserEffect />);

    await waitFor(() => {
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });
  });
});

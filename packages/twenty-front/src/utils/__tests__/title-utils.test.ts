import { i18n } from '@lingui/core';
import { messages as enMessages } from '~/locales/generated/en';
import { getPageTitleFromPath } from '~/utils/title-utils';

i18n.load('en', enMessages);
i18n.activate('en');

describe('title-utils', () => {
  it('should return the correct title for a given path', () => {
    expect(getPageTitleFromPath('/verify')).toBe('Verify');
    expect(getPageTitleFromPath('/welcome')).toBe(
      'Sign in or Create an account',
    );
    expect(getPageTitleFromPath('/invite/:workspaceInviteHash')).toBe('Invite');
    expect(getPageTitleFromPath('/workspace-activation')).toBe(
      'Create Workspace',
    );
    expect(getPageTitleFromPath('/create/profile')).toBe('Create Profile');
    expect(getPageTitleFromPath('/myah/inbox')).toBe('Myah');
    expect(getPageTitleFromPath('/settings/profile')).toBe('Myah');
    expect(getPageTitleFromPath('/settings/email')).toBe('Myah');
    expect(getPageTitleFromPath('/objects/creators')).toBe('Myah');
    expect(getPageTitleFromPath('/')).toBe('Myah');
    expect(getPageTitleFromPath('/random')).toBe('Myah');
  });
});

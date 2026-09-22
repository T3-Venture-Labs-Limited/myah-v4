import { MODULE_METADATA } from '@nestjs/common/constants';

import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { WorkspaceQueryHookModule } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.module';
import { MyahCreatorSocialProfileModule } from 'src/modules/myah-creator-social-profile/myah-creator-social-profile.module';
import {
  SocialProfileCreateManyPreQueryHook,
  SocialProfileCreateOnePreQueryHook,
  SocialProfileDeleteManyPreQueryHook,
  SocialProfileDeleteOnePreQueryHook,
  SocialProfileDestroyManyPreQueryHook,
  SocialProfileDestroyOnePreQueryHook,
  SocialProfileRestoreManyPreQueryHook,
  SocialProfileRestoreOnePreQueryHook,
  SocialProfileUpdateManyPreQueryHook,
  SocialProfileUpdateOnePreQueryHook,
} from 'src/modules/myah-creator-social-profile/query-hooks/social-profile.pre-query-hooks';

const authContext = { workspace: { id: 'workspace-1' } } as never;

const hookCases = [
  [SocialProfileCreateOnePreQueryHook, 'socialProfile.createOne'],
  [SocialProfileCreateManyPreQueryHook, 'socialProfile.createMany'],
  [SocialProfileUpdateOnePreQueryHook, 'socialProfile.updateOne'],
  [SocialProfileUpdateManyPreQueryHook, 'socialProfile.updateMany'],
  [SocialProfileDeleteOnePreQueryHook, 'socialProfile.deleteOne'],
  [SocialProfileDeleteManyPreQueryHook, 'socialProfile.deleteMany'],
  [SocialProfileDestroyOnePreQueryHook, 'socialProfile.destroyOne'],
  [SocialProfileDestroyManyPreQueryHook, 'socialProfile.destroyMany'],
  [SocialProfileRestoreOnePreQueryHook, 'socialProfile.restoreOne'],
  [SocialProfileRestoreManyPreQueryHook, 'socialProfile.restoreMany'],
] as const;

describe('SocialProfile query hooks', () => {
  it.each(hookCases)('registers %p for %s', (HookClass, key) => {
    expect(
      Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, HookClass),
    ).toEqual({
      key,
      type: WorkspaceQueryHookType.PRE_HOOK,
    });
  });

  it('registers every guard in the workspace query-hook graph', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCreatorSocialProfileModule,
    ) as unknown[];
    const workspaceImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      WorkspaceQueryHookModule,
    ) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining(hookCases.map(([HookClass]) => HookClass)),
    );
    expect(workspaceImports).toContain(MyahCreatorSocialProfileModule);
  });

  it('normalizes generic create input without accepting forged internal fields', async () => {
    const hook = new SocialProfileCreateOnePreQueryHook();

    expect(() =>
      hook.validateRawInput?.(
        authContext,
        'socialProfile',
        {
          data: {
            creatorId: 'creator-1',
            platform: 'instagram',
            handle: '@Creator.Name',
            normalizedLocator: 'handle:forged',
          },
        },
        {} as never,
      ),
    ).toThrow('managed by Myah');

    await expect(
      hook.execute(authContext, 'socialProfile', {
        data: {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@Creator.Name',
        },
      }),
    ).resolves.toEqual({
      data: {
        creatorId: 'creator-1',
        platform: 'INSTAGRAM',
        handle: 'creator.name',
        profileUrl: 'https://www.instagram.com/creator.name/',
        platformAccountId: null,
        normalizedLocator: 'handle:creator.name',
        name: '@creator.name on INSTAGRAM',
      },
    });
  });

  it.each([-1, 1.5, '10'])(
    'rejects invalid follower count %p on generic create and update',
    async (followerCount) => {
      const createHook = new SocialProfileCreateOnePreQueryHook();
      const updateHook = new SocialProfileUpdateOnePreQueryHook();

      expect(() =>
        createHook.validateRawInput?.(
          authContext,
          'socialProfile',
          {
            data: {
              creatorId: 'creator-1',
              platform: 'instagram',
              handle: '@creator.name',
              followerCount,
            },
          },
          {} as never,
        ),
      ).toThrow('non-negative integer');
      await expect(
        updateHook.execute(authContext, 'socialProfile', {
          id: 'profile-1',
          data: { followerCount },
        }),
      ).rejects.toThrow('non-negative integer');
    },
  );

  it.each([
    ['creatorId', 'creator-2'],
    ['creator', { connect: { id: 'creator-2' } }],
    ['platform', 'TIKTOK'],
    ['handle', 'replacement'],
    ['profileUrl', 'https://instagram.com/replacement'],
    ['platformAccountId', 'replacement-id'],
    ['normalizedLocator', 'handle:replacement'],
  ])('rejects generic identity update through %s', async (field, value) => {
    const hook = new SocialProfileUpdateOnePreQueryHook();

    await expect(
      hook.execute(authContext, 'socialProfile', {
        id: 'profile-1',
        data: { [field]: value },
      }),
    ).rejects.toThrow('identity fields');
  });

  it.each([
    SocialProfileDeleteOnePreQueryHook,
    SocialProfileDeleteManyPreQueryHook,
    SocialProfileDestroyOnePreQueryHook,
    SocialProfileDestroyManyPreQueryHook,
    SocialProfileRestoreOnePreQueryHook,
    SocialProfileRestoreManyPreQueryHook,
  ])(
    'blocks generic retirement or restoration through %p',
    async (HookClass) => {
      await expect(
        new HookClass().execute(authContext, 'socialProfile', {
          id: 'profile-1',
        } as never),
      ).rejects.toThrow('managed retirement service');
    },
  );
});

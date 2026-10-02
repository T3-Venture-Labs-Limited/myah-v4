import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import {
  getNamedType,
  isInputObjectType,
  isNonNullType,
  isObjectType,
} from 'graphql';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { UpdateSocialProfileIdentityInput } from 'src/modules/myah-creator-social-profile/dtos/social-profile.dto';
import { SocialProfileService } from 'src/modules/myah-creator-social-profile/services/social-profile.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { SocialProfileResolver } from 'src/modules/myah-creator-social-profile/resolvers/social-profile.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

@Resolver()
@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
class SchemaTestQueryResolver {
  @Query(() => Boolean)
  schemaTestQuery(): boolean {
    return true;
  }
}

describe('SocialProfileResolver', () => {
  const authContext = { workspace: { id: 'workspace-1' } } as never;
  const service = {
    updateIdentity: jest.fn(),
    retire: jest.fn(),
    restore: jest.fn(),
  };
  const resolver = new SocialProfileResolver(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getWorkspaceAuthContext).mockReturnValue(authContext);
  });

  it('builds the managed mutations with nullable scalar input and result fields', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        SocialProfileResolver,
        SchemaTestQueryResolver,
        { provide: SocialProfileService, useValue: service },
      ],
    }).compile();

    try {
      const schema = await moduleRef
        .get(GraphQLSchemaFactory)
        .create([SocialProfileResolver, SchemaTestQueryResolver]);
      const mutation = schema
        .getMutationType()
        ?.getFields().updateSocialProfileIdentity;
      expect(mutation).toBeDefined();
      const inputType = schema.getType('UpdateSocialProfileIdentityInput');
      const resultType = schema.getType('SocialProfileDTO');
      expect(isInputObjectType(inputType)).toBe(true);
      expect(isObjectType(resultType)).toBe(true);
      if (!isInputObjectType(inputType) || !isObjectType(resultType)) {
        throw new Error('Missing SocialProfile GraphQL types');
      }

      for (const [field, scalar] of Object.entries({
        handle: 'String',
        profileUrl: 'String',
        platformAccountId: 'String',
        followerCount: 'Int',
        followerCountObservedAt: 'String',
        followerCountSource: 'String',
      })) {
        const inputField = inputType.getFields()[field];
        expect(isNonNullType(inputField.type)).toBe(false);
        expect(getNamedType(inputField.type).name).toBe(scalar);
      }
      for (const [field, scalar] of Object.entries({
        handle: 'String',
        profileUrl: 'String',
        platformAccountId: 'String',
        followerCount: 'Int',
        followerCountObservedAt: 'DateTime',
        followerCountSource: 'String',
        deletedAt: 'DateTime',
      })) {
        const resultField = resultType.getFields()[field];
        expect(isNonNullType(resultField.type)).toBe(false);
        expect(getNamedType(resultField.type).name).toBe(scalar);
      }
    } finally {
      await moduleRef.close();
    }
  });

  it('delegates a managed update using only the authenticated workspace context', async () => {
    const persisted = { id: 'profile-1', creatorId: 'creator-1' };
    service.updateIdentity.mockResolvedValue(persisted);

    await expect(
      resolver.updateSocialProfileIdentity({
        id: 'profile-1',
        handle: '@corrected',
        followerCountObservedAt: '2026-09-22T00:00:00.000Z',
      }),
    ).resolves.toBe(persisted);
    expect(service.updateIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'profile-1',
        handle: '@corrected',
        followerCountObservedAt: new Date('2026-09-22T00:00:00.000Z'),
      }),
      authContext,
    );
  });

  it('rejects a null platform while allowing it to be omitted', async () => {
    await expect(
      validate(
        Object.assign(new UpdateSocialProfileIdentityInput(), {
          id: '00000000-0000-4000-8000-000000000001',
          platform: null,
        }),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'platform' }),
      ]),
    );
    await expect(
      validate(
        Object.assign(new UpdateSocialProfileIdentityInput(), {
          id: '00000000-0000-4000-8000-000000000001',
        }),
      ),
    ).resolves.toEqual([]);
  });

  it('returns the persisted result for retirement and restoration', async () => {
    const retired = { id: 'profile-1', deletedAt: new Date() };
    const restored = { id: 'profile-1', deletedAt: null };
    service.retire.mockResolvedValue(retired);
    service.restore.mockResolvedValue(restored);

    await expect(
      resolver.retireSocialProfile({ id: 'profile-1' }),
    ).resolves.toBe(retired);
    await expect(
      resolver.restoreSocialProfile({ id: 'profile-1' }),
    ).resolves.toBe(restored);
    expect(service.retire).toHaveBeenCalledWith('profile-1', authContext);
    expect(service.restore).toHaveBeenCalledWith('profile-1', authContext);
  });
});

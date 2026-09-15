import { GUARDS_METADATA, PIPES_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { graphql } from 'graphql';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';

import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { UpdateCampaignSendingWindowInput } from 'src/modules/campaign-execution/dtos/campaign-execution.dto';
import { CampaignExecutionApplicationService } from 'src/modules/campaign-execution/services/campaign-execution-application.service';
import { CampaignExecutionResolver } from 'src/modules/campaign-execution/resolvers/campaign-execution.resolver';
import {
  CampaignOutreachAudienceAccessError,
  CampaignOutreachAudienceReviewService,
} from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({
    getWorkspaceAuthContext: () => ({ workspace: { id: 'workspace' } }),
  }),
);

describe('CampaignExecutionResolver', () => {
  const service = { start: jest.fn(), stop: jest.fn() };
  const audienceReview = { preview: jest.fn() };
  const resolver = new CampaignExecutionResolver(
    service as never,
    audienceReview as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('requires workspace, user, custom-permission, and validation boundaries', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CampaignExecutionResolver),
    ).toEqual([WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard]);
    expect(
      Reflect.getMetadata(PIPES_METADATA, CampaignExecutionResolver),
    ).toEqual([ResolverValidationPipe]);
  });

  it('returns permission-scoped audience counts and identities without emails', async () => {
    audienceReview.preview.mockResolvedValue({
      campaignId: '10000000-0000-4000-8000-000000000001',
      eligible: [
        {
          campaignCreatorId: '20000000-0000-4000-8000-000000000001',
          creatorId: '30000000-0000-4000-8000-000000000001',
          creatorName: 'Ada',
          normalizedEmail: 'private@example.com',
        },
      ],
      excluded: [
        {
          campaignCreatorId: '20000000-0000-4000-8000-000000000002',
          creatorId: null,
          creatorName: null,
          reasons: ['MISSING_CREATOR'],
        },
      ],
    });

    await expect(
      resolver.campaignOutreachAudienceReview(
        '10000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toEqual({
      state: 'LOADED',
      campaignId: '10000000-0000-4000-8000-000000000001',
      errorCode: null,
      eligibleCount: 1,
      eligibleCreators: [
        {
          campaignCreatorId: '20000000-0000-4000-8000-000000000001',
          creatorId: '30000000-0000-4000-8000-000000000001',
          creatorName: 'Ada',
        },
      ],
      excludedCount: 1,
      excludedCreators: [
        {
          campaignCreatorId: '20000000-0000-4000-8000-000000000002',
          creatorId: null,
          creatorName: null,
          reasons: ['MISSING_CREATOR'],
        },
      ],
    });
    expect(audienceReview.preview).toHaveBeenCalledWith({
      authContext: { workspace: { id: 'workspace' } },
      campaignId: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('does not turn an audience permission or workspace failure into an empty review', async () => {
    audienceReview.preview.mockRejectedValueOnce(
      new CampaignOutreachAudienceAccessError(
        'Campaign is missing, inaccessible, or deleted',
      ),
    );

    await expect(
      resolver.campaignOutreachAudienceReview(
        '10000000-0000-4000-8000-000000000099',
      ),
    ).rejects.toThrow('missing, inaccessible, or deleted');
  });

  it('returns an explicit error state for an authoritative audience load failure', async () => {
    audienceReview.preview.mockRejectedValueOnce(new Error('database offline'));

    await expect(
      resolver.campaignOutreachAudienceReview(
        '10000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toEqual({
      state: 'ERROR',
      campaignId: '10000000-0000-4000-8000-000000000001',
      errorCode: 'AUDIENCE_UNAVAILABLE',
      eligibleCount: 0,
      eligibleCreators: [],
      excludedCount: 0,
      excludedCreators: [],
    });
  });

  it('exposes the audience contract through the executable GraphQL schema without email fields', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        CampaignExecutionResolver,
        { provide: CampaignExecutionApplicationService, useValue: service },
        {
          provide: CampaignOutreachAudienceReviewService,
          useValue: audienceReview,
        },
      ],
    }).compile();
    const schema = await moduleRef
      .get(GraphQLSchemaFactory)
      .create([CampaignExecutionResolver]);
    const result = await graphql({
      schema,
      source: `query {
        campaignOutreachAudienceReview(campaignId: "10000000-0000-4000-8000-000000000001") {
          state errorCode campaignId eligibleCount excludedCount
          eligibleCreators { campaignCreatorId creatorId creatorName }
          excludedCreators { campaignCreatorId creatorId creatorName reasons }
        }
      }`,
      rootValue: {
        campaignOutreachAudienceReview: {
          state: 'LOADED',
          errorCode: null,
          campaignId: '10000000-0000-4000-8000-000000000001',
          eligibleCount: 1,
          eligibleCreators: [
            {
              campaignCreatorId: '20000000-0000-4000-8000-000000000001',
              creatorId: '30000000-0000-4000-8000-000000000001',
              creatorName: 'Ada',
            },
          ],
          excludedCount: 1,
          excludedCreators: [
            {
              campaignCreatorId: '20000000-0000-4000-8000-000000000002',
              creatorId: null,
              creatorName: null,
              reasons: ['MISSING_CREATOR'],
            },
          ],
        },
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toMatchObject({
      campaignOutreachAudienceReview: {
        state: 'LOADED',
        eligibleCount: 1,
        excludedCount: 1,
        eligibleCreators: [{ creatorName: 'Ada' }],
        excludedCreators: [{ reasons: ['MISSING_CREATOR'] }],
      },
    });
    expect(
      schema
        .getType('CampaignOutreachAudienceCreator')
        ?.toString()
        .includes('normalizedEmail'),
    ).toBe(false);
    await moduleRef.close();
  });

  it('forwards only Campaign identity and the stable Start key', async () => {
    service.start.mockResolvedValue({ status: 'STARTED' });
    await resolver.startCampaignExecution({
      campaignId: '10000000-0000-4000-8000-000000000001',
      startIdempotencyKey: '20000000-0000-4000-8000-000000000002',
    });
    expect(service.start).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      { workspace: { id: 'workspace' } },
    );
    expect(service.start.mock.calls[0]).toHaveLength(3);
  });

  it('forwards Stop without lifecycle, authority, or provider payload', async () => {
    service.stop.mockResolvedValue({ status: 'STOPPED' });
    await resolver.stopCampaignExecution({
      campaignId: '10000000-0000-4000-8000-000000000001',
    });
    expect(service.stop).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      { workspace: { id: 'workspace' } },
    );
  });

  it('accepts canonical HH:mm:ss sending-window values at the API boundary', async () => {
    const input = Object.assign(new UpdateCampaignSendingWindowInput(), {
      campaignId: '10000000-0000-4000-8000-000000000001',
      timeZone: 'UTC',
      startLocalTime: '00:00:00',
      endLocalTime: '23:59:00',
    });

    await expect(validate(input)).resolves.toEqual([]);
  });
});

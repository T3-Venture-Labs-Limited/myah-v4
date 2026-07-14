import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FeatureFlagKey } from 'twenty-shared/types';

import { SetMyahPlatformFeatureFlagDto } from 'src/modules/myah-platform-admin/dtos/set-myah-platform-feature-flag.dto';

describe('SetMyahPlatformFeatureFlagDto', () => {
  it('accepts a boolean feature-flag update', async () => {
    const errors = await validate(
      plainToInstance(SetMyahPlatformFeatureFlagDto, {
        enabled: true,
        featureFlag: FeatureFlagKey.IS_JUNCTION_RELATIONS_ENABLED,
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-boolean enabled value', async () => {
    const errors = await validate(
      plainToInstance(SetMyahPlatformFeatureFlagDto, {
        enabled: 'true',
        featureFlag: FeatureFlagKey.IS_JUNCTION_RELATIONS_ENABLED,
      }),
    );

    expect(errors[0]?.constraints).toHaveProperty('isBoolean');
  });

  it('rejects an unknown feature flag', async () => {
    const errors = await validate(
      plainToInstance(SetMyahPlatformFeatureFlagDto, {
        enabled: true,
        featureFlag: 'IS_AI_ENABLED',
      }),
    );

    expect(errors[0]?.constraints).toHaveProperty('isEnum');
  });
});

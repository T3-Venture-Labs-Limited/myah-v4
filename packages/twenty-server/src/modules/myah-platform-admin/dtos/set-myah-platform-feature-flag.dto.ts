import { IsBoolean, IsEnum } from 'class-validator';
import { FeatureFlagKey } from 'twenty-shared/types';

export class SetMyahPlatformFeatureFlagDto {
  @IsBoolean()
  enabled: boolean;

  @IsEnum(FeatureFlagKey)
  featureFlag: FeatureFlagKey;
}

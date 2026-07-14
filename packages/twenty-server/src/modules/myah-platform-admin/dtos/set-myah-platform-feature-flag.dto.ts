import { IsBoolean, IsString } from 'class-validator';

export class SetMyahPlatformFeatureFlagDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  featureFlag: string;
}

import { ConfigService } from '@/cli/utilities/config/config-service';

export const getServerUrl = async (): Promise<string> => {
  return (
    process.env.TWENTY_API_URL ?? (await new ConfigService().getConfig()).apiUrl
  );
};

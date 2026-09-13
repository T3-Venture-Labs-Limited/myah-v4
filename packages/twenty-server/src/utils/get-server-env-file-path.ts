const INTEGRATION_ENV_FILE_SELECTOR =
  'TWENTY_SERVER_INTEGRATION_ENV_FILE' as const;

export const getServerEnvFilePath = (): string => {
  if (process.env.NODE_ENV !== 'test') {
    return '.env';
  }

  const selectedEnvFile = process.env[INTEGRATION_ENV_FILE_SELECTOR];

  if (selectedEnvFile === undefined) {
    return '.env.test';
  }

  if (selectedEnvFile.trim() === '') {
    throw new Error(
      'TWENTY_SERVER_INTEGRATION_ENV_FILE must be a non-empty path',
    );
  }

  return selectedEnvFile;
};

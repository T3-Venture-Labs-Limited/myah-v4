import { config } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';

import { getServerEnvFilePath } from 'src/utils/get-server-env-file-path';
config({
  path: getServerEnvFilePath(),
  override: true,
});

const typeORMRawModuleOptions: DataSourceOptions = {
  url: process.env.PG_DATABASE_URL,
  type: 'postgres',
  logging: ['error'],
  ssl:
    process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true'
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
};

export const rawDataSource = new DataSource(typeORMRawModuleOptions);

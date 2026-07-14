import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type MyahPlatformStatus = {
  database: 'reachable';
  environment: string;
  release: string;
  serverTime: string;
  startedAt: string;
  status: 'ok';
  uptimeSeconds: number;
};

@Injectable()
export class MyahPlatformStatusService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getStatus(): Promise<MyahPlatformStatus> {
    try {
      await this.dataSource.query('SELECT 1 AS ready');
    } catch {
      throw new ServiceUnavailableException('Platform database is unavailable');
    }
    const now = Date.now();
    const uptimeSeconds = Math.floor(process.uptime());
    return {
      database: 'reachable',
      environment: process.env.NODE_ENV ?? 'unknown',
      release:
        process.env.SENTRY_RELEASE ??
        process.env.RAILWAY_GIT_COMMIT_SHA ??
        'unknown',
      serverTime: new Date(now).toISOString(),
      startedAt: new Date(now - uptimeSeconds * 1000).toISOString(),
      status: 'ok',
      uptimeSeconds,
    };
  }
}

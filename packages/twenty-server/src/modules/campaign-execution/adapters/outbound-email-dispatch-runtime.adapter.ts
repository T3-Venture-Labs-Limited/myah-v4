import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  type OutboundEmailDispatchTransactionPort,
  type SuspendAwareMonotonicClock,
} from 'src/modules/campaign-execution/types/outbound-email-dispatch.type';

const MAX_FORWARD_CLOCK_DRIFT_MS = 1_000;

export type SuspendAwareClockSources = Readonly<{
  monotonicNow: () => number;
  wallNow: () => number;
}>;

export class ConservativeSuspendAwareMonotonicClock implements SuspendAwareMonotonicClock {
  private previousMonotonic: number;
  private previousWall: number;
  private elapsed: number;

  constructor(private readonly sources: SuspendAwareClockSources) {
    this.previousMonotonic = sources.monotonicNow();
    this.previousWall = sources.wallNow();
    this.elapsed = this.previousMonotonic;
    this.assertFinite(this.previousMonotonic, this.previousWall);
  }

  now(): number {
    const monotonic = this.sources.monotonicNow();
    const wall = this.sources.wallNow();

    this.assertFinite(monotonic, wall);
    const monotonicDelta = monotonic - this.previousMonotonic;
    const wallDelta = wall - this.previousWall;

    this.previousMonotonic = monotonic;
    this.previousWall = wall;
    if (monotonicDelta < 0) {
      throw new Error('Monotonic clock moved backwards');
    }
    if (wallDelta - monotonicDelta > MAX_FORWARD_CLOCK_DRIFT_MS) {
      throw new Error(
        'Process suspension or forward wall-clock drift detected',
      );
    }
    this.elapsed += monotonicDelta;

    return this.elapsed;
  }

  private assertFinite(...values: number[]): void {
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error('Suspend-aware clock source is non-finite');
    }
  }
}

@Injectable()
export class OutboundEmailDispatchTransactionAdapter implements OutboundEmailDispatchTransactionPort {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async runInTransaction<Result>(
    work: (manager: EntityManager) => Promise<Result>,
  ): Promise<Result> {
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

    return dataSource.transaction(work);
  }

  async runPreProviderTransaction<Result>(
    work: (manager: EntityManager) => Promise<Result>,
  ): Promise<Result> {
    return this.runInTransaction(work);
  }
}

export const createProductionSuspendAwareClock = () =>
  new ConservativeSuspendAwareMonotonicClock({
    monotonicNow: () => performance.now(),
    wallNow: () => Date.now(),
  });

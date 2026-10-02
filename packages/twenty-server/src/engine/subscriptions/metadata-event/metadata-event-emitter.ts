import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AllMetadataName } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MetadataEventBatch } from 'src/engine/subscriptions/metadata-event/types/metadata-event-batch.type';
import { computeMetadataEventName } from 'src/engine/subscriptions/metadata-event/utils/compute-metadata-event-name.util';
import {
  AllMetadataEventName,
  AllMetadataEventType,
  MetadataEvent,
} from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/metadata-event';

type EmitMetadataEventsArgs = {
  metadataEvents: MetadataEvent[];
  workspaceId: string;
  initiatorContext?: WorkspaceAuthContext;
};

@Injectable()
export class MetadataEventEmitter {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  public emitMetadataEvents(args: EmitMetadataEventsArgs): void {
    for (const batch of this.createBatches(args))
      this.eventEmitter.emit(batch.name, batch);
  }

  // Pinned upgrades must wait for durable webhook jobs and subscriber delivery
  // before their command process closes; the ordinary live path is unchanged.
  public async emitMetadataEventsAsync(
    args: EmitMetadataEventsArgs,
  ): Promise<void> {
    for (const batch of this.createBatches(args))
      await this.eventEmitter.emitAsync(batch.name, batch);
  }

  private createBatches({
    metadataEvents,
    workspaceId,
    initiatorContext,
  }: EmitMetadataEventsArgs): MetadataEventBatch[] {
    if (metadataEvents.length === 0) return [];

    const resolvedInitiatorContext =
      this.resolveInitiatorContext(initiatorContext);
    const userId =
      resolvedInitiatorContext?.type === 'user' ||
      resolvedInitiatorContext?.type === 'pendingActivationUser'
        ? resolvedInitiatorContext.user.id
        : undefined;
    const apiKeyId =
      resolvedInitiatorContext?.type === 'apiKey'
        ? resolvedInitiatorContext.apiKey.id
        : undefined;

    return [...this.groupByMetadataNameAndAction(metadataEvents).values()].map(
      ({ eventName, events, metadataName, type }): MetadataEventBatch => ({
        name: eventName,
        workspaceId,
        metadataName,
        type,
        events,
        userId,
        apiKeyId,
      }),
    );
  }

  private resolveInitiatorContext(
    initiatorContext?: WorkspaceAuthContext,
  ): WorkspaceAuthContext | undefined {
    if (isDefined(initiatorContext)) {
      return initiatorContext;
    }

    try {
      return getWorkspaceAuthContext();
    } catch {
      return undefined;
    }
  }

  private groupByMetadataNameAndAction(metadataEvents: MetadataEvent[]) {
    const grouped = new Map<
      AllMetadataEventName,
      {
        metadataName: AllMetadataName;
        type: AllMetadataEventType;
        eventName: AllMetadataEventName;
        events: MetadataEvent[];
      }
    >();

    for (const metadataEvent of metadataEvents) {
      const { metadataName, type } = metadataEvent;
      const eventName = computeMetadataEventName({
        metadataName,
        type,
      });
      const occurrence = grouped.get(eventName);

      if (!isDefined(occurrence)) {
        grouped.set(eventName, {
          eventName,
          metadataName,
          type,
          events: [metadataEvent],
        });
        continue;
      }

      grouped.set(eventName, {
        ...occurrence,
        events: [...occurrence.events, metadataEvent],
      });
    }

    return grouped;
  }
}

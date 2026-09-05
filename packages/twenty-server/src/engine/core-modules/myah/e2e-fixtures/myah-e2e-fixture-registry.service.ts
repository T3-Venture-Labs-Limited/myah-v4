import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const MAX_ACTIVE_FIXTURES = 100;

type FixtureRecords = {
  campaignIds: string[];
  connectedAccountIds: string[];
  messageChannelIds?: string[];
  campaignAccountIds?: string[];
  callbackConnectedAccountIdsByCampaignId?: Record<string, string>;
  outreachActionIds?: string[];
  creatorIds?: string[];
  campaignCreatorIds?: string[];
  actionApprovalBindingIds?: string[];
  agentChatThreadIds?: string[];
  agentMessageIds?: string[];
  agentMessagePartIds?: string[];
};

export type MyahE2eFixture = {
  id: string;
  workspaceId: string;
  records: FixtureRecords;
};

@Injectable()
export class MyahE2eFixtureRegistryService {
  private readonly fixtures = new Map<string, MyahE2eFixture>();

  constructor(private readonly capacity = MAX_ACTIVE_FIXTURES) {}

  register(workspaceId: string, records: FixtureRecords): MyahE2eFixture {
    // Ponytail: this short-lived, flag-gated registry deliberately bounds
    // fixture residue to one isolated E2E server process and database reset.
    if (this.fixtures.size >= this.capacity) {
      throw new Error('E2E fixture capacity has been reached');
    }

    const fixture: MyahE2eFixture = {
      id: randomUUID(),
      workspaceId,
      records,
    };
    this.fixtures.set(fixture.id, fixture);

    return fixture;
  }

  get(workspaceId: string, fixtureId: string): MyahE2eFixture | null {
    const fixture = this.fixtures.get(fixtureId);

    return fixture?.workspaceId === workspaceId ? fixture : null;
  }

  release(workspaceId: string, fixtureId: string): void {
    if (this.get(workspaceId, fixtureId)) this.fixtures.delete(fixtureId);
  }

  entries(): readonly MyahE2eFixture[] {
    return [...this.fixtures.values()];
  }
}

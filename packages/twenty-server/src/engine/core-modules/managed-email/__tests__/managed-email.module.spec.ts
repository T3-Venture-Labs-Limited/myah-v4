import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';

import { EventLogEmitterModule } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.module';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { MyahModule } from 'src/engine/core-modules/myah/myah.module';
import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';

import { ManagedEmailAcquisitionOperationEntity } from '../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailModule } from '../managed-email.module';
import { IcemailClient } from '../providers/icemail/icemail.client';
import { WarmupInboxClient } from '../providers/warmup-inbox/warmup-inbox.client';
import {
  MANAGED_EMAIL_PROPOSAL_CLOCK,
  MANAGED_EMAIL_PROPOSAL_ID_FACTORY,
  MANAGED_EMAIL_PROPOSAL_POLICY,
  ManagedEmailProposalService,
} from '../services/managed-email-proposal.service';
import {
  MANAGED_EMAIL_QUOTE_ID_FACTORY,
  ManagedEmailQuoteService,
} from '../services/managed-email-quote.service';
import { ManagedEmailSubscriptionService } from '../services/managed-email-subscription.service';

const ENTITIES = [
  ManagedEmailDomainEntity,
  ManagedEmailMailboxEntity,
  ManagedEmailAcquisitionOperationEntity,
];

describe('ManagedEmailModule', () => {
  it('registers TypeORM and workspace-scoped repositories for all three records', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedEmailModule,
    ) as Array<{ module?: unknown; providers?: Array<{ provide?: unknown }> }>;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ManagedEmailModule,
    ) as Array<{ provide?: unknown }>;
    const typeOrmFeature = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeature).toBeDefined();
    for (const entity of ENTITIES) {
      expect(typeOrmFeature?.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provide: getRepositoryToken(entity) }),
        ]),
      );
      expect(providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provide: getWorkspaceScopedRepositoryToken(entity),
          }),
        ]),
      );
    }
  });

  it('registers repositories, providers, and orchestration exactly once', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedEmailModule,
    ) as Array<{ module?: unknown }>;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ManagedEmailModule,
    ) as unknown[];
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ManagedEmailModule) ??
      [];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ManagedEmailModule,
    ) as unknown[];
    const repositoryTokens = ENTITIES.map((entity) =>
      getWorkspaceScopedRepositoryToken(entity),
    );

    expect(imports).toHaveLength(4);
    expect(imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: TypeOrmModule }),
        EventLogEmitterModule,
        ManagedProviderBillingModule,
        SecureHttpClientModule,
      ]),
    );
    expect(controllers).toEqual([]);
    expect(providers.filter((item) => item === IcemailClient)).toHaveLength(1);
    expect(providers.filter((item) => item === WarmupInboxClient)).toHaveLength(
      1,
    );
    for (const service of [
      ManagedEmailProposalService,
      ManagedEmailQuoteService,
      ManagedEmailSubscriptionService,
    ]) {
      expect(providers.filter((item) => item === service)).toHaveLength(1);
    }
    for (const token of [
      MANAGED_EMAIL_PROPOSAL_CLOCK,
      MANAGED_EMAIL_PROPOSAL_ID_FACTORY,
      MANAGED_EMAIL_PROPOSAL_POLICY,
      MANAGED_EMAIL_QUOTE_ID_FACTORY,
    ]) {
      expect(providers).toEqual(
        expect.arrayContaining([expect.objectContaining({ provide: token })]),
      );
    }
    expect(providers).toHaveLength(repositoryTokens.length + 9);
    expect(exports).toEqual([
      ...repositoryTokens,
      IcemailClient,
      WarmupInboxClient,
      ManagedEmailProposalService,
      ManagedEmailQuoteService,
      ManagedEmailSubscriptionService,
    ]);
  });

  it('is registered and exported exactly once through MyahModule', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MyahModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MyahModule,
    ) as unknown[];

    expect(imports.filter((item) => item === ManagedEmailModule)).toHaveLength(
      1,
    );
    expect(exports.filter((item) => item === ManagedEmailModule)).toHaveLength(
      1,
    );
  });
});

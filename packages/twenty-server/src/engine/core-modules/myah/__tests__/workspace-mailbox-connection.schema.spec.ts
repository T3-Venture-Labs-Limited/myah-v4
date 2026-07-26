import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';

import { isInputObjectType, isObjectType } from 'graphql';

import { WorkspaceMailboxConnectionResolver } from 'src/engine/core-modules/myah/resolvers/workspace-mailbox-connection.resolver';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

describe('workspace mailbox GraphQL schema', () => {
  it('exposes only guarded mailbox operations and secret-free outputs', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        WorkspaceMailboxConnectionResolver,
        { provide: WorkspaceMailboxConnectionService, useValue: {} },
        { provide: PermissionsService, useValue: {} },
      ],
    }).compile();
    const schema = await moduleRef
      .get(GraphQLSchemaFactory)
      .create([WorkspaceMailboxConnectionResolver]);
    const mutationFields = Object.keys(
      schema.getMutationType()?.getFields() ?? {},
    );
    const queryFields = Object.keys(schema.getQueryType()?.getFields() ?? {});

    expect(mutationFields).toEqual(
      expect.arrayContaining([
        'connectWorkspaceMailbox',
        'reconnectWorkspaceMailbox',
        'revokeWorkspaceMailbox',
        'rotateWorkspaceMailbox',
      ]),
    );
    expect(queryFields).toContain('getWorkspaceMailboxStatus');

    for (const inputTypeName of [
      'ConnectWorkspaceMailboxInput',
      'ReplaceWorkspaceMailboxCredentialsInput',
    ]) {
      const inputType = schema.getType(inputTypeName);

      expect(isInputObjectType(inputType)).toBe(true);
      if (!isInputObjectType(inputType)) {
        throw new Error(`Missing input type ${inputTypeName}`);
      }

      const inputFieldNames = Object.keys(inputType.getFields());

      expect(inputFieldNames).not.toContain('workspaceId');
      expect(inputFieldNames).not.toContain('userWorkspaceId');
      expect(inputFieldNames).not.toContain('idempotencyKey');
    }

    for (const outputTypeName of [
      'WorkspaceMailboxConnectionResult',
      'WorkspaceMailboxConnectionStatus',
      'RevokeWorkspaceMailboxResult',
    ]) {
      const outputType = schema.getType(outputTypeName);

      expect(isObjectType(outputType)).toBe(true);
      if (!isObjectType(outputType)) {
        throw new Error(`Missing output type ${outputTypeName}`);
      }

      const outputFieldNames = Object.keys(outputType.getFields());

      expect(outputFieldNames).not.toEqual(
        expect.arrayContaining([
          'connectionParameters',
          'password',
          'username',
          'workspaceId',
          'userWorkspaceId',
        ]),
      );
    }

    await moduleRef.close();
  });
});

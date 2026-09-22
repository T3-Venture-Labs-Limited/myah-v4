import { z } from 'zod';

import { MetadataToolProvider } from 'src/engine/core-modules/tool-provider/providers/metadata-tool.provider';

const context = {
  workspaceId: 'workspace-id',
  roleId: 'role-id',
  rolePermissionConfig: { shouldBypassPermissionChecks: true as const },
};

const readTool = (result: string) => ({
  description: `Read ${result}`,
  inputSchema: z.object({}),
  execute: jest.fn().mockResolvedValue(result),
});

const writeTool = () => ({
  description: 'Write schema',
  inputSchema: z.object({}),
  execute: jest.fn().mockResolvedValue('should not execute'),
});

describe('MetadataToolProvider', () => {
  const buildProvider = () =>
    new MetadataToolProvider(
      {
        generateTools: jest.fn().mockReturnValue({
          get_object_metadata: readTool('objects'),
          create_object_metadata: writeTool(),
          update_many_object_metadata: writeTool(),
        }),
      } as never,
      {
        generateTools: jest.fn().mockReturnValue({
          get_field_metadata: readTool('fields'),
          create_field_metadata: writeTool(),
          create_many_relation_fields: writeTool(),
        }),
      } as never,
      {} as never,
    );

  it('advertises metadata reads without schema-write tools', async () => {
    const descriptors = await buildProvider().generateDescriptors(context);

    expect(descriptors.map(({ name }) => name)).toEqual([
      'get_object_metadata',
      'get_field_metadata',
    ]);
  });

  it('rejects direct invocation of hidden schema-write tools', async () => {
    await expect(
      buildProvider().executeStaticTool('create_object_metadata', {}, context),
    ).rejects.toThrow('Tool "create_object_metadata" not found');
  });

  it('continues to execute metadata reads', async () => {
    await expect(
      buildProvider().executeStaticTool('get_object_metadata', {}, context),
    ).resolves.toBe('objects');
  });
});

import { appDevOnce } from 'twenty-sdk/cli';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { describe, expect, it } from 'vitest';

const readObjectNames = async () => {
  const client = new MetadataApiClient();
  const { objects } = await client.query({
    objects: {
      __args: { paging: { first: 1000 }, filter: {} },
      edges: { node: { nameSingular: true } },
    },
  });

  return objects.edges.map((edge) => edge.node.nameSingular).sort();
};

describe('Postcard on fresh product-owned schema', () => {
  it('rejects customer app schema sync without adding an object', async () => {
    const before = await readObjectNames();
    expect(before).not.toContain('postCard');

    const result = await appDevOnce({ appPath: process.cwd() });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain(
      'Schema definitions are managed by the product and cannot be changed by customers',
    );
    expect(await readObjectNames()).toEqual(before);
  });
});

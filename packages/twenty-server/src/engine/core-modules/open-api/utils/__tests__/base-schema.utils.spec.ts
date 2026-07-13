import { baseSchema } from 'src/engine/core-modules/open-api/utils/base-schema.utils';

describe('baseSchema', () => {
  it('identifies Myah and preserves request-derived API endpoints', () => {
    const schema = baseSchema('core', 'https://workspace.example');

    expect(schema.info.title).toBe('Myah API');
    expect(schema.info.description).toContain('Myah MCP server');
    expect(schema.info.description).toContain(
      'https://workspace.example/rest/open-api/core > myah-core.json',
    );
    expect(schema.servers).toEqual([
      {
        url: 'https://workspace.example/rest/',
        description: 'Production Development',
      },
    ]);
  });

  it('uses the metadata download name for metadata schemas', () => {
    const schema = baseSchema('metadata', 'https://workspace.example');

    expect(schema.info.description).toContain('myah-metadata.json');
    expect(schema.servers?.[0]?.url).toBe(
      'https://workspace.example/rest/metadata',
    );
  });
});

import { buildMcpServerInstructions } from 'src/engine/api/mcp/utils/build-mcp-server-instructions.util';

describe('buildMcpServerInstructions', () => {
  it('presents Myah as the workspace product without changing dynamic capabilities', () => {
    const instructions = buildMcpServerInstructions(
      'people, companies',
      'campaign-management',
    );

    expect(instructions).toContain('Myah CRM workspace');
    expect(instructions).toContain('Myah primitives:');
    expect(instructions).toContain("never for Myah's own data");
    expect(instructions).toContain('Available objects: people, companies.');
    expect(instructions).toContain(
      'Available skills: campaign-management.',
    );
    expect(instructions).not.toContain('Twenty CRM workspace');
    expect(instructions).not.toContain('Twenty primitives:');
  });
});
